import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import {
  applyBulkProductFieldEdit,
  buildBulkProductFieldEditWritableRows,
} from "../server/bulkProductFieldEdit/bulkProductFieldEditApply.server";
import { coerceBulkProductFieldEditRows } from "../lib/bulkProductFieldEdit";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
    request,
    taskType: "bulk_product_field_edit",
    apply: async ({ admin, shop, rawResult }) => {
      const rows = buildBulkProductFieldEditWritableRows(
        coerceBulkProductFieldEditRows(rawResult.rows),
      );
      if (rows.length === 0) throw new Error("没有可写回的变更");
      return applyBulkProductFieldEdit({ admin, shop, rows });
    },
  });
