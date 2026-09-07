import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import {
  applyBulkCollectionEdit,
  buildBulkCollectionEditWritableRows,
} from "../server/bulkCollectionEdit/bulkCollectionEditApply.server";
import { coerceBulkCollectionEditRows } from "../lib/bulkCollectionEdit";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
    request,
    taskType: "bulk_collection_edit",
    apply: async ({ admin, shop, rawResult }) => {
      const rows = buildBulkCollectionEditWritableRows(coerceBulkCollectionEditRows(rawResult.rows));
      if (rows.length === 0) throw new Error("没有可写回的变更");
      const collectionId =
        typeof rawResult.collectionId === "string" ? rawResult.collectionId.trim() : "";
      const action = rawResult.action === "remove" ? "remove" : "add";
      if (!collectionId) throw new Error("缺少目标合集");
      return applyBulkCollectionEdit({ admin, shop, collectionId, action, rows });
    },
  });
