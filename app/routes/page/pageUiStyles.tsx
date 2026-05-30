import type { CSSProperties, ReactNode } from "react";

export const pageColorTokens = {
  textPrimary: "#1a1d1f",
  textBody: "#2c2f32",
  textSecondary: "#6b7280",
  textFootnote: "#9ca3af",
  textMuted: "#4b5563",
  border: "#e2e5e9",
  borderInput: "#c8cdd3",
  borderSubtle: "#dde1e6",
  divider: "#f0f2f4",
  // Brand — slightly more vivid than legacy #008060 / #2c6ecb
  brandGreen: "#00a67c",
  brandGreenDark: "#007a5a",
  brandGreenDeep: "#005c46",
  brandGreenLight: "#edfaf5",
  brandGreenGlow: "rgba(0, 166, 124, 0.18)",
  brandBlue: "#4070f4",
  brandBlueDark: "#2952d8",
  brandBlueLight: "#eef2ff",
  brandBlueGlow: "rgba(64, 112, 244, 0.18)",
  // Surfaces
  surface: "#ffffff",
  surfaceGlass: "linear-gradient(160deg, #ffffff 0%, #f7f9ff 100%)",
  surfaceMuted: "#f5f6f8",
  surfaceEvenRow: "#f9fafb",
  surfaceSubtle: "#fafafa",
  // Feedback
  critical: "#dc2626",
  criticalBg: "rgba(220, 38, 38, 0.07)",
  criticalText: "#991b1b",
  // Elevation
  shadowCard: "0 2px 10px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
  shadowCardStrong: "0 8px 28px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06)",
  shadowModal: "0 16px 40px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.08)",
  progressTrackGradient: "linear-gradient(90deg, #e8eaef 0%, #dfe3ea 100%)",
  radiusCard: "14px",
  radiusControl: "9px",
  mutedBg: "rgba(107, 114, 128, 0.08)",
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

export const pageContentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  maxWidth: "1120px",
};

export const pageSurfaceStyle: CSSProperties = {
  background: "linear-gradient(160deg, #ffffff 0%, #fbfcfd 100%)",
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
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "1.25rem",
};

export const pageFieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
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
  color: pageColorTokens.textSecondary,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
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
    border: `1px solid ${disabled ? pageColorTokens.borderSubtle : pageColorTokens.borderInput}`,
    background: disabled ? pageColorTokens.surfaceMuted : pageColorTokens.surfaceSubtle,
    color: pageColorTokens.textBody,
    boxSizing: "border-box",
    boxShadow: disabled ? "none" : "inset 0 1px 0 rgba(255,255,255,0.6)",
    transition: "border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease",
  };
}

export const languageSelectorBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem 0.75rem",
  marginTop: "0.5rem",
  padding: "0.65rem 0.85rem",
  borderRadius: pageColorTokens.radiusControl,
  background: "linear-gradient(135deg, #fafafa 0%, #f5f6f8 100%)",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)",
};

export const languageSelectorLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  whiteSpace: "nowrap",
};

