/**
 * TaskProposal — 通用「任务确认卡片」流式协议（阶段 1）。
 *
 * 目标：任何 Skill 想让用户确认后再执行批量任务时，发出一个 TaskProposalPayload，
 * 前端用同一个 TaskProposalCard 渲染（目标对象勾选 + schema 驱动的参数表单 + 执行估算），
 * 替代每个功能各写一套卡片 + flag + payload 管道的旧模式。
 *
 * 流转：
 *   Skill (server) → SSE chunk { type: "task_proposal", payload }
 *                  → done.metadata.uiPayloads.taskProposal（兜底）
 *   前端确认后    → POST /api/task-proposal { intent: "execute", skillId, params, targets }
 *   估算          → POST /api/task-proposal { intent: "estimate", skillId, params }
 */

import {
  coerceObjectQuerySelection,
  type ObjectQuerySelection,
} from "./objectQuerySpec";
import {
  filterPictureTranslateSourceLanguages,
  filterPictureTranslateTargetLanguages,
} from "../config/pictureTranslateLanguages";

export const TASK_PROPOSAL_VERSION = 1;

/**
 * schema 驱动的参数字段：value 内联在字段里，前端按 type 渲染控件。
 *
 * `hidden` 用于执行端需要、但用户不该看见也不该改的值（如上传文件的 fileId）：
 * 卡片不渲染它，提交时照常随 params 一起带上。
 *
 * `collection` / `location` / `metafieldDefinition` 是「远端资源选择器」：
 * 取值是店铺侧的资源标识（前两个是 Shopify GID，metafieldDefinition 是 `namespace.key`
 * —— Shopify 自 2026-07 起把按 id 查定义标为 deprecated，改推 namespace + key），
 * options 由服务端在开卡时预取。它们与 `select` 的区别有两点——卡片渲染成带搜索框的下拉
 * （合集可能有上百个），且展示时直接用 option 自带的 label，
 * 不去 i18n 表里查（资源标识查不到任何东西）。以后再接别的资源选择器沿用这个分支。
 */
export type TaskProposalField = {
  key: string;
  label: string;
  type:
    | "select"
    | "collection"
    | "location"
    | "metafieldDefinition"
    | "text"
    | "textarea"
    | "hidden";
  value: string;
  /** type === "select" 或任一资源选择器时必填 */
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

/** 取值来自 options 自带 label、而非 i18n 枚举表的字段类型。 */
export function isResourceOptionField(type: TaskProposalField["type"]): boolean {
  return type === "collection" || type === "location" || type === "metafieldDefinition";
}

export type TaskProposalTarget = {
  id: string;
  title: string;
  imageUrl?: string | null;
  /**
   * 图片翻译等多图场景：id 可能是「商品::图片」复合键，真正的商品 GID 放这里。
   * 未设时执行端回退用 id（商品级目标）。
   */
  productId?: string;
  /** 不可执行原因（如图片翻译但无主图）；有值时默认不勾选 */
  disabledReason?: string;
};

export type TaskProposalTargetKind = "products" | "articles" | "orders" | "none";

export type TaskProposalPayload = {
  version: typeof TASK_PROPOSAL_VERSION;
  proposalId: string;
  /** 执行该任务的 skill 标识，决定 /api/task-proposal 的路由 */
  skillId: string;
  title: string;
  summary?: string;
  targets: {
    kind: TaskProposalTargetKind;
    items: TaskProposalTarget[];
    /**
     * 按条件圈定（阶段 2）：与 items 互斥优先级低于 items。
     * 有 query 且 items 为空时，执行端按条件重新求值（不固化 ID）。
     */
    query?: ObjectQuerySelection;
  };
  params: TaskProposalField[];
};

/** /api/task-proposal estimate 响应（per-item，由前端乘以勾选数量） */
export type TaskProposalEstimateResponse =
  | {
      ok: true;
      perItemCredits: number | null;
      perItemSeconds: number | null;
    }
  | { ok: false; error: string };

export type TaskProposalExecuteError = {
  index: number;
  targetId: string;
  error: string;
};

export type TaskProposalExecuteResponse =
  | {
      ok: true;
      created: number;
      taskIds: string[];
      errors: TaskProposalExecuteError[];
    }
  | { ok: false; error: string };

// ─── coerce ───────────────────────────────────────────────────────────────────

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

const KNOWN_FIELD_TYPES = new Set<TaskProposalField["type"]>([
  "select",
  "collection",
  "location",
  "metafieldDefinition",
  "text",
  "textarea",
  "hidden",
]);

function coerceField(raw: unknown): TaskProposalField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = safeString(r.key);
  const label = safeString(r.label, key);
  if (!key) return null;
  const type = KNOWN_FIELD_TYPES.has(r.type as TaskProposalField["type"])
    ? (r.type as TaskProposalField["type"])
    : "text";
  const options = Array.isArray(r.options)
    ? r.options
        .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
        .map((o) => ({ value: safeString(o.value), label: safeString(o.label, safeString(o.value)) }))
        .filter((o) => o.value !== "")
    : undefined;
  return {
    key,
    label,
    type,
    value: safeString(r.value),
    ...(options && options.length > 0 ? { options } : {}),
    ...(safeString(r.placeholder) ? { placeholder: safeString(r.placeholder) } : {}),
  };
}

