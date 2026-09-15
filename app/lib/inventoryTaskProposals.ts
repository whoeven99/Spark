/**
 * 库存与 SKU Wave 1 TaskProposal 构造。
 */
import {
  TASK_PROPOSAL_VERSION,
  type TaskProposalField,
  type TaskProposalPayload,
} from "./taskProposalPayload";
import { INVENTORY_EXPORT_SKILL_ID, INVENTORY_IMPORT_SKILL_ID } from "./inventoryCsv";
import {
  INVENTORY_ADJUST_SKILL_ID,
  INVENTORY_SET_SKILL_ID,
  INVENTORY_ZERO_SKILL_ID,
} from "./inventoryQtyEdit";

export {
  INVENTORY_EXPORT_SKILL_ID,
  INVENTORY_IMPORT_SKILL_ID,
  INVENTORY_SET_SKILL_ID,
  INVENTORY_ADJUST_SKILL_ID,
  INVENTORY_ZERO_SKILL_ID,
};

function proposalId(): string {
  return `tp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`;
}

function productTargets(
  products: Array<{ id: string; title: string; imageUrl?: string | null }>,
): TaskProposalPayload["targets"] {
  return {
    kind: "products",
    items: products.map((product) => ({
      id: product.id,
      title: product.title,
      imageUrl: product.imageUrl ?? null,
    })),
  };
}

export type InventoryLocationOption = { value: string; label: string };

function locationField(
  locations: InventoryLocationOption[],
  locationId?: string,
): TaskProposalField {
  const fallback = locations.length === 1 ? (locations[0]?.value ?? "") : "";
  const value = locationId && locations.some((item) => item.value === locationId) ? locationId : fallback;
  return {
    key: "locationId",
    label: "库存地点",
    type: "location",
    value,
    options: locations,
    placeholder: "搜索地点",
  };
}

export function buildInventoryExportProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: INVENTORY_EXPORT_SKILL_ID,
    title: "导出库存",
    summary: "导出已选商品的 Shopify 官方库存 CSV（按地点，含 On hand current）。不改店铺。",
    targets: productTargets(args.products),
    params: [],
  };
}

export function buildInventoryImportProposal(args: {
  fileId?: string;
  fileName?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: INVENTORY_IMPORT_SKILL_ID,
    title: "导入库存",
    summary:
      "上传 Shopify 官方 All states 库存表。只写 On hand (new)；current 不一致的行会跳过。不会立刻改店铺。",
    targets: { kind: "none", items: [] },
    params: [
      { key: "fileId", label: "上传表格", type: "file", value: args.fileId?.trim() ?? "" },
      { key: "fileName", label: "文件名", type: "hidden", value: args.fileName?.trim() ?? "" },
    ],
  };
}

export function buildInventorySetProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  locations: InventoryLocationOption[];
  locationId?: string;
  quantity?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: INVENTORY_SET_SKILL_ID,
    title: "设置库存",
    summary: "把已选商品在指定地点的可售库存设为整数。先出变更预览，确认后才写回。",
    targets: productTargets(args.products),
    params: [
      locationField(args.locations, args.locationId),
      {
        key: "quantity",
        label: "目标可售库存",
        type: "text",
        value: args.quantity ?? "",
        placeholder: "例如 10",
      },
    ],
  };
}

export function buildInventoryAdjustProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  locations: InventoryLocationOption[];
  locationId?: string;
  direction?: string;
  amount?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: INVENTORY_ADJUST_SKILL_ID,
    title: "增加 / 减少库存",
    summary: "按地点给可售库存加或减一个正整数。先出预览，确认后才写回。",
    targets: productTargets(args.products),
    params: [
      locationField(args.locations, args.locationId),
      {
        key: "direction",
        label: "方向",
        type: "select",
        value: args.direction === "down" ? "down" : "up",
        options: [
          { value: "up", label: "增加" },
          { value: "down", label: "减少" },
        ],
      },
      {
        key: "amount",
        label: "数量",
        type: "text",
        value: args.amount ?? "",
        placeholder: "例如 5",
      },
    ],
  };
}

export function buildInventoryZeroProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  locations: InventoryLocationOption[];
  locationId?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: INVENTORY_ZERO_SKILL_ID,
    title: "清零库存",
    summary: "把已选商品在指定地点的可售库存设为 0。已占用库存不会被抹掉。",
    targets: productTargets(args.products),
    params: [locationField(args.locations, args.locationId)],
  };
}
