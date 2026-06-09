import { useEffect, useRef, useState } from "react";
import styles from "./StreamingThinking.module.css";

/** 思考耗时格式化：优先秒，超过 60s 用分秒 */
function formatThinkingDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${seconds} 秒`;
}

/** 等待首个响应时的轻量指示器（无思考正文、无答案时显示） */
export function ThinkingIndicator({ label = "正在思考" }: { label?: string }) {
  return (
    <div className={styles.indicator}>
      <span className={styles.pulseDot} />
      <span className={styles.shimmerLabel}>{label}</span>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
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
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.checkDot} />
        <span className={styles.staticLabel}>已深度思考</span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className={styles.bodyWrap}>
          <div className={styles.body}>{text}</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Claude 风格思考面板。
 * - 思考进行中：展开显示流光标题 + 实时计时 + 正文自动滚动到底部。
 * - 答案开始生成或思考结束：自动折叠为「已深度思考 · 用时 N」，可点击展开回看。
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

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setUserToggled((prev) => !(prev ?? thinkingActive))}
        aria-expanded={open}
      >
        {thinkingActive ? (
          <>
            <span className={styles.pulseDot} />
            <span className={styles.shimmerLabel}>正在深度思考</span>
          </>
        ) : (
          <>
            <span className={styles.checkDot} />
            <span className={styles.staticLabel}>已深度思考</span>
          </>
        )}
        <span className={styles.timer}>
          {thinkingActive ? formatThinkingDuration(elapsedMs) : `用时 ${formatThinkingDuration(elapsedMs)}`}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <div className={styles.bodyWrap}>
          {thinkingActive ? <div className={styles.fadeMask} /> : null}
          <div ref={bodyRef} className={styles.body}>
            {text}
          </div>
        </div>
      ) : null}
    </div>
  );
}
