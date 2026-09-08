export const XHS_DIRECTIONS = ["howto", "compare", "data"] as const;

export type XhsDirection = (typeof XHS_DIRECTIONS)[number];

export type XhsCoverSlots = {
  headline: string;
  subhead: string;
  left: string[];
  right: string[];
  metric: string;
  metricNote: string;
  promptBox: string;
};

export type XhsCopyDraft = {
  title: string;
  body: string;
  tags: string[];
  cover: XhsCoverSlots;
};

const BANNED = ["最", "第一", "100%", "神仙", "宝藏", "绝对", "保证"];

export function isXhsDirection(value: string): value is XhsDirection {
  return (XHS_DIRECTIONS as readonly string[]).includes(value);
}

export function directionLabel(direction: XhsDirection): string {
  switch (direction) {
    case "howto":
      return "功能";
    case "compare":
      return "对比";
    case "data":
      return "数据";
    default: {
      const _never: never = direction;
      return _never;
    }
  }
}

export function playbookHint(direction: XhsDirection): string {
  switch (direction) {
    case "howto":
      return [
        "标题公式：数字+动作，或「别再…」。14 字内，前 8 字能看懂。",
        "正文：钩子（1-2 句）→ 共鸣 → 3 步干货 → 一句收尾。短句换行，别写说明书。",
        "封面槽：headline 3-10 字；subhead 一句痛点；promptBox 放可复制的短提示词。",
      ].join("\n");
    case "compare":
      return [
        "标题公式：A vs B，或「为什么不…」。14 字内。",
        "正文：先抛旧方法的坑，再给新方法 4 条，最后一句结论。",
        "封面槽：headline 3-10 字；left 旧方法 4 条（每条≤8字）；right 新方法 4 条。",
      ].join("\n");
    case "data":
      return [
        "标题公式：结果数字前置，如「转化率 +32%」。没有真实数字就写「某店对照」，禁止编造精确值。",
        "正文：数字从哪来、改了什么、别的先不动。",
        "封面槽：headline 3-10 字；metric 只放一个数字；metricNote 写口径。",
      ].join("\n");
    default: {
      const _never: never = direction;
      return _never;
    }
  }
}

export function emptyCoverSlots(): XhsCoverSlots {
  return {
    headline: "",
    subhead: "",
    left: [],
    right: [],
    metric: "",
    metricNote: "",
    promptBox: "",
  };
}

export function normalizeDraft(raw: unknown, fallbackTopic: string): XhsCopyDraft {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const coverRaw =
    obj.cover && typeof obj.cover === "object"
      ? (obj.cover as Record<string, unknown>)
      : {};

  const title = clip(asString(obj.title) || fallbackTopic, 18);
  const body = asString(obj.body).slice(0, 1200);
  const tags = asStringList(obj.tags).slice(0, 6);
  const left = asStringList(coverRaw.left).map((s) => clip(s, 10)).slice(0, 4);
  const right = asStringList(coverRaw.right).map((s) => clip(s, 10)).slice(0, 4);

  return {
    title,
    body,
    tags: tags.length > 0 ? tags : ["独立站", "Shopify", "AI运营"],
    cover: {
      headline: clip(asString(coverRaw.headline) || title, 10),
      subhead: clip(asString(coverRaw.subhead), 22),
      left,
      right,
      metric: clip(asString(coverRaw.metric), 12),
      metricNote: clip(asString(coverRaw.metricNote), 22),
      promptBox: clip(asString(coverRaw.promptBox), 80),
    },
  };
}

export function findBannedHit(text: string): string | null {
  return BANNED.find((word) => text.includes(word)) ?? null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}
