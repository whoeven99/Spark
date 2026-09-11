import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import { applyProductImport } from "../server/productImport/productImportApply.server";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
    request,
    taskType: "product_import",
    apply: async ({ admin, shop, rawResult }) => {
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
