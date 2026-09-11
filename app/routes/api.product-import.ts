import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import { applyProductImport } from "../server/productImport/productImportApply.server";
import { completeEmptyProductImportReview } from "../server/productImport/productImportCompleteReview.server";
import { coerceBulkProductDeleteRows, countWritableProductDeletes } from "../lib/bulkProductDelete";

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
      // JSON 无效时交给写回骨架返回 400
    }
  }
  return runConfirmedCatalogApply({
    request,
    taskType: "product_import",
    apply: async ({ admin, shop, rawResult, confirmDelete }) => {
      const deleteCount = countWritableProductDeletes(coerceBulkProductDeleteRows(rawResult.deleteRows));
      if (deleteCount > 0 && confirmDelete !== true) {
        throw new Error("删除商品需要在审核页额外确认");
      }
      const outcome = await applyProductImport({ admin, shop, rawResult });
      if (outcome.succeeded === 0 && outcome.failed === 0) {
        throw new Error("没有可写回的变更");
      }
      return {
        succeeded: outcome.succeeded,
        failed: outcome.failed,
        extra: { byOperation: outcome.byOperation },
      };
    },
  });
};
