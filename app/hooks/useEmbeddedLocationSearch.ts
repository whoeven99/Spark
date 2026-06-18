import { useEffect, useMemo } from "react";
import { useLocation } from "react-router";
import {
  cacheEmbeddedSearch,
  resolveEmbeddedLocationSearch,
} from "../lib/embeddedLocationSearch";

/**
 * 嵌入式 App 内 API / fetcher 应使用的 location search。
 * 客户端路由（s-link）会丢掉 shop/host，此 hook 用 sessionStorage 兜底。
 */
export function useEmbeddedLocationSearch(): string {
  const location = useLocation();

  useEffect(() => {
    cacheEmbeddedSearch(location.search);
  }, [location.search]);

  return useMemo(
    () => resolveEmbeddedLocationSearch(location.search),
    [location.search],
  );
}
