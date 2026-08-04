import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getTiktokCatalogCredential } from "../server/adsCatalog/credentialStore.server";
import { getTaskForShop } from "../server/aiTask/aiTaskStore.server";
import type { AdsCatalogSyncTaskResult } from "../lib/aiTaskTypes";
import { refreshTiktokFeedLogProductResults } from "../server/adsCatalog/clients/tiktokCatalogUploadConfirm.server";

/** 刷新 TikTok Feed 同步任务的逐商品入库结果。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim() ?? "";
  if (!taskId) {
    return Response.json({ ok: false, error: "taskId is required" }, { status: 400 });
  }

  const task = await getTaskForShop({ taskId, shop: session.shop });
  if (!task || task.taskType !== "ads_catalog_sync") {
    return Response.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const result = task.result as AdsCatalogSyncTaskResult | null;
  if (!result || result.platform !== "tiktok" || !result.feedLogId || !result.catalogId) {
    return Response.json(
      { ok: false, error: "该任务没有可刷新的 TikTok Feed 日志" },
      { status: 400 },
    );
  }

  const credential = await getTiktokCatalogCredential(session.shop);
  if (!credential?.bcId) {
    return Response.json({ ok: false, error: "TikTok 凭证不完整" }, { status: 400 });
  }

  const expectedSkuIds =
    result.productResults?.map((row) => row.productId) ??
    result.errors.map((row) => row.productId);

  if (expectedSkuIds.length === 0) {
    return Response.json({ ok: false, error: "任务中无商品 SKU 可查询" }, { status: 400 });
  }

  try {
    const refreshed = await refreshTiktokFeedLogProductResults({
      accessToken: credential.accessToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: result.catalogId,
      feedLogId: result.feedLogId,
      expectedSkuIds,
    });
    return Response.json({ ok: true, ...refreshed });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to refresh feed log" },
      { status: 500 },
    );
  }
};
