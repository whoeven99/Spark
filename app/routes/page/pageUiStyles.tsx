import type { CSSProperties, ReactNode } from "react";

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
  background: "#ffffff",
  border: "1px solid #e1e3e5",
  borderRadius: "12px",
  padding: "1.25rem",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
};

export const pageSectionTitleStyle: CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 600,
  color: "#202223",
  margin: "0 0 1rem",
};

export const pageSectionMajorTitleStyle: CSSProperties = {
  fontSize: "1.375rem",
  fontWeight: 700,
  color: "#202223",
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
  color: "#008060",
};

export const pageMetaTextStyle: CSSProperties = {
  margin: 0,
  padding: "0.65rem 0.75rem",
  background: "#f6f6f7",
  borderRadius: "8px",
  fontSize: "0.8125rem",
  color: "#303030",
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
    color: "#6d7175",
    lineHeight: 1.5,
    padding: "1rem 1.25rem",
    background: token.gradient,
    borderLeft: `4px solid ${token.borderColor}`,
    borderRadius: "0 8px 8px 0",
    marginBottom: options?.marginBottom ?? "1rem",
  };
}

export const pageEmptyStateStyle: CSSProperties = {
  padding: "2.5rem 1.5rem",
  borderRadius: "12px",
  background: "linear-gradient(180deg, #fafafa 0%, #f4f5f6 100%)",
  border: "1px dashed #c9cccf",
  color: "#6d7175",
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
  borderRadius: "8px",
  background: "rgba(216, 44, 13, 0.08)",
  color: "#8a2712",
  fontSize: "0.8125rem",
  lineHeight: 1.45,
};

export const pageMetricCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e1e3e5",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
};

export const pageMetricCardAccentStyle: CSSProperties = {
  background: "linear-gradient(90deg, #1a6b52 0%, #208060 100%)",
  color: "#fff",
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
  color: "#6d7175",
};

export const pageMetricValueStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#202223",
  lineHeight: 1.15,
  wordBreak: "break-word",
};

export const pageMetricUnitStyle: CSSProperties = {
  margin: "0.25rem 0 0",
  fontSize: "0.8125rem",
  color: "#6d7175",
};

export const pageMetricFooterStyle: CSSProperties = {
  padding: "0.75rem 1rem 1rem",
  borderTop: "1px solid #f1f2f3",
  fontSize: "0.8125rem",
  color: "#6d7175",
  textAlign: "center",
};

export const pageStatusCardStyle: CSSProperties = {
  padding: "0.85rem 1rem",
  border: "1px solid #e1e3e5",
  borderRadius: "12px",
  background: "#fff",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
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
