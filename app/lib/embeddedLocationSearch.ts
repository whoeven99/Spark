/** 嵌入式 Admin 鉴权依赖的 query 键（与 sessionTokenBounce 一致）。 */
export const EMBEDDED_QUERY_KEYS = ["shop", "host", "embedded", "id_token"] as const;

const STORAGE_KEY = "spark:embedded-search";

function toParams(rawSearch: string): URLSearchParams {
  const normalized = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  return new URLSearchParams(normalized);
}

/** 从完整 search 中只保留嵌入式鉴权相关参数。 */
export function pickEmbeddedSearch(rawSearch: string): string {
  const params = toParams(rawSearch);
  const kept = new URLSearchParams();
  for (const key of EMBEDDED_QUERY_KEYS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const qs = kept.toString();
  return qs ? `?${qs}` : "";
}

export function hasEmbeddedAuthContext(search: string): boolean {
  const params = toParams(search);
  return Boolean(params.get("shop") || params.get("host"));
}

/** 首次进入嵌入式应用时缓存 shop/host，供客户端路由丢失 query 后兜底。 */
export function cacheEmbeddedSearch(rawSearch: string): void {
  if (typeof window === "undefined") return;
  const picked = pickEmbeddedSearch(rawSearch);
  if (hasEmbeddedAuthContext(picked)) {
    sessionStorage.setItem(STORAGE_KEY, picked);
  }
}

export function readCachedEmbeddedSearch(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(STORAGE_KEY) ?? "";
}

/** 优先用当前 URL 的嵌入式参数，缺失时回退到 sessionStorage。 */
export function resolveEmbeddedLocationSearch(rawSearch: string): string {
  const current = pickEmbeddedSearch(rawSearch);
  if (hasEmbeddedAuthContext(current)) return current;
  return readCachedEmbeddedSearch();
}

/** 将嵌入式 search 合并进目标路径（保留路径自身 query，如 `?tab=translate`）。 */
export function appendEmbeddedSearchToPath(path: string, locationSearch: string): string {
  const [pathname, pathQuery = ""] = path.split("?");
  const merged = new URLSearchParams(pathQuery);
  const embedded = toParams(locationSearch);
  for (const [key, value] of embedded) {
    if (!merged.has(key)) merged.set(key, value);
  }
  const qs = merged.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** 构建带嵌入式鉴权参数的 App action URL（如 `/app?setLocale=1`）。 */
export function buildAppActionUrl(path: string, extraParams?: Record<string, string>): string {
  const search = resolveEmbeddedLocationSearch(
    typeof window !== "undefined" ? window.location.search : "",
  );
  let result = appendEmbeddedSearchToPath(path, search);
  if (!extraParams || Object.keys(extraParams).length === 0) return result;

  const [pathname, query = ""] = result.split("?");
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(extraParams)) {
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
