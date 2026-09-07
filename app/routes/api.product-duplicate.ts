import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import {
  applyProductDuplicate,
  buildProductDuplicateWritableRows,
} from "../server/productDuplicate/productDuplicateApply.server";
import { coerceProductDuplicateRows } from "../lib/productDuplicate";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
    request,
    taskType: "product_duplicate",
    apply: async ({ admin, shop, rawResult }) => {
      const rows = buildProductDuplicateWritableRows(coerceProductDuplicateRows(rawResult.rows));
      if (rows.length === 0) throw new Error("没有可复制的商品");
      return applyProductDuplicate({ admin, shop, rows });
    },
  });
