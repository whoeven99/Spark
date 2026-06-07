import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getV4Job } from "../server/translation/v4/cosmosV4Store.server";
import { mergeV4JobMetrics } from "../server/translation/v4/v4JobProgress.server";
import { getTranslateRedisClient } from "../server/translation/translateRedis.server";

function progressKey(taskId: string) {
  return `translate:v4:progress:${taskId}`;
}

/** GET /api/translate/v4/task-progress?taskId=&shopName= */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId")?.trim() || "";
  const shopName = url.searchParams.get("shopName")?.trim() || session.shop;

  if (!taskId) return data({ ok: false, error: "taskId required" }, { status: 400 });

  const [job, redisProgress] = await Promise.all([
    getV4Job(shopName, taskId),
    (async () => {
      try {
        return await getTranslateRedisClient().hgetall(progressKey(taskId));
      } catch {
        return {} as Record<string, string>;
      }
    })(),
  ]);

  if (!job) return data({ ok: false, error: "task not found" }, { status: 404 });

  const merged = mergeV4JobMetrics(job, redisProgress);

  return data({
    ok: true,
    taskId,
    status: job.status,
    testMode: job.testMode,
    source: job.source,
    target: job.target,
    modules: job.modules,
    aiModel: job.aiModel,
    errorMessage: job.errorMessage,
    errorStage: job.errorStage,
    claimedBy: job.claimedBy,
    lastHeartbeat: job.lastHeartbeat,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    metrics: merged,
  });
};