function coerceTarget(raw: unknown): TaskProposalTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = safeString(r.id);
  if (!id) return null;
  const productId = safeString(r.productId);
  return {
    id,
    title: safeString(r.title, "未命名对象"),
    imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : null,
    ...(productId ? { productId } : {}),
    ...(safeString(r.disabledReason) ? { disabledReason: safeString(r.disabledReason) } : {}),
  };
}

function coerceTargetKind(raw: unknown): TaskProposalTargetKind {
  return raw === "products" || raw === "articles" || raw === "orders" ? raw : "none";
}

/** 防御式解析（SSE / 数据库 payloads 反序列化用）。结构不合法返回 null。 */
export function coerceTaskProposalPayload(raw: unknown): TaskProposalPayload | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const skillId = safeString(r.skillId);
  if (!skillId) return null;
  const targetsRaw = (r.targets ?? {}) as Record<string, unknown>;
  const items = Array.isArray(targetsRaw.items)
    ? targetsRaw.items.map(coerceTarget).filter((t): t is TaskProposalTarget => t !== null)
    : [];
  const targetsQuery = coerceObjectQuerySelection(targetsRaw.query);
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: safeString(r.proposalId, `tp-${Date.now()}`),
    skillId,
    title: safeString(r.title, "任务确认"),
    ...(safeString(r.summary) ? { summary: safeString(r.summary) } : {}),
    targets: {
      kind: coerceTargetKind(targetsRaw.kind),
      items,
      ...(targetsQuery ? { query: targetsQuery } : {}),
    },
    params: Array.isArray(r.params)
      ? r.params.map(coerceField).filter((f): f is TaskProposalField => f !== null)
      : [],
  };
}

// ─── 批量商品描述生成（阶段 1 首个走通协议的 Skill） ─────────────────────────

export const BATCH_PRODUCT_IMPROVE_SKILL_ID = "batch_product_improve";

export const PRODUCT_IMPROVE_LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
];

/**
 * 客户端兜底合并：AI 没填 targets 时，用工作台已选商品（或按条件圈定）补全。
 * 默认优先级：proposal 自带 items/query > 工作台手动勾选 > 工作台按条件圈定。
 * preferContext=true（用户在本卡点了「更换/选择商品」）时改为：工作台当前选择优先，
 * 避免历史消息里固化的 targets 挡住更换结果；其它卡片不受影响。
 * 图片翻译类提案补全时，无主图的商品自动标记不可执行。
 */
