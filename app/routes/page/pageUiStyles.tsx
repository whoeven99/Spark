import type { CSSProperties, ReactNode } from "react";

/** §3.5.2 视觉令牌 — 与 billingPage.module.css 对齐，全站复用 */
export const pageColorTokens = {
  textPrimary: "#202223",
  textBody: "#303030",
  textSecondary: "#6d7175",
  textMuted: "#42474c",
  border: "#e1e3e5",
  borderInput: "#c9cccf",
  divider: "#f1f2f3",
  brandGreen: "#008060",
  brandGreenDark: "#208060",
  brandGreenDeep: "#1a6b52",
  brandGreenLight: "#f1f8f5",
  brandBlue: "#2c6ecb",
  surface: "#ffffff",
  surfaceMuted: "#f6f6f7",
  surfaceSubtle: "#fafafa",
  critical: "#bf0711",
  criticalBg: "rgba(216, 44, 13, 0.08)",
  criticalText: "#8a2712",
  shadowCard: "0 1px 2px rgba(0, 0, 0, 0.04)",
  radiusCard: "12px",
  radiusControl: "8px",
} as const;

/** §3.2 双栏布局 */
export const twoColumnLayoutStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "1.5rem",
  alignItems: "flex-start",
};

export const twoColumnMainStyle: CSSProperties = {
  flex: "2 1 360px",
  minWidth: 0,
};

export const twoColumnSideStyle: CSSProperties = {
  flex: "3 1 480px",
  minWidth: 0,
};

export const stickyAsideColumnStyle: CSSProperties = {
  flex: "0 1 400px",
  width: "100%",
  maxWidth: 440,
  position: "sticky",
  top: "1rem",
  alignSelf: "flex-start",
};

/** 单栏页内容区（对齐计费页 `.page`） */
export const pageContentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  maxWidth: "1120px",
};

/** 白底卡片容器（12px 圆角，对齐计费卡片） */
export const pageSurfaceStyle: CSSProperties = {
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: "1.25rem",
  boxShadow: pageColorTokens.shadowCard,
};

export const pageCompactSurfaceStyle: CSSProperties = {
  ...pageSurfaceStyle,
  padding: "0.75rem",
};

export const pageInnerPanelStyle: CSSProperties = {
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "1.25rem",
};

export const pageFieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: pageColorTokens.textBody,
  marginBottom: "0.35rem",
};

export const pageHintTextStyle: CSSProperties = {
  marginTop: "0.35rem",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.45,
};

export const pageLinkHintStyle: CSSProperties = {
  cursor: "pointer",
  fontSize: "0.8125rem",
  color: pageColorTokens.brandBlue,
  userSelect: "none",
};

export function pageSelectStyle(disabled = false): CSSProperties {
  return {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    marginTop: "0.35rem",
    padding: "0.5rem 0.65rem",
    fontSize: "0.875rem",
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.borderInput}`,
    background: disabled ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
    color: pageColorTokens.textBody,
    boxSizing: "border-box",
  };
}

export function pageTextareaStyle(options?: {
  minHeight?: string;
  fontSize?: string;
  padding?: string;
}): CSSProperties {
  return {
    display: "block",
    width: "100%",
    marginTop: "0.35rem",
    padding: options?.padding ?? "0.5rem 0.65rem",
    fontSize: options?.fontSize ?? "0.875rem",
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.borderInput}`,
    background: pageColorTokens.surface,
    color: pageColorTokens.textBody,
    boxSizing: "border-box",
    lineHeight: 1.55,
    minHeight: options?.minHeight ?? "160px",
    resize: "vertical",
    fontFamily: "inherit",
  };
}

export const pageSectionTitleStyle: CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 600,
  color: pageColorTokens.textPrimary,
  margin: "0 0 1rem",
};

export const pageSectionMajorTitleStyle: CSSProperties = {
  fontSize: "1.375rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
  margin: 0,
};

export const pageSectionHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "0.75rem",
};

export const pageAccentBadgeStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  color: pageColorTokens.brandGreen,
};

export const pageMetaTextStyle: CSSProperties = {
  margin: 0,
  padding: "0.65rem 0.75rem",
  background: pageColorTokens.surfaceMuted,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
};

export type PageIntroTone =
  | "render"
  | "picture"
  | "translation"
  | "chat"
  | "billing"
  | "diagnosis";

const introToneTokens: Record<
  PageIntroTone,
  { gradient: string; borderColor: string }
> = {
  render: {
    gradient:
      "linear-gradient(to right, rgba(72, 0, 140, 0.04), rgba(243, 71, 255, 0.04))",
    borderColor: "#48008c",
  },
  picture: {
    gradient:
      "linear-gradient(to right, rgba(138, 5, 255, 0.04), rgba(0, 158, 122, 0.04))",
    borderColor: "#8a05ff",
  },
  translation: {
    gradient:
      "linear-gradient(to right, rgba(0, 128, 96, 0.05), rgba(44, 110, 203, 0.04))",
    borderColor: "#008060",
  },
  chat: {
    gradient:
      "linear-gradient(to right, rgba(44, 110, 203, 0.06), rgba(0, 128, 96, 0.04))",
    borderColor: "#2c6ecb",
  },
  billing: {
    gradient:
      "linear-gradient(to right, rgba(0, 128, 96, 0.05), rgba(138, 5, 255, 0.03))",
    borderColor: "#008060",
  },
  diagnosis: {
    gradient:
      "linear-gradient(to right, rgba(44, 110, 203, 0.04), rgba(109, 113, 117, 0.06))",
    borderColor: "#2c6ecb",
  },
};

