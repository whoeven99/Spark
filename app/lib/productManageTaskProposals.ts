/**
 * 商品管理 TaskProposal 构造（导出 / 导入）。
 * 单独文件，避免继续膨胀 taskProposalPayload.ts。
 */
import {
  TASK_PROPOSAL_VERSION,
  type TaskProposalPayload,
} from "./taskProposalPayload";
import {
  PRODUCT_IMPORT_OPERATION_GROUPS,
  PRODUCT_IMPORT_SKILL_ID,
  serializeImportOperations,
} from "./productImport";

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

function pickOption(
  options: Array<{ value: string; label: string }>,
  value: string | undefined,
  fallback: string,
): string {
  return value && options.some((option) => option.value === value) ? value : fallback;
}

export const PRODUCT_EXPORT_SKILL_ID = "product_export";
export { PRODUCT_IMPORT_SKILL_ID };

export const PRODUCT_EXPORT_FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "shopify_csv", label: "Shopify CSV" },
  { value: "tiktok_csv", label: "TikTok Catalog Feed CSV" },
];

export function buildProductExportProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  exportFormat?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: PRODUCT_EXPORT_SKILL_ID,
    title: "导出商品",
    summary:
      "导出已选商品的 CSV。一期只支持已选范围（最多 200 个），不会改店铺数据。缺必填列的行会进校验报告。",
    targets: productTargets(args.products),
    params: [
      {
        key: "exportFormat",
        label: "导出格式",
        type: "select",
        value: pickOption(PRODUCT_EXPORT_FORMAT_OPTIONS, args.exportFormat, "shopify_csv"),
        options: PRODUCT_EXPORT_FORMAT_OPTIONS,
      },
    ],
  };
}

export function buildProductImportProposal(args: {
  fileId?: string;
  fileName?: string;
  operations?: string[] | string;
}): TaskProposalPayload {
  const fileId = args.fileId?.trim() ?? "";
  const fileName = args.fileName?.trim() ?? "";
  const operations = serializeImportOperations(args.operations);
  const operationOptions = PRODUCT_IMPORT_OPERATION_GROUPS.flatMap((group) =>
    group.operations.map((operation) => ({
      value: operation,
      label: operation,
      group: group.key,
    })),
  );
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: PRODUCT_IMPORT_SKILL_ID,
    title: "导入商品",
    summary:
      "先勾选要写入的内容，再在卡片上上传 CSV 或 Excel。确认后只校验勾选的模块，不会立刻改店铺。",
    targets: { kind: "none", items: [] },
    params: [
      {
        key: "operations",
        label: "要写入的内容",
        type: "multiselect",
        value: operations,
        options: operationOptions,
      },
      {
        key: "fileId",
        label: "上传表格",
        type: "file",
        value: fileId,
      },
      {
        key: "fileName",
        label: "文件名",
        type: "hidden",
        value: fileName,
      },
    ],
  };
}
