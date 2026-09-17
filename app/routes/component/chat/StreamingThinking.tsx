import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { formatThinkingDuration, THINKING_I18N_PREFIX } from "../../../lib/thinkingDuration";
import { resolveThinkingStepLabel, THINKING_PHASE, type ThinkingStep } from "../../../lib/thinkingSteps";
import { shopifyUi } from "../../page/workspace/styles";
import styles from "./StreamingThinking.module.css";

/**
 * 结构样式用 inline：CSS module 在 Shopify 嵌入 / Vite dev 下可能晚于首帧注入，
 * 无固有尺寸的 SVG 会先撑满容器（截图里的巨型箭头）。动画仍走 module。
 * 配色统一取 shopifyUi，和同一条回复里的推荐操作条同源。
 */
const panelStyle: CSSProperties = {
  borderRadius: shopifyUi.radiusControl,
  border: `1px solid ${shopifyUi.border}`,
  background: shopifyUi.surfaceSubtle,
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
  color: shopifyUi.textSecondary,
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
  background: shopifyUi.link,
};

const checkDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  flexShrink: 0,
  borderRadius: 999,
  background: shopifyUi.textMuted,
};

const labelStyle: CSSProperties = {
  flex: 1,
  color: shopifyUi.textSecondary,
};

const timerStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 500,
  color: shopifyUi.textMuted,
  fontVariantNumeric: "tabular-nums",
};

const bodyWrapStyle: CSSProperties = {
  position: "relative",
  borderTop: `1px solid ${shopifyUi.border}`,
};

const bodyStyle: CSSProperties = {
  fontSize: 13,
  color: shopifyUi.textSecondary,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  padding: "10px 12px",
  // 展开时也限高，避免 CoT 把回复区顶没；完整原文靠滚动看
  maxHeight: 140,
  overflowY: "auto",
};

const stepListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 12px",
};

const stepLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: shopifyUi.textSecondary,
};

const stepGlyphStyle = (status: ThinkingStep["status"]): CSSProperties => ({
  width: 14,
  flexShrink: 0,
  textAlign: "center",
  fontSize: 11,
  fontWeight: 600,
  color:
    status === "running"
      ? shopifyUi.link
      : status === "completed"
        ? shopifyUi.primary
        : status === "error"
          ? "#d72c0d"
          : shopifyUi.textMuted,
});

const rawToggleStyle: CSSProperties = {
  alignSelf: "flex-start",
  marginTop: 2,
  padding: 0,
  border: "none",
  background: "transparent",
  color: shopifyUi.textMuted,
  fontSize: 12,
  cursor: "pointer",
};

function stepGlyph(status: ThinkingStep["status"]): string {
  if (status === "running") return "○";
  if (status === "completed") return "✓";
  if (status === "error") return "✗";
  return "–";
}

