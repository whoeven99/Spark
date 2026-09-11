/**
 * 商品管理一期 TaskProposal 构造（字段 / 合集 / 复制 / 归档 / 导出）。
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

export const BULK_PRODUCT_FIELD_EDIT_SKILL_ID = "bulk_product_field_edit";
export const BULK_COLLECTION_EDIT_SKILL_ID = "bulk_collection_edit";
export const PRODUCT_DUPLICATE_SKILL_ID = "product_duplicate";
export const BULK_ARCHIVE_SKILL_ID = "bulk_archive";
export const PRODUCT_EXPORT_SKILL_ID = "product_export";
export { PRODUCT_IMPORT_SKILL_ID };

export const BULK_PRODUCT_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unset", label: "请选择要改的字段" },
  { value: "vendor", label: "Vendor（品牌）" },
  { value: "productType", label: "Product Type（商品类型）" },
  { value: "seoTitle", label: "SEO 标题" },
  { value: "seoDescription", label: "SEO 描述" },
];

export const BULK_PRODUCT_FIELD_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "set", label: "设为指定值" },
  { value: "clear", label: "清空" },
];

export function buildBulkProductFieldEditProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  field?: string;
  mode?: string;
  value?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: BULK_PRODUCT_FIELD_EDIT_SKILL_ID,
    title: "批量修改商品字段",
    summary:
      "先按所选字段算出每个商品的新值并生成变更清单（可导出 CSV），确认无误后才写回店铺。本步骤不会修改任何商品。",
    targets: productTargets(args.products),
    params: [
      {
        key: "field",
        label: "要改的字段",
        type: "select",
        value: pickOption(BULK_PRODUCT_FIELD_OPTIONS, args.field, "unset"),
        options: BULK_PRODUCT_FIELD_OPTIONS,
      },
      {
        key: "mode",
        label: "操作方式",
        type: "select",
        value: pickOption(BULK_PRODUCT_FIELD_MODE_OPTIONS, args.mode, "set"),
        options: BULK_PRODUCT_FIELD_MODE_OPTIONS,
      },
      {
        key: "value",
        label: "写入的值",
        type: "text",
        value: args.value ?? "",
        placeholder: "设为指定值时必填；清空可留空",
      },
    ],
  };
}

export const BULK_COLLECTION_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unset", label: "请选择：加入或移出" },
  { value: "add", label: "加入合集" },
  { value: "remove", label: "移出合集" },
];

export function buildBulkCollectionEditProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  collectionAction?: string;
  collectionId?: string;
  collections?: Array<{ value: string; label: string }>;
}): TaskProposalPayload {
  const collections = args.collections ?? [];
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: BULK_COLLECTION_EDIT_SKILL_ID,
    title: "批量调整商品所属合集",
    summary:
      "先算出每个商品进出合集的变化并生成变更清单（可导出 CSV），确认无误后才写回店铺。本步骤不会修改任何商品。",
    targets: productTargets(args.products),
    params: [
      {
        key: "collectionAction",
        label: "操作方向",
        type: "select",
        value: pickOption(BULK_COLLECTION_ACTION_OPTIONS, args.collectionAction, "unset"),
        options: BULK_COLLECTION_ACTION_OPTIONS,
      },
      {
        key: "collectionId",
        label: "目标合集",
        type: "collection",
        value: args.collectionId ?? "",
        options: collections,
        placeholder: collections.length === 0 ? "店铺里还没有合集" : "搜索合集名称",
      },
    ],
  };
}

export const PRODUCT_DUPLICATE_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "DRAFT", label: "草稿（Draft）" },
  { value: "ACTIVE", label: "上架（Active）" },
];

export const PRODUCT_DUPLICATE_IMAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "true", label: "复制图片" },
  { value: "false", label: "不复制图片" },
];

export function buildProductDuplicateProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  titleSuffix?: string;
  includeImages?: string;
  newStatus?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: PRODUCT_DUPLICATE_SKILL_ID,
    title: "复制商品",
    summary:
      "先算出每个商品复制后的标题与状态并生成清单，确认无误后才在店铺里创建副本。本步骤不会修改原商品。",
    targets: productTargets(args.products),
    params: [
      {
        key: "titleSuffix",
        label: "新标题后缀",
        type: "text",
        value: args.titleSuffix ?? " (Copy)",
        placeholder: "例如： (Copy)",
      },
      {
        key: "includeImages",
        label: "是否复制图片",
        type: "select",
        value: pickOption(PRODUCT_DUPLICATE_IMAGE_OPTIONS, args.includeImages, "true"),
        options: PRODUCT_DUPLICATE_IMAGE_OPTIONS,
      },
      {
        key: "newStatus",
        label: "副本状态",
        type: "select",
        value: pickOption(PRODUCT_DUPLICATE_STATUS_OPTIONS, args.newStatus, "DRAFT"),
        options: PRODUCT_DUPLICATE_STATUS_OPTIONS,
      },
    ],
  };
}

export function buildBulkArchiveProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: proposalId(),
    skillId: BULK_ARCHIVE_SKILL_ID,
    title: "归档商品",
    summary:
      "先算出哪些商品将被归档并生成变更清单（可导出 CSV），确认无误后才写回店铺。已归档的商品会跳过。本步骤不会修改任何商品。",
    targets: productTargets(args.products),
    params: [],
  };
}

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
