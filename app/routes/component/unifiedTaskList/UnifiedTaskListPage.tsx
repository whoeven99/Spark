import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PageSectionHeader,
  pageColorTokens,
  pageEmptyStateStyle,
} from "../../page/pageUiStyles";
import {
  DestinationFilterBar,
  destinationSurfaceStyle,
} from "../shared/DestinationPage";
import { AITaskPagination } from "../aiTask/AITaskPagination";
import { UnifiedTaskCard } from "./UnifiedTaskCard";
import type {
  UnifiedTaskEntry,
  UnifiedTaskListResponse,
  UnifiedTaskStatusFilter,
  UnifiedTaskTypeFilter,
  UnifiedTaskView,
} from "../../../lib/unifiedTaskTypes";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";

const PAGE_SIZE = 10;
const EMPTY_STATE_MIN_HEIGHT = 320;

function readViewFromSearch(search: string): UnifiedTaskView {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("unifiedView") === "history" ? "history" : "current";
}

function readPageFromSearch(search: string): number {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = Number(params.get("unifiedPage"));
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

function readTypeFilterFromSearch(search: string): UnifiedTaskTypeFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("unifiedType");
  if (
    value === "operation_task" ||
    value === "product_improve" ||
    value === "image_generation" ||
    value === "picture_translate"
  ) {
    return value;
  }
  return "all";
}

function readStatusFilterFromSearch(search: string): UnifiedTaskStatusFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("unifiedStatus");
  if (
    value === "running" ||
    value === "open" ||
    value === "in_progress" ||
    value === "needs_review" ||
    value === "failed" ||
    value === "completed" ||
    value === "ignored"
  ) {
    return value;
  }
  return "all";
}

