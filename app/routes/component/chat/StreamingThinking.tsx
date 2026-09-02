import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { formatThinkingDuration, THINKING_I18N_PREFIX } from "../../../lib/thinkingDuration";
import styles from "./StreamingThinking.module.css";

/**
 * 结构样式用 inline：CSS module 在 Shopify 嵌入 / Vite dev 下可能晚于首帧注入，
 * 无固有尺寸的 SVG 会先撑满容器（截图里的巨型箭头）。动画仍走 module。
 */
const panelStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(99, 110, 124, 0.16)",
  background: "rgba(99, 110, 124, 0.04)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "9px 12px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 600,
  color: "#5c6370",
  userSelect: "none",
};

const indicatorStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 500,
  padding: "2px 0",
};

const pulseDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  flexShrink: 0,
  borderRadius: 999,
  background: "#2c6ecb",
};

const checkDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  flexShrink: 0,
  borderRadius: 999,
  background: "#9aa3ad",
};

const labelStyle: CSSProperties = {
  flex: 1,
  color: "#5c6370",
};

const timerStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 500,
  color: "#8a929c",
  fontVariantNumeric: "tabular-nums",
};

const bodyWrapStyle: CSSProperties = {
  position: "relative",
  borderTop: "1px solid rgba(99, 110, 124, 0.12)",
};

const bodyStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  padding: "10px 12px",
  maxHeight: 180,
  overflowY: "auto",
};

const fadeMaskStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 6,
  height: 18,
  pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(99, 110, 124, 0.04), rgba(99, 110, 124, 0))",
};

/** 等待首个响应时的轻量指示器（无思考正文、无答案时显示） */
export function ThinkingIndicator({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.indicator} style={indicatorStyle}>
      <span className={styles.pulseDot} style={pulseDotStyle} />
      <span className={styles.shimmerLabel} style={labelStyle}>
        {label ?? t(`${THINKING_I18N_PREFIX}.idle`)}
      </span>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{
        width: 14,
        height: 14,
        flexShrink: 0,
        color: "#9aa3ad",
        display: "block",
        transform: open ? "rotate(90deg)" : undefined,
        transition: "transform 180ms ease",
      }}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 历史消息中的思考回看：默认折叠，点击展开查看完整思考过程，无计时。 */
export function ThinkingReview({ text }: { text: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className={styles.panel} style={panelStyle}>
      <button
        type="button"
        className={styles.header}
        style={headerStyle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.checkDot} style={checkDotStyle} />
        <span className={styles.staticLabel} style={labelStyle}>
          {t(`${THINKING_I18N_PREFIX}.done`)}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className={styles.bodyWrap} style={bodyWrapStyle}>
          <div className={styles.body} style={bodyStyle}>
            {text}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Claude 风格思考面板。
 * - 思考进行中：展开显示流光标题 + 实时计时 + 正文自动滚动到底部。
 * - 答案开始生成或思考结束：自动折叠为完成态 + 耗时，可点击展开回看。
 */
export function ThinkingPanel({
  isStreaming,
  text,
  answerStarted,
}: {
  isStreaming: boolean;
  text: string;
  answerStarted: boolean;
}) {
  const { t } = useTranslation();
  const startRef = useRef<number>(Date.now());
  const frozenRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 思考阶段视为「未结束」：仍在流式且答案尚未开始
  const thinkingActive = isStreaming && !answerStarted;

  // 计时：思考结束后冻结耗时
  useEffect(() => {
    if (!thinkingActive) {
      if (frozenRef.current === null) {
        frozenRef.current = Date.now() - startRef.current;
        setElapsedMs(frozenRef.current);
      }
      return;
    }
    frozenRef.current = null;
    const tick = () => setElapsedMs(Date.now() - startRef.current);
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [thinkingActive]);

  // 正文流式时自动滚动到底部
  useEffect(() => {
    if (thinkingActive && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, thinkingActive]);

  // 默认展开规则：思考中展开，结束后折叠；用户手动操作后以用户选择为准
  const open = userToggled ?? thinkingActive;
  const duration = formatThinkingDuration(elapsedMs, t);

  return (
    <div className={styles.panel} style={panelStyle}>
      <button
        type="button"
        className={styles.header}
        style={headerStyle}
        onClick={() => setUserToggled((prev) => !(prev ?? thinkingActive))}
        aria-expanded={open}
      >
        {thinkingActive ? (
          <>
            <span className={styles.pulseDot} style={pulseDotStyle} />
            <span className={styles.shimmerLabel} style={labelStyle}>
              {t(`${THINKING_I18N_PREFIX}.active`)}
            </span>
          </>
        ) : (
          <>
            <span className={styles.checkDot} style={checkDotStyle} />
            <span className={styles.staticLabel} style={labelStyle}>
              {t(`${THINKING_I18N_PREFIX}.done`)}
            </span>
          </>
        )}
        <span className={styles.timer} style={timerStyle}>
          {thinkingActive ? duration : t(`${THINKING_I18N_PREFIX}.elapsed`, { duration })}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className={styles.bodyWrap} style={bodyWrapStyle}>
          {thinkingActive ? <div className={styles.fadeMask} style={fadeMaskStyle} /> : null}
          <div ref={bodyRef} className={styles.body} style={bodyStyle}>
            {text}
          </div>
        </div>
      ) : null}
    </div>
  );
}
