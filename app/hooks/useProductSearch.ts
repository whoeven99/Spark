import { useEffect, useRef, useState } from "react";
import type {
  ProductSearchApiResponse,
  ProductSearchItem,
} from "../lib/productSearchTypes";

const DEFAULT_DEBOUNCE_MS = 380;

type Options = {
  /** 用户输入的原始关键词（未 trim 的防抖前状态由调用方维护） */
  input: string;
  /**
   * 与 `/api/generate-description` 等请求一致：嵌入环境下需带上当前 URL query（含 shop / host 等）。
   * 传 `typeof window !== "undefined" ? window.location.search : ""` 即可。
   */
  locationSearch: string;
  debounceMs?: number;
};

/**
 * 防抖后请求 `/api/product-search`，带 Abort 避免竞态。
 */
export function useProductSearch({
  input,
  locationSearch,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: Options): {
  items: ProductSearchItem[];
  isLoading: boolean;
  errorText: string | null;
} {
  const [items, setItems] = useState<ProductSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      abortRef.current?.abort();
      abortRef.current = null;
      setItems([]);
      setErrorText(null);
      setIsLoading(false);
      return;
    }

    const t = window.setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setIsLoading(true);
      setErrorText(null);

      const params = new URLSearchParams(
        locationSearch.startsWith("?")
          ? locationSearch.slice(1)
          : locationSearch,
      );
      params.set("q", trimmed);
      const url = `/api/product-search?${params.toString()}`;

      void (async () => {
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: ac.signal,
          });
          const payload = (await res
            .json()
            .catch(() => ({}))) as ProductSearchApiResponse;

          if (ac.signal.aborted) return;

          if (!res.ok || payload.success === false) {
            const msg =
              payload.success === false
                ? payload.errorMsg
                : `请求失败（${res.status}）`;
            setItems([]);
            setErrorText(msg || `请求失败（${res.status}）`);
            return;
          }

          if (
            payload.success === true &&
            payload.response &&
            Array.isArray(payload.response.products)
          ) {
            setItems(payload.response.products);
            setErrorText(null);
          } else {
            setItems([]);
            setErrorText("返回数据异常，请重试");
          }
        } catch (e) {
          if (ac.signal.aborted) return;
          if (e instanceof DOMException && e.name === "AbortError") return;
          setItems([]);
          setErrorText("网络异常，请稍后重试");
        } finally {
          if (!ac.signal.aborted) setIsLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      window.clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [input, locationSearch, debounceMs]);

  return { items, isLoading, errorText };
}
