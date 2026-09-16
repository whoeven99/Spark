/**
 * POST /api/bulk-inventory-edit
 *
 * 设置 / 增减 / 清零可售库存的唯一写回入口。
 * 门禁：confirm: true + pending_review。Agent 回合内禁止走到这里。
 */
import type { ActionFunctionArgs } from "react-router";
import { runConfirmedCatalogApply } from "../server/bulkEdit/confirmedCatalogApply.server";
import { applyInventoryQtyEdit } from "../server/inventoryQtyEdit/inventoryQtyEditApply.server";
import { coerceInventoryQtyEditRows, isInventoryQtyMode } from "../lib/inventoryQtyEdit";

export const action = async ({ request }: ActionFunctionArgs) =>
  runConfirmedCatalogApply({
    request,
    taskType: "inventory_qty_edit",
    apply: async ({ admin, shop, task, rawResult }) => {
      const writable = coerceInventoryQtyEditRows(rawResult.rows).filter((row) => !row.skipped);
      if (writable.length === 0) throw new Error("没有可写回的变更");
      const mode = isInventoryQtyMode(task.config.mode) ? task.config.mode : "set";
      return applyInventoryQtyEdit({
        admin,
        shop,
        taskId: task.id,
        mode,
        rows: writable,
      });
    },
  });
