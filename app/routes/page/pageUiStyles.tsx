import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { resolveBackDestination } from "../../lib/pageBackNavigation";

/**
 * 与工作台 `page/workspace/styles.ts` 的 `shopifyUi` 同源，保证工作台与工具页视觉一致。
 * 取值遵循 docs/DESIGN.md：中性表面为主，语义色只用于状态。
 */
export const pageColorTokens = {
  textPrimary: "#1f2124",
  textBody: "#42474c",
  textSecondary: "#61666c",
  textFootnote: "#8c9196",
  textMuted: "#4a4f55",
  border: "#e1e3e5",
  borderInput: "#c9cdd2",
  borderSubtle: "#ebedf0",
  divider: "#f1f2f3",
  // Brand — Shopify Admin 标准绿与链接蓝
  brandGreen: "#008060",
  brandGreenDark: "#006e52",
  brandGreenDeep: "#004c3f",
  brandGreenLight: "#e9f7ef",
  brandGreenGlow: "rgba(0, 128, 96, 0.16)",
  brandBlue: "#005bd3",
  brandBlueDark: "#00449e",
  brandBlueLight: "#eef4ff",
  brandBlueGlow: "rgba(0, 91, 211, 0.16)",
  // Surfaces
  surface: "#ffffff",
  surfaceMuted: "#f6f6f7",
  surfaceEvenRow: "#fafbfb",
  surfaceSubtle: "#fafbfb",
  // Feedback
  critical: "#d82c0d",
  criticalBg: "#fff0ee",
  criticalText: "#8e1f0b",
  warning: "#b98900",
  warningBg: "#fff7e0",
  progress: "#c05717",
  progressBg: "#fff1e8",
  neutralStatus: "#61666c",
  // Elevation — 优先靠边框分层，阴影保持克制
  shadowCard: "0 1px 0 rgba(0, 0, 0, 0.05)",
  shadowCardStrong: "0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.05)",
  shadowModal: "0 24px 56px rgba(15, 23, 42, 0.16)",
  radiusCard: "14px",
  radiusControl: "10px",
  mutedBg: "rgba(97, 102, 108, 0.08)",
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

/**
 * 应用外壳内容区：所有 /app 子页面共用的唯一留白来源（工作台首页自带整屏布局，不套这层）。
 * 与工作台 `page/workspace/styles.ts` 的 contentStyle 同值。
 */
export const appShellContentStyle: CSSProperties = {
  padding: "24px 28px 36px",
  minWidth: 0,
};

export const appShellContentMobileStyle: CSSProperties = {
  padding: "14px 14px 24px",
  minWidth: 0,
};

export const pageContentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  width: "100%",
  maxWidth: "1120px",
  marginInline: "auto",
};

/**
 * 分析页会承载更宽的筛选条、指标卡和宽表，因此单独放宽内容区上限。
 * 仍然保持居中，避免回到左贴边体验。
 */
export const analysisPageContentStyle: CSSProperties = {
  ...pageContentStyle,
  maxWidth: "1440px",
};

/**
 * 移动端变体。部分调用方写成 `isMobile ? mobile : desktop` 的整体替换，
 * 因此这里必须自带 flex 布局，不能只放差异字段。
 */
export const mobilePageContentStyle: CSSProperties = {
  ...pageContentStyle,
  gap: "1rem",
  width: "100%",
};

export const pageBackButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.45rem",
  width: "fit-content",
  padding: "0.44rem 0.78rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textSecondary,
  fontSize: "0.8125rem",
  fontWeight: 620,
  cursor: "pointer",
  boxShadow: "none",
  transition: "border-color 120ms ease, color 120ms ease, background 120ms ease",
};

export const pageBackButtonMobileStyle: CSSProperties = {
  ...pageBackButtonStyle,
  minHeight: 36,
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
};

export const pageHeaderNavStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.95rem",
  flexWrap: "wrap",
  padding: "0.95rem 1rem",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
};

export const pageHeaderNavPlainStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.95rem",
  flexWrap: "wrap",
  padding: "0.95rem 1rem",
};

export const pageHeaderNavMobileStyle: CSSProperties = {
  ...pageHeaderNavStyle,
  gap: "0.75rem",
  flexDirection: "column",
  padding: "0.85rem 0.85rem",
};

export const pageHeaderNavMobilePlainStyle: CSSProperties = {
  ...pageHeaderNavPlainStyle,
  gap: "0.75rem",
  flexDirection: "column",
  padding: "0.85rem 0.85rem",
};

export const pageHeaderNavMainStyle: CSSProperties = {
  flex: "1 1 16rem",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.58rem",
};

export const pageHeaderNavHeadingStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
};

export const pageHeaderNavEyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: pageColorTokens.textFootnote,
};

export const pageHeaderNavTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.48rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.18,
};

export const pageHeaderNavTitleMobileStyle: CSSProperties = {
  ...pageHeaderNavTitleStyle,
  fontSize: "1.125rem",
};

export const pageHeaderNavSubtitleStyle: CSSProperties = {
  margin: "0.2rem 0 0",
  fontSize: "0.84rem",
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
  maxWidth: "52rem",
};

export const pageHeaderNavSubtitleMobileStyle: CSSProperties = {
  ...pageHeaderNavSubtitleStyle,
  fontSize: "0.8rem",
  marginTop: "0.15rem",
};

export const pageHeaderNavActionStyle: CSSProperties = {
  flexShrink: 0,
  alignSelf: "center",
};

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

export const languageSelectorBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem 0.75rem",
  marginTop: "0.5rem",
  padding: "0.65rem 0.85rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
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
  fontSize: "1.05rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

