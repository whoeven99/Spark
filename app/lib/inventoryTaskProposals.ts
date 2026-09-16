import {
  TASK_PROPOSAL_VERSION,
  type TaskProposalPayload,
} from "./taskProposalPayload";
import { PRODUCT_EXPORT_MAX_PRODUCTS } from "./productExport";
import { INVENTORY_IMPORT_SKILL_ID } from "./inventoryImport";
import { INVENTORY_QTY_EDIT_SKILL_ID, INVENTORY_QTY_MAX_PRODUCTS } from "./inventoryQtyEdit";
import { SKU_EXPORT_SKILL_ID, SKU_EXPORT_MAX_PRODUCTS } from "./skuExport";

export const INVENTORY_EXPORT_SKILL_ID = "inventory_export";
export { INVENTORY_IMPORT_SKILL_ID, INVENTORY_QTY_EDIT_SKILL_ID, SKU_EXPORT_SKILL_ID };
export const INVENTORY_EXPORT_MAX_PRODUCTS = PRODUCT_EXPORT_MAX_PRODUCTS;

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

export function buildSkuExportProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: SKU_EXPORT_SKILL_ID,
    title: "导出 SKU",
    summary: "导出变体身份对照表（Handle / Option / SKU / 条码 / 重量）。只读，不改店铺。SKU 重复会进警告报告。",
    targets: productTargets(args.products),
    params: [],
  };
}

export function buildInventoryExportProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  locationId?: string;
  locations: Array<{ value: string; label: string }>;
}): TaskProposalPayload {
  const locationOptions = [{ value: "all", label: "全部仓库（每仓一行）" }, ...args.locations];
  const locationId =
    args.locationId && locationOptions.some((item) => item.value === args.locationId)
      ? args.locationId
      : args.locations.length === 1
        ? args.locations[0]?.value ?? "all"
        : "all";
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: INVENTORY_EXPORT_SKILL_ID,
    title: "导出库存",
    summary: "按 Shopify 官方库存 CSV 导出：每个变体在每个仓库一行。On hand (new) 留空，改完再导入。",
    targets: productTargets(args.products),
    params: [
      {
        key: "location",
        label: "仓库",
        type: args.locations.length <= 1 ? "hidden" : "location",
        value: locationId,
        options: locationOptions,
      },
    ],
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
      "只认 Shopify 库存 CSV。填了 On hand (new) 的行才会改该仓在库。SKU 列不会改 SKU。本步只校验。",
    targets: { kind: "none", items: [] },
    params: [
      { key: "fileId", label: "上传表格", type: "file", value: args.fileId?.trim() ?? "" },
      { key: "fileName", label: "文件名", type: "hidden", value: args.fileName?.trim() ?? "" },
    ],
  };
}

export function buildInventoryQtyEditProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  mode?: string;
  qtyValue?: string;
  locationId?: string;
  locationName?: string;
  locations: Array<{ value: string; label: string; writable?: boolean }>;
  allWritableLocations?: boolean;
  clearAck?: boolean;
}): TaskProposalPayload {
  const writable = args.locations.filter((item) => item.writable !== false);
  const single = writable.length === 1;
  const locationId =
    args.locationId && writable.some((item) => item.value === args.locationId)
      ? args.locationId
      : (writable[0]?.value ?? "");
  const locationName =
    writable.find((item) => item.value === locationId)?.label ?? args.locationName ?? "";
  const mode = args.mode === "adjust" || args.mode === "clear" || args.mode === "set" ? args.mode : "set";
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: INVENTORY_QTY_EDIT_SKILL_ID,
    title: mode === "clear" ? "清零库存" : mode === "adjust" ? "增减库存" : "设置库存",
    summary:
      mode === "clear"
        ? "把所选仓库的可售库存置 0。不把在库打成 0，避免未发货订单占用导致失败。"
        : "改的是所选仓库的可售库存（Available）。有占用时在库会大于可售。本步只生成预览。",
    targets: productTargets(args.products),
    params: [
      {
        key: "mode",
        label: "方式",
        type: "select",
        value: mode,
        options: [
          { value: "set", label: "设置可售数量" },
          { value: "adjust", label: "增加 / 减少" },
          { value: "clear", label: "清零可售" },
        ],
      },
      {
        key: "qtyValue",
        label: mode === "adjust" ? "差额" : "可售数量",
        type: mode === "clear" ? "hidden" : "text",
        value: mode === "clear" ? "0" : (args.qtyValue ?? ""),
        placeholder: mode === "adjust" ? "正数增加，负数减少" : "例如 50",
      },
      {
        key: "location",
        label: "仓库",
        type: single || args.allWritableLocations ? "hidden" : "location",
        value: locationId,
        options: args.locations,
      },
      { key: "locationName", label: "仓库名", type: "hidden", value: locationName },
      {
        key: "allWritableLocations",
        label: "清零全部可写仓库",
        type: mode === "clear" ? "select" : "hidden",
        value: args.allWritableLocations ? "true" : "false",
        options: [
          { value: "false", label: "只改所选仓库" },
          { value: "true", label: "全部可写仓库（高风险）" },
        ],
      },
      {
        key: "clearAck",
        label: "确认清零",
        type: mode === "clear" ? "select" : "hidden",
        value: args.clearAck ? "true" : "false",
        options: [
          { value: "false", label: "尚未确认" },
          { value: "true", label: "确认将可售库存置 0" },
        ],
      },
    ],
  };
}

export { INVENTORY_QTY_MAX_PRODUCTS, SKU_EXPORT_MAX_PRODUCTS };
