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

/** 白底卡片容器（Render 风格 12px 圆角） */
export const pageSurfaceStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e3e3e3",
  borderRadius: "12px",
  padding: "1.5rem",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
};

export const pageSectionTitleStyle: CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 600,
  color: "#202223",
  marginBottom: "1.25rem",
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
