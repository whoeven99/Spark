import { getTranslateRedisClient } from "./translateRedis.server";

/** 与 AgentTask {@code TranslateTaskV3QueueKeys} 完全一致 */
export const TRANSLATE_V3_QUEUE_KEYS = {
  init: "translate:v3:q:init",
  translate: "translate:v3:q:translate",
} as const;

export type TranslateTaskV3QueueStage = "INIT" | "TRANSLATE";

export type TranslateTaskV3QueuePayload = {
  taskId: string;
  shopName: string;
  stage: TranslateTaskV3QueueStage;
  enqueuedAt: number;
};

function buildPayload(
  taskId: string,
  shopName: string,
  stage: TranslateTaskV3QueueStage,
): TranslateTaskV3QueuePayload {
  return {
    taskId: taskId.trim(),
    shopName: shopName.trim(),
    stage,
    enqueuedAt: Date.now(),
  };
}

async function lpushStage(
  stage: TranslateTaskV3QueueStage,
  taskId: string,
  shopName: string,
): Promise<void> {
  const id = taskId.trim();
  const shop = shopName.trim();
  if (!id || !shop) return;

  try {
    const redis = getTranslateRedisClient();
    const key =
      stage === "TRANSLATE"
        ? TRANSLATE_V3_QUEUE_KEYS.translate
        : TRANSLATE_V3_QUEUE_KEYS.init;
    const payload = JSON.stringify(buildPayload(id, shop, stage));
    await redis.lpush(key, payload);
    console.log(
      `[translation][queue] LPUSH stage=${stage} taskId=${id} shop=${shop}`,
    );
  } catch (error) {
    console.warn(
      `[translation][queue] LPUSH failed stage=${stage} taskId=${id} shop=${shop}`,
      error,
    );
  }
}

/** 创建或复用任务后入队 INIT（失败仅打日志，不阻断 Cosmos 写入成功）。 */
export async function enqueueTranslateTaskV3Init(
  taskId: string,
  shopName: string,
): Promise<void> {
  await lpushStage("INIT", taskId, shopName);
}

/** INIT 已完成、待翻译时入队 TRANSLATE。 */
export async function enqueueTranslateTaskV3Translate(
  taskId: string,
  shopName: string,
): Promise<void> {
  await lpushStage("TRANSLATE", taskId, shopName);
}
