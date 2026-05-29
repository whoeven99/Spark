import type { CSSProperties, ReactNode } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";

type CriticalErrorBoxProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function CriticalErrorBox({
  children,
  className,
  style,
}: CriticalErrorBoxProps) {
  return (
    <div
      className={className}
      style={{
        padding: "0.5rem 0.65rem",
        borderRadius: pageColorTokens.radiusControl,
        background: pageColorTokens.criticalBg,
        color: pageColorTokens.criticalText,
        fontSize: "0.8125rem",
        lineHeight: 1.45,
        ...style,
      }}
      role="alert"
    >
      {children}
    </div>
  );
}

