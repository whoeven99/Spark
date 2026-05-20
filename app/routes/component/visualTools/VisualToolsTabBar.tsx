import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";

export type VisualToolsTab = "generate" | "translate";

type Props = {
  activeTab: VisualToolsTab;
  onTabChange: (tab: VisualToolsTab) => void;
};

const tabBarStyle: CSSProperties = {
  display: "inline-flex",
  padding: 4,
  gap: 4,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
};

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: "0.875rem",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
    background: active ? pageColorTokens.surface : "transparent",
    boxShadow: active ? pageColorTokens.shadowCard : "none",
    transition: "background 0.15s ease, color 0.15s ease",
  };
}

export function VisualToolsTabBar({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();

  return (
    <div
      role="tablist"
      aria-label={t("imageStudio.tabListLabel")}
      style={tabBarStyle}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "generate"}
        style={tabButtonStyle(activeTab === "generate")}
        onClick={() => onTabChange("generate")}
      >
        {t("imageStudio.tabGenerate")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "translate"}
        style={tabButtonStyle(activeTab === "translate")}
        onClick={() => onTabChange("translate")}
      >
        {t("imageStudio.tabTranslate")}
      </button>
    </div>
  );
}
