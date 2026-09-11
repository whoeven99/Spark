import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import { applyProductImport } from "../server/productImport/productImportApply.server";
import { coerceBulkProductDeleteRows, countWritableProductDeletes } from "../lib/bulkProductDelete";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
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
