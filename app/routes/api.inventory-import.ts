/**
 * POST /api/inventory-import
 *
 * 官方库存 CSV 写回入口，唯一会调用 inventorySetQuantities(on_hand) 的地方。
 * 门禁：confirm: true + pending_review。Agent 回合内禁止走到这里。
 */
import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import { applyInventoryImport } from "../server/inventoryImport/inventoryImportApply.server";
import { coerceInventoryImportRows } from "../lib/inventoryImport";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
    request,
    taskType: "inventory_import",
    apply: async ({ admin, shop, task, rawResult }) => {
      const writable = coerceInventoryImportRows(rawResult.rows).filter((row) => !row.skipped);
      if (writable.length === 0) throw new Error("没有可写回的变更");
      return applyInventoryImport({
        admin,
        shop,
        taskId: task.id,
        rows: writable,
      });
    },
  });
