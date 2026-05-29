import type { CSSProperties, ReactNode } from "react";

type PictureTranslateShellProps = {
  embedded?: boolean;
  children: ReactNode;
};

export function PictureTranslateShell({
  embedded = false,
  children,
}: PictureTranslateShellProps) {
  const shellStyle: CSSProperties = {
    marginTop: embedded ? 0 : "0.5rem",
    borderRadius: embedded ? "14px" : "16px",
    padding: "1px",
    background:
      "linear-gradient(135deg, rgba(44, 110, 203, 0.38) 0%, rgba(0, 128, 96, 0.28) 50%, rgba(147, 112, 219, 0.22) 100%)",
    boxShadow: embedded
      ? "0 2px 12px rgba(0, 0, 0, 0.05)"
      : "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
  };
  const innerStyle: CSSProperties = {
    borderRadius: embedded ? "13px" : "15px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbfb 100%)",
    overflow: "hidden",
  };

  return (
    <div style={shellStyle}>
      <div style={innerStyle}>
        <div style={{ padding: embedded ? "0.85rem 1rem 1rem" : "1rem 1.125rem 1.125rem" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
