/**
 * Ciwi Spark Image Switcher
 * 按访客语言静默替换页面 <img> 的 src/srcset，无可见 UI。
 * 数据来源：App Proxy (/a/ciwi-spark?shop=…&language=…)
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时

function getShopDomain() {
  return document.getElementById("ciwi_shop_domain")?.value?.trim() ?? "";
}

function getLanguageCode() {
  return document.getElementById("ciwi_language_code")?.value?.trim() ?? "";
}

/** 从 URL 路径取文件名（不含 query），兼容店面 /cdn/shop/files/ 与 admin CDN。 */
function extractFileName(url) {
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
 * 与 BogdaApps 对齐：admin URL 含两段 /files/ 时取第二段后的文件名。
 * 例：…/s/files/1/xxx/yyy/files/shoe.jpg → shoe.jpg
 */
function extractBogdaMatchKey(url) {
  if (!url) return "";
  const parts = url.split("/files/");
  if (parts.length >= 3) {
    return parts[2].split("?")[0].split("#")[0];
  }
  return extractFileName(url);
}

/** 为一条 sourceUrl 生成多个可匹配 key（文件名优先）。 */
function collectMatchKeys(sourceUrl) {
  const keys = new Set();
  const fileName = extractFileName(sourceUrl);
  const bogdaKey = extractBogdaMatchKey(sourceUrl);
  if (fileName) keys.add(fileName);
  if (bogdaKey && bogdaKey !== fileName) keys.add(bogdaKey);
  const filesIdx = sourceUrl.indexOf("/files/");
  if (filesIdx !== -1) {
    const legacy = sourceUrl.slice(filesIdx + 7).split("?")[0].split("#")[0];
    if (legacy) keys.add(legacy);
  }
  return [...keys];
}

/** 构建 key → { sourceUrl, targetUrl } 映射 Map。 */
function buildMappingMap(mappings) {
  const map = new Map();
  for (const item of mappings) {
    for (const key of collectMatchKeys(item.sourceUrl)) {
      if (key) map.set(key, item);
    }
  }
  return map;
}

/** 缓存：localStorage，key = ciwi_mappings_{shop}_{language} */
function cacheKey(shop, language) {
  return `ciwi_mappings_${shop}_${language}`;
}

function readCache(shop, language) {
  try {
    const raw = localStorage.getItem(cacheKey(shop, language));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.ts || Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(shop, language, data) {
  try {
    localStorage.setItem(
      cacheKey(shop, language),
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {
    // localStorage 写满时忽略
  }
}

/** 向 App Proxy 拉取图片映射。 */
async function fetchMappings(shop, language) {
  const cached = readCache(shop, language);
  if (cached) return cached;

  const url = `/a/ciwi-spark?shop=${encodeURIComponent(shop)}&language=${encodeURIComponent(language)}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`App Proxy 返回 ${resp.status}`);

  const body = await resp.json();
  if (!body.ok || !Array.isArray(body.mappings)) return [];

  writeCache(shop, language, body.mappings);
  return body.mappings;
}

/** 预加载译图，减少 INP 延迟。 */
function preloadImages(mappings) {
  for (const item of mappings) {
    if (item.targetUrl) {
      const img = new Image();
      img.src = item.targetUrl;
    }
  }
}

function imgMatchesKey(img, key) {
  const sources = [img.currentSrc, img.src, img.srcset].filter(Boolean);
  for (const raw of sources) {
    if (raw.includes(key)) return true;
    if (extractFileName(raw) === key) return true;
  }
  return false;
}

function tryReplaceImage(img, map) {
  for (const [key, item] of map.entries()) {
    if (!imgMatchesKey(img, key) || !item.targetUrl) continue;
    img.src = item.targetUrl;
    img.srcset = item.targetUrl;
    return true;
  }
  return false;
}

/** 用 IntersectionObserver 按需替换可见 <img>，并监听后续动态插入的图片。 */
function observeAndReplace(map) {
  if (map.size === 0) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = /** @type {HTMLImageElement} */ (entry.target);
      if (tryReplaceImage(img, map)) observer.unobserve(img);
    }
  });

  const attach = (img) => {
    if (tryReplaceImage(img, map)) return;
    observer.observe(img);
  };

  document.querySelectorAll("img").forEach(attach);

  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLImageElement) attach(node);
        else if (node instanceof Element) {
          node.querySelectorAll("img").forEach(attach);
        }
      }
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

async function main() {
  const shop = getShopDomain();
  const language = getLanguageCode();

  if (!shop || !language) return;

  try {
    const mappings = await fetchMappings(shop, language);
    if (!mappings.length) {
      console.info("[CiwiImageSwitcher] 无图片映射，跳过替换");
      return;
    }

    preloadImages(mappings);
    const map = buildMappingMap(mappings);
    console.info(
      `[CiwiImageSwitcher] 已加载 ${mappings.length} 条映射，${map.size} 个匹配 key`,
    );
    observeAndReplace(map);
  } catch (e) {
    console.warn("[CiwiImageSwitcher] 图片替换初始化失败：", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  void main();
}
