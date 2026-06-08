import { useEffect, useRef, useState } from "react";
import type {
  ContextResourceItem,
  ContextResourceListResponse,
  ContextResourcePageInfo,
  ContextResourceSortDirection,
  ContextResourceType,
} from "../lib/contextResourceTypes";

const DEFAULT_DEBOUNCE_MS = 320;

type Options = {
  enabled?: boolean;
  type: ContextResourceType;
  query: string;
  filter: string;
  sort: string;
  direction: ContextResourceSortDirection;
  locationSearch: string;
  debounceMs?: number;
};

type State = {
  items: ContextResourceItem[];
  pageInfo: ContextResourcePageInfo;
  isLoading: boolean;
  errorText: string | null;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  resetPagination: () => void;
};

const EMPTY_PAGE_INFO: ContextResourcePageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

export function useContextResourceSearch({
  enabled = true,
  type,
  query,
  filter,
  sort,
  direction,
  locationSearch,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: Options): State {
  const [items, setItems] = useState<ContextResourceItem[]>([]);
  const [pageInfo, setPageInfo] = useState<ContextResourcePageInfo>(EMPTY_PAGE_INFO);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCursor("");
  }, [type, query, filter, sort, direction]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setPageInfo(EMPTY_PAGE_INFO);
      setIsLoading(false);
      setErrorText(null);
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
      params.set("q", query.trim());
      params.set("filter", filter);
      params.set("sort", sort);
      params.set("direction", direction);
      if (cursor) params.set("cursor", cursor);
      const url = `/api/context-resources/${type}?${params.toString()}`;

      void (async () => {
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: ac.signal,
          });
          const payload = (await res.json().catch(() => ({}))) as ContextResourceListResponse;
          if (ac.signal.aborted) return;

          if (!res.ok || payload.success === false || !payload.response) {
            setItems([]);
            setPageInfo(EMPTY_PAGE_INFO);
            setErrorText(payload.errorMsg || `请求失败（${res.status}）`);
            return;
          }

          setItems(payload.response.items);
          setPageInfo(payload.response.pageInfo);
          setErrorText(null);
        } catch (error) {
          if (ac.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setItems([]);
          setPageInfo(EMPTY_PAGE_INFO);
          setErrorText("资源加载失败，请稍后重试");
        } finally {
          if (!ac.signal.aborted) {
            setIsLoading(false);
          }
        }
      })();
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [enabled, type, query, filter, sort, direction, locationSearch, debounceMs, cursor]);

  return {
    items,
    pageInfo,
    isLoading,
    errorText,
    goToNextPage: () => {
      if (!pageInfo.endCursor) return;
      setCursor(pageInfo.endCursor);
    },
    goToPreviousPage: () => {
      if (!pageInfo.startCursor) return;
      setCursor(`prev:${pageInfo.startCursor}`);
    },
    resetPagination: () => {
      setCursor("");
    },
  };
}
