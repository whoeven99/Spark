/** 助手页 / 通用工作台 SSR 占位：侧栏骨架 + 空白主区，避免 "Loading…" 成为 LCP。 */
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  contentStyle,
  shellStyle,
  shopifyUi,
  sidebarStyle,
} from "./styles";

const styles = {
  brandTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: shopifyUi.text,
  } satisfies CSSProperties,
  brandMeta: {
    marginTop: 2,
    fontSize: 11,
    color: shopifyUi.textMuted,
  } satisfies CSSProperties,
  newChatStub: {
    marginTop: 12,
    height: 36,
    borderRadius: 10,
    background: shopifyUi.primary,
    opacity: 0.85,
  } satisfies CSSProperties,
  historyLabel: {
    marginTop: 18,
    fontSize: 11,
    fontWeight: 700,
    color: shopifyUi.textMuted,
  } satisfies CSSProperties,
  historyStub: {
    marginTop: 8,
    height: 12,
    width: "72%",
    borderRadius: 6,
    background: shopifyUi.border,
  } satisfies CSSProperties,
} as const;

export function WorkspaceShellSsrFallback({
  children,
}: {
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div style={shellStyle} aria-busy="true" aria-live="polite">
      <aside style={sidebarStyle} aria-hidden="true">
        <div>
          <div style={styles.brandTitle}>Spark AI</div>
          <div style={styles.brandMeta}>{t("workspace.shell.account.workspaceLabel")}</div>
          <div style={styles.newChatStub} />
          <div style={styles.historyLabel}>{t("workspace.shell.recentConversations")}</div>
          <div style={styles.historyStub} />
        </div>
      </aside>
      <main style={contentStyle}>{children}</main>
    </div>
  );
}
