import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";
import type {
  TranslationV4Job,
  TranslationV4Metrics,
  TranslationV4Status,
} from "../../../server/translation/v4/types";
import {
  formatTranslationV4TranslateDetailLocalized,
  formatV4JobTimeLine,
  formatV4TaskElapsed,
  translationV4StatusLabel,
} from "../../../lib/translationV4/state";
import { TERMINAL_V4_STATUSES } from "../../../server/translation/v4/types";

// ─── Token-to-credit conversion ───────────────────────────────────────────────

const TOKENS_PER_CREDIT = 1000;

function tokensToCredits(tokens: number): number {
  return Math.ceil(tokens / TOKENS_PER_CREDIT);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────
// `translationV4StatusLabel` + formatters now come from the canonical
// client-safe module `app/lib/translationV4/state`.

function mapV4StatusToAIStatus(status: TranslationV4Status): AITaskStatus {
  if (status === "COMPLETED") return "succeeded";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED" || status === "PAUSED") return "cancelled";
  return "running";
}

function moduleListSummary(modules: string[]): string {
  const names: Record<string, string> = {
    PRODUCT: "商品",
    COLLECTION: "集合",
    PAGE: "页面",
    ARTICLE: "文章",
    BLOG: "博客",
    MENU: "导航菜单",
    METAFIELD: "元字段",
    METAOBJECT: "元对象",
    FILTER: "过滤器",
    SHOP: "店铺信息",
    PRODUCT_OPTION: "商品选项",
    PRODUCT_OPTION_VALUE: "选项值",
  };
  const MAX_SHOW = 3;
  const shown = modules.slice(0, MAX_SHOW).map((m) => names[m] ?? m);
  const rest = modules.length - MAX_SHOW;
  return rest > 0 ? `${shown.join("、")} 等 ${modules.length} 个模块` : shown.join("、");
}

function buildStageSummary(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
): string {
  const label = translationV4StatusLabel(status);
  if (["TRANSLATING", "TRANSLATE_QUEUED", "TRANSLATE_DONE"].includes(status)) {
    if (metrics.translateUnitTotal > 0) {
      return `${label}：${metrics.translateUnitDone} / ${metrics.translateUnitTotal} 单元`;
    }
    if (metrics.translateTotal > 0) {
      return `${label}：${metrics.translateDone} / ${metrics.translateTotal} 项`;
    }
  }
  if (["INITIALIZING", "INIT_DONE"].includes(status) && metrics.initTotal > 0) {
    return `${label}：${metrics.initDone} / ${metrics.initTotal} 项`;
  }
  if (["WRITING_BACK", "WRITEBACK_QUEUED"].includes(status) && metrics.writebackTotal > 0) {
    return `${label}：${metrics.writebackDone} / ${metrics.writebackTotal} 项`;
  }
  if (["VERIFYING", "VERIFY_QUEUED"].includes(status) && metrics.verifyTotal > 0) {
    return `${label}：${metrics.verifyDone} / ${metrics.verifyTotal} 项`;
  }
  return label;
}

// ─── Multi-stage progress ─────────────────────────────────────────────────────

type StageState = "completed" | "active" | "pending" | "failed";

type StageRow = {
  label: string;
  done: number;
  total: number;
  state: StageState;
  /** 覆盖右侧计数文案（如翻译行展示节点 + 资源数） */
  countDetail?: string;
};

/**
 * Determine the state of each stage (init / translate / writeback / verify)
 * from the current job status + accumulated metrics.
 */
function resolveStageStates(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
): [StageState, StageState, StageState, StageState] {
  // ── Active flows ─────────────────────────────────────────────────────────
  if (status === "COMPLETED" || status === "FAILED") {
    const init = "completed" as const;
    const translate = "completed" as const;
    const writebackStage: StageState =
      metrics.writebackTotal > 0 && metrics.writebackDone === 0 && metrics.writebackFailed > 0
        ? "failed"
        : "completed";
    const verifyStage: StageState =
      metrics.verifyTotal > 0 && metrics.verifyDone === 0 && metrics.verifyFailed > 0
        ? "failed"
        : writebackStage === "failed"
          ? "failed"
          : "completed";
    return [init, translate, writebackStage, verifyStage];
  }
  if (status === "CREATED") return ["pending", "pending", "pending", "pending"];
  if (status === "INIT_QUEUED" || status === "INITIALIZING") return ["active", "pending", "pending", "pending"];
  if (status === "INIT_DONE") return ["completed", "pending", "pending", "pending"];
  if (status === "TRANSLATE_QUEUED" || status === "TRANSLATING") return ["completed", "active", "pending", "pending"];
  if (status === "TRANSLATE_DONE") return ["completed", "completed", "pending", "pending"];
  if (status === "WRITEBACK_QUEUED" || status === "WRITING_BACK") return ["completed", "completed", "active", "pending"];
  if (status === "VERIFY_QUEUED" || status === "VERIFYING") return ["completed", "completed", "completed", "active"];

  // ── Terminal flows: infer from metrics which stages completed ─────────────
  const failState: StageState = status === "FAILED" ? "failed" : "pending";

  const initDone = metrics.initTotal > 0 && metrics.initDone >= metrics.initTotal;
  const hasTranslate = metrics.translateTotal > 0 || metrics.translateUnitTotal > 0;
  const translateDone =
    (metrics.translateUnitTotal > 0 && metrics.translateUnitDone >= metrics.translateUnitTotal) ||
    (metrics.translateTotal > 0 && metrics.translateDone >= metrics.translateTotal);
  const hasWriteback = metrics.writebackTotal > 0;
  const writebackDone = hasWriteback && metrics.writebackDone >= metrics.writebackTotal;
  const hasVerify = metrics.verifyTotal > 0;
  const verifyDone = hasVerify && metrics.verifyDone >= metrics.verifyTotal;

  if (verifyDone) return ["completed", "completed", "completed", "completed"];
  if (writebackDone || hasVerify) return ["completed", "completed", "completed", failState];
  if (translateDone || hasWriteback) return ["completed", "completed", failState, "pending"];
  if (initDone || hasTranslate) return ["completed", failState, "pending", "pending"];
  return [failState, "pending", "pending", "pending"];
}

const STAGE_BAR_COLORS: Record<StageState, { bar: string; label: string }> = {
  completed: { bar: "#00a67c", label: pageColorTokens.brandGreenDark },
  active: { bar: "#4070f4", label: "#4070f4" },
  pending: { bar: "#e5e7eb", label: pageColorTokens.textFootnote },
  failed: { bar: "#d97706", label: pageColorTokens.criticalText },
};

function stagePercent(row: StageRow): number {
  if (row.state === "completed") return 100;
  if (row.state === "pending") return 0;
  if (row.total <= 0) return row.state === "active" ? 5 : 0; // show tiny sliver when active but no data yet
  return Math.min(100, Math.round((row.done / row.total) * 100));
}

function StageProgressRow({ row }: { row: StageRow }) {
  const colors = STAGE_BAR_COLORS[row.state];
  const pct = stagePercent(row);
  const isActive = row.state === "active";
  const isPending = row.state === "pending";

  const countText =
    row.countDetail ??
    (row.total > 0
      ? `${row.done.toLocaleString()} / ${row.total.toLocaleString()}`
      : isPending
        ? "—"
        : "");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* Stage label */}
      <div
        style={{
          width: 52,
          flexShrink: 0,
          fontSize: 12,
          fontWeight: isActive ? 700 : 600,
          color: colors.label,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {isActive && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: colors.label,
              flexShrink: 0,
              boxShadow: `0 0 0 3px ${colors.label}22`,
              animation: "pulse 1.4s ease-in-out infinite",
            }}
          />
        )}
        {row.label}
      </div>

      {/* Progress bar */}
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: "#f0f0f2",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 999,
            background: isPending ? "#d1d5db" : colors.bar,
            transition: "width 0.35s ease",
          }}
        />
      </div>

      {/* Count */}
      <div
        style={{
          width: row.countDetail ? 168 : 100,
          flexShrink: 0,
          fontSize: 11,
          color: isPending ? pageColorTokens.textFootnote : colors.label,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {countText}
      </div>
    </div>
  );
}