export function mergeTaskProposalTargets(
  proposal: TaskProposalPayload,
  contextProducts: Array<{ id: string; title: string; imageUrl?: string | null }>,
  contextProductQuery?: ObjectQuerySelection | null,
  options?: { preferContext?: boolean },
): TaskProposalPayload {
  // 文生图参考商品可选：工具未预填时，只用工作台第一个已选商品补全
  if (proposal.skillId === IMAGE_GENERATION_SKILL_ID) {
    if (proposal.targets.items.length > 0) return proposal;
    const first = contextProducts[0];
    if (!first?.id.trim()) return proposal;
    return {
      ...proposal,
      targets: {
        kind: "products",
        items: [
          {
            id: first.id,
            title: first.title,
            imageUrl: first.imageUrl ?? null,
          },
        ],
      },
    };
  }
  // 无目标对象的技能不做上下文兜底
  if (proposal.targets.kind === "none") return proposal;

  const preferContext = Boolean(options?.preferContext);
  const shouldKeepProposalTargets =
    !preferContext &&
    (proposal.targets.items.length > 0 || Boolean(proposal.targets.query));
  if (shouldKeepProposalTargets) return proposal;

  const requiresImage = proposal.skillId === BATCH_PICTURE_TRANSLATE_SKILL_ID;
  if (contextProducts.length > 0) {
    return {
      ...proposal,
      targets: {
        ...proposal.targets,
        query: undefined,
        items: contextProducts.map((p) => ({
          id: p.id,
          title: p.title,
          imageUrl: p.imageUrl ?? null,
          ...(requiresImage && !p.imageUrl
            ? { disabledReason: "no_primary_image" }
            : {}),
        })),
      },
    };
  }
  if (contextProductQuery && contextProductQuery.kind === "product") {
    return {
      ...proposal,
      targets: { ...proposal.targets, items: [], query: contextProductQuery },
    };
  }
  // 用户主动改选后清空了上下文：露出「选择商品」空态，而不是继续显示旧 proposal
  if (preferContext) {
    return {
      ...proposal,
      targets: { ...proposal.targets, items: [], query: undefined },
    };
  }
  return proposal;
}

/**
 * 旧 BatchTasksFormPayload → TaskProposal 转换（阶段 4 起两种任务类型都走新协议）。
 * products 允许为空：客户端会用工作台已选商品补全 targets。
 */
export function taskProposalFromBatchTasksPayload(payload: {
  taskType: string;
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  targetLanguage?: string;
  sourceLanguage?: string;
}): TaskProposalPayload | null {
  if (payload.taskType === "picture_translate") {
    return buildBatchPictureTranslateProposal({
      products: payload.products,
      sourceLanguage: payload.sourceLanguage,
      targetLanguage: payload.targetLanguage,
    });
  }
  if (payload.taskType !== "product_improve") return null;
  return buildBatchProductImproveProposal({
    products: payload.products,
    targetLanguage: payload.targetLanguage,
  });
}

// ─── 文生图（参考商品可选：无商品时 kind=none；有商品时 kind=products 且仅 1 个） ────

export const IMAGE_GENERATION_SKILL_ID = "image_generation";

