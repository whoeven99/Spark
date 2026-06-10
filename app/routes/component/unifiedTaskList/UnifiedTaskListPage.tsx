import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pageColorTokens, pageEmptyStateStyle } from "../../page/pageUiStyles";
import { AITaskPagination } from "../aiTask/AITaskPagination";
import { UnifiedTaskCard } from "./UnifiedTaskCard";
import type { UnifiedTaskEntry, UnifiedTaskListResponse, UnifiedTaskView } from "../../../lib/unifiedTaskTypes";
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

function syncSearch(view: UnifiedTaskView, page: number) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("unifiedView", view);
  if (page <= 1) {
    url.searchParams.delete("unifiedPage");
  } else {
    url.searchParams.set("unifiedPage", String(page));
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function getCacheKey(view: UnifiedTaskView, page: number): string {
  return `${view}:${page}`;
}

async function fetchUnifiedTasks(
  locationSearch: string,
  view: UnifiedTaskView,
  page: number,
): Promise<UnifiedTaskListResponse> {
  const q = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  q.set("view", view);
  q.set("page", String(page));
  q.set("pageSize", String(PAGE_SIZE));
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
  const [entries, setEntries] = useState<UnifiedTaskEntry[]>([]);
  const [counts, setCounts] = useState<CountState>({ currentCount: 0, historyCount: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const pageCache = useRef<Record<string, UnifiedTaskListResponse>>({});

  const load = useCallback(
    async (v: UnifiedTaskView, p: number, force = false) => {
      const key = getCacheKey(v, p);
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
        const data = await fetchUnifiedTasks(locationSearch, v, p);
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
    syncSearch(view, page);
    void load(view, page);
  }, [view, page, load]);

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
        void load(view, page, true);
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

  // ── Tab bar ────────────────────────────────────────────────────────────────

  const tabs = useMemo(
    () => [
      { key: "current" as const, label: `当前任务（${counts.currentCount}）` },
      { key: "history" as const, label: `历史任务（${counts.historyCount}）` },
    ],
    [counts],
  );

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const showEmpty = !loading && entries.length === 0;
  const showLoading = loading && entries.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div ref={listTopRef} />

      {tabBar}

      {showLoading ? (
        <div
          style={{
            ...pageEmptyStateStyle,
            minHeight: EMPTY_STATE_MIN_HEIGHT,
            padding: "2.75rem 1.5rem",
            background: "linear-gradient(160deg, #fafafa 0%, #f5f6f8 100%)",
            border: `1px dashed ${pageColorTokens.borderSubtle}`,
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
            background: "linear-gradient(160deg, #fafafa 0%, #f5f6f8 100%)",
            border: `1px dashed ${pageColorTokens.borderSubtle}`,
          }}
        >
          <span style={{ fontSize: 28, lineHeight: 1 }}>📋</span>
          <span style={{ fontSize: 14, color: pageColorTokens.textSecondary }}>
            {view === "current" ? "暂无进行中的任务" : "暂无历史任务"}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((entry) => {
            const key =
              entry.entryType === "ai_task" ? entry.task.id : entry.job.id;
            const isDeletingThis =
              entry.entryType === "ai_task" && entry.task.id === deletingId;
            return (
              <UnifiedTaskCard
                key={key}
                entry={entry}
                locationSearch={locationSearch}
                onAITaskDeleted={(id) => void handleAITaskDeleted(id)}
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
