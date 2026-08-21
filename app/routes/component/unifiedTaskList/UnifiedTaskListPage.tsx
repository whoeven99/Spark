import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
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
import { buildWorkspaceChatPrefillPath } from "../../../lib/workspaceChatPrefill";
import { UnifiedTaskCard } from "./UnifiedTaskCard";
import { buildOperationTaskPrompt, inferOperationTaskPresentation } from "../../../lib/operationTaskPresentation";
import type {
  UnifiedTaskEntry,
  UnifiedTaskListResponse,
  UnifiedTaskStatusFilter,
  UnifiedTaskTypeFilter,
  UnifiedTaskView,
} from "../../../lib/unifiedTaskTypes";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";
import type { OperationTaskView } from "../../../server/operations/dailyInspection.server";

const PAGE_SIZE = 10;
const EMPTY_STATE_MIN_HEIGHT = 320;
const OPERATION_SOURCE_LABELS: Record<string, string> = {
  fulfillment_overdue: "发货超时",
  logistics_stale: "物流停滞",
  refund_spike: "退款异常",
  after_sales_timeout: "售后超时",
  inventory_risk: "库存风险",
  payment_chain_review: "支付链路",
  sales_decline: "销售下滑",
  traffic_conversion_drop: "转化承接下滑",
  routine_shipping: "履约排队",
  launch_failure_review: "上新复盘",
  product_incomplete: "商品未就绪",
  inventory_replenish_plan: "补货计划",
};

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
    value === "automation_task" ||
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

function readTaskIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("taskId")?.trim();
  return value ? value : null;
}

function readOperationSourceFilterFromSearch(search: string): string[] {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("unifiedOperationSource");
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}

