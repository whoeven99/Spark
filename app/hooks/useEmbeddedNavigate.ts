import { useCallback } from "react";
import { useNavigate, type NavigateOptions } from "react-router";
import { appendEmbeddedSearchToPath } from "../lib/embeddedLocationSearch";
import { useEmbeddedLocationSearch } from "./useEmbeddedLocationSearch";

/**
 * 嵌入式 App 内 navigate 应始终带上 shop/host 等鉴权参数。
 * 客户端路由（s-link / navigate）会丢掉 query，此 hook 用 sessionStorage 兜底。
 */
export function useEmbeddedNavigate() {
  const navigate = useNavigate();
  const embeddedSearch = useEmbeddedLocationSearch();

  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      navigate(appendEmbeddedSearchToPath(to, embeddedSearch), options);
    },
    [navigate, embeddedSearch],
  );
}
