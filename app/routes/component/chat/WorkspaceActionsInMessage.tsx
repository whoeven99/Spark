import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildWorkspaceRecommendedGroups } from "../../../lib/workspaceRecommendedActions";
import { shopifyUi } from "../../page/workspace/styles";

type WorkspaceActionsInMessageProps = {
  hasProductContext?: boolean;
  disabled?: boolean;
  onAction: (prompt: string, skillFocus: string) => void;
};

const wrapStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: shopifyUi.radiusControl,
  border: `1px solid ${shopifyUi.border}`,
  background: shopifyUi.surfaceSubtle,
};

const titleStyle: CSSProperties = {
  margin: "0 0 8px",
  color: shopifyUi.text,
  fontSize: 13,
  fontWeight: 700,
};

const groupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 10,
};

const groupLabelStyle: CSSProperties = {
  color: shopifyUi.textMuted,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.2,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: "100%",
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${shopifyUi.border}`,
  background: shopifyUi.surface,
  color: shopifyUi.text,
  fontSize: 13,
  fontWeight: 550,
  lineHeight: 1.3,
  cursor: "pointer",
  textAlign: "left",
};

const chipDisabledStyle: CSSProperties = {
  ...chipStyle,
  opacity: 0.55,
  cursor: "not-allowed",
};

const badgeStyle: CSSProperties = {
  flexShrink: 0,
  padding: "1px 6px",
  borderRadius: 999,
  background: shopifyUi.primarySurface,
  color: shopifyUi.primaryText,
  fontSize: 11,
  fontWeight: 600,
};

/**
 * 能力介绍回复下方的可点操作区：数据与点击效果与底部「推荐」菜单同源。
 */
export function WorkspaceActionsInMessage({
  hasProductContext = false,
  disabled = false,
  onAction,
}: WorkspaceActionsInMessageProps) {
  const { t } = useTranslation();
  const groups = useMemo(
    () => buildWorkspaceRecommendedGroups(t, hasProductContext),
    [t, hasProductContext],
  );

  return (
    <div style={wrapStyle} data-testid="workspace-actions-in-message">
      <div style={titleStyle}>{t("workspace.shell.chat.capabilityActionsTitle")}</div>
      {groups.map((group) => (
        <div key={group.key} style={groupStyle}>
          <div style={groupLabelStyle}>{group.label}</div>
          <div style={chipRowStyle}>
            {group.items.map((action) => (
              <button
                key={action.key}
                type="button"
                className="workspace-recommended-action"
                style={disabled ? chipDisabledStyle : chipStyle}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onAction(action.prompt, action.key);
                }}
              >
                <span>{action.label}</span>
                {action.createsTask ? (
                  <span style={badgeStyle}>{t("workspace.shell.chat.recommend.createsTask")}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
