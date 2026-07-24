import { useEffect, useRef, useState } from "react";
import type {
  ShopifyObjectItem,
  ShopifyObjectKind,
  ShopifyObjectListApiResponse,
  ShopifyObjectPageInfo,
  ShopifyObjectSort,
  ShopifyObjectStatusFilter,
} from "../lib/shopifyObjectTypes";

const DEFAULT_DEBOUNCE_MS = 320;

type Options = {
  kind: ShopifyObjectKind;
  query: string;
  statusFilter: ShopifyObjectStatusFilter;
  sort: ShopifyObjectSort;
  after: string | null;
  locationSearch: string;
  enabled?: boolean;
  debounceMs?: number;
  /** 商品标签筛选（仅 kind=product 生效） */
  tag?: string;
  /** 库存上限筛选 inventory_total<=N（仅 kind=product 生效） */
  maxInventory?: number | null;
  /** 同时返回条件匹配总数（count 字段） */
  withCount?: boolean;
};

export function useShopifyObjectList({
  kind,
  query,
  statusFilter,
  sort,
  after,
  locationSearch,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  tag,
  maxInventory,
  withCount = false,
}: Options): {
  items: ShopifyObjectItem[];
  pageInfo: ShopifyObjectPageInfo;
  isLoading: boolean;
  errorText: string | null;
  count: number | null;
} {
  const [items, setItems] = useState<ShopifyObjectItem[]>([]);
  const [pageInfo, setPageInfo] = useState<ShopifyObjectPageInfo>({
    hasNextPage: false,
    endCursor: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      setItems([]);
      setPageInfo({ hasNextPage: false, endCursor: null });
      setErrorText(null);
      setIsLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setIsLoading(true);
      setErrorText(null);

      const params = new URLSearchParams(
        locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
      );
      params.set("kind", kind);
      params.set("status", statusFilter);
      params.set("sort", sort);
      if (query.trim()) params.set("q", query.trim());
      if (after) params.set("after", after);
      if (tag?.trim()) params.set("tag", tag.trim());
      if (typeof maxInventory === "number" && maxInventory >= 0) {
        params.set("maxInv", String(Math.floor(maxInventory)));
      }
      if (withCount) params.set("withCount", "1");

      const url = `/api/shopify/objects?${params.toString()}`;

      void (async () => {
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: ac.signal,
          });
          const payload = (await res.json().catch(() => ({}))) as ShopifyObjectListApiResponse;

          if (ac.signal.aborted) return;

          if (!res.ok || payload.success === false) {
            const msg =
              payload.success === false
                ? payload.errorMsg
                : `请求失败（${res.status}）`;
            setItems([]);
            setPageInfo({ hasNextPage: false, endCursor: null });
            setCount(null);
            setErrorText(msg || `请求失败（${res.status}）`);
            return;
          }

          setItems(payload.response.items);
          setPageInfo(payload.response.pageInfo);
          setCount(payload.response.count ?? null);
          setErrorText(null);
        } catch (error) {
          if (ac.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setItems([]);
          setPageInfo({ hasNextPage: false, endCursor: null });
          setCount(null);
          setErrorText("网络异常，请稍后重试");
        } finally {
          if (!ac.signal.aborted) setIsLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [kind, query, statusFilter, sort, after, locationSearch, enabled, debounceMs, tag, maxInventory, withCount]);

  return { items, pageInfo, isLoading, errorText, count };
}
