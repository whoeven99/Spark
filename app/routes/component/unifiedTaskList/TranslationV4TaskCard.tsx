import { useEffect, useState } from "react";
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
import { TERMINAL_V4_STATUSES } from "../../../server/translation/v4/types";

// ─── Token-to-credit conversion ───────────────────────────────────────────────

const TOKENS_PER_CREDIT = 1000;

function tokensToCredits(tokens: number): number {
  return Math.ceil(tokens / TOKENS_PER_CREDIT);
}

// ─── Pure helpers (inlined from v4JobProgress.server.ts) ──────────────────────

function translationV4StatusLabel(status: TranslationV4Status): string {
  const labels: Record<TranslationV4Status, string> = {
    CREATED: "已创建",
    INIT_QUEUED: "等待初始化",
    INITIALIZING: "初始化中",
    INIT_DONE: "初始化完成",
    TRANSLATE_QUEUED: "等待翻译",
    TRANSLATING: "翻译中",
    TRANSLATE_DONE: "翻译完成",
    WRITEBACK_QUEUED: "等待写回",
    WRITING_BACK: "写回 Shopify 中",
    VERIFY_QUEUED: "等待校验",
    VERIFYING: "校验中",
    COMPLETED: "已完成",
    FAILED: "失败",
    PAUSED: "已暂停",
    CANCELLED: "已取消",
  };
  return labels[status] ?? status;
}

function ratioPercent(done: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

function computeV4ProgressPercent(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
): number | null {
  if (status === "COMPLETED") return 100;
  if (TERMINAL_V4_STATUSES.includes(status)) return null;

  if (["CREATED", "INIT_QUEUED", "INITIALIZING", "INIT_DONE"].includes(status)) {
    return ratioPercent(metrics.initDone, metrics.initTotal);
  }
  if (["TRANSLATE_QUEUED", "TRANSLATING", "TRANSLATE_DONE"].includes(status)) {
    if (metrics.translateUnitTotal > 0) {
      return ratioPercent(metrics.translateUnitDone, metrics.translateUnitTotal);
    }
    return ratioPercent(metrics.translateDone, metrics.translateTotal);
  }
  if (["WRITEBACK_QUEUED", "WRITING_BACK"].includes(status)) {
    return ratioPercent(metrics.writebackDone, metrics.writebackTotal);
  }
  if (["VERIFY_QUEUED", "VERIFYING"].includes(status)) {
    return ratioPercent(metrics.verifyDone, metrics.verifyTotal);
  }
  return null;
}

function mapV4StatusToAIStatus(status: TranslationV4Status): AITaskStatus {
  if (status === "COMPLETED") return "succeeded";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED" || status === "PAUSED") return "cancelled";
  return "running";
}

function formatTaskDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function formatElapsed(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt) return null;
  const end = completedAt ? new Date(completedAt) : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function getProgressBackground(status: TranslationV4Status): string {
  if (status === "COMPLETED") {
    return "linear-gradient(90deg, #00a67c 0%, #00a67c 100%)";
  }
  if (status === "FAILED") {
    return "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)";
  }
  if (TERMINAL_V4_STATUSES.includes(status)) {
    return "linear-gradient(90deg, #9ca3af 0%, #cbd5e1 100%)";
  }
  return "linear-gradient(90deg, #00a67c 0%, #35b486 55%, #7ad9a8 100%)";
}

function buildStageSummary(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
): string {
  const label = translationV4StatusLabel(status);
  if (
    status === "TRANSLATING" ||
    status === "TRANSLATE_QUEUED" ||
    status === "TRANSLATE_DONE"
  ) {
    if (metrics.translateUnitTotal > 0) {
      return `${label}：${metrics.translateUnitDone} / ${metrics.translateUnitTotal} 单元`;
    }
    if (metrics.translateTotal > 0) {
      return `${label}：${metrics.translateDone} / ${metrics.translateTotal} 项`;
    }
  }
  if (status === "INITIALIZING" || status === "INIT_DONE") {
    if (metrics.initTotal > 0) {
      return `${label}：${metrics.initDone} / ${metrics.initTotal} 项`;
    }
  }
  if (status === "WRITING_BACK" || status === "WRITEBACK_QUEUED") {
    if (metrics.writebackTotal > 0) {
      return `${label}：${metrics.writebackDone} / ${metrics.writebackTotal} 项`;
    }
  }
  if (status === "VERIFYING" || status === "VERIFY_QUEUED") {
    if (metrics.verifyTotal > 0) {
      return `${label}：${metrics.verifyDone} / ${metrics.verifyTotal} 项`;
    }
  }
  return label;
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

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  job: TranslationV4Job;
};

export function TranslationV4TaskCard({ job }: Props) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const mappedStatus = mapV4StatusToAIStatus(job.status);
  const progressPercent = computeV4ProgressPercent(job.status, job.metrics) ?? 0;
  const progressBackground = getProgressBackground(job.status);

  const shortId = job.id.slice(0, 8).toUpperCase();
  const isActive = !TERMINAL_V4_STATUSES.includes(job.status) && job.status !== "PAUSED";

  const createdAtText = isHydrated
    ? formatTaskDate(job.createdAt)
    : formatTaskDate(job.createdAt);

  // Estimate an elapsed start time: use createdAt as proxy since V4 jobs don't store startedAt
  const elapsedLabel = formatElapsed(job.createdAt, job.status === "COMPLETED" || TERMINAL_V4_STATUSES.includes(job.status) ? job.updatedAt : null);

  const usedCredits = job.metrics.usedTokens > 0
    ? tokensToCredits(job.metrics.usedTokens)
    : null;

  const primaryCopy = isActive
    ? buildStageSummary(job.status, job.metrics)
    : translationV4StatusLabel(job.status);

  let primaryCopyColor: string = pageColorTokens.textPrimary;
  if (job.status === "FAILED") primaryCopyColor = pageColorTokens.criticalText;
  else if (isActive) primaryCopyColor = pageColorTokens.brandBlue;
  else if (job.status === "COMPLETED") primaryCopyColor = pageColorTokens.brandGreenDark;

  const secondaryParts: string[] = [];
  if (elapsedLabel) secondaryParts.push(`耗时 ${elapsedLabel}`);
  if (usedCredits != null) secondaryParts.push(`消耗 ${usedCredits} 积分`);
  if (job.metrics.translateDone > 0 && job.metrics.translateTotal > 0) {
    secondaryParts.push(`翻译 ${job.metrics.translateDone} / ${job.metrics.translateTotal} 项`);
  }
  if (job.errorMessage) secondaryParts.push(job.errorMessage.slice(0, 60));
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
        minHeight: 228,
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
            {/* Task type tag */}
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
            {job.testMode && (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>·</span>
                <span style={{ color: "#d97706" }}>测试模式</span>
              </>
            )}
          </div>
        </div>

        {/* Creation date */}
        <div
          style={{
            flexShrink: 0,
            fontSize: 12,
            color: pageColorTokens.textFootnote,
            paddingTop: 2,
          }}
        >
          {`创建于 ${createdAtText}`}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: pageColorTokens.border, margin: "0 -20px" }} />

      {/* ── Status section ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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

        {/* Progress bar */}
        <div
          style={{
            height: 9,
            borderRadius: 999,
            background: "#e5e7eb",
            overflow: "hidden",
            marginTop: 4,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, progressPercent))}%`,
              borderRadius: 999,
              background: progressBackground,
              transition: "width 0.35s ease",
            }}
          />
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