function MultiStageProgress({
  status,
  metrics,
}: {
  status: TranslationV4Status;
  metrics: TranslationV4Metrics;
}) {
  const [init, translate, writeback, verify] = resolveStageStates(status, metrics);

  // For translate, prefer unit-level numbers if available
  const translateDone = metrics.translateUnitTotal > 0 ? metrics.translateUnitDone : metrics.translateDone;
  const translateTotal = metrics.translateUnitTotal > 0 ? metrics.translateUnitTotal : metrics.translateTotal;

  const translateCountDetail = formatTranslationV4TranslateDetailLocalized(metrics) ?? undefined;

  const verifyCountDetail =
    metrics.writebackTotal > 0 && metrics.verifyTotal > 0 && metrics.verifyTotal < metrics.writebackTotal
      ? `${metrics.verifyDone.toLocaleString()}/${metrics.verifyTotal.toLocaleString()}（有译文变更）`
      : undefined;

  const rows: StageRow[] = [
    { label: "初始化", done: metrics.initDone, total: metrics.initTotal, state: init },
    {
      label: "翻  译",
      done: translateDone,
      total: translateTotal,
      state: translate,
      countDetail: translateCountDetail,
    },
    { label: "写  回", done: metrics.writebackDone, total: metrics.writebackTotal, state: writeback },
    {
      label: "校  验",
      done: metrics.verifyDone,
      total: metrics.verifyTotal,
      state: verify,
      countDetail: verifyCountDetail,
    },
  ];

  // Only show verify row if there's actual verify data or job reached that stage
  const showVerify = verify !== "pending" || metrics.verifyTotal > 0;

  const visibleRows = showVerify ? rows : rows.slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {visibleRows.map((row) => (
        <StageProgressRow key={row.label} row={row} />
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  job: TranslationV4Job;
};

export function TranslationV4TaskCard({ job }: Props) {
  const { i18n: _i18n } = useTranslation();
  const navigate = useNavigate();

  const mappedStatus = mapV4StatusToAIStatus(job.status);
  const shortId = job.id.slice(0, 8).toUpperCase();
  const isActive = !TERMINAL_V4_STATUSES.includes(job.status) && job.status !== "PAUSED";

  const freezeEnd =
    job.status === "PAUSED" ||
    job.status === "CANCELLED" ||
    TERMINAL_V4_STATUSES.includes(job.status)
      ? job.updatedAt
      : null;
  const elapsedLabel = formatV4TaskElapsed(job.createdAt, freezeEnd);

  const usedCredits = job.metrics.usedTokens > 0 ? tokensToCredits(job.metrics.usedTokens) : null;

  const primaryCopy = isActive
    ? buildStageSummary(job.status, job.metrics)
    : translationV4StatusLabel(job.status);

  let primaryCopyColor: string = pageColorTokens.textPrimary;
  if (job.status === "FAILED") primaryCopyColor = pageColorTokens.criticalText;
  else if (isActive) primaryCopyColor = "#4070f4";
  else if (job.status === "COMPLETED") primaryCopyColor = pageColorTokens.brandGreenDark;

  const secondaryParts: string[] = [];
  if (elapsedLabel) secondaryParts.push(`耗时 ${elapsedLabel}`);
  if (usedCredits != null) secondaryParts.push(`消耗 ${usedCredits} 积分`);
  if (job.errorMessage) secondaryParts.push(job.errorMessage.slice(0, 80));
  const secondaryCopy = secondaryParts.join(" · ");

  function handleViewDetail() {
    void navigate(`/app/translation-v4${window.location.search}`);
  }

  const actions = [
    {
      label: isActive ? "查看进度" : "查看详情",
      tone: "primary" as const,
      onClick: handleViewDetail,
    },
  ];

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "18px 20px 16px",
        background: "#fff",
        boxShadow: pageColorTokens.shadowCard,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 28rem", minWidth: 0 }}>
          {/* Badge row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: pageColorTokens.textSecondary,
                padding: "0.22rem 0.48rem",
                borderRadius: 999,
                background: pageColorTokens.surfaceMuted,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
              }}
            >
              #{shortId}
            </span>
            <TaskStatusBadge status={mappedStatus} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#6366f1",
                padding: "0.22rem 0.48rem",
                borderRadius: 999,
                background: "#eef2ff",
                border: "1px solid rgba(99,102,241,0.18)",
              }}
            >
              翻译 v4
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: pageColorTokens.textPrimary,
              marginTop: 12,
              lineHeight: 1.25,
            }}
          >
            {`翻译任务：${job.source} → ${job.target}`}
          </div>

          {/* Meta line */}
          <div
            style={{
              fontSize: 13,
              color: pageColorTokens.textSecondary,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            <span>{`${job.modules.length} 个模块`}</span>
            <span style={{ color: pageColorTokens.textFootnote }}>·</span>
            <span>{moduleListSummary(job.modules)}</span>
            {job.aiModel && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span>{job.aiModel}</span>
              </>
            )}
          </div>
        </div>

        {/* Task time */}
        <div
          style={{
            flexShrink: 0,
            fontSize: 12,
            color: pageColorTokens.textFootnote,
            paddingTop: 2,
            textAlign: "right",
            lineHeight: 1.5,
            maxWidth: 320,
          }}
        >
          {formatV4JobTimeLine(job, job.status)}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: pageColorTokens.border, margin: "0 -20px" }} />

      {/* ── Status section ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Primary copy */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: primaryCopyColor,
            lineHeight: 1.5,
          }}
        >
          {primaryCopy}
        </div>

        {/* Secondary copy */}
        {secondaryCopy && (
          <div
            style={{
              fontSize: 12,
              color: pageColorTokens.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {secondaryCopy}
          </div>
        )}

        {/* ── Multi-stage progress bars ── */}
        <div
          style={{
            background: pageColorTokens.surfaceMuted,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginTop: 2,
          }}
        >
          <MultiStageProgress status={job.status} metrics={job.metrics} />
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 2,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              style={actionButtonStyle(action.tone)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
