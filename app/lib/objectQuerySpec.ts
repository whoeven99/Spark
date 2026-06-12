/**
 * ObjectQuerySpec — 「按条件圈定对象」的查询规格（阶段 2）。
 *
 * 与 ID 快照相对：query 保存的是筛选条件本身，每次执行时重新求值。
 * 这是 Playbook 复用的关键——定时任务应每次重新计算「库存 ≤ 10 的商品」，
 * 而不是固化某一天的 ID 列表。
 *
 * 客户端（弹窗条件构建、上下文块、TaskProposalCard）与服务端
 * （/api/shopify/objects 筛选、/api/task-proposal 执行期求值）共用本文件。
 */

export type ObjectQueryKind = "product" | "article";

export type ObjectQueryStatus = "all" | "active" | "draft" | "archived" | "published";

export type ObjectQuerySpec = {
  kind: ObjectQueryKind;
  /** 标题关键词（可选） */
  keyword?: string;
  /** product: active/draft/archived；article: published/draft */
  status?: ObjectQueryStatus;
  /** 商品标签（仅 product） */
  tag?: string;
  /** 库存上限 inventory_total <= N（仅 product） */
  maxInventory?: number;
};

/** 选中后随规格一起保存的展示信息。 */
export type ObjectQuerySelection = ObjectQuerySpec & {
  /** 圈定时的匹配数快照（仅展示用；执行时重新求值） */
  matchCount: number | null;
};

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  draft: "草稿",
  archived: "已归档",
};

const ARTICLE_STATUS_LABELS: Record<string, string> = {
  published: "已发布",
  draft: "草稿",
};

export function objectQueryKindLabel(kind: ObjectQueryKind): string {
  return kind === "product" ? "商品" : "文章";
}

/** 是否为空规格（没有任何有效条件）。空规格视为「全部对象」，允许保存。 */
export function describeObjectQuery(spec: ObjectQuerySpec): string {
  const parts: string[] = [];
  if (spec.keyword?.trim()) parts.push(`标题含“${spec.keyword.trim()}”`);
  if (spec.status && spec.status !== "all") {
    const labels = spec.kind === "product" ? PRODUCT_STATUS_LABELS : ARTICLE_STATUS_LABELS;
    parts.push(`状态 ${labels[spec.status] ?? spec.status}`);
  }
  if (spec.kind === "product" && spec.tag?.trim()) parts.push(`标签 ${spec.tag.trim()}`);
  if (spec.kind === "product" && typeof spec.maxInventory === "number") {
    parts.push(`库存 ≤ ${spec.maxInventory}`);
  }
  if (parts.length === 0) return `全部${objectQueryKindLabel(spec.kind)}`;
  return parts.join("；");
}

/** 机器可读的单行格式，注入上下文块供 AI 透传回 TaskProposal。 */
export function serializeObjectQueryForAI(spec: ObjectQuerySpec): string {
  const parts = [`kind=${spec.kind}`];
  if (spec.keyword?.trim()) parts.push(`keyword=${spec.keyword.trim()}`);
  if (spec.status && spec.status !== "all") parts.push(`status=${spec.status}`);
  if (spec.kind === "product" && spec.tag?.trim()) parts.push(`tag=${spec.tag.trim()}`);
  if (spec.kind === "product" && typeof spec.maxInventory === "number") {
    parts.push(`max_inventory=${spec.maxInventory}`);
  }
  return parts.join("; ");
}

function safeTrimmed(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** 防御式解析（API 入参 / 数据库 payloads 反序列化用）。结构不合法返回 null。 */
export function coerceObjectQuerySpec(raw: unknown): ObjectQuerySpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === "product" || r.kind === "article" ? r.kind : null;
  if (!kind) return null;

  const status =
    r.status === "active" ||
    r.status === "draft" ||
    r.status === "archived" ||
    r.status === "published"
      ? r.status
      : undefined;

  const maxInventoryRaw =
    typeof r.maxInventory === "number"
      ? r.maxInventory
      : typeof r.maxInventory === "string" && r.maxInventory.trim() !== ""
        ? Number(r.maxInventory)
        : undefined;
  const maxInventory =
    typeof maxInventoryRaw === "number" &&
    Number.isFinite(maxInventoryRaw) &&
    maxInventoryRaw >= 0
      ? Math.floor(maxInventoryRaw)
      : undefined;

  return {
    kind,
    ...(safeTrimmed(r.keyword) ? { keyword: safeTrimmed(r.keyword) } : {}),
    ...(status ? { status } : {}),
    ...(kind === "product" && safeTrimmed(r.tag) ? { tag: safeTrimmed(r.tag) } : {}),
    ...(kind === "product" && maxInventory !== undefined ? { maxInventory } : {}),
  };
}

export function coerceObjectQuerySelection(raw: unknown): ObjectQuerySelection | null {
  const spec = coerceObjectQuerySpec(raw);
  if (!spec) return null;
  const r = raw as Record<string, unknown>;
  const matchCount =
    typeof r.matchCount === "number" && Number.isFinite(r.matchCount) && r.matchCount >= 0
      ? Math.floor(r.matchCount)
      : null;
  return { ...spec, matchCount };
}
