import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { LogViewer } from "./LogViewer";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type CardAction = {
  label: string;
  tone: "primary" | "secondary" | "subtle";
  disabled?: boolean;
  onClick?: () => void;
};

// ─── Shared utilities ─────────────────────────────────────────────────────────

export function formatActualElapsed(
  startedAt: string | null,
  completedAt: string | null,
): string | null {
  if (!startedAt || !completedAt) return null;
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(elapsedMs / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function formatTaskDate(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

export function actionButtonStyle(tone: CardAction["tone"], disabled = false) {
  if (tone === "primary") {
    return {
      padding: "8px 14px",
      borderRadius: pageColorTokens.radiusControl,
      background: disabled ? "#d9dde3" : pageColorTokens.brandGreen,
      color: "#ffffff",
      border: `1px solid ${disabled ? "#d9dde3" : pageColorTokens.brandGreen}`,
      boxShadow: disabled ? "none" : "0 6px 18px rgba(0, 166, 124, 0.18)",
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 12,
      fontWeight: 700,
    } as const;
  }

  if (tone === "secondary") {
    return {
      padding: "8px 14px",
      borderRadius: pageColorTokens.radiusControl,
      background: "#ffffff",
      color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textPrimary,
      border: `1px solid ${disabled ? pageColorTokens.border : pageColorTokens.borderSubtle}`,
      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 12,
      fontWeight: 600,
    } as const;
  }

  return {
    padding: "8px 12px",
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surfaceSubtle,
    color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textSecondary,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 600,
  } as const;
}

// ─── Shell props ──────────────────────────────────────────────────────────────

type Props = {
  /** The raw task record — used for id, timestamps, and LogViewer. */
  task: AITaskItem;
  locationSearch: string;

  /** Live status (may differ from task.status while LogViewer is polling). */
  status: AITaskStatus;

  /** Main title rendered below the badge row. */
  title: ReactNode;

  /** Optional detail line rendered below the title. */
  metaLine?: ReactNode;

  /**
   * Extra badges rendered beside #id and the status badge.
   * E.g. a "积分不足" warning tag.
   */
  extraBadges?: ReactNode;

  /** Large status sentence — color is controlled by primaryCopyColor. */
  primaryCopy: string;
  primaryCopyColor?: string;

  /** Smaller secondary sentence below primaryCopy. */
  secondaryCopy: string;

  /** Progress bar fill, 0–100. */
  progressPercent: number;

  /** CSS background value for the progress bar fill (supports gradients). */
  progressBackground: string;

  /** Optional custom badge element used instead of the default task status badge. */
  statusBadge?: ReactNode;

  /** Optional extra content rendered between the progress bar and actions. */
  bodyContent?: ReactNode;

  /** Buttons rendered in the bottom-right corner. */
  actions: CardAction[];

  /**
   * Whether to render the live LogViewer.
   * Typically true only while status === "running".
   */
  showLogViewer?: boolean;

  /**
   * Called by LogViewer when it detects a status change.
   * The parent should update its localStatus state in response.
   */
  onStatusChange?: (
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
};

// ─── Shell component ──────────────────────────────────────────────────────────

/**
 * Generic card shell for AI tasks.
 *
 * Owns layout, styling, progress bar, action buttons, and the live LogViewer.
 * Business logic (copy, action labels, progress value) is computed by the
 * caller and passed as props, so each task type can customise the card
 * without duplicating the structural code.
 *
 * Usage:
 *   <AITaskCardShell
 *     task={task}
 *     status={localStatus}
 *     title="任务目标：生成产品描述"
 *     metaLine={<span>10 个商品 | 英语 | ...</span>}
 *     primaryCopy="正在生成..."
 *     secondaryCopy="已运行 1m 23s"
 *     progressPercent={62}
 *     progressBackground="linear-gradient(90deg, #00a67c, #35b486)"
 *     actions={[{ label: "查看详情", tone: "primary", onClick: ... }]}
 *     showLogViewer
 *     onStatusChange={(s, r) => setLocalStatus(s)}
 *     locationSearch={locationSearch}
 *   />
 */
export function AITaskCardShell({
  task,
  locationSearch,
  status,
  title,
  metaLine,
  extraBadges,
  primaryCopy,
  primaryCopyColor,
  secondaryCopy,
  progressPercent,
  progressBackground,
  statusBadge,
  bodyContent,
  actions,
  showLogViewer = false,
  onStatusChange,
}: Props) {
  const { i18n, t } = useTranslation();
  const { isMobile, isNarrowMobile } = useResponsiveLayout();
  const shortId = task.id.slice(0, 8).toUpperCase();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const createdAtText = isHydrated
    ? formatTaskDate(task.createdAt, i18n.language)
    : formatTaskDate(task.createdAt, i18n.language, "UTC");

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: isMobile ? "16px 14px 14px" : "18px 20px 16px",
        background: "#fff",
        boxShadow: pageColorTokens.shadowCard,
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? 14 : 16,
        minHeight: isMobile ? undefined : 228,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: isMobile ? "nowrap" : "wrap",
          flexDirection: isMobile ? "column" : "row",
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
            {statusBadge ?? <TaskStatusBadge status={status} />}
            {extraBadges}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: isMobile ? 16 : 18,
              fontWeight: 700,
              color: pageColorTokens.textPrimary,
              marginTop: 12,
              lineHeight: 1.25,
            }}
          >
            {title}
          </div>

          {/* Meta line */}
          {metaLine ? (
            <div
              style={{
                fontSize: isMobile ? 12 : 13,
                color: pageColorTokens.textSecondary,
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 10,
                lineHeight: 1.6,
              }}
            >
              {metaLine}
            </div>
          ) : null}
        </div>

        {/* Creation date */}
        <div
          style={{
            flexShrink: 0,
            fontSize: 12,
            color: pageColorTokens.textFootnote,
            paddingTop: isMobile ? 0 : 2,
            alignSelf: isMobile ? "flex-start" : "auto",
          }}
        >
          {t("aiTask.createdAtLabel", { value: createdAtText })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: pageColorTokens.border, margin: isMobile ? "0 -14px" : "0 -20px" }} />

      {/* ── Status section ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            fontSize: isMobile ? 14 : 15,
            fontWeight: 700,
            color: primaryCopyColor ?? pageColorTokens.textPrimary,
            lineHeight: 1.5,
          }}
        >
          {primaryCopy}
        </div>

        <div
          style={{
            fontSize: 12,
            color: pageColorTokens.textSecondary,
            lineHeight: 1.5,
          }}
        >
          {secondaryCopy}
        </div>

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
              // No border-radius on the fill: the container's overflow:hidden + border-radius
              // clips the fill correctly on both ends. Adding border-radius here creates a
              // visual concavity at the right edge when width approaches 100%.
              borderRadius: 0,
              background: progressBackground,
              transition: "width 0.35s ease",
            }}
          />
        </div>

        {bodyContent ? <div>{bodyContent}</div> : null}

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: isMobile ? "stretch" : "flex-end",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 2,
            flexDirection: isNarrowMobile ? "column" : "row",
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              style={{
                ...actionButtonStyle(action.tone, action.disabled),
                ...(isNarrowMobile
                  ? {
                      width: "100%",
                      justifyContent: "center",
                      display: "inline-flex",
                    }
                  : {}),
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Live log viewer ── */}
      {showLogViewer ? (
        <LogViewer
          taskId={task.id}
          taskType={task.taskType}
          status={status}
          locationSearch={locationSearch}
          startedAt={task.startedAt}
          completedAt={task.completedAt}
          initialLogs={[]}
          defaultLogsOpen={false}
          onStatusChange={onStatusChange}
        />
      ) : null}
    </div>
  );
}