export function pageSelectCompactStyle(disabled = false): CSSProperties {
  return {
    ...pageSelectStyle(disabled),
    marginTop: 0,
    width: "auto",
    minWidth: "10rem",
    maxWidth: "14rem",
    flex: "1 1 10rem",
    fontSize: "0.8125rem",
    padding: "0.4rem 0.55rem",
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
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
  margin: "0 0 1rem",
};

export const pageBlockTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.125rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

export const pageSectionSubtitleStyle: CSSProperties = {
  margin: "0.25rem 0 0",
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
  maxWidth: "36rem",
};

export const pageStatusBadgeStyle: CSSProperties = {
  flexShrink: 0,
  padding: "0.32rem 0.78rem",
  borderRadius: "999px",
  fontSize: "0.8125rem",
  fontWeight: 700,
  color: pageColorTokens.brandGreenDark,
  background: pageColorTokens.brandGreenLight,
  border: "1px solid rgba(0, 166, 124, 0.18)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
};

export const pageTrustFootnoteStyle: CSSProperties = {
  margin: 0,
  padding: "0.85rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  background: "linear-gradient(135deg, #fafafa 0%, #f5f6f8 100%)",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.75rem",
  lineHeight: 1.45,
  color: pageColorTokens.textSecondary,
  textAlign: "center",
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
  fontWeight: 700,
  color: pageColorTokens.brandGreenDark,
  padding: "0.28rem 0.6rem",
  borderRadius: "999px",
  background: pageColorTokens.brandGreenLight,
  border: "1px solid rgba(0, 166, 124, 0.16)",
};

export const pageMetaTextStyle: CSSProperties = {
  margin: 0,
  padding: "0.65rem 0.75rem",
  background: "linear-gradient(135deg, #fafafa 0%, #f5f6f8 100%)",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
};

export type PageIntroTone =
  | "render"
  | "picture"
  | "translation"
  | "chat"
  | "billing"
  | "diagnosis"
  | "order-monitor";

const introToneTokens: Record<
  PageIntroTone,
  { gradient: string; borderColor: string }
> = {
  render: {
    gradient: "linear-gradient(135deg, rgba(109, 40, 217, 0.08) 0%, rgba(236, 72, 153, 0.06) 100%)",
    borderColor: "#7c3aed",
  },
  picture: {
    gradient: "linear-gradient(135deg, rgba(139, 5, 255, 0.09) 0%, rgba(0, 166, 124, 0.07) 100%)",
    borderColor: "#8a05ff",
  },
  translation: {
    gradient: "linear-gradient(135deg, rgba(0, 166, 124, 0.09) 0%, rgba(64, 112, 244, 0.07) 100%)",
    borderColor: "#00a67c",
  },
  chat: {
    gradient: "linear-gradient(135deg, rgba(64, 112, 244, 0.09) 0%, rgba(0, 166, 124, 0.07) 100%)",
    borderColor: "#4070f4",
  },
  billing: {
    gradient: "linear-gradient(135deg, rgba(0, 166, 124, 0.08) 0%, rgba(139, 5, 255, 0.05) 100%)",
    borderColor: "#00a67c",
  },
  diagnosis: {
    gradient: "linear-gradient(135deg, rgba(64, 112, 244, 0.08) 0%, rgba(107, 114, 128, 0.07) 100%)",
    borderColor: "#4070f4",
  },
  "order-monitor": {
    gradient: "linear-gradient(135deg, rgba(234, 88, 12, 0.08) 0%, rgba(0, 166, 124, 0.07) 100%)",
    borderColor: "#ea580c",
  },
};

export function pageIntroBannerStyle(
  tone: PageIntroTone,
  options?: { marginBottom?: string },
): CSSProperties {
  const token = introToneTokens[tone];
  return {
    fontSize: "0.875rem",
    color: pageColorTokens.textBody,
    lineHeight: 1.55,
    padding: "0.9rem 1.25rem",
    background: token.gradient,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderLeft: `4px solid ${token.borderColor}`,
    borderRadius: pageColorTokens.radiusControl,
    marginBottom: options?.marginBottom ?? "1rem",
    boxShadow: pageColorTokens.shadowCard,
  };
}

export const pageEmptyStateStyle: CSSProperties = {
  padding: "2.5rem 1.5rem",
  borderRadius: pageColorTokens.radiusCard,
  background: "linear-gradient(160deg, #fafafa 0%, #f5f6f8 100%)",
  border: `1px dashed ${pageColorTokens.borderSubtle}`,
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
  padding: "0.55rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  background: "linear-gradient(135deg, rgba(220,38,38,0.07) 0%, rgba(220,38,38,0.04) 100%)",
  border: "1px solid rgba(220,38,38,0.2)",
  color: pageColorTokens.criticalText,
  fontSize: "0.8125rem",
  lineHeight: 1.45,
};

export const pageMetricCardStyle: CSSProperties = {
  background: "linear-gradient(160deg, #ffffff 0%, #fbfcfd 100%)",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  overflow: "hidden",
  boxShadow: pageColorTokens.shadowCard,
};

export const pageMetricCardAccentStyle: CSSProperties = {
  background: "linear-gradient(135deg, #005c46 0%, #007a5a 50%, #00c48c 100%)",
  color: "#ffffff",
  padding: "0.7rem 1rem",
  fontSize: "0.8125rem",
  lineHeight: 1.45,
  letterSpacing: "0.01em",
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
  background: "linear-gradient(160deg, #ffffff 0%, #fbfcfd 100%)",
  boxShadow: pageColorTokens.shadowCard,
};

type PageSectionHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
};

export function PageSectionHeader({ title, subtitle, badge }: PageSectionHeaderProps) {
  return (
    <div style={pageSectionHeaderRowStyle}>
      <div style={{ flex: "1 1 14rem", minWidth: 0 }}>
        <h2 style={pageBlockTitleStyle}>{title}</h2>
        {subtitle ? <p style={pageSectionSubtitleStyle}>{subtitle}</p> : null}
      </div>
      {badge ?? null}
    </div>
  );
}

type PageSurfaceProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export function PageSurface({ title, subtitle, children }: PageSurfaceProps) {
  return (
    <div style={pageSurfaceStyle}>
      {title || subtitle ? (
        <div style={{ marginBottom: "1rem" }}>
          {title ? (
            <h3 style={{ ...pageBlockTitleStyle, marginBottom: subtitle ? "0.25rem" : 0 }}>
              {title}
            </h3>
          ) : null}
          {subtitle ? (
            <p style={{ ...pageSectionSubtitleStyle, margin: 0 }}>{subtitle}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

type PagePanelProps = {
  children: ReactNode;
  padding?: "small" | "base" | "large";
  highlighted?: boolean;
};

export function PagePanel({ children, padding = "base", highlighted = false }: PagePanelProps) {
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
              boxShadow: `0 0 0 1px ${pageColorTokens.brandGreen}, 0 4px 20px ${pageColorTokens.brandGreenGlow}`,
              background: `linear-gradient(160deg, ${pageColorTokens.brandGreenLight} 0%, #ffffff 32%)`,
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
