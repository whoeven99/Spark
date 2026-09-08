import type { XhsContentCard, XhsDirection } from "./xhsPlaybooks.js";
import { svgToImagePayload } from "./xhsTemplateCover.js";

export type ContentCardImage = {
  headline: string;
  lines: string[];
  image: { mimeType: "image/svg+xml"; base64: string };
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

export function renderContentCards(params: {
  direction: XhsDirection;
  cards: XhsContentCard[];
}): ContentCardImage[] {
  const total = params.cards.length;
  return params.cards.map((card, index) => ({
    headline: card.headline,
    lines: card.lines,
    image: svgToImagePayload(renderContentCardSvg({
      direction: params.direction,
      card,
      index,
      total,
    })),
  }));
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
  <rect x="48" y="96" width="160" height="36" rx="8" fill="${colors.accent}"/>
  <text x="128" y="121" text-anchor="middle" font-size="18" fill="${colors.accentInk}">正文滑页</text>
  <text x="48" y="230" font-size="52" font-weight="700" fill="${colors.ink}">${headline}</text>
  ${rows}
  <text x="48" y="980" font-size="20" fill="${colors.muted}">和封面同一套风格，字由模板排出</text>
</svg>`;
}
