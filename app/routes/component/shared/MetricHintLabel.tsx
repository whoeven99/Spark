import { useId, useState, type CSSProperties, type ElementType } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";

type MetricHintLabelProps = {
  text: string;
  content?: string | null;
  as?: ElementType;
  style?: CSSProperties;
  tooltipAlign?: "start" | "end";
};

export function MetricHintLabel({
  text,
  content,
  as: Component = "span",
  style,
  tooltipAlign = "start",
}: MetricHintLabelProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const normalizedContent = content?.trim() ?? "";

  if (!normalizedContent) {
    return <Component style={style}>{text}</Component>;
  }

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      title={normalizedContent}
    >
      <Component style={{ ...style, ...triggerTextStyle }}>{text}</Component>
      <span aria-hidden style={hintBadgeStyle}>
        ?
      </span>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          style={{
            ...tooltipStyle,
            left: tooltipAlign === "start" ? 0 : undefined,
            right: tooltipAlign === "end" ? 0 : undefined,
          }}
        >
          {normalizedContent}
        </div>
      ) : null}
    </div>
  );
}

const containerStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  width: "fit-content",
  maxWidth: "100%",
  outline: "none",
};

const triggerTextStyle: CSSProperties = {
  cursor: "help",
  borderBottom: `1px dashed ${pageColorTokens.borderInput}`,
};

const hintBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  borderRadius: 999,
  background: pageColorTokens.brandBlueLight,
  color: pageColorTokens.brandBlueDark,
  fontSize: "0.7rem",
  fontWeight: 700,
  lineHeight: 1,
  flexShrink: 0,
};

const tooltipStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 0.45rem)",
  zIndex: 30,
  width: "max-content",
  maxWidth: "min(24rem, 72vw)",
  padding: "0.7rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.textPrimary,
  color: "#ffffff",
  fontSize: "0.75rem",
  lineHeight: 1.55,
  boxShadow: pageColorTokens.shadowCardStrong,
  whiteSpace: "pre-wrap",
  pointerEvents: "none",
};
