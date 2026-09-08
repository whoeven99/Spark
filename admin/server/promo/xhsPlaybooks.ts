export const XHS_DIRECTIONS = ["howto", "compare", "data"] as const;

export type XhsDirection = (typeof XHS_DIRECTIONS)[number];

export type XhsCoverSlots = {
  headline: string;
  subhead: string;
  leftTitle: string;
  rightTitle: string;
  left: string[];
  right: string[];
  metric: string;
  metricNote: string;
  promptBox: string;
};

export type XhsContentCard = {
  headline: string;
  lines: string[];
};

export type XhsCopyDraft = {
  title: string;
  body: string;
  tags: string[];
  cover: XhsCoverSlots;
  cards: XhsContentCard[];
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
        "正文 200-400 字：钩子（1-2 句）→ 共鸣 → 3 步干货 → 一句收尾。短句换行，别写说明书。",
        "封面槽：headline 可两行写全，不超过 18 字，英文品牌名不要截断；subhead 一句痛点；promptBox 放可复制的短提示词。",
        "滑页卡片 cards：2-4 张，给图片用，不是笔记正文。每张 headline ≤10 字，lines 2-4 条、每条≤16 字。功能向按「痛点 / 步骤 / 收尾」切页。",
      ].join("\n");
    case "compare":
      return [
        "标题禁止只写「Spark vs Sidekick」或两个品牌名。要写区别点，如「能问店 vs 能改店」「问得了改不了」。14 字内，前 8 字是钩子。",
        "正文 200-400 字：先抛对照对象的坑，再讲 Spark 怎么做，最后一句结论。没有补充里的真实数字，禁止编造转化率/CTR。",
        "封面槽：headline 可两行写全，不超过 18 字，品牌名不要截断。leftTitle=对照对象（如 Sidekick 写全），rightTitle=Spark。left 只写对照短板，right 只写 Spark。禁止把 Spark 放左边。",
        "滑页卡片 cards：2-4 张。对比向按「对照对象坑 / Spark 做法 / 结论」切页。",
      ].join("\n");
    case "data":
      return [
        "标题公式：结果数字前置，如「转化率 +32%」。没有真实数字就写「某店对照」，禁止编造精确值。",
        "正文 200-400 字：数字从哪来、改了什么、别的先不动。",
        "封面槽：headline 可两行写全，不超过 18 字；metric 只放一个数字；metricNote 写口径。",
        "滑页卡片 cards：2-4 张。数据向按「数字从哪来 / 改了什么 / 别的先不动」切页。禁止编造精确值。",
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
    leftTitle: "",
    rightTitle: "",
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
  const body = asString(obj.body).slice(0, 480);
  const tags = asStringList(obj.tags).slice(0, 6);
  const left = asStringList(coverRaw.left).map((s) => clip(s, 10)).slice(0, 4);
  const right = asStringList(coverRaw.right).map((s) => clip(s, 10)).slice(0, 4);

  return {
    title,
    body,
    tags: tags.length > 0 ? tags : ["独立站", "Shopify", "AI运营"],
    cover: {
      headline: clip(asString(coverRaw.headline) || title, 18),
      subhead: clip(asString(coverRaw.subhead), 22),
      leftTitle: clip(asString(coverRaw.leftTitle) || "对照", 8),
      rightTitle: clip(asString(coverRaw.rightTitle) || "Spark", 8),
      left,
      right,
      metric: clip(asString(coverRaw.metric), 12),
      metricNote: clip(asString(coverRaw.metricNote), 22),
      promptBox: clip(asString(coverRaw.promptBox), 80),
    },
    cards: normalizeCards(obj.cards, title, body),
  };
}

export function findBannedHit(text: string): string | null {
  return BANNED.find((word) => text.includes(word)) ?? null;
}

export function scrubBanned(text: string): string {
  let next = text;
  for (const word of BANNED) {
    next = next.replaceAll(word, "");
  }
  return next;
}

function normalizeCards(raw: unknown, fallbackTitle: string, fallbackBody: string): XhsContentCard[] {
  const parsed: XhsContentCard[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const headline = clip(asString(rec.headline) || asString(rec.title), 12);
      const lines = asStringList(rec.lines ?? rec.bullets ?? rec.items)
        .map((line) => clip(line, 18))
        .slice(0, 4);
      if (!headline && lines.length === 0) continue;
      parsed.push({
        headline: headline || clip(fallbackTitle, 12),
        lines: lines.length > 0 ? lines : [clip(fallbackTitle, 18)],
      });
    }
  }
  if (parsed.length >= 2) return parsed.slice(0, 4);
  return fallbackCards(fallbackTitle, fallbackBody);
}

function fallbackCards(title: string, body: string): XhsContentCard[] {
  const parts = body
    .split(/\n+/)
    .map((line) => line.replace(/^[\d一二三四五六七八九十]+[、.．。:\s]*/, "").trim())
    .filter((line) => line.length > 1);
  const groups: string[][] = [];
  for (let i = 0; i < parts.length; i += 3) {
    groups.push(parts.slice(i, i + 3));
  }
  const labels = ["先看这页", "怎么做", "记住这点", "可以先试"];
  const cards: XhsContentCard[] = [
    {
      headline: clip(title, 12),
      lines: (groups[0] ?? [title]).map((line) => clip(line, 18)).slice(0, 4),
    },
  ];
  for (let i = 1; i < Math.min(groups.length, 3); i += 1) {
    cards.push({
      headline: labels[i] ?? `第${i + 1}页`,
      lines: groups[i].map((line) => clip(line, 18)),
    });
  }
  if (cards.length < 2) {
    cards.push({
      headline: "可以先试",
      lines: ["只看异常", "先试算再改", "确认后再写回"],
    });
  }
  return cards.slice(0, 4);
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
