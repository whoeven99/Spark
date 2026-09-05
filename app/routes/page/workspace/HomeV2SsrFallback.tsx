/** 首页 SSR / ClientMount 占位：把 LCP 问候语写进首屏 HTML，不拉工作台壳。 */
import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { shopifyUi } from "./styles";
import {
  formatHomeDate,
  greetingForHour,
} from "./homeGreeting";
import { WorkspaceShellSsrFallback } from "./WorkspaceShellSsrFallback";

const styles = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    marginBottom: 4,
  } satisfies CSSProperties,
  greetingTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: shopifyUi.text,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  greetingDate: {
    marginTop: 6,
    fontSize: 13,
    color: shopifyUi.textMuted,
  } satisfies CSSProperties,
  assistantCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: shopifyUi.radiusCard,
    border: `1px solid ${shopifyUi.border}`,
    background: shopifyUi.surface,
  } satisfies CSSProperties,
  assistantTitle: {
    margin: "0 0 14px",
    fontSize: 15,
    fontWeight: 700,
    color: shopifyUi.text,
  } satisfies CSSProperties,
  composerShell: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 10,
    background: shopifyUi.surface,
    padding: "12px 12px 10px",
    minHeight: 62,
    color: shopifyUi.textMuted,
    fontSize: 14,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  capabilityGrid: {
    marginTop: 14,
    paddingTop: 11,
    borderTop: `1px solid ${shopifyUi.border}`,
    display: "grid",
    // 与 HomeV2Panel 的推荐区同口径，避免 hydrate 后列数跳变
    gridTemplateColumns: "repeat(auto-fit, minmax(176px, 1fr))",
    gap: 10,
  } satisfies CSSProperties,
  capabilityStub: {
    height: 148,
    borderRadius: shopifyUi.radiusCard,
    border: `1px solid ${shopifyUi.border}`,
    background: shopifyUi.surfaceSubtle,
  } satisfies CSSProperties,
} as const;

/**
 * 仅用于 SSR 与 ClientMount 首帧。结构贴近真实首页，让问候语成为 LCP 元素；
 * 交互与侧栏状态等真实壳挂载后再切换。
 */
export function HomeV2SsrFallback({
  displayName,
  homeRenderTimeIso,
}: {
  displayName: string;
  homeRenderTimeIso?: string;
}) {
  const { t, i18n } = useTranslation();
  const now = useMemo(() => {
    if (!homeRenderTimeIso) return new Date();
    const parsed = new Date(homeRenderTimeIso);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [homeRenderTimeIso]);
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const name = displayName.trim() || t("workspace.shell.defaultAccountName");

  return (
    <WorkspaceShellSsrFallback>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        <header style={styles.pageHeader}>
          <div>
            <h1 style={styles.greetingTitle}>
              {t("workspace.home.greeting.title", {
                greeting: greetingForHour(now.getHours(), t),
                name,
              })}
            </h1>
            <div style={styles.greetingDate}>{formatHomeDate(now, locale)}</div>
          </div>
        </header>
        <section style={styles.assistantCard}>
          <h2 style={styles.assistantTitle}>{t("workspace.homeV2.assistantTitle")}</h2>
          <div style={styles.composerShell}>{t("workspace.homeV2.composerPlaceholder")}</div>
          <div style={styles.capabilityGrid} aria-hidden="true">
            <div style={styles.capabilityStub} />
            <div style={styles.capabilityStub} />
            <div style={styles.capabilityStub} />
            <div style={styles.capabilityStub} />
          </div>
        </section>
      </div>
    </WorkspaceShellSsrFallback>
  );
}
