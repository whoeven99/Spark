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
    return data({ ok: true, status: "CANCELLED" });
  }

  if (actionType === "pause") {
    // Save which stage we're pausing from so resume can return to the right queue
    const pauseStage = stageFromStatus(job.status);
    await updateV4Job(shopName, taskId, {
      status: "PAUSED",
      claimedBy: null,
      errorStage: pauseStage,
    });
    return data({ ok: true, status: "PAUSED" });
  }

  if (actionType === "resume") {
    const resumeStatus = resolveResumeStatus(job.status, job.errorStage);
    if (!resumeStatus) {
      return data({ ok: false, error: `cannot resume from status ${job.status}` }, { status: 400 });
    }
    // Clear error state and re-queue at the correct stage
    await updateV4Job(shopName, taskId, {
      status: resumeStatus,
      claimedBy: null,
      errorMessage: null,
      errorStage: null,
    });
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

/** Determine pipeline stage from current status (used when pausing). */
function stageFromStatus(status: TranslationV4Status): string {
  if (["INIT_QUEUED", "INITIALIZING", "INIT_DONE"].includes(status)) return "INIT";
  if (["TRANSLATE_QUEUED", "TRANSLATING", "TRANSLATE_DONE"].includes(status)) return "TRANSLATE";
  if (["WRITEBACK_QUEUED", "WRITING_BACK"].includes(status)) return "WRITEBACK";
  if (["VERIFY_QUEUED", "VERIFYING"].includes(status)) return "VERIFY";
  return "INIT";
}

/** Map errorStage → correct _QUEUED status for resume. */
function resolveResumeStatus(
  currentStatus: TranslationV4Status,
  errorStage: string | null,
): TranslationV4Status | null {
  if (currentStatus !== "PAUSED" && currentStatus !== "FAILED") return null;
  switch (errorStage) {
    case "TRANSLATE": return "TRANSLATE_QUEUED";
    case "WRITEBACK": return "WRITEBACK_QUEUED";
    case "VERIFY":    return "VERIFY_QUEUED";
    default:          return "INIT_QUEUED";
  }
}