/** 文生图表单 → 提案（旧 open_image_generation_form 卡片的替代）。 */
export function buildImageGenerationProposal(form: {
  description?: string;
  productId?: string;
  productTitle?: string;
  imageUrl?: string | null;
}): TaskProposalPayload {
  const productId = form.productId?.trim() ?? "";
  const productTitle = form.productTitle?.trim() ?? "";
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: `tp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    skillId: IMAGE_GENERATION_SKILL_ID,
    title: "AI 生成商品图片",
    summary: "根据描述生成一张商品图片，完成后可在任务列表查看与应用。",
    targets: productId
      ? {
          kind: "products",
          items: [
            {
              id: productId,
              title: productTitle || productId,
              imageUrl: form.imageUrl ?? null,
            },
          ],
        }
      : { kind: "none", items: [] },
    params: [
      {
        key: "description",
        label: "图片描述",
        type: "textarea",
        value: form.description?.trim() ?? "",
        placeholder: "描述想要的图片，如：白底极简风格的陶瓷马克杯",
      },
    ],
  };
}

// ─── 变体批量调价（受控写回：dry-run 预览 + 二次确认才写 Shopify） ───────────

export const BULK_PRICE_EDIT_SKILL_ID = "bulk_price_edit";

export const BULK_PRICE_EDIT_PRICE_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "percent_down", label: "按百分比降价" },
  { value: "percent_up", label: "按百分比涨价" },
  { value: "amount_down", label: "按固定金额降价" },
  { value: "amount_up", label: "按固定金额涨价" },
  { value: "set_fixed", label: "统一设为固定价" },
  { value: "unchanged", label: "价格不变" },
];

export const BULK_PRICE_EDIT_ROUNDING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "不取整" },
  { value: "end99", label: "取整到 .99" },
  { value: "end95", label: "取整到 .95" },
  { value: "integer", label: "取整到整数" },
];

export const BULK_PRICE_EDIT_COMPARE_AT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unchanged", label: "划线价不变" },
  { value: "original_price", label: "把调价前的原价写成划线价" },
  { value: "clear", label: "清空划线价" },
];

function pickOption(
  options: Array<{ value: string; label: string }>,
  value: string | undefined,
  fallback: string,
): string {
  return value && options.some((o) => o.value === value) ? value : fallback;
}

/**
 * 由商品列表 + 规则构造「批量调价」提案。
 * 确认后只创建一个 dry-run 任务（读 + 算），真正写 Shopify 要在审核弹窗再确认一次。
 */
export function buildBulkPriceEditProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  priceMode?: string;
  priceValue?: string | number;
  rounding?: string;
  compareAtMode?: string;
  minPrice?: string | number;
}): TaskProposalPayload {
  const priceMode = pickOption(BULK_PRICE_EDIT_PRICE_MODE_OPTIONS, args.priceMode, "percent_down");
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: `tp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    skillId: BULK_PRICE_EDIT_SKILL_ID,
    title: "批量调整变体价格",
    summary:
      "先按规则算出每个变体的新价并生成变更清单（可导出 CSV），确认无误后才写回店铺。本步骤不会修改任何商品。",
    targets: {
      kind: "products",
      items: args.products.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl ?? null,
      })),
    },
    params: [
      {
        key: "priceMode",
        label: "调价方式",
        type: "select",
        value: priceMode,
        options: BULK_PRICE_EDIT_PRICE_MODE_OPTIONS,
      },
      {
        key: "priceValue",
        label: "调价数值",
        type: "text",
        value: args.priceValue != null ? String(args.priceValue) : "",
        placeholder: "百分比填 10 表示 10%；金额填 5 表示 5 元/美元",
      },
      {
        key: "rounding",
        label: "取整方式",
        type: "select",
        value: pickOption(BULK_PRICE_EDIT_ROUNDING_OPTIONS, args.rounding, "none"),
        options: BULK_PRICE_EDIT_ROUNDING_OPTIONS,
      },
      {
        key: "compareAtMode",
        label: "划线价处理",
        type: "select",
        value: pickOption(BULK_PRICE_EDIT_COMPARE_AT_OPTIONS, args.compareAtMode, "unchanged"),
        options: BULK_PRICE_EDIT_COMPARE_AT_OPTIONS,
      },
      {
        key: "minPrice",
        label: "最低价保护",
        type: "text",
        value: args.minPrice != null ? String(args.minPrice) : "",
        placeholder: "留空表示不设下限；填 9.9 表示新价低于 9.9 的变体跳过",
      },
    ],
  };
}

// ─── 商品批量打标（受控写回：dry-run 预览 + 二次确认才写 Shopify） ───────────

export const BULK_TAG_EDIT_SKILL_ID = "bulk_tag_edit";

/**
 * 由商品列表 + 规则构造「批量打标」提案。
 * 确认后只创建一个 dry-run 任务（读 + 算），真正写 Shopify 要在审核弹窗再确认一次。
 */