export function pageIntroBannerStyle(
  tone: PageIntroTone,
  options?: { marginBottom?: string },
): CSSProperties {
  const token = introToneTokens[tone];
  return {
    fontSize: "0.875rem",
    color: pageColorTokens.textSecondary,
    lineHeight: 1.5,
    padding: "1rem 1.25rem",
    background: token.gradient,
    borderLeft: `4px solid ${token.borderColor}`,
    borderRadius: `0 ${pageColorTokens.radiusControl} ${pageColorTokens.radiusControl} 0`,
    marginBottom: options?.marginBottom ?? "1rem",
  };
}

export const pageEmptyStateStyle: CSSProperties = {
  padding: "2.5rem 1.5rem",
  borderRadius: pageColorTokens.radiusCard,
  background: `linear-gradient(180deg, ${pageColorTokens.surfaceSubtle} 0%, ${pageColorTokens.surfaceMuted} 100%)`,
  border: `1px dashed ${pageColorTokens.borderInput}`,
  color: pageColorTokens.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.5,
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.75rem",
};

export const formErrorBoxStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  fontSize: "0.8125rem",
  lineHeight: 1.45,
};

export const pageMetricCardStyle: CSSProperties = {
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  overflow: "hidden",
  boxShadow: pageColorTokens.shadowCard,
};

export const pageMetricCardAccentStyle: CSSProperties = {
  background: `linear-gradient(90deg, ${pageColorTokens.brandGreenDeep} 0%, ${pageColorTokens.brandGreenDark} 100%)`,
  color: pageColorTokens.surface,
  padding: "0.65rem 1rem",
  fontSize: "0.8125rem",
  lineHeight: 1.45,
};

export const pageMetricTileStyle: CSSProperties = {
  padding: "1.25rem 1rem",
  textAlign: "center",
};

export const pageMetricLabelStyle: CSSProperties = {
  margin: "0 0 0.35rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
};

export const pageMetricValueStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.15,
  wordBreak: "break-word",
};

export const pageMetricUnitStyle: CSSProperties = {
  margin: "0.25rem 0 0",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
};

export const pageMetricFooterStyle: CSSProperties = {
  padding: "0.75rem 1rem 1rem",
  borderTop: `1px solid ${pageColorTokens.divider}`,
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  textAlign: "center",
};

export const pageStatusCardStyle: CSSProperties = {
  padding: "0.85rem 1rem",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
};

type PageSurfaceProps = {
  title?: string;
  children: ReactNode;
};

export function PageSurface({ title, children }: PageSurfaceProps) {
  return (
    <div style={pageSurfaceStyle}>
      {title ? <div style={pageSectionTitleStyle}>{title}</div> : null}
      {children}
    </div>
  );
}

type PagePanelProps = {
  children: ReactNode;
  padding?: "small" | "base" | "large";
  highlighted?: boolean;
};

/** 替代 s-box background="subdued"，统一为计费风白底卡片 */
export function PagePanel({
  children,
  padding = "base",
  highlighted = false,
}: PagePanelProps) {
  const paddingPx =
    padding === "large" ? "1.5rem" : padding === "small" ? "0.75rem" : "1.25rem";
  return (
    <div
      style={{
        ...pageSurfaceStyle,
        padding: paddingPx,
        ...(highlighted
          ? {
              borderColor: pageColorTokens.brandGreen,
              boxShadow: `0 0 0 1px ${pageColorTokens.brandGreen}`,
              background: `linear-gradient(180deg, ${pageColorTokens.brandGreenLight} 0%, ${pageColorTokens.surface} 28%)`,
            }
          : {}),
      }}
    >
      {children}
    </div>
  );
}

export type PageMetricItem = {
  label: string;
  value: string;
  unit?: string;
};

type PageMetricCardProps = {
  accent?: string;
  metrics: PageMetricItem[];
  footer?: ReactNode;
};

function pageMetricGridStyle(columnCount: number): CSSProperties {
  const minWidth = columnCount > 4 ? "120px" : "160px";
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))`,
    gap: 0,
  };
}

/** 对齐计费页额度卡：顶栏强调 + 指标网格 + 可选页脚 */
export function PageMetricCard({ accent, metrics, footer }: PageMetricCardProps) {
  return (
    <div style={pageMetricCardStyle}>
      {accent ? <div style={pageMetricCardAccentStyle}>{accent}</div> : null}
      <div style={pageMetricGridStyle(metrics.length)}>
        {metrics.map((metric) => (
          <div key={metric.label} style={pageMetricTileStyle}>
            <p style={pageMetricLabelStyle}>{metric.label}</p>
            <p style={pageMetricValueStyle}>{metric.value}</p>
            {metric.unit ? <p style={pageMetricUnitStyle}>{metric.unit}</p> : null}
          </div>
        ))}
      </div>
      {footer ? <div style={pageMetricFooterStyle}>{footer}</div> : null}
    </div>
  );
}
