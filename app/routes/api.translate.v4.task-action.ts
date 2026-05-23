import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getV4Job, updateV4Job } from "../server/translation/v4/cosmosV4Store.server";
import { getTranslateRedisClient } from "../server/translation/translateRedis.server";
import type { TranslationV4Status } from "../server/translation/v4/types";

const HINT_KEYS: Record<string, string> = {
  init: "translate:v4:hint:init",
  translate: "translate:v4:hint:translate",
  writeback: "translate:v4:hint:writeback",
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
    return data({ ok: true, status: "CANCELLED" });
  }

  if (actionType === "pause") {
    await updateV4Job(shopName, taskId, { status: "PAUSED", claimedBy: null });
    return data({ ok: true, status: "PAUSED" });
  }

  if (actionType === "resume") {
    // Resume from where it was paused — determine correct queued status
    const resumeStatus = resolveResumeStatus(job.status);
    if (!resumeStatus) {
      return data({ ok: false, error: `cannot resume from status ${job.status}` }, { status: 400 });
    }
    await updateV4Job(shopName, taskId, { status: resumeStatus, claimedBy: null });
    // Push hint so worker picks it up immediately
    const hintStage = resumeStatus.replace("_QUEUED", "").toLowerCase() as keyof typeof HINT_KEYS;
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

function resolveResumeStatus(currentStatus: TranslationV4Status): TranslationV4Status | null {
  if (currentStatus === "PAUSED" || currentStatus === "FAILED") {
    // Can't determine exact stage without more info — default to re-init
    return "INIT_QUEUED";
  }
  return null;
}
