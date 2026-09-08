import type { XhsCoverSlots, XhsDirection } from "./xhsPlaybooks.js";

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function listItems(items: string[], fill: string): string {
  return items
    .slice(0, 4)
    .map((item, i) => {
      const y = 420 + i * 56;
      return `<text x="70" y="${y}" font-size="28" fill="${fill}">${esc(item)}</text>`;
    })
    .join("");
}

export function renderTemplateSvg(params: {
  direction: XhsDirection;
  cover: XhsCoverSlots;
  topic: string;
}): string {
  const headline = esc(params.cover.headline || params.topic);
  const subhead = esc(params.cover.subhead);

  switch (params.direction) {
    case "howto":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <rect width="768" height="1024" fill="#ffffff"/>
  <text x="48" y="64" font-size="22" fill="#8c8c8c">每日经营晨报</text>
  <rect x="48" y="96" width="220" height="36" fill="#d4ff3f"/>
  <text x="60" y="121" font-size="18" fill="#111">PROMPT · 只读分析</text>
  <text x="48" y="210" font-size="48" font-weight="700" fill="#111">${headline}</text>
  <text x="48" y="280" font-size="24" fill="#434343">${subhead}</text>
  <rect x="48" y="330" width="672" height="420" rx="20" fill="#111"/>
  <text x="72" y="380" font-size="20" fill="#d4ff3f">完整提示词</text>
  <foreignObject x="72" y="400" width="624" height="320">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#f5f5f5;font-size:28px;line-height:1.5;font-family:sans-serif;">
      ${esc(params.cover.promptBox || params.topic)}
    </div>
  </foreignObject>
</svg>`;
    case "compare":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <rect width="768" height="1024" fill="#f6f1e8"/>
  <rect x="40" y="40" width="688" height="90" fill="#efe6d6" stroke="#c9b89a" stroke-dasharray="6 6"/>
  <text x="384" y="96" text-anchor="middle" font-size="32" font-weight="700" fill="#111">${headline}</text>
  <rect x="40" y="160" width="328" height="700" fill="#f8e6e4"/>
  <rect x="400" y="160" width="328" height="700" fill="#e5eef0"/>
  <text x="204" y="220" text-anchor="middle" font-size="28" font-weight="700" fill="#a8071a">旧方法</text>
  <text x="564" y="220" text-anchor="middle" font-size="28" font-weight="700" fill="#237804">新方法</text>
  ${listItems(params.cover.left, "#a8071a")}
  ${listItems(params.cover.right, "#237804").replaceAll('x="70"', 'x="430"')}
  <rect x="40" y="890" width="688" height="90" fill="#efe6d6"/>
  <text x="384" y="945" text-anchor="middle" font-size="24" fill="#111">${subhead || "先把数据放到一张表里"}</text>
</svg>`;
    case "data":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <rect width="768" height="1024" fill="#111"/>
  <text x="48" y="80" font-size="24" fill="#d4ff3f">用了这个 AI 插件之后</text>
  <text x="48" y="180" font-size="44" font-weight="700" fill="#fff">${headline}</text>
  <text x="48" y="520" font-size="120" font-weight="700" fill="#d4ff3f">${esc(params.cover.metric || "+32%")}</text>
  <text x="48" y="600" font-size="26" fill="rgba(255,255,255,.65)">${esc(params.cover.metricNote)}</text>
  <text x="48" y="960" font-size="22" fill="rgba(255,255,255,.45)">${subhead}</text>
</svg>`;
    default: {
      const _never: never = params.direction;
      return _never;
    }
  }
}

export function svgToImagePayload(svg: string): { mimeType: "image/svg+xml"; base64: string } {
  return {
    mimeType: "image/svg+xml",
    base64: Buffer.from(svg, "utf8").toString("base64"),
  };
}
