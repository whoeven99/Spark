/** 上架前并行首页：问候 + 本页提问 + 文案/生图提示。不含经营、健康度、任务入口。 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { buildWorkspaceRecommendedGroups } from "../../../lib/workspaceRecommendedActions";
import type { ContextTool } from "./types";
import {
  panelStackStyle,
  shopifyUi,
} from "./styles";

function greetingForHour(
  hour: number,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (hour < 6) return t("workspace.home.greeting.lateNight");
  if (hour < 12) return t("workspace.home.greeting.morning");
  if (hour < 18) return t("workspace.home.greeting.afternoon");
  return t("workspace.home.greeting.evening");
}

function formatHomeDate(now: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
}

const homeV2Styles = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 4,
  },
  greetingTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: shopifyUi.text,
    letterSpacing: "-0.02em",
  },
  greetingDate: {
    marginTop: 6,
    fontSize: 13,
    color: shopifyUi.textMuted,
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 14,
    color: shopifyUi.textSecondary,
    lineHeight: 1.45,
  },
  assistantCard: {
    padding: "16px",
    borderRadius: shopifyUi.radiusCard,
    border: `1px solid ${shopifyUi.border}`,
    background: shopifyUi.surface,
  },
  assistantBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: shopifyUi.primary,
    marginBottom: 7,
  },
  assistantTitle: {
    margin: "0 0 14px",
    fontSize: 15,
    fontWeight: 700,
    color: shopifyUi.text,
  },
  composerShell: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 10,
    background: shopifyUi.surface,
    padding: "12px 12px 10px",
  },
  composerInput: {
    width: "100%",
    minHeight: 62,
    border: "none",
    outline: "none",
    resize: "none" as const,
    background: "transparent",
    fontSize: 14,
    lineHeight: 1.55,
    color: shopifyUi.text,
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  composerFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
    flexWrap: "wrap" as const,
  },
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  contextChip: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 999,
    background: shopifyUi.surface,
    color: shopifyUi.textSecondary,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sendButton: (disabled: boolean) =>
    ({
      width: 36,
      height: 36,
      borderRadius: "50%",
      border: "none",
      background: disabled ? "#c9cccf" : shopifyUi.primary,
      color: "#ffffff",
      fontSize: 16,
      fontWeight: 700,
      cursor: disabled ? "default" : "pointer",
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
    }) as const,
  recommendGroups: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  recommendGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 5,
  },
  recommendGroupLabel: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    color: shopifyUi.textMuted,
    letterSpacing: 0.2,
  },
  quickPillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  recommendations: {
    borderTop: `1px solid ${shopifyUi.border}`,
    marginTop: 14,
    paddingTop: 11,
  },
  recommendationsHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 8,
  },
  recommendationsTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: shopifyUi.text,
  },
  recommendationsHint: {
    fontSize: 12,
    color: shopifyUi.textMuted,
  },
  quickPill: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 999,
    background: shopifyUi.surface,
    color: shopifyUi.textSecondary,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: 1.25,
  },
  quickPillBadge: {
    padding: "0 5px",
    borderRadius: 999,
    background: shopifyUi.surfaceSubtle,
    color: shopifyUi.textMuted,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
  },
};

export function HomeV2Panel({
  displayName,
  initialRenderTimeIso,
  onSubmitPrompt,
  onOpenContextTool,
}: {
  displayName: string;
  initialRenderTimeIso?: string;
  onSubmitPrompt: (prompt: string) => void;
  onOpenContextTool: (tool: ContextTool) => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState("");
  const now = useMemo(() => {
    if (!initialRenderTimeIso) return new Date();
    const parsed = new Date(initialRenderTimeIso);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [initialRenderTimeIso]);
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  // 首页无会话商品上下文，与输入区「店铺级」推荐同源（8 条、三组）
  const recommendedGroups = useMemo(
    () => buildWorkspaceRecommendedGroups(t, false),
    [t],
  );
  const contextChips = useMemo(
    () => [
      { tool: "product" as const, label: t("workspace.home.context.product"), icon: "◫" },
      { tool: "order" as const, label: t("workspace.home.context.order"), icon: "◎" },
      { tool: "article" as const, label: t("workspace.home.context.article"), icon: "≣" },
      { tool: "file" as const, label: t("workspace.home.context.file"), icon: "↑" },
    ],
    [t],
  );

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    onSubmitPrompt(text);
    setDraft("");
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitDraft();
    }
  };

  return (
    <div style={panelStackStyle}>
      <header style={homeV2Styles.pageHeader}>
        <div>
          <h1 style={homeV2Styles.greetingTitle}>
            {t("workspace.home.greeting.title", {
              greeting: greetingForHour(now.getHours(), t),
              name: displayName,
            })}
          </h1>
          <div style={homeV2Styles.greetingDate}>{formatHomeDate(now, locale)}</div>
          <p style={homeV2Styles.subtitle}>{t("workspace.homeV2.subtitle")}</p>
        </div>
      </header>

      <section style={homeV2Styles.assistantCard}>
        <div style={homeV2Styles.assistantBadge}>
          <span aria-hidden="true">■</span>
          <span>{t("workspace.home.askSpark")}</span>
        </div>
        <h2 style={homeV2Styles.assistantTitle}>{t("workspace.homeV2.assistantTitle")}</h2>
        <div className="workspace-home-composer" style={homeV2Styles.composerShell}>
          <textarea
            data-home-composer
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={t("workspace.homeV2.composerPlaceholder")}
            style={homeV2Styles.composerInput}
          />
          <div style={homeV2Styles.composerFooter}>
            <div style={homeV2Styles.chipRow}>
              {contextChips.map((chip) => (
                <button
                  key={chip.tool}
                  type="button"
                  style={homeV2Styles.contextChip}
                  onClick={() => onOpenContextTool(chip.tool)}
                >
                  {chip.icon} {chip.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              style={homeV2Styles.sendButton(!draft.trim())}
              disabled={!draft.trim()}
              onClick={submitDraft}
              aria-label={t("workspace.home.send")}
            >
              ↑
            </button>
          </div>
        </div>
        <div style={homeV2Styles.recommendations}>
          <div style={homeV2Styles.recommendationsHeader}>
            <h3 style={homeV2Styles.recommendationsTitle}>
              {t("workspace.homeV2.recommendationsTitle")}
            </h3>
            <span style={homeV2Styles.recommendationsHint}>
              {t("workspace.homeV2.recommendationsHint")}
            </span>
          </div>
          <div style={homeV2Styles.recommendGroups}>
            {recommendedGroups.map((group) => (
              <div key={group.key} style={homeV2Styles.recommendGroup}>
                <div style={homeV2Styles.recommendGroupLabel}>{group.label}</div>
                <div style={homeV2Styles.quickPillRow}>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="workspace-home-quick-action"
                      style={homeV2Styles.quickPill}
                      onClick={() => onSubmitPrompt(item.prompt)}
                    >
                      <span>{item.label}</span>
                      {item.createsTask ? (
                        <span style={homeV2Styles.quickPillBadge}>
                          {t("workspace.shell.chat.recommend.createsTask")}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
