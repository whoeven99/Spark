/** 上架前并行首页：问候 + 本页提问 + 文案/生图提示。不含经营、健康度、任务入口。 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { buildWorkspaceRecommendedGroups } from "../../../lib/workspaceRecommendedActions";
import type { ContextTool } from "./types";
import {
  formatHomeDate,
  greetingForHour,
} from "./homeGreeting";
import {
  panelStackStyle,
  shopifyUi,
} from "./styles";

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
  assistantCard: {
    padding: "20px",
    borderRadius: shopifyUi.radiusCard,
    border: `1px solid ${shopifyUi.border}`,
    background: shopifyUi.surface,
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
    padding: "14px 14px 12px",
  },
  composerInput: {
    width: "100%",
    minHeight: 130,
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
  capabilityGrid: {
    display: "grid",
    // 176px 让四组在常见嵌入宽度下排成一行；放不下时 auto-fit 自行换行
    gridTemplateColumns: "repeat(auto-fit, minmax(176px, 1fr))",
    gap: 10,
  },
  capabilityCard: {
    display: "flex",
    flexDirection: "column" as const,
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: shopifyUi.radiusControl,
    background: shopifyUi.surface,
    padding: "10px 12px 8px",
  },
  capabilityHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  capabilityIcon: {
    fontSize: 12,
    lineHeight: 1,
    color: shopifyUi.textMuted,
  },
  capabilityTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: shopifyUi.text,
  },
  capabilityBadge: {
    marginLeft: "auto",
    padding: "1px 6px",
    borderRadius: 999,
    border: `1px solid ${shopifyUi.linkBorder}`,
    background: shopifyUi.linkSurface,
    color: shopifyUi.link,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
  },
  capabilityActions: {
    display: "flex",
    flexDirection: "column" as const,
    margin: "0 -6px",
  },
  capabilityAction: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    padding: "5px 6px",
    borderRadius: shopifyUi.radiusControl,
    border: "1px solid transparent",
    background: "transparent",
    color: shopifyUi.text,
    fontSize: 13,
    fontWeight: 550,
    fontFamily: "inherit",
    lineHeight: 1.3,
    textAlign: "left" as const,
    cursor: "pointer",
  },
  capabilityActionChevron: {
    flexShrink: 0,
    fontSize: 12,
    color: shopifyUi.textMuted,
  },
  recommendations: {
    borderTop: `1px solid ${shopifyUi.border}`,
    marginTop: 18,
    paddingTop: 13,
  },
  recommendationsTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    margin: "0 0 9px",
    fontSize: 13,
    fontWeight: 700,
    color: shopifyUi.text,
  },
  recommendationsTitleIcon: {
    fontSize: 10,
    lineHeight: 1,
    color: shopifyUi.link,
  },
  capabilityActionLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  capabilityActionIcon: {
    flexShrink: 0,
    fontSize: 10,
    lineHeight: 1,
    color: shopifyUi.link,
  },
  capabilityActionBadge: {
    padding: "0 5px",
    borderRadius: 999,
    background: shopifyUi.linkSurface,
    color: shopifyUi.link,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
  },
};

/** 推荐分组 key → 首页能力卡图标；缺失时降级为通用方块。 */
const CAPABILITY_ICONS: Record<string, string> = {
  operations: "▤",
  productOptimization: "◫",
  bulkEdit: "▥",
  imageGeneration: "▣",
};

export function HomeV2Panel({
  displayName,
  initialRenderTimeIso,
  onSubmitPrompt,
  onOpenContextTool,
}: {
  displayName: string;
  initialRenderTimeIso?: string;
  onSubmitPrompt: (prompt: string, skillFocus?: string) => void;
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
        </div>
      </header>

      <section style={homeV2Styles.assistantCard}>
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
          <h3 style={homeV2Styles.recommendationsTitle}>
            <span style={homeV2Styles.recommendationsTitleIcon} aria-hidden="true">
              ▶
            </span>
            {t("workspace.homeV2.recommendationsTitle")}
          </h3>
          <div style={homeV2Styles.capabilityGrid}>
            {recommendedGroups.map((group) => {
              // 整组都会建任务时徽标提到卡头，避免每行重复；混合分组回落到逐行标注
              const allCreateTasks =
                group.items.length > 0 && group.items.every((item) => item.createsTask);
              return (
                <div key={group.key} style={homeV2Styles.capabilityCard}>
                  <div style={homeV2Styles.capabilityHeader}>
                    <span style={homeV2Styles.capabilityIcon} aria-hidden="true">
                      {CAPABILITY_ICONS[group.key] ?? "▣"}
                    </span>
                    <h4 style={homeV2Styles.capabilityTitle}>{group.label}</h4>
                    {allCreateTasks ? (
                      <span style={homeV2Styles.capabilityBadge}>
                        {t("workspace.shell.chat.recommend.createsTask")}
                      </span>
                    ) : null}
                  </div>
                  <div style={homeV2Styles.capabilityActions}>
                    {group.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="workspace-home-quick-action"
                        style={homeV2Styles.capabilityAction}
                        onClick={() => onSubmitPrompt(item.prompt, item.key)}
                      >
                        <span style={homeV2Styles.capabilityActionLabel}>
                          <span style={homeV2Styles.capabilityActionIcon} aria-hidden="true">
                            ▶
                          </span>
                          <span>{item.label}</span>
                          {!allCreateTasks && item.createsTask ? (
                            <span style={homeV2Styles.capabilityActionBadge}>
                              {t("workspace.shell.chat.recommend.createsTask")}
                            </span>
                          ) : null}
                        </span>
                        <span style={homeV2Styles.capabilityActionChevron} aria-hidden="true">
                          ›
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
