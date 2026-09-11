/**
 * 创作页能力清单：目录与工作区都从这里派生，新增能力只在本文件登记一次。
 *
 * 交互契约按 `kind` 分流（细则见 docs/INTERACTION_DESIGN.md）：
 * - read：只查不改，跑完就地出结果，不需要二次确认
 * - generate：消耗 Credit 产出草稿，发起前二次确认，草稿落回店铺前再确认一次
 * - write：改店铺数据，必须走 试算 → 审核 → 二次确认 → 应用（复用 bulk-edit 四层）
 * - import：上传 → 校验 → 预览 → 二次确认 → 写入
 *
 * `status` 决定目录里怎么露出：
 * - ready：页内有工作区，卡片可直接打开
 * - chat：能力已上线但闭环在助手对话里（写回门禁要求 dry-run 产出的 pending_review）
 * - planned：只作为路线图占位，目录不渲染，避免给商户看没做完的入口
 *
 * 域（domain）按《Spark-商家常见操作》预先铺好，未落地的域不渲染但保留归属，
 * 后续能力上线时不需要重新设计导航。整店翻译归 TSF，本清单刻意不设该域。
 */

export type CreateDomainKey =
  | "content"
  | "products"
  | "inventory"
  | "pricing"
  | "orders"
  | "customers"
  | "images"
  | "collections"
  | "discounts"
  | "metafields"
  | "markets"
  | "ads"
  | "alerts";

export type CreateOperationKind = "read" | "generate" | "write" | "import";

/** 页内工作区标识；每个 ready 能力必须对应一个。 */
export type CreateWorkspaceKey = "copy" | "image-generate" | "image-translate";

type CreateOperationBase = {
  key: string;
  domain: CreateDomainKey;
  kind: CreateOperationKind;
};

export type CreateOperation =
  | (CreateOperationBase & { status: "ready"; workspace: CreateWorkspaceKey })
  | (CreateOperationBase & { status: "chat"; chatPromptKey: string })
  | (CreateOperationBase & { status: "planned" });

export type CreateOperationStatus = CreateOperation["status"];

/** 目录里的域顺序：先创作，再按商家操作文档的编排。 */
export const CREATE_DOMAIN_ORDER: readonly CreateDomainKey[] = [
  "content",
  "products",
  "pricing",
  "inventory",
  "orders",
  "customers",
  "images",
  "collections",
  "discounts",
  "metafields",
  "markets",
  "ads",
  "alerts",
];

export const CREATE_OPERATIONS: readonly CreateOperation[] = [
  {
    key: "product-copy",
    domain: "content",
    kind: "generate",
    status: "ready",
    workspace: "copy",
  },
  {
    key: "image-generate",
    domain: "content",
    kind: "generate",
    status: "ready",
    workspace: "image-generate",
  },
  {
    key: "image-translate",
    domain: "content",
    kind: "generate",
    status: "ready",
    workspace: "image-translate",
  },
  {
    key: "seo-audit",
    domain: "products",
    kind: "read",
    status: "chat",
    chatPromptKey: "workspace.shell.chat.recommend.seoAudit.prompt",
  },
  {
    key: "bulk-tag-edit",
    domain: "products",
    kind: "write",
    status: "chat",
    chatPromptKey: "workspace.shell.chat.recommend.bulkTagEdit.prompt.shop",
  },
  {
    key: "bulk-status-edit",
    domain: "products",
    kind: "write",
    status: "chat",
    chatPromptKey: "workspace.shell.chat.recommend.bulkStatusEdit.prompt.shop",
  },
  {
    key: "bulk-price-edit",
    domain: "pricing",
    kind: "write",
    status: "chat",
    chatPromptKey: "workspace.shell.chat.recommend.bulkPriceEdit.prompt.shop",
  },
];

export type CreateDomainSection = {
  domain: CreateDomainKey;
  operations: CreateOperation[];
};

function isVisible(operation: CreateOperation): boolean {
  return operation.status !== "planned";
}

/** 目录分组：只保留有已上线能力的域，planned 不渲染。 */
export function listCreateDomainSections(): CreateDomainSection[] {
  const sections: CreateDomainSection[] = [];
  for (const domain of CREATE_DOMAIN_ORDER) {
    const operations = CREATE_OPERATIONS.filter(
      (operation) => operation.domain === domain && isVisible(operation),
    );
    if (operations.length > 0) sections.push({ domain, operations });
  }
  return sections;
}

export function findCreateOperationByWorkspace(
  workspace: CreateWorkspaceKey,
): CreateOperation | undefined {
  return CREATE_OPERATIONS.find(
    (operation) => operation.status === "ready" && operation.workspace === workspace,
  );
}

export function createDomainLabelKey(domain: CreateDomainKey): string {
  return `createPage.domains.${domain}.label`;
}

export function createDomainDescriptionKey(domain: CreateDomainKey): string {
  return `createPage.domains.${domain}.description`;
}

export function createOperationLabelKey(operationKey: string): string {
  return `createPage.operations.${operationKey}.label`;
}

export function createOperationDescriptionKey(operationKey: string): string {
  return `createPage.operations.${operationKey}.description`;
}
