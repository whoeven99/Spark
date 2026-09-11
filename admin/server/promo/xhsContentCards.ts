import type { XhsContentCard, XhsDirection } from "./xhsPlaybooks.js";
import { generatePromoImage, XHS_VISUAL_SYSTEM, type CoverImage } from "./xhsCoverClient.js";
import { svgToImagePayload } from "./xhsTemplateCover.js";

export type ContentCardImage = {
  headline: string;
  lines: string[];
  image: CoverImage;
};

type CardTheme = {
  label: string;
  bg: string;
  ink: string;
  muted: string;
  panel: string;
  accent: string;
  accentInk: string;
};

function theme(direction: XhsDirection): CardTheme {
  switch (direction) {
    case "howto":
      return {
        label: "干货卡",
        bg: "#ffffff",
        ink: "#111111",
        muted: "#8c8c8c",
        panel: "#f7f7f7",
        accent: "#d4ff3f",
        accentInk: "#111111",
      };
    case "compare":
      return {
        label: "对照卡",
        bg: "#f6f1e8",
        ink: "#111111",
        muted: "#8c6d4a",
        panel: "#efe6d6",
        accent: "#f8e6e4",
        accentInk: "#a8071a",
      };
    case "data":
      return {
        label: "结果卡",
        bg: "#111111",
        ink: "#ffffff",
        muted: "rgba(255,255,255,0.55)",
        panel: "#1d1d1d",
        accent: "#d4ff3f",
        accentInk: "#111111",
      };
    default: {
      const _never: never = direction;
      return _never;
    }
  }
}

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cardLayoutHint(direction: XhsDirection): string {
  switch (direction) {
    case "howto":
      return "构图：白底知识卡。荧光绿编号块 + 短句条目，一条一块，不要写成说明书。";
    case "compare":
      return "构图：对照信息卡。短句分条，对照对象和 Spark 不要左右对调。";
    case "data":
      return "构图：结果卡。结论或数字居中，底栏小字即可，不要仪表盘。";
    default: {
      const _never: never = direction;
      return _never;
    }
  }
}

function buildCardImagePrompt(params: {
  direction: XhsDirection;
  card: XhsContentCard;
  index: number;
  total: number;
  stylePrompt?: string | null;
}): string {
  const page = `${String(params.index + 1).padStart(2, "0")} / ${String(Math.max(params.total, 1)).padStart(2, "0")}`;
  const lines = [
    "生成一张可直接发小红书的竖版滑页，不是封面。",
    XHS_VISUAL_SYSTEM,
    cardLayoutHint(params.direction),
    `这是第 ${params.index + 1}/${Math.max(params.total, 1)} 张。右上角页码写成 ${page}。`,
    `主标题必须原样写上：${params.card.headline}`,
    params.card.lines.length
      ? `条目必须原样写上，一条都不要改：${params.card.lines.join(" / ")}`
      : "",
    "不要在图上写制作说明、模板、提示词、「同一套风格」或「字由模板排出」。",
  ];
  const extra = params.stylePrompt?.trim();
  if (extra) {
    lines.push("风格补充（只影响构图和配色，不要把这段字画上图）：", extra);
  }
  return lines.filter(Boolean).join("\n");
}

export async function renderContentCards(params: {
  direction: XhsDirection;
  cards: XhsContentCard[];
  provider?: string | null;
  stylePrompt?: string | null;
}): Promise<{ cards: ContentCardImage[]; error?: string }> {
  const total = params.cards.length;
  let error: string | undefined;
  const cards = await Promise.all(
    params.cards.map(async (card, index) => {
      const fallback = svgToImagePayload(
        renderContentCardSvg({
          direction: params.direction,
          card,
          index,
          total,
        }),
      );
      try {
        const generated = await generatePromoImage({
          prompt: buildCardImagePrompt({
            direction: params.direction,
            card,
            index,
            total,
            stylePrompt: params.stylePrompt,
          }),
          provider: params.provider,
        });
        if (!generated) {
          return { headline: card.headline, lines: card.lines, image: fallback };
        }
        return { headline: card.headline, lines: card.lines, image: generated.image };
      } catch (err) {
        if (!error) {
          error = err instanceof Error ? err.message : String(err);
        }
        return { headline: card.headline, lines: card.lines, image: fallback };
      }
    }),
  );
  return { cards, error };
}

function renderContentCardSvg(params: {
  direction: XhsDirection;
  card: XhsContentCard;
  index: number;
  total: number;
}): string {
  const colors = theme(params.direction);
  const headline = esc(params.card.headline);
  const page = `${params.index + 1}/${Math.max(params.total, 1)}`;
  const rows = params.card.lines
    .slice(0, 4)
    .map((line, i) => {
      const y = 360 + i * 130;
      return `
  <rect x="48" y="${y}" width="672" height="112" rx="20" fill="${colors.panel}"/>
  <rect x="68" y="${y + 32}" width="48" height="48" rx="12" fill="${colors.accent}"/>
  <text x="92" y="${y + 65}" text-anchor="middle" font-size="24" font-weight="700" fill="${colors.accentInk}">${i + 1}</text>
  <text x="140" y="${y + 68}" font-size="32" fill="${colors.ink}">${esc(line)}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <rect width="768" height="1024" fill="${colors.bg}"/>
  <text x="48" y="72" font-size="22" fill="${colors.muted}">${colors.label}</text>
  <text x="720" y="72" text-anchor="end" font-size="22" fill="${colors.muted}">${page}</text>
  <text x="48" y="230" font-size="52" font-weight="700" fill="${colors.ink}">${headline}</text>
  ${rows}
</svg>`;
}
