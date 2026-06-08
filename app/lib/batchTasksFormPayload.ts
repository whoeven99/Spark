/**
 * BatchTasksFormPayload — 批量任务确认卡片的数据结构
 * 由 AI skill 填充，前端卡片读取。
 */

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