function syncSearch(
  view: UnifiedTaskView,
  page: number,
  typeFilter: UnifiedTaskTypeFilter,
  statusFilter: UnifiedTaskStatusFilter,
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("unifiedView", view);
  if (page <= 1) {
    url.searchParams.delete("unifiedPage");
  } else {
    url.searchParams.set("unifiedPage", String(page));
  }
  if (typeFilter === "all") {
    url.searchParams.delete("unifiedType");
  } else {
    url.searchParams.set("unifiedType", typeFilter);
  }
  if (statusFilter === "all") {
    url.searchParams.delete("unifiedStatus");
  } else {
    url.searchParams.set("unifiedStatus", statusFilter);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function getCacheKey(
  view: UnifiedTaskView,
  page: number,
  typeFilter: UnifiedTaskTypeFilter,
  statusFilter: UnifiedTaskStatusFilter,
): string {
  return `${view}:${page}:${typeFilter}:${statusFilter}`;
}

async function fetchUnifiedTasks(
  locationSearch: string,
  view: UnifiedTaskView,
  page: number,
  typeFilter: UnifiedTaskTypeFilter,
  statusFilter: UnifiedTaskStatusFilter,
): Promise<UnifiedTaskListResponse> {
  const q = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  q.set("view", view);
  q.set("page", String(page));
  q.set("pageSize", String(PAGE_SIZE));
  q.set("type", typeFilter);
  q.set("status", statusFilter);
  const resp = await fetch(`/api/unified-tasks?${q.toString()}`);
  if (!resp.ok) throw new Error(`Failed to fetch unified tasks: ${resp.status}`);
  return (await resp.json()) as UnifiedTaskListResponse;
}

type Props = {
  locationSearch: string;
};

type CountState = { currentCount: number; historyCount: number };

export function UnifiedTaskListPage({ locationSearch }: Props) {
  const initialSearch =
    typeof window !== "undefined" ? window.location.search : locationSearch;

  const [view, setView] = useState<UnifiedTaskView>(() => readViewFromSearch(initialSearch));
  const [page, setPage] = useState<number>(() => readPageFromSearch(initialSearch));
  const [typeFilter, setTypeFilter] = useState<UnifiedTaskTypeFilter>(() =>
    readTypeFilterFromSearch(initialSearch),
  );
  const [statusFilter, setStatusFilter] = useState<UnifiedTaskStatusFilter>(() =>
    readStatusFilterFromSearch(initialSearch),
  );
  const [entries, setEntries] = useState<UnifiedTaskEntry[]>([]);
  const [counts, setCounts] = useState<CountState>({ currentCount: 0, historyCount: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const pageCache = useRef<Record<string, UnifiedTaskListResponse>>({});

  const load = useCallback(
    async (
      v: UnifiedTaskView,
      p: number,
      type: UnifiedTaskTypeFilter,
      status: UnifiedTaskStatusFilter,
      force = false,
    ) => {
      const key = getCacheKey(v, p, type, status);
      if (!force && pageCache.current[key]) {
        const cached = pageCache.current[key];
        setEntries(cached.entries);
        setTotalCount(cached.totalCount);
        setTotalPages(cached.totalPages);
        setCounts({ currentCount: cached.currentCount, historyCount: cached.historyCount });
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchUnifiedTasks(locationSearch, v, p, type, status);
        pageCache.current[key] = data;
        setEntries(data.entries);
        setTotalCount(data.totalCount);
        setTotalPages(data.totalPages);
        setCounts({ currentCount: data.currentCount, historyCount: data.historyCount });
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [locationSearch],
  );

  // Initial load and view/page changes
  useEffect(() => {
    syncSearch(view, page, typeFilter, statusFilter);
    void load(view, page, typeFilter, statusFilter);
  }, [view, page, typeFilter, statusFilter, load]);

  function scrollToTop() {
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleViewChange(next: UnifiedTaskView) {
    if (next === view) return;
    setView(next);
    setPage(1);
    scrollToTop();
  }

  function handlePageChange(next: number) {
    if (next === page) return;
    setPage(next);
    scrollToTop();
  }

  function handleTypeFilterChange(next: UnifiedTaskTypeFilter) {
    if (next === typeFilter) return;
    setTypeFilter(next);
    setPage(1);
    scrollToTop();
  }

  function handleStatusFilterChange(next: UnifiedTaskStatusFilter) {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setPage(1);
    scrollToTop();
  }

  async function handleAITaskDeleted(taskId: string) {
    setDeletingId(taskId);
    try {
      const resp = await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", taskId }),
      });
      if (resp.ok) {
        // Remove from current view and invalidate cache
        setEntries((prev) => prev.filter((e) => !(e.entryType === "ai_task" && e.task.id === taskId)));
        pageCache.current = {};
        setTotalCount((c) => Math.max(0, c - 1));
        // Refresh counts
        void load(view, page, typeFilter, statusFilter, true);
      }
    } finally {
      setDeletingId(null);
    }
  }

  function handleTaskUpdated(
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.entryType === "ai_task" && e.task.id === taskId) {
          return { ...e, task: { ...e.task, status, ...(result ? { result } : {}) } };
        }
        return e;
      }),
    );
  }

  const handleOperationTaskUpdated = useCallback(() => {
    pageCache.current = {};
    void load(view, page, typeFilter, statusFilter, true);
  }, [load, page, statusFilter, typeFilter, view]);

  // ── Tab bar ────────────────────────────────────────────────────────────────

  const tabs = useMemo(
    () => [
      { key: "current" as const, label: `当前任务（${counts.currentCount}）` },
      { key: "history" as const, label: `历史任务（${counts.historyCount}）` },
    ],
    [counts],
  );

  const typeFilters = [
    { key: "all" as const, label: "全部类型" },
    { key: "operation_task" as const, label: "经营任务" },
    { key: "product_improve" as const, label: "文案" },
    { key: "image_generation" as const, label: "图片生成" },
    { key: "picture_translate" as const, label: "图片翻译" },
  ];

  const statusFilters = [
    { key: "all" as const, label: "全部状态" },
    { key: "running" as const, label: "进行中" },
    { key: "open" as const, label: "待处理" },
    { key: "in_progress" as const, label: "处理中" },
    { key: "needs_review" as const, label: "待审核" },
    { key: "failed" as const, label: "失败" },
    { key: "completed" as const, label: "已完成" },
    { key: "ignored" as const, label: "已忽略" },
  ];

  const tabBar = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "0.5rem",
        borderRadius: 999,
        background: pageColorTokens.surfaceMuted,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tabs.map((tab) => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleViewChange(tab.key)}
              style={{
                padding: "0.5rem 0.9rem",
                borderRadius: 999,
                border: `1px solid ${active ? pageColorTokens.borderSubtle : "transparent"}`,
                background: active ? pageColorTokens.surface : "transparent",
                color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
                boxShadow: active ? pageColorTokens.shadowCard : "none",
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
        历史任务保留 30 天
      </div>
    </div>
  );

  const filterBar = (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: "0.85rem",
        ...destinationSurfaceStyle,
      }}
    >
      <PageSectionHeader
        title="任务收件箱"
        subtitle="统一查看经营任务、文案、图片和批处理任务"
        badge={<div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>当前结果 {totalCount} 条</div>}
      />

      <DestinationFilterBar
        label="任务类型"
        items={typeFilters}
        active={typeFilter}
        onChange={handleTypeFilterChange}
      />

      <DestinationFilterBar
        label="任务状态"
        items={statusFilters}
        active={statusFilter}
        onChange={handleStatusFilterChange}
      />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const showEmpty = !loading && entries.length === 0;
  const showLoading = loading && entries.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div ref={listTopRef} />

      {tabBar}
      {filterBar}

      {showLoading ? (
        <div
          style={{
            ...pageEmptyStateStyle,
            minHeight: EMPTY_STATE_MIN_HEIGHT,
            padding: "2.75rem 1.5rem",
          }}
        >
          <span style={{ fontSize: 28, lineHeight: 1 }}>⏳</span>
          <span style={{ fontSize: 14, color: pageColorTokens.textSecondary }}>
            加载中…
          </span>
        </div>
      ) : showEmpty ? (
        <div
          style={{
            ...pageEmptyStateStyle,
            minHeight: EMPTY_STATE_MIN_HEIGHT,
            padding: "2.75rem 1.5rem",
          }}
        >
          <span style={{ fontSize: 28, lineHeight: 1 }}>📋</span>
          <span style={{ fontSize: 14, color: pageColorTokens.textSecondary }}>
            {view === "current" ? "暂无进行中的任务" : "暂无历史任务"}
          </span>
          <span style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
            可以调整类型或状态筛选查看其它任务。
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((entry) => {
            const key = entry.task.id;
            const isDeletingThis = entry.task.id === deletingId;
            return (
              <UnifiedTaskCard
                key={key}
                entry={entry}
                locationSearch={locationSearch}
                onAITaskDeleted={(id) => void handleAITaskDeleted(id)}
                onOperationTaskUpdated={handleOperationTaskUpdated}
                onTaskUpdated={handleTaskUpdated}
                deleting={isDeletingThis}
              />
            );
          })}
        </div>
      )}

      <AITaskPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        loading={loading}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
