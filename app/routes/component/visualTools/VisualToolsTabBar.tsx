import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";

export type VisualToolsTab = "generate" | "translate";

type Props = {
  activeTab: VisualToolsTab;
  onTabChange: (tab: VisualToolsTab) => void;
};

const wrapperStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
};

const labelStyle: CSSProperties = {
  margin: "0 0 8px 0",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: pageColorTokens.textSecondary,
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  width: "100%",
  padding: 5,
  gap: 6,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  border: `2px solid ${pageColorTokens.border}`,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 128, 96, 0.06)",
};

function tabButtonStyle(
  active: boolean,
  accent: "generate" | "translate",
): CSSProperties {
  const isGenerate = accent === "generate";
  const activeBg = isGenerate ? pageColorTokens.brandGreen : pageColorTokens.brandBlue;
  const activeShadow = isGenerate
    ? "0 2px 6px rgba(0, 128, 96, 0.35)"
    : "0 2px 6px rgba(44, 110, 203, 0.35)";

  return {
    flex: 1,
    border: active ? "none" : `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    padding: "12px 16px",
    minHeight: 48,
    fontSize: "0.9375rem",
    fontWeight: active ? 600 : 500,
    lineHeight: 1.3,
    cursor: "pointer",
    textAlign: "center",
    color: active ? "#ffffff" : pageColorTokens.textPrimary,
    background: active ? activeBg : pageColorTokens.surfaceMuted,
    boxShadow: active ? activeShadow : "none",
    transition:
      "background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
  };
}

export function VisualToolsTabBar({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();

  return (
    <div style={wrapperStyle}>
      <p style={labelStyle}>{t("imageStudio.tabListLabel")}</p>
      <div
        role="tablist"
        aria-label={t("imageStudio.tabListLabel")}
        style={tabBarStyle}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "generate"}
          style={tabButtonStyle(activeTab === "generate", "generate")}
          onClick={() => onTabChange("generate")}
        >
          {t("imageStudio.tabGenerate")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "translate"}
          style={tabButtonStyle(activeTab === "translate", "translate")}
          onClick={() => onTabChange("translate")}
        >
          {t("imageStudio.tabTranslate")}
        </button>
      </div>
    </div>
  );
}