export function buildBulkTagEditProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  addTags?: string;
  removeTags?: string;
  removePrefixes?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: `tp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    skillId: BULK_TAG_EDIT_SKILL_ID,
    title: "批量修改商品标签",
    summary:
      "先算出每个商品的标签变化并生成变更清单（可导出 CSV），确认无误后才写回店铺。本步骤不会修改任何商品。",
    targets: {
      kind: "products",
      items: args.products.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl ?? null,
      })),
    },
    params: [
      {
        key: "addTags",
        label: "要添加的标签",
        type: "text",
        value: args.addTags ?? "",
        placeholder: "多个标签用逗号分隔，如：夏季清仓, 包邮",
      },
      {
        key: "removeTags",
        label: "要移除的标签",
        type: "text",
        value: args.removeTags ?? "",
        placeholder: "多个标签用逗号分隔；留空表示不移除",
      },
      {
        key: "removePrefixes",
        label: "按前缀清理",
        type: "text",
        value: args.removePrefixes ?? "",
        placeholder: "如填 sale- 会清掉 sale-2026、sale-summer；留空表示不清理",
      },
    ],
  };
}

// ─── 商品批量上下架（受控写回：dry-run 预览 + 二次确认才写 Shopify） ─────────

export const BULK_STATUS_EDIT_SKILL_ID = "bulk_status_edit";

/**
 * `unset` 是刻意保留的占位项：上架与下架方向相反，默认帮用户选一个的代价太大。
 * 它不是合法规则值，`parseBulkStatusEditRule` 会拒绝并提示先选方向。
 */
export const BULK_STATUS_EDIT_TARGET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unset", label: "请选择：上架或下架" },
  { value: "active", label: "上架（Active）" },
  { value: "draft", label: "下架为草稿（Draft）" },
];

export const BULK_STATUS_EDIT_INVENTORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "不限库存" },
  { value: "out_of_stock_only", label: "只处理库存为 0 的" },
  { value: "in_stock_only", label: "只处理有库存的" },
];

/**
 * 由商品列表 + 规则构造「批量上下架」提案。
 * 确认后只创建一个 dry-run 任务（读 + 算），真正写 Shopify 要在审核弹窗再确认一次。
 *
 * targetStatus 没有默认值：上架和下架方向相反，默认选一个等于替用户做了危险决定。
 */
export function buildBulkStatusEditProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  targetStatus?: string;
  inventoryCondition?: string;
}): TaskProposalPayload {
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: `tp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    skillId: BULK_STATUS_EDIT_SKILL_ID,
    title: "批量上下架商品",
    summary:
      "先算出每个商品的状态变化并生成变更清单（可导出 CSV），确认无误后才写回店铺。本步骤不会修改任何商品。",
    targets: {
      kind: "products",
      items: args.products.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl ?? null,
      })),
    },
    params: [
      {
        key: "targetStatus",
        label: "目标状态",
        type: "select",
        value: pickOption(BULK_STATUS_EDIT_TARGET_OPTIONS, args.targetStatus, "unset"),
        options: BULK_STATUS_EDIT_TARGET_OPTIONS,
      },
      {
        key: "inventoryCondition",
        label: "库存条件",
        type: "select",
        value: pickOption(BULK_STATUS_EDIT_INVENTORY_OPTIONS, args.inventoryCondition, "none"),
        options: BULK_STATUS_EDIT_INVENTORY_OPTIONS,
      },
    ],
  };
}

// ─── 批量图片翻译（阶段 4 第二个走通协议的 Skill） ───────────────────────────

export const BATCH_PICTURE_TRANSLATE_SKILL_ID = "batch_picture_translate";

