import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import {
  applyBulkArchive,
  buildBulkArchiveWritableRows,
} from "../server/bulkArchive/bulkArchiveApply.server";
import { coerceBulkArchiveRows } from "../lib/bulkArchive";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
    request,
    taskType: "bulk_archive",
    apply: async ({ admin, shop, rawResult }) => {
      const rows = buildBulkArchiveWritableRows(coerceBulkArchiveRows(rawResult.rows));
      if (rows.length === 0) throw new Error("没有可归档的商品");
      return applyBulkArchive({ admin, shop, rows });
    },
  });
