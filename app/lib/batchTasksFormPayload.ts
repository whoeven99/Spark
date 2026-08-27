/**
 * BatchTasksFormPayload — 批量任务确认卡片的数据结构
 * 由 AI skill 填充，前端卡片读取。
 */
import {
  detectPictureTranslateTargetLanguage,
  isPictureTranslateUserIntent,
} from "./chatCardFallback";

export type BatchTaskProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
};

export type BatchTasksFormPayload = {
  taskType: "product_improve" | "picture_translate";
  products: BatchTaskProduct[];
  /** 目标语言（描述生成 + 图片翻译目标语言） */
  targetLanguage: string;
  /** 源语言（图片翻译用，默认 auto） */
  sourceLanguage: string;
};

const DEFAULT_PAYLOAD: BatchTasksFormPayload = {
  taskType: "product_improve",
  products: [],
  targetLanguage: "en",
  sourceLanguage: "auto",
};

function safeString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function safeProducts(v: unknown): BatchTaskProduct[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      id: safeString(item.id, ""),
      title: safeString(item.title, "未知商品"),
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    }))
    .filter((p) => p.id !== "");
}

/** 当 AI 未填入 products 时，用工作台已选商品补全。 */
export function mergeBatchTasksPayloadWithContext(
  payload: BatchTasksFormPayload,
  contextProducts: BatchTaskProduct[],
): BatchTasksFormPayload {
  if (payload.products.length > 0) return payload;
  if (contextProducts.length === 0) return payload;
  return { ...payload, products: contextProducts };
}

/**
 * 按用户真实意图纠正批量任务类型：当用户明确要「翻译图片」但模型把
 * taskType 填成了 product_improve（描述生成）时，改回 picture_translate，
 * 并按用户正文修正目标语言（识别不到回落 zh）。已是 picture_translate 时不动。
 */
export function alignBatchTasksPayloadWithUserIntent(
  payload: BatchTasksFormPayload,
  lastUserText: string,
): BatchTasksFormPayload {
  if (payload.taskType === "picture_translate") return payload;
  if (!isPictureTranslateUserIntent(lastUserText)) return payload;
  return {
    ...payload,
    taskType: "picture_translate",
    targetLanguage: detectPictureTranslateTargetLanguage(lastUserText) ?? "zh",
    sourceLanguage: payload.sourceLanguage?.trim() || "auto",
  };
}

export function coerceBatchTasksFormPayload(raw: unknown): BatchTasksFormPayload {
  // LangChain on_tool_start / on_tool_end may pass a JSON string instead of a parsed object
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_PAYLOAD };
    }
  }
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PAYLOAD };
  const r = raw as Record<string, unknown>;
  const taskType =
    r.taskType === "picture_translate" ? "picture_translate" : "product_improve";
  return {
    taskType,
    products: safeProducts(r.products),
    targetLanguage: safeString(r.targetLanguage, taskType === "picture_translate" ? "zh" : "en"),
    sourceLanguage: safeString(r.sourceLanguage, "auto"),
  };
}