function syncSearch(
  view: UnifiedTaskView,
  page: number,
  typeFilter: UnifiedTaskTypeFilter,
  statusFilter: UnifiedTaskStatusFilter,
  operationSourceFilter: string[],
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
  if (operationSourceFilter.length === 0) {
    url.searchParams.delete("unifiedOperationSource");
  } else {
    url.searchParams.set("unifiedOperationSource", operationSourceFilter.join(","));
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function getCacheKey(
  view: UnifiedTaskView,
  page: number,
  typeFilter: UnifiedTaskTypeFilter,
  statusFilter: UnifiedTaskStatusFilter,
  operationSourceFilter: string[],
): string {
  return `${view}:${page}:${typeFilter}:${statusFilter}:${operationSourceFilter.join(",")}`;
}

async function fetchUnifiedTasks(
  locationSearch: string,
  view: UnifiedTaskView,
  page: number,
  typeFilter: UnifiedTaskTypeFilter,
  statusFilter: UnifiedTaskStatusFilter,
  operationSourceFilter: string[],
): Promise<UnifiedTaskListResponse> {
  const q = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  q.set("view", view);
  q.set("page", String(page));
  q.set("pageSize", String(PAGE_SIZE));
  q.set("type", typeFilter);
  q.set("status", statusFilter);
  if (operationSourceFilter.length > 0) {
    q.set("operationSource", operationSourceFilter.join(","));
  }
  const resp = await fetch(`/api/unified-tasks?${q.toString()}`);
  if (!resp.ok) throw new Error(`Failed to fetch unified tasks: ${resp.status}`);
  return (await resp.json()) as UnifiedTaskListResponse;
}

type Props = {
  locationSearch: string;
};

type CountState = { currentCount: number; historyCount: number };

export function UnifiedTaskListPage({ locationSearch }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
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
  const [operationSourceFilter, setOperationSourceFilter] = useState<string[]>(() =>
    readOperationSourceFilterFromSearch(initialSearch),
  );
  const [entries, setEntries] = useState<UnifiedTaskEntry[]>([]);
  const [counts, setCounts] = useState<CountState>({ currentCount: 0, historyCount: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const pageCache = useRef<Record<string, UnifiedTaskListResponse>>({});
  const currentSearch = location.search || locationSearch;

  const load = useCallback(
    async (
      v: UnifiedTaskView,
      p: number,
      type: UnifiedTaskTypeFilter,
      status: UnifiedTaskStatusFilter,
      operationSource: string[],
      force = false,
    ) => {
      const key = getCacheKey(v, p, type, status, operationSource);
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
        const data = await fetchUnifiedTasks(currentSearch, v, p, type, status, operationSource);
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
    [currentSearch],
  );

  // Initial load and view/page changes
  useEffect(() => {
    syncSearch(view, page, typeFilter, statusFilter, operationSourceFilter);
    void load(view, page, typeFilter, statusFilter, operationSourceFilter);
  }, [view, page, typeFilter, statusFilter, operationSourceFilter, load]);

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
        void load(view, page, typeFilter, statusFilter, operationSourceFilter, true);
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
    void load(view, page, typeFilter, statusFilter, operationSourceFilter, true);
  }, [load, operationSourceFilter, page, statusFilter, typeFilter, view]);

  const selectedTaskId = useMemo(() => readTaskIdFromSearch(currentSearch), [currentSearch]);
  const selectedOperationTask = useMemo(() => {
    if (!selectedTaskId) return null;
    const selectedEntry = entries.find(
      (entry): entry is Extract<UnifiedTaskEntry, { entryType: "operation_task" }> =>
        entry.entryType === "operation_task" && entry.task.id === selectedTaskId,
    );
    return selectedEntry?.task ?? null;
  }, [entries, selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId || loading) return;
    if (selectedOperationTask) return;
    const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
    params.delete("taskId");
    const query = params.toString();
    navigate(`/app/tasks${query ? `?${query}` : ""}`, { replace: true });
  }, [currentSearch, loading, navigate, selectedOperationTask, selectedTaskId]);

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
    { key: "automation_task" as const, label: "定时任务" },
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
        subtitle={
          operationSourceFilter.length > 0
            ? `当前仅显示：${operationSourceFilter
                .map((key) => OPERATION_SOURCE_LABELS[key] ?? key)
                .join("、")} 相关的经营任务`
            : "统一查看定时任务、经营任务、文案、图片和批处理任务"
        }
        badge={
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: pageColorTokens.textFootnote }}>
            <span>当前结果 {totalCount} 条</span>
            {operationSourceFilter.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setOperationSourceFilter([]);
                  setTypeFilter("all");
                  setPage(1);
                }}
                style={{
                  padding: "0.2rem 0.55rem",
                  borderRadius: 999,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  background: pageColorTokens.surface,
                  color: pageColorTokens.textSecondary,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                查看全部
              </button>
            ) : null}
          </div>
        }
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
  const closeTaskDetail = () => {
    const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
    params.delete("taskId");
    const query = params.toString();
    navigate(`/app/tasks${query ? `?${query}` : ""}`, { replace: true });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div ref={listTopRef} />

      {tabBar}
      {filterBar}
      {selectedOperationTask ? (
        <OperationTaskDetailPanel
          task={selectedOperationTask}
          onClose={closeTaskDetail}
        />
      ) : null}

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
            {operationSourceFilter.length > 0
              ? "当前健康项下暂无匹配任务"
              : view === "current"
                ? "暂无进行中的任务"
                : "暂无历史任务"}
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

function operationStatusLabel(
  status: OperationTaskView["status"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (status) {
    case "open":
      return t("taskWorkbench.taskStatusOpen");
    case "in_progress":
      return t("taskWorkbench.taskStatusInProgress");
    case "done":
      return t("taskWorkbench.taskStatusDone");
    case "ignored":
      return t("taskWorkbench.taskStatusIgnored");
    default:
      return t("taskWorkbench.taskStatusAutoClosed");
  }
}

function operationDueWindowLabel(
  task: OperationTaskView,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (task.dueWindow === "today") return t("taskWorkbench.dueWindowToday");
  if (task.dueWindow === "48h") return t("taskWorkbench.dueWindow48h");
  if (task.dueWindow === "this_week") return t("taskWorkbench.dueWindowThisWeek");
  return t("taskWorkbench.dueWindowBacklog");
}

function operationSourceTypeLabel(task: OperationTaskView) {
  if (task.sourceType === "hybrid") return "规则 + AI";
  if (task.sourceType === "ai") return "AI";
  return "规则";
}

function operationConfidenceLabel(task: OperationTaskView) {
  if (task.confidence === "high") return "高";
  if (task.confidence === "medium") return "中";
  if (task.confidence === "low") return "低";
  return "—";
}

function operationRiskEnvironmentLabel(task: OperationTaskView) {
  if (task.riskEnvironment === "after-sales") return "售后";
  if (task.riskEnvironment === "payments") return "支付";
  if (task.riskEnvironment === "fulfillment") return "履约";
  if (task.riskEnvironment === "inventory") return "库存";
  if (task.riskEnvironment === "conversion") return "转化";
  if (task.riskEnvironment === "new-arrivals") return "上新";
  if (task.riskEnvironment === "risk-control") return "风控";
  return "—";
}

function renderRelatedObjects(relatedObjects: unknown) {
  if (!relatedObjects || typeof relatedObjects !== "object") return "—";
  const entries = Object.entries(relatedObjects as Record<string, unknown>).filter(([, value]) => {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number" || typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "object" && Object.keys(value).length > 0;
  });
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

function OperationTaskDetailPanel({
  task,
  onClose,
}: {
  task: OperationTaskView;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const presentation = inferOperationTaskPresentation(task, t);
  const aiChatPath = buildWorkspaceChatPrefillPath({
    prompt: buildOperationTaskPrompt(task, presentation, {
      taskStatusText: operationStatusLabel(task.status, t),
      dueWindowText: operationDueWindowLabel(task, t),
      t,
    }),
    constraints: [
      `当前 AI 语境：Tasks / ${task.title}`,
      "只围绕当前经营任务的处理顺序、原因判断和执行动作回答，不切回通用助手语境。",
    ],
  });

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: "1rem",
        ...destinationSurfaceStyle,
      }}
    >
      <PageSectionHeader
        title={task.title}
        subtitle={task.triggerReason}
        badge={
          <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
            {task.priority} / {task.quadrant.toUpperCase()} / {operationStatusLabel(task.status, t)}
          </div>
        }
      />
      <div style={detailGridStyle}>
        <DetailBlock label={t("taskWorkbench.taskObjectiveLabel")} value={presentation.objective} />
        <DetailBlock label={t("taskWorkbench.taskImpactMetricLabel")} value={presentation.impactMetric} />
        <DetailBlock label={t("taskWorkbench.taskEstimatedLiftLabel")} value={presentation.estimatedLift} />
        <DetailBlock label={t("taskWorkbench.taskRoiImpactLabel")} value={presentation.roiImpact} />
        <DetailBlock label="来源类型" value={operationSourceTypeLabel(task)} />
        <DetailBlock label="置信度" value={operationConfidenceLabel(task)} />
        <DetailBlock label="风险环境" value={operationRiskEnvironmentLabel(task)} />
        <DetailBlock label={t("taskWorkbench.taskPromptOwner")} value={task.ownerRole ?? t("taskWorkbench.taskPromptOwnerUnknown")} />
        <DetailBlock label={t("taskWorkbench.taskPromptDue")} value={operationDueWindowLabel(task, t)} />
      </div>
      <DetailBlock
        label={t("taskWorkbench.suggestedActionsLabel")}
        value={task.suggestedActions.length > 0 ? task.suggestedActions.join("\n") : "—"}
        multiline
      />
      <DetailBlock
        label={t("taskWorkbench.relatedObjectsLabel")}
        value={renderRelatedObjects(task.relatedObjects)}
        multiline
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={detailPrimaryButtonStyle} onClick={() => navigate(aiChatPath)}>
          {t("taskWorkbench.actionSendToAi")}
        </button>
        <button type="button" style={detailSecondaryButtonStyle} onClick={onClose}>
          {t("common.backToPrevious")}
        </button>
      </div>
    </div>
  );
}

function DetailBlock({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        padding: "0.85rem 0.95rem",
        borderRadius: 12,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        background: pageColorTokens.surface,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: pageColorTokens.textPrimary,
          whiteSpace: multiline ? "pre-wrap" : "normal",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const detailPrimaryButtonStyle = {
  padding: "0.6rem 0.95rem",
  borderRadius: 999,
  border: `1px solid ${pageColorTokens.brandBlue}`,
  background: pageColorTokens.brandBlue,
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const detailSecondaryButtonStyle = {
  padding: "0.6rem 0.95rem",
  borderRadius: 999,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
