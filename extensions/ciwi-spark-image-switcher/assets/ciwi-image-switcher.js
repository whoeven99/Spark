/**
 * Ciwi Spark Image Switcher
 * 两项功能：
 *   1. IP 地区跳转：通过 Shopify browsing_context_suggestions.json 检测访客地区，
 *      与当前 localization 不同时 POST /localization 静默切换国家/语言。
 *   2. 图片替换：按访客语言静默替换页面 <img> 的 src/srcset，无可见 UI。
 *      数据来源：App Proxy (/a/{subpath}?shop=…&language=…)，subpath 由主题块设置注入，须与 shopify.app.*.toml 一致。
 *
 * 调试：控制台执行 localStorage.setItem("ciwi_debug","1") 后刷新；
 *       或 URL 加 ?ciwi_debug=1。关闭：localStorage.removeItem("ciwi_debug")
 */

const LOG = "[CiwiImageSwitcher]";

function isDebug() {
  try {
    if (new URLSearchParams(location.search).has("ciwi_debug")) return true;
    return localStorage.getItem("ciwi_debug") === "1";
  } catch {
    return false;
  }
}

/** @param {string} step @param {Record<string, unknown>} [data] */
function logStep(step, data) {
  if (!isDebug()) return;
  if (data && Object.keys(data).length > 0) {
    console.info(`${LOG} ${step}`, data);
  } else {
    console.info(`${LOG} ${step}`);
  }
}

/** @param {string} step @param {string} reason @param {Record<string, unknown>} [extra] */
function logSkip(step, reason, extra) {
  console.info(`${LOG} ${step} → 跳过：${reason}`, extra ?? "");
}

// ─── 图片替换缓存 ───────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时

// ─── IP 跳转缓存 ────────────────────────────────────────────────────────────
const IP_REDIRECT_CACHE_KEY = "ciwi_ip_redirect_ts";
const LANG_MARKET_DEFAULT_ATTEMPT_KEY = "ciwi_lang_market_default_attempt";
const IP_REDIRECT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/** 已知爬虫 UA 关键词，命中则跳过 IP 检测，避免频繁触发重定向。 */
const BOT_UA_KEYWORDS = [
  "bot", "spider", "crawl", "slurp", "bingbot", "googlebot",
  "yandex", "duckduck", "baidu", "sogou", "360spider", "headless",
];

function isLikelyBot() {
  const ua = navigator.userAgent.toLowerCase();
  return BOT_UA_KEYWORDS.some((k) => ua.includes(k));
}

function getCountryCode() {
  return document.getElementById("ciwi_country_code")?.value?.trim() ?? "";
}

/** ISO 3166-1 alpha-2，统一大写便于比较。 */
function normalizeCountryCode(code) {
  return (code || "").trim().toUpperCase();
}

/** 语言 ISO code，统一小写便于比较。 */
function normalizeLanguageCode(code) {
  return (code || "").trim().toLowerCase();
}

/** Shopify API 可能返回 zh，Liquid 为 zh-CN，视为同一语言。 */
function languagesMatch(a, b) {
  const left = normalizeLanguageCode(a);
  const right = normalizeLanguageCode(b);
  if (!left || !right) return left === right;
  if (left === right) return true;
  return left.split("-")[0] === right.split("-")[0];
}

/**
 * 解析主题设置中的语言-市场绑定映射表。
 * 格式：JP:ja,KR:ko,FR:fr  大小写不敏感，结果 key=大写国家码，value=小写语言码。
 * @returns {Map<string, string>}
 */
function getLanguageMarketMap() {
  const raw = document.getElementById("ciwi_language_market_map")?.value?.trim() ?? "";
  const map = new Map();
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx === -1) continue;
    const country = pair.slice(0, idx).trim().toUpperCase();
    const language = pair.slice(idx + 1).trim().toLowerCase();
    if (country && language) map.set(country, language);
  }
  return map;
}

/** 在市场绑定映射表中查询目标国家对应的语言，未命中返回空字符串。 */
function lookupMarketLanguage(countryCode, marketMap) {
  if (!countryCode || !marketMap.size) return "";
  return marketMap.get(normalizeCountryCode(countryCode)) ?? "";
}