/** 语言代码 → 中文显示名（Intl.DisplayNames，失败时回退 code 本身） */
function pictureTranslateLanguageLabel(code: string): string {
  if (code === "auto") return "自动检测";
  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const PICTURE_TRANSLATE_SOURCE_OPTIONS: Array<{ value: string; label: string }> =
  filterPictureTranslateSourceLanguages(null).map((language) => ({
    value: language.code,
    label: pictureTranslateLanguageLabel(language.code),
  }));

export const PICTURE_TRANSLATE_TARGET_OPTIONS: Array<{ value: string; label: string }> =
  filterPictureTranslateTargetLanguages({ sourceLanguage: "auto", provider: null }).map(
    (language) => ({
      value: language.code,
      label: pictureTranslateLanguageLabel(language.code),
    }),
  );

/** 由批量商品列表构造「批量翻译商品图片」提案。无主图的商品标记为不可执行。 */
export function buildBatchPictureTranslateProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  sourceLanguage?: string;
  targetLanguage?: string;
}): TaskProposalPayload {
  const sourceLanguage =
    args.sourceLanguage &&
    PICTURE_TRANSLATE_SOURCE_OPTIONS.some((o) => o.value === args.sourceLanguage)
      ? args.sourceLanguage
      : "auto";
  const targetLanguage =
    args.targetLanguage &&
    PICTURE_TRANSLATE_TARGET_OPTIONS.some((o) => o.value === args.targetLanguage)
      ? args.targetLanguage
      : "zh";
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: `tp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    skillId: BATCH_PICTURE_TRANSLATE_SKILL_ID,
    title: "批量翻译商品图片",
    summary: "为勾选商品中选中的图片创建翻译任务，完成后可在任务列表逐个审核应用。",
    targets: {
      kind: "products",
      items: args.products.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl ?? null,
        ...(p.imageUrl ? {} : { disabledReason: "no_primary_image" }),
      })),
    },
    params: [
      {
        key: "sourceLanguage",
        label: "源语言",
        type: "select",
        value: sourceLanguage,
        options: PICTURE_TRANSLATE_SOURCE_OPTIONS,
      },
      {
        key: "targetLanguage",
        label: "目标语言",
        type: "select",
        value: targetLanguage,
        options: PICTURE_TRANSLATE_TARGET_OPTIONS,
      },
    ],
  };
}

/**
 * 单图翻译表单 → 提案（旧 open_picture_translate_form 卡片的替代）。
 * imageUrl 缺失时 targets 为空，由 mergeTaskProposalTargets 用工作台上下文兜底。
 */
export function buildSinglePictureTranslateProposal(form: {
  imageUrl?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}): TaskProposalPayload {
  return buildBatchPictureTranslateProposal({
    products: form.imageUrl
      ? [{ id: form.imageUrl, title: "对话中的图片", imageUrl: form.imageUrl }]
      : [],
    sourceLanguage: form.sourceLanguage,
    targetLanguage: form.targetLanguage,
  });
}

/**
 * 单商品描述表单 → 提案（旧 open_product_improve_form 卡片的替代）。
 * productId 缺失时 targets 为空，由工作台上下文兜底。
 */
export function buildSingleProductImproveProposal(form: {
  productId?: string;
  title?: string;
  targetLanguage?: string;
}): TaskProposalPayload {
  return buildBatchProductImproveProposal({
    products: form.productId?.trim()
      ? [{ id: form.productId.trim(), title: form.title?.trim() || "商品" }]
      : [],
    targetLanguage: form.targetLanguage,
  });
}

/** 由批量商品列表构造「批量商品描述生成」提案（服务端发射 / 客户端工作台兜底共用）。 */
export function buildBatchProductImproveProposal(args: {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  targetLanguage?: string;
}): TaskProposalPayload {
  const targetLanguage =
    args.targetLanguage &&
    PRODUCT_IMPROVE_LANGUAGE_OPTIONS.some((o) => o.value === args.targetLanguage)
      ? args.targetLanguage
      : "en";
  return {
    version: TASK_PROPOSAL_VERSION,
    proposalId: `tp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`,
    skillId: BATCH_PRODUCT_IMPROVE_SKILL_ID,
    title: "批量生成商品描述",
    summary: "为每个勾选的商品创建一个 AI 描述生成任务，完成后可在任务列表逐个审核应用。",
    targets: {
      kind: "products",
      items: args.products.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl ?? null,
      })),
    },
    params: [
      {
        key: "targetLanguage",
        label: "目标语言",
        type: "select",
        value: targetLanguage,
        options: PRODUCT_IMPROVE_LANGUAGE_OPTIONS,
      },
    ],
  };
}
