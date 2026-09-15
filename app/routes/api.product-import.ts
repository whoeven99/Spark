import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { getTaskForShop } from "../server/aiTask/aiTaskStore.server";
import { completeEmptyProductImportReview } from "../server/productImport/productImportCompleteReview.server";
import {
  enqueueProductImportApply,
  isProductImportApplyInFlight,
  markProductImportApplyStarted,
} from "../server/productImport/productImportApply.server";
import { countImportWritableFromResult } from "../lib/productImportEmptyReview";
import { coerceBulkProductDeleteRows, countWritableProductDeletes } from "../lib/bulkProductDelete";
import { resolveUiLocale } from "../i18n/resolveUiLocale.server";

const applyBodySchema = z.object({
  taskId: z.string().min(1),
  confirm: z.literal(true),
  confirmDelete: z.boolean().optional(),
});

function isCompleteReviewBody(raw: unknown): boolean {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      (raw as { completeReview?: unknown }).completeReview === true,
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "POST") {
    const probe = request.clone();
    try {
      if (isCompleteReviewBody(await probe.json())) {
        return completeEmptyProductImportReview(request);
      }
    } catch {
      // JSON 无效时交给写回入口返回 400
    }
  }
  return enqueueConfirmedProductImportApply(request);
};

async function enqueueConfirmedProductImportApply(request: Request) {
  const fail = (error: string, status: number) =>
    data<{ ok: false; error: string }>({ ok: false, error }, { status });

  if (request.method !== "POST") return fail("Method not allowed", 405);

  const { admin, session } = await authenticate.admin(request);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = applyBodySchema.safeParse(raw);
  if (!parsed.success) return fail("缺少 taskId 或未确认写回", 400);

  const task = await getTaskForShop({ taskId: parsed.data.taskId, shop: session.shop });
  if (!task || task.taskType !== "product_import") return fail("任务不存在", 404);
  if (task.status !== "pending_review") return fail("该任务当前状态不可写回", 409);

  const rawResult = task.result ?? {};
  if (isProductImportApplyInFlight(rawResult)) {
    return fail("上一次写回还在进行中，请稍后再试", 409);
  }

  const summary =
    rawResult.summary && typeof rawResult.summary === "object"
      ? (rawResult.summary as Record<string, unknown>)
      : {};
  const parsedDeletes = Number(summary.deletes);
  const deletes = Number.isFinite(parsedDeletes)
    ? parsedDeletes
    : countWritableProductDeletes(coerceBulkProductDeleteRows(rawResult.deleteRows));
  if (deletes > 0 && parsed.data.confirmDelete !== true) {
    return fail("删除商品需要在审核页额外确认", 400);
  }
  if (countImportWritableFromResult(rawResult) <= 0) {
    return fail("没有可写回的变更", 400);
  }

  await markProductImportApplyStarted(task.id, rawResult);
  const locale = await resolveUiLocale(request, {
    admin,
    shop: session.shop,
    logContext: `product-import-apply shop=${session.shop}`,
  });
  enqueueProductImportApply({ taskId: task.id, shop: session.shop, locale });
  return data({ ok: true as const, queued: true as const });
}
