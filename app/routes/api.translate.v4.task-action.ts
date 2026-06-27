import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getV4Job, updateV4Job } from "../server/translation/v4/cosmosV4Store.server";
import { resolveShopAccessTokenForWorker } from "../server/shopify/resolveShopAccessToken.server";
import { syncV4JobShopifyTokensFromSession } from "../server/translation/v4/syncV4JobShopifyTokens.server";
import { getTranslateRedisClient } from "../server/translation/translateRedis.server";
import { resolveResumeV4JobStatus } from "../server/translation/v4/resumeV4JobStatus";
import { deriveStage } from "../lib/translationV4/state";

const HINT_KEYS: Record<string, string> = {
  init: "translate:v4:hint:init",
  translate: "translate:v4:hint:translate",
  writeback: "translate:v4:hint:writeback",
  verify: "translate:v4:hint:verify",
};

/** POST /api/translate/v4/task-action */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    taskId?: string;
    shopName?: string;
    action?: string;
  };

  const taskId = body.taskId?.trim() || "";
  const shopName = body.shopName?.trim() || session.shop;
  const actionType = body.action?.trim();

  if (!taskId) return data({ ok: false, error: "taskId required" }, { status: 400 });

  const job = await getV4Job(shopName, taskId);
  if (!job) return data({ ok: false, error: "task not found" }, { status: 404 });

  if (actionType === "cancel") {
    await updateV4Job(shopName, taskId, { status: "CANCELLED", claimedBy: null });
    await setV4Control(taskId, "cancel"); // 让正在运行的阶段中途即时取消
    return data({ ok: true, status: "CANCELLED" });
  }

  if (actionType === "pause") {
    // Save which stage we're pausing from so resume can return to the right queue
    const pauseStage = deriveStage(job.status);
    await updateV4Job(shopName, taskId, {
      status: "PAUSED",
      claimedBy: null,
      errorStage: pauseStage,
    });
    await setV4Control(taskId, "pause"); // 让正在运行的阶段中途即时暂停
    return data({ ok: true, status: "PAUSED" });
  }

  if (actionType === "resume") {
    const resumeStatus = resolveResumeV4JobStatus(
      job.status,
      job.errorStage,
      job.metrics,
    );
    if (!resumeStatus) {
      return data({ ok: false, error: `cannot resume from status ${job.status}` }, { status: 400 });
    }

    await syncV4JobShopifyTokensFromSession(shopName, session.accessToken);
    const freshToken =
      (await resolveShopAccessTokenForWorker(shopName, session.accessToken)) ??
      job.shopifyAccessToken;

    // Clear error state and re-queue at the correct stage
    await updateV4Job(shopName, taskId, {
      status: resumeStatus,
      claimedBy: null,
      errorMessage: null,
      errorStage: null,
      shopifyAccessToken: freshToken,
    });
    await clearV4Control(taskId); // 清除暂停/取消控制键，避免 resume 后立即再次中断
    // Push hint so worker picks it up immediately
    const hintStage = resumeStatus.replace("_QUEUED", "").toLowerCase();
    const hintKey = HINT_KEYS[hintStage];
    if (hintKey) {
      try {
        await getTranslateRedisClient().lpush(hintKey, JSON.stringify({ taskId, shopName }));
      } catch {
        // non-fatal
      }
    }
    return data({ ok: true, status: resumeStatus });
  }

  return data({ ok: false, error: "unknown action" }, { status: 400 });
};

/** 运行时控制键：worker 在阶段中途读取后优雅暂停/取消。 */
function v4ControlKey(taskId: string): string {
  return `translate:v4:control:${taskId}`;
}

async function setV4Control(taskId: string, action: "pause" | "cancel"): Promise<void> {
  try {
    await getTranslateRedisClient().set(v4ControlKey(taskId), action, "EX", 24 * 3600);
  } catch {
    // 控制键为尽力而为；即便失败，阶段结束后仍会依据 Cosmos 状态停止
  }
}

async function clearV4Control(taskId: string): Promise<void> {
  try {
    await getTranslateRedisClient().del(v4ControlKey(taskId));
  } catch {
    // non-fatal
  }
}

