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

/** schema 驱动的参数字段：value 内联在字段里，前端按 type 渲染控件。 */
export type TaskProposalField = {
  key: string;
  label: string;
  type: "select" | "text";
  value: string;
  /** type === "select" 时必填 */
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export type TaskProposalTarget = {
  id: string;
  title: string;
  imageUrl?: string | null;
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

function coerceField(raw: unknown): TaskProposalField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = safeString(r.key);
  const label = safeString(r.label, key);
  if (!key) return null;
  const type = r.type === "select" ? "select" : "text";
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
  return {
    id,
    title: safeString(r.title, "未命名对象"),
    imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : null,
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
 * 优先级：proposal 自带 items > 工作台手动勾选 > 工作台按条件圈定（query）。
 */
export function mergeTaskProposalTargets(
  proposal: TaskProposalPayload,
  contextProducts: Array<{ id: string; title: string; imageUrl?: string | null }>,
  contextProductQuery?: ObjectQuerySelection | null,
): TaskProposalPayload {
  if (proposal.targets.items.length > 0 || proposal.targets.query) return proposal;
  if (contextProducts.length > 0) {
    return {
      ...proposal,
      targets: {
        ...proposal.targets,
        items: contextProducts.map((p) => ({
          id: p.id,
          title: p.title,
          imageUrl: p.imageUrl ?? null,
        })),
      },
    };
  }
  if (contextProductQuery && contextProductQuery.kind === "product") {
    return {
      ...proposal,
      targets: { ...proposal.targets, query: contextProductQuery },
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
    summary: "为每个勾选商品的主图创建一个图片翻译任务，完成后可在任务列表逐个审核应用。",
    targets: {
      kind: "products",
      items: args.products.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl ?? null,
        ...(p.imageUrl ? {} : { disabledReason: "无主图" }),
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
