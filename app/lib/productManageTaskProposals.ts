/**
 * 商品管理 TaskProposal 构造（导出 / 导入）。
 * 单独文件，避免继续膨胀 taskProposalPayload.ts。
 */
import {
  TASK_PROPOSAL_VERSION,
  type TaskProposalPayload,
} from "./taskProposalPayload";
import { PRODUCT_IMPORT_SKILL_ID } from "./productImport";

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
}): TaskProposalPayload {
  const fileId = args.fileId?.trim() ?? "";
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: PRODUCT_IMPORT_SKILL_ID,
    title: "导入商品",
    summary: args.fileName
      ? `将读取「${args.fileName}」，先对照 Shopify 要求检查问题行并告诉你怎么改，确认后才写回。本步骤不会修改店铺。`
      : "请先在对话输入区上传 CSV 或 Excel。导入会先检查是否符合 Shopify 要求并反馈怎么改，确认后才写回。没有文件无法试算。",
    targets: { kind: "none", items: [] },
    params: [
      {
        key: "fileId",
        label: "上传文件",
        type: "hidden",
        value: fileId,
      },
    ],
  };
}