export const pageSectionSubtitleStyle: CSSProperties = {
  margin: "0.3rem 0 0",
  fontSize: "0.8rem",
  lineHeight: 1.45,
  color: pageColorTokens.textSecondary,
  maxWidth: "36rem",
};

export const pageStatusBadgeStyle: CSSProperties = {
  flexShrink: 0,
  padding: "0.3rem 0.8rem",
  borderRadius: "999px",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: pageColorTokens.brandGreenDeep,
  background: pageColorTokens.brandGreenLight,
  border: `1px solid ${pageColorTokens.brandGreenGlow}`,
};

export const pageTrustFootnoteStyle: CSSProperties = {
  margin: 0,
  padding: "0.85rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
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
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "0.9rem",
  flexWrap: "wrap",
  marginBottom: "0.9rem",
  paddingBottom: "0.55rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
};

export const pageSectionHeaderTextStyle: CSSProperties = {
  flex: "1 1 14rem",
  minWidth: 0,
};

export const pageAccentBadgeStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: pageColorTokens.brandGreen,
};

export const pageMetaTextStyle: CSSProperties = {
  margin: 0,
  padding: "0.65rem 0.75rem",
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
};

export function pageIntroBannerStyle(options?: { marginBottom?: string }): CSSProperties {
  return {
    fontSize: "0.875rem",
    color: pageColorTokens.textSecondary,
    lineHeight: 1.55,
    padding: "0.9rem 1.1rem",
    background: pageColorTokens.surfaceMuted,
    border: `1px solid ${pageColorTokens.border}`,
    borderRadius: pageColorTokens.radiusControl,
    marginBottom: options?.marginBottom ?? "1rem",
  };
}

export const pageEmptyStateStyle: CSSProperties = {
  padding: "2.5rem 1.5rem",
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surfaceSubtle,
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
  padding: "0.55rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.criticalBg,
  border: "1px solid #f2b8ae",
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
  background: pageColorTokens.surfaceMuted,
  borderBottom: `1px solid ${pageColorTokens.border}`,
  color: pageColorTokens.textSecondary,
  padding: "0.7rem 1rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
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

type PageSectionHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
};

export function PageSectionHeader({ title, subtitle, badge }: PageSectionHeaderProps) {
  return (
    <div style={pageSectionHeaderRowStyle}>
      <div style={pageSectionHeaderTextStyle}>
        <h2 style={pageBlockTitleStyle}>{title}</h2>
        {subtitle ? <p style={pageSectionSubtitleStyle}>{subtitle}</p> : null}
      </div>
      {badge ?? null}
    </div>
  );
}

type PageBackButtonProps = {
  label: string;
  fallbackPath?: string;
  preserveSearch?: boolean;
  workspaceOnly?: boolean;
  style?: CSSProperties;
  returnTo?: string;
};

export function PageBackButton({
  label,
  fallbackPath = "/app",
  preserveSearch = false,
  workspaceOnly = false,
  style,
  returnTo,
}: PageBackButtonProps) {
  const navigate = useEmbeddedNavigate();
  const location = useLocation();
  const { isMobile } = useResponsiveLayout();

  if (workspaceOnly && new URLSearchParams(location.search).get("from") !== "workspace") {
    return null;
  }

  const handleBack = () => {
    const destination = resolveBackDestination({
      fallbackPath,
      locationSearch: location.search,
      preserveSearch,
      returnTo,
    });
    navigate(destination.to, destination.replace ? { replace: true } : undefined);
  };

  return (
    <button
      type="button"
      style={{
        ...(isMobile ? pageBackButtonMobileStyle : pageBackButtonStyle),
        ...style,
      }}
      onClick={handleBack}
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </button>
  );
}

type PageHeaderNavProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  titleBarTitle?: string;
  backLabel: string;
  fallbackPath?: string;
  preserveSearch?: boolean;
  workspaceOnly?: boolean;
  returnTo?: string;
  rightAction?: ReactNode;
  chromeless?: boolean;
};

export function PageHeaderNav({
  title,
  subtitle,
  eyebrow,
  titleBarTitle,
  backLabel,
  fallbackPath,
  preserveSearch,
  workspaceOnly,
  returnTo,
  rightAction,
  chromeless = false,
}: PageHeaderNavProps) {
  const { isMobile } = useResponsiveLayout();
  const headerStyle = isMobile
    ? chromeless
      ? pageHeaderNavMobilePlainStyle
      : pageHeaderNavMobileStyle
    : chromeless
      ? pageHeaderNavPlainStyle
      : pageHeaderNavStyle;

  return (
    <div style={headerStyle}>
      {/* 同步 Shopify Admin 顶部标题栏，避免切换页面后残留上一页标题 */}
      <TitleBar title={titleBarTitle ?? title} />
      <div style={pageHeaderNavMainStyle}>
        <PageBackButton
          label={backLabel}
          fallbackPath={fallbackPath}
          preserveSearch={preserveSearch}
          workspaceOnly={workspaceOnly}
          returnTo={returnTo}
        />
        <div style={pageHeaderNavHeadingStyle}>
          {eyebrow ? <p style={pageHeaderNavEyebrowStyle}>{eyebrow}</p> : null}
          <h1 style={isMobile ? pageHeaderNavTitleMobileStyle : pageHeaderNavTitleStyle}>
            {title}
          </h1>
          {subtitle ? (
            <p style={isMobile ? pageHeaderNavSubtitleMobileStyle : pageHeaderNavSubtitleStyle}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {rightAction ? <div style={pageHeaderNavActionStyle}>{rightAction}</div> : null}
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
              boxShadow: `0 0 0 1px ${pageColorTokens.brandGreen}`,
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