/** 步骤按发生顺序堆叠；原文默认收起，点开才看模型自述。 */
function ThinkingBody({
  steps,
  text,
  bodyRef,
  active = false,
}: {
  steps: ThinkingStep[];
  text: string;
  bodyRef?: RefObject<HTMLDivElement>;
  /** 仍在思考中：无真实步骤时合成「理解问题」为 running */
  active?: boolean;
}) {
  const { t } = useTranslation();
  const [rawOpen, setRawOpen] = useState(false);
  const hasText = Boolean(text.trim());
  // 没有工具步骤时也绝不整段甩原文——至少显示阶段行，原文藏在「查看思考原文」后
  const displaySteps: ThinkingStep[] =
    steps.length > 0
      ? steps
      : hasText
        ? [
            {
              label: THINKING_PHASE.analyze,
              status: active ? "running" : "completed",
            },
          ]
        : [];

  if (displaySteps.length === 0) return null;

  return (
    <div ref={bodyRef} style={{ ...bodyStyle, whiteSpace: "normal", padding: 0 }}>
      <div style={stepListStyle}>
        {displaySteps.map((step, index) => (
          <div key={`${step.label}-${index}`} style={stepLineStyle}>
            <span style={stepGlyphStyle(step.status)}>{stepGlyph(step.status)}</span>
            <span>{resolveThinkingStepLabel(step.label, t)}</span>
          </div>
        ))}
        {hasText ? (
          <button type="button" style={rawToggleStyle} onClick={() => setRawOpen((v) => !v)}>
            {t(`${THINKING_I18N_PREFIX}.${rawOpen ? "hideRaw" : "showRaw"}`)}
          </button>
        ) : null}
        {rawOpen && hasText ? (
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", paddingTop: 4 }}>
            {text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const fadeMaskStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 6,
  height: 18,
  pointerEvents: "none",
  background: `linear-gradient(180deg, ${shopifyUi.surfaceSubtle}, rgba(250, 250, 250, 0))`,
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

/**
 * 折叠时不要直接 unmount，否则答案开始那一帧版面会往上塌一截。
 * 关键样式用 inline：Shopify 嵌入下 CSS module 可能晚于首帧或不生效，
 * 只靠 class 时会出现「点了没反应、正文一直展开」——截图里的过高思考栏就是这个。
 */
function ThinkingCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`${styles.collapse} ${open ? styles.collapseOpen : ""}`}
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 180ms ease",
      }}
    >
      <div
        className={styles.collapseInner}
        style={{ minHeight: 0, overflow: "hidden" }}
      >
        {children}
      </div>
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
        color: shopifyUi.textMuted,
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

function formatStepsSummary(
  steps: ThinkingStep[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const labels: string[] = [];
  for (const step of steps) {
    if (step.status === "skipped") continue;
    const label = resolveThinkingStepLabel(step.label, t);
    if (!label || labels[labels.length - 1] === label) continue;
    labels.push(label);
  }
  return labels.slice(0, 5).join(" · ");
}

/** 历史消息中的思考回看：默认折叠，点击展开查看步骤与思考原文，无计时。 */
export function ThinkingReview({
  text,
  steps = [],
}: {
  text: string;
  steps?: ThinkingStep[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!text.trim() && steps.length === 0) return null;
  const summary = formatStepsSummary(steps, t);
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
        <span className={styles.staticLabel} style={{ ...labelStyle, minWidth: 0 }}>
          <span style={{ display: "block" }}>{t(`${THINKING_I18N_PREFIX}.done`)}</span>
          {!open && summary ? (
            <span
              style={{
                display: "block",
                marginTop: 2,
                fontSize: 12,
                fontWeight: 500,
                color: shopifyUi.textMuted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {summary}
            </span>
          ) : null}
        </span>
        <ChevronIcon open={open} />
      </button>
      <ThinkingCollapse open={open}>
        <div className={styles.bodyWrap} style={bodyWrapStyle}>
          <ThinkingBody steps={steps} text={text} />
        </div>
      </ThinkingCollapse>
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
  steps = [],
}: {
  isStreaming: boolean;
  text: string;
  answerStarted: boolean;
  steps?: ThinkingStep[];
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
  const summary = formatStepsSummary(steps, t);

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
            <span className={styles.shimmerLabel} style={{ ...labelStyle, minWidth: 0 }}>
              <span style={{ display: "block" }}>{t(`${THINKING_I18N_PREFIX}.active`)}</span>
              {summary ? (
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    fontSize: 12,
                    fontWeight: 500,
                    color: shopifyUi.textMuted,
                    WebkitTextFillColor: shopifyUi.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {summary}
                </span>
              ) : null}
            </span>
          </>
        ) : (
          <>
            <span className={styles.checkDot} style={checkDotStyle} />
            <span className={styles.staticLabel} style={{ ...labelStyle, minWidth: 0 }}>
              <span style={{ display: "block" }}>{t(`${THINKING_I18N_PREFIX}.done`)}</span>
              {!open && summary ? (
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    fontSize: 12,
                    fontWeight: 500,
                    color: shopifyUi.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {summary}
                </span>
              ) : null}
            </span>
          </>
        )}
        <span className={styles.timer} style={timerStyle}>
          {thinkingActive ? duration : t(`${THINKING_I18N_PREFIX}.elapsed`, { duration })}
        </span>
        <ChevronIcon open={open} />
      </button>
      <ThinkingCollapse open={open}>
        <div className={styles.bodyWrap} style={bodyWrapStyle}>
          {thinkingActive && steps.length === 0 && !text.trim() ? (
            <div className={styles.fadeMask} style={fadeMaskStyle} />
          ) : null}
          <ThinkingBody
            steps={steps}
            text={text}
            bodyRef={bodyRef}
            active={thinkingActive}
          />
        </div>
      </ThinkingCollapse>
    </div>
  );
}
