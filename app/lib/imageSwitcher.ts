export type ImageSwitcherMapping = {
  sourceUrl: string;
  targetUrl: string;
};

/** 与店面 ciwi-image-switcher.js 的 extractFileName 对齐：去掉 query/hash，取 path 最后一段。 */
export function extractImageFileName(url: string): string {
  if (!url) return "";
  try {
    const pathname = new URL(url, "https://placeholder.invalid").pathname;
    return pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    const noQuery = url.split("?")[0].split("#")[0];
    return noQuery.split("/").filter(Boolean).pop() ?? "";
  }
}

/**
 * 同文件名只留第一条。调用方须已按 createdAt desc 排好，这样最新译图胜出。
 */
export function dedupeImageMappingsNewestFirst(
  mappings: ImageSwitcherMapping[],
): ImageSwitcherMapping[] {
  const seen = new Set<string>();
  const out: ImageSwitcherMapping[] = [];
  for (const item of mappings) {
    const fileName = extractImageFileName(item.sourceUrl);
    const key = fileName || item.sourceUrl;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeLanguageCode(code: string): string {
  return (code || "").trim().toLowerCase();
}

/** 简体（含裸 zh）与繁体必须分开，不能只比主语言码 zh。 */
function chineseScript(code: string): "hans" | "hant" | null {
  const normalized = normalizeLanguageCode(code);
  if (!normalized || (normalized !== "zh" && !normalized.startsWith("zh-"))) {
    return null;
  }
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hant" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo" ||
    normalized.includes("hant")
  ) {
    return "hant";
  }
  return "hans";
}

/**
 * 店面 IP 跳转用的语言等价判断。
 * 须与 extensions/spark-tiktok-pixel/assets/ciwi-image-switcher.js 的 languagesMatch 保持一致。
 */
export function languagesMatch(a: string, b: string): boolean {
  const left = normalizeLanguageCode(a);
  const right = normalizeLanguageCode(b);
  if (!left || !right) return left === right;
  if (left === right) return true;

  const leftZh = chineseScript(left);
  const rightZh = chineseScript(right);
  if (leftZh || rightZh) {
    if (!leftZh || !rightZh) return false;
    return leftZh === rightZh;
  }

  const leftBase = left.split("-")[0] ?? "";
  const rightBase = right.split("-")[0] ?? "";
  if (leftBase === "pt" && rightBase === "pt") {
    const leftRegion = left.split("-")[1];
    const rightRegion = right.split("-")[1];
    if (!leftRegion || !rightRegion) return true;
    return leftRegion === rightRegion;
  }

  return leftBase === rightBase;
}