/** 与 Shopify 官方示例一致：优先 window.Shopify，回退 hidden input。 */
function getCurrentLocalization() {
  return {
    country: normalizeCountryCode(window.Shopify?.country ?? getCountryCode()),
    language: normalizeLanguageCode(window.Shopify?.language ?? getLanguageCode()),
    excludeCountry: window.Shopify?.country ?? getCountryCode(),
    submitCountry: getCountryCode(),
  };
}

function isIpRedirectEnabled() {
  return document.getElementById("ciwi_ip_redirect_enabled")?.value === "true";
}

function hasIpRedirectCache() {
  try {
    const raw = localStorage.getItem(IP_REDIRECT_CACHE_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < IP_REDIRECT_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function setIpRedirectCache() {
  try {
    localStorage.setItem(IP_REDIRECT_CACHE_KEY, String(Date.now()));
  } catch {
    // localStorage 不可用时静默忽略
  }
}

/** IP 跳转关键步骤：始终打印，便于店面排查。 */
function logRedirect(step, data) {
  if (data && Object.keys(data).length > 0) {
    console.info(`${LOG} ${step}`, data);
  } else {
    console.info(`${LOG} ${step}`);
  }
}

function findAuthenticityToken() {
  return (
    document.querySelector('input[name="authenticity_token"]')?.value?.trim() ||
    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")?.trim() ||
    ""
  );
}

/** 从 GeoIP 响应提取建议的目标国家（优先 suggestions，回退 detected_values）。 */
function pickRedirectTargets(json) {
  const parts = json?.suggestions?.[0]?.parts;
  return {
    country: parts?.country?.handle ?? json?.detected_values?.country?.handle ?? "",
  };
}

/**
 * 根据 GeoIP 建议计算是否需要切换国家；语言由映射表决定，不依赖 GeoIP 语言建议。
 * 同国家的语言修正由调用方 IP-4d 通过映射表独立处理。
 * @param {ReturnType<typeof getCurrentLocalization>} current
 * @param {object} json  browsing_context_suggestions 响应
 * @param {Map<string, string>} [marketMap]  country → language 绑定映射表
 */
function resolveLocalizationTargets(current, json, marketMap = new Map()) {
  const { country: suggestedCountry } = pickRedirectTargets(json);

  const countryChanged =
    Boolean(suggestedCountry) &&
    normalizeCountryCode(suggestedCountry) !== current.country;

  if (!countryChanged) {
    // 国家未变：语言修正交由 IP-4d 市场映射路径处理，不基于 GeoIP 语言建议触发跳转
    return { shouldRedirect: false, countryChanged: false, suggestedCountry };
  }

  // 国家需要切换：语言由映射表决定；无映射则省略 language_code，让 Shopify Markets 应用目标市场默认语言
  const targetCountryCode = normalizeCountryCode(suggestedCountry);
  const mappedLanguage = lookupMarketLanguage(targetCountryCode, marketMap);

  return {
    shouldRedirect: true,
    targetCountry: suggestedCountry,
    targetLanguage: mappedLanguage,
    omitLanguage: !mappedLanguage,
    countryChanged: true,
    mappedLanguage,
  };
}

/**
 * 提交 /localization 切换国家与语言。
 * 对齐 Shopify 官方实现：动态创建独立表单 + form.submit()（非 requestSubmit）。
 * /localization 不需要 authenticity_token；复用主题表单会被 <localization-form> 拦截。
 * @see https://shopify.dev/docs/storefronts/themes/markets/localization-discovery
 * @returns {{ ok: boolean, method: string, reason?: string }}
 */
function submitLocalization(countryCode, languageCode, options = {}) {
  const { omitLanguage = false } = options;
  const root = window.Shopify?.routes?.root ?? "/";
  const returnTo = `${location.pathname}${location.search}`;
  const targetCountry = normalizeCountryCode(countryCode);
  const targetLanguage = (languageCode || "").trim();
  const token = findAuthenticityToken();

  logRedirect("[IP-5a] 准备提交 /localization", {
    root,
    returnTo,
    targetCountry,
    targetLanguage: omitLanguage ? "(omit → 市场默认)" : targetLanguage,
    omitLanguage,
    hasToken: Boolean(token),
  });

  if (!document.body) {
    logRedirect("[IP-5-ERR] document.body 不存在");
    return { ok: false, method: "none", reason: "body-missing" };
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${root}localization`;
  form.hidden = true;
  form.acceptCharset = "UTF-8";
  form.enctype = "multipart/form-data";

  /** @type {Record<string, string>} */
  const fields = {
    form_type: "localization",
    utf8: "✓",
    _method: "PUT",
    country_code: targetCountry,
    return_to: returnTo,
  };
  if (!omitLanguage && targetLanguage) {
    fields.language_code = targetLanguage;
  }
  if (token) {
    fields.authenticity_token = token;
  }

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);

  logRedirect("[IP-5b] 动态表单 form.submit()（Shopify 官方模式）", {
    action: form.action,
    fieldNames: Object.keys(fields),
  });

  setIpRedirectCache();
  // form.submit() 触发完整页面 POST 导航，不会被主题的 submit 事件处理器拦截
  form.submit();
  return { ok: true, method: "dynamic-form-submit" };
}

/**
 * IP 地区跳转主逻辑。
 * 返回 true 表示已触发跳转（页面即将刷新），调用方可提前终止后续操作。
 */
async function runIpRedirect() {
  const marketMap = getLanguageMarketMap();

  logStep("[IP-1] 开始检测", {
    enabled: isIpRedirectEnabled(),
    designMode: document.documentElement.hasAttribute("shopify-design-mode"),
    bot: isLikelyBot(),
    cache: hasIpRedirectCache(),
    marketMapSize: marketMap.size,
    marketMapEntries: marketMap.size > 0 ? Object.fromEntries(marketMap) : null,
  });

  if (!isIpRedirectEnabled()) {
    logSkip("[IP-1]", "主题 block 未勾选「启用 IP 地区跳转」");
    return false;
  }
  if (isLikelyBot()) {
    logSkip("[IP-1]", "疑似爬虫 UA");
    return false;
  }
  // 主题编辑器中不执行跳转，避免商家预览时被强制切换
  if (document.documentElement.hasAttribute("shopify-design-mode")) {
    logSkip("[IP-1]", "主题编辑器预览模式（shopify-design-mode）");
    return false;
  }
  if (hasIpRedirectCache()) {
    logSkip("[IP-1]", "近期已跳转过（localStorage ciwi_ip_redirect_ts）");
    return false;
  }

  const current = getCurrentLocalization();
  logStep("[IP-2] 当前 localization", current);

  try {
    const root = window.Shopify?.routes?.root ?? "/";
    const params = new URLSearchParams({
      "country[enabled]": "true",
      "country[exclude]": current.excludeCountry,
    });
    const suggestUrl = `${root}browsing_context_suggestions.json?${params}`;
    logStep("[IP-3] 请求 GeoIP 建议", { url: suggestUrl });
    const resp = await fetch(suggestUrl);
    if (!resp.ok) {
      logSkip("[IP-3]", `browsing_context_suggestions 返回 ${resp.status}`);
      return false;
    }

    const json = await resp.json();
    logStep("[IP-3] GeoIP 响应", json);
    const { country: suggestedCountry } = pickRedirectTargets(json);
    logRedirect("[IP-3b] 解析跳转目标", {
      suggestedCountry,
      fromSuggestions: Boolean(json?.suggestions?.[0]?.parts),
      detectedCountry: json?.detected_values?.country?.handle ?? "",
    });

    if (!json?.suggestions?.length && !json?.detected_values?.country?.handle) {
      logSkip("[IP-4]", "Shopify 未返回国家建议（可能 IP 与当前 localization 一致）", {
        detected: json?.detected_values,
      });
      // 即使 GeoIP 无国家建议，仍需检查市场映射语言（见 IP-4d）
    }

    let targets = resolveLocalizationTargets(current, json, marketMap);

    // IP-4d：当前国家已在映射表中但语言不符（如 JP/zh-CN → JP/ja）→ 触发语言修正。
    // 语言修正完全由映射表决定，不依赖 GeoIP 语言建议。
    if (!targets.shouldRedirect && marketMap.size > 0) {
      const mappedLanguage = lookupMarketLanguage(current.country, marketMap);
      if (mappedLanguage && !languagesMatch(mappedLanguage, current.language)) {
        const attemptKey = `${current.country}/${current.language}/map`;
        let alreadyTried = false;
        try {
          alreadyTried =
            sessionStorage.getItem(LANG_MARKET_DEFAULT_ATTEMPT_KEY) === attemptKey;
        } catch {
          // ignore
        }

        if (alreadyTried) {
          logSkip(
            "[IP-4d]",
            `本轮会话已尝试过市场映射语言修正（${attemptKey}），跳过`,
          );
        } else {
          try {
            sessionStorage.setItem(LANG_MARKET_DEFAULT_ATTEMPT_KEY, attemptKey);
          } catch {
            // ignore
          }
          targets = {
            shouldRedirect: true,
            targetCountry: current.submitCountry,
            targetLanguage: mappedLanguage,
            omitLanguage: false,
            countryChanged: false,
            mappedLanguage,
          };
          logRedirect("[IP-4d] 市场绑定映射：触发语言修正", {
            country: current.country,
            currentLanguage: current.language,
            mappedLanguage,
            attemptKey,
          });
        }
      }
    }

    logRedirect("[IP-4b] 解析提交目标", {
      ...targets,
      currentCountry: current.country,
      currentLanguage: current.language,
    });

    if (!targets.shouldRedirect) {
      logSkip("[IP-4]", "建议与当前 localization 实质相同", {
        suggestedCountry: targets.suggestedCountry,
        currentCountry: current.country,
        currentLanguage: current.language,
      });
      return false;
    }

    const toLanguageLabel = targets.omitLanguage
      ? "市场默认"
      : normalizeLanguageCode(targets.targetLanguage);

    logRedirect("[IP-5] 触发跳转", {
      from: `${current.country}/${current.language}`,
      to: `${normalizeCountryCode(targets.targetCountry)}/${toLanguageLabel}`,
      countryChanged: targets.countryChanged,
      omitLanguage: targets.omitLanguage,
    });
    const submitResult = submitLocalization(
      targets.targetCountry,
      targets.targetLanguage,
      { omitLanguage: targets.omitLanguage },
    );
    if (!submitResult.ok) {
      logRedirect("[IP-5-ERR] localization 提交失败", submitResult);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`${LOG} [IP-ERR] 跳转异常：`, e);
    return false;
  }
}

function getShopDomain() {
  return document.getElementById("ciwi_shop_domain")?.value?.trim() ?? "";
}

function getLanguageCode() {
  return document.getElementById("ciwi_language_code")?.value?.trim() ?? "";
}

/** 与 shopify.app.*.toml [app_proxy] subpath 一致，由 Liquid 块设置注入。 */
function getAppProxySubpath() {
  const raw = document.getElementById("ciwi_app_proxy_subpath")?.value?.trim();
  return raw || "ciwi-spark";
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
  if (cached) {
    logStep("[IMG-2] 使用 localStorage 缓存", {
      key: cacheKey(shop, language),
      count: cached.length,
    });
    return cached;
  }

  const subpath = getAppProxySubpath();
  const url = `/a/${subpath}?shop=${encodeURIComponent(shop)}&language=${encodeURIComponent(language)}`;
  logStep("[IMG-2] 请求 App Proxy", { url });
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  const contentType = resp.headers.get("content-type") ?? "";
  logStep("[IMG-3] App Proxy 响应头", {
    status: resp.status,
    statusText: resp.statusText,
    contentType,
  });

  if (!resp.ok) {
    const bodyPreview = (await resp.text()).slice(0, 300);
    console.warn(`${LOG} [IMG-3] App Proxy 失败`, {
      status: resp.status,
      contentType,
      bodyPreview,
    });
    const hint =
      resp.status >= 502
        ? "（后端不可达：请确认 npm run dev:spark-zz 正在运行）"
        : "";
    throw new Error(`App Proxy 返回 ${resp.status}${hint}`);
  }

  if (!contentType.includes("application/json")) {
    const bodyPreview = (await resp.text()).slice(0, 300);
    console.warn(`${LOG} [IMG-3] App Proxy 非 JSON`, { contentType, bodyPreview });
    throw new Error("App Proxy 未返回 JSON（tunnel 可能已断开，请重启 dev）");
  }

  const body = await resp.json();
  console.info(`${LOG} [IMG-3] App Proxy 成功`, {
    ok: body.ok,
    mappingCount: Array.isArray(body.mappings) ? body.mappings.length : 0,
    error: body.error ?? null,
  });
  logStep("[IMG-3] App Proxy JSON 详情", {
    ok: body.ok,
    mappingCount: Array.isArray(body.mappings) ? body.mappings.length : 0,
    error: body.error ?? null,
    sample: Array.isArray(body.mappings) ? body.mappings.slice(0, 2) : null,
  });

  if (!body.ok || !Array.isArray(body.mappings)) {
    logSkip("[IMG-4]", "响应 ok=false 或 mappings 非数组", { body });
    return [];
  }

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

let replacedCount = 0;

function tryReplaceImage(img, map) {
  for (const [key, item] of map.entries()) {
    if (!imgMatchesKey(img, key) || !item.targetUrl) continue;
    logStep("[IMG-6] 替换图片", {
      key,
      from: img.currentSrc || img.src,
      to: item.targetUrl,
    });
    img.src = item.targetUrl;
    img.srcset = item.targetUrl;
    replacedCount += 1;
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
  console.info(
    `${LOG} 启动 v${"2026-06-15c"} | debug=${isDebug()} | 开启调试：localStorage.setItem("ciwi_debug","1")`,
  );
  logStep("[0] 环境", {
    shop: getShopDomain(),
    language: getLanguageCode(),
    country: getCountryCode(),
    appProxySubpath: getAppProxySubpath(),
    ipRedirectEnabled: isIpRedirectEnabled(),
    designMode: document.documentElement.hasAttribute("shopify-design-mode"),
    shopifyCountry: window.Shopify?.country,
    shopifyLanguage: window.Shopify?.language,
    imgCount: document.querySelectorAll("img").length,
  });

  // IP 跳转优先执行；若触发跳转则页面即将刷新，无需继续图片替换
  const redirected = await runIpRedirect();
  if (redirected) {
    logRedirect("[IP-5] 已提交 /localization，等待页面刷新，跳过后续图片替换");
    return;
  }

  const shop = getShopDomain();
  const language = getLanguageCode();

  if (!shop || !language) {
    logSkip("[IMG-1]", "缺少 shop 或 language hidden input", { shop, language });
    return;
  }

  logStep("[IMG-1] 开始图片替换", { shop, language });

  try {
    const mappings = await fetchMappings(shop, language);
    if (!mappings.length) {
      logSkip(
        "[IMG-4]",
        `当前语言「${language}」无映射记录（需在 Image Studio 完成对应语言的整图翻译）`,
        {
          hint: "可在后台查 ImageMapping 表 targetCode 是否与店面语言一致",
        },
      );
      return;
    }

    preloadImages(mappings);
    const map = buildMappingMap(mappings);
    const mapKeys = [...map.keys()];
    console.info(
      `${LOG} [IMG-5] 已加载 ${mappings.length} 条映射，${map.size} 个匹配 key`,
      isDebug() ? { keys: mapKeys } : "",
    );

    const pageImgSrcs = [...document.querySelectorAll("img")]
      .slice(0, 10)
      .map((img) => img.currentSrc || img.src);
    logStep("[IMG-5] 页面 img 采样（前 10）", { pageImgSrcs });

    observeAndReplace(map);

    // 延迟统计：给 IntersectionObserver 一点时间处理首屏可见图
    setTimeout(() => {
      console.info(
        `${LOG} [IMG-7] 替换统计：已替换 ${replacedCount} 张，页面共 ${document.querySelectorAll("img").length} 张 img`,
      );
      if (replacedCount === 0 && isDebug()) {
        console.info(
          `${LOG} [IMG-7] 未命中提示：映射 key 与页面 img src 文件名需一致`,
          { mapKeys, pageImgSrcs },
        );
      }
    }, 2000);
  } catch (e) {
    console.warn(`${LOG} [IMG-ERR] 图片替换初始化失败：`, e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  void main();
}
