import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { ImageGenerationFormPayload } from "../../../lib/imageGenerationFormPayload";
import type { PictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import type { ProductImproveCardPayload } from "../../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import type {
  BatchTaskProduct,
  BatchTasksFormPayload,
} from "../../../lib/batchTasksFormPayload";
import { mergeBatchTasksPayloadWithContext } from "../../../lib/batchTasksFormPayload";
import { ChatMessageContent } from "./ChatMessageContent";
import { ChatStreamingSkeleton } from "./ChatStreamingSkeleton";
import { ImageGenerationChatCard } from "./ImageGenerationChatCard";
import { PictureTranslateChatCard } from "./PictureTranslateChatCard";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { TranslationTaskChatCard } from "../translation/TranslationTaskChatCard";
import { BatchTasksChatCard } from "./BatchTasksChatCard";
import {
  hasStreamingVisualContent,
  type SkillStepProgress,
} from "../../page/chat/chatStreamUtils";

type StreamingAssistantReplyProps = {
  active: boolean;
  isStreaming: boolean;
  streamingText: string;
  streamingThinkingText?: string;
  skillSteps: SkillStepProgress[];
  streamingTranslationForm?: unknown;
  streamingGenerateCard: boolean;
  streamingGeneratePayload?: unknown;
  streamingPictureTranslateCard?: boolean;
  streamingPictureTranslatePayload?: unknown;
  streamingImageGenerationCard?: boolean;
  streamingImageGenerationPayload?: unknown;
  streamingBatchTasksCard?: boolean;
  streamingBatchTasksPayload?: BatchTasksFormPayload;
  workspaceBatchProducts?: BatchTaskProduct[];
};

const assistantBubbleShellStyle: CSSProperties = {
  borderRadius: "12px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(44, 110, 203, 0.35)",
  background:
    "linear-gradient(180deg, rgba(44, 110, 203, 0.08), rgba(44, 110, 203, 0.02))",
};

function ThinkingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 450);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={thinkingTextStyle}>
      正在思考
      <span style={{ letterSpacing: 2 }}>{"...".slice(0, frame)}</span>
      <span style={{ opacity: 0, letterSpacing: 2 }}>{"...".slice(frame)}</span>
    </span>
  );
}

function StreamingCursor() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ ...cursorStyle, opacity: visible ? 1 : 0 }} aria-hidden>
      ▍
    </span>
  );
}

function StreamingSkillSteps({ steps }: { steps: SkillStepProgress[] }) {
  if (steps.length === 0) return null;
  return (
    <div style={skillStepsWrapStyle}>
      <div style={skillStepsHeadingStyle}>正在执行</div>
      {steps.map((step) => (
        <div key={`${step.skill}-${step.stepId}`} style={skillStepLineStyle}>
          <span style={skillStepStatusStyle(step.status)}>
            {step.status === "running"
              ? "○"
              : step.status === "completed"
                ? "✓"
                : step.status === "error"
                  ? "✗"
                  : "–"}
          </span>
          <span>
            {step.label}
            {step.detail ? ` · ${step.detail}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function getThinkingProgress(params: {
  hasContent: boolean;
  isStreaming: boolean;
  skillSteps: SkillStepProgress[];
  hasEmbeddedCard: boolean;
}) {
  const { hasContent, isStreaming, skillSteps, hasEmbeddedCard } = params;
  if (!isStreaming) return 100;
  if (hasContent) return hasEmbeddedCard ? 88 : 76;
  if (!skillSteps.length) return 18;

  const completed = skillSteps.filter((step) => step.status === "completed").length;
  const errored = skillSteps.filter((step) => step.status === "error").length;
  const base = Math.round(((completed + errored) / skillSteps.length) * 62);
  return Math.min(84, Math.max(24, 24 + base));
}

function ThinkingProgressPanel({
  isStreaming,
  progressPercent,
  text,
  hasContent,
}: {
  isStreaming: boolean;
  progressPercent: number;
  text: string;
  hasContent: boolean;
}) {
  return (
    <details style={thinkingBlockStyle} open={isStreaming}>
      <summary style={thinkingSummaryStyle}>
        <span>{isStreaming ? "处理过程" : "处理完成"}</span>
        <span style={thinkingPercentStyle}>{progressPercent}%</span>
      </summary>
      <div style={thinkingProgressTrackStyle}>
        <div style={thinkingProgressBarStyle(progressPercent, isStreaming)} />
      </div>
      <div style={thinkingBlockBodyStyle}>{text}</div>
    </details>
  );
}

export function StreamingAssistantReply({
  active,
  isStreaming,
  streamingText,
  streamingThinkingText = "",
  skillSteps,
  streamingTranslationForm,
  streamingGenerateCard,
  streamingGeneratePayload,
  streamingPictureTranslateCard = false,
  streamingPictureTranslatePayload,
  streamingImageGenerationCard = false,
  streamingImageGenerationPayload,
  streamingBatchTasksCard = false,
  streamingBatchTasksPayload,
  workspaceBatchProducts = [],
}: StreamingAssistantReplyProps) {
  if (!active) return null;

  const streamingTranslationPayload = streamingTranslationForm
    ? coerceTranslationTaskFormPayload(streamingTranslationForm)
    : undefined;
  const streamingProductImprovePayload =
    streamingGeneratePayload as ProductImproveCardPayload | undefined;
  const streamingPictureTranslateFormPayload =
    streamingPictureTranslatePayload as PictureTranslateFormPayload | undefined;
  const streamingImageGenerationFormPayload =
    streamingImageGenerationPayload as ImageGenerationFormPayload | undefined;
  const streamingBatchTasksResolvedPayload = streamingBatchTasksPayload
    ? mergeBatchTasksPayloadWithContext(streamingBatchTasksPayload, workspaceBatchProducts)
    : undefined;
  const showProductImproveCard =
    streamingGenerateCard && !streamingBatchTasksCard && workspaceBatchProducts.length < 2;
  const hasContent = hasStreamingVisualContent({
    streamingText,
    skillSteps,
    streamingTranslationForm,
    streamingGenerateCard: showProductImproveCard,
    streamingPictureTranslateCard,
    streamingImageGenerationCard,
    streamingBatchTasksCard,
  });
  const hasEmbeddedCard = Boolean(
    streamingTranslationPayload ||
      showProductImproveCard ||
      streamingPictureTranslateCard ||
      streamingImageGenerationCard ||
      streamingBatchTasksCard,
  );
  const thinkingProgressPercent = getThinkingProgress({
    hasContent,
    isStreaming,
    skillSteps,
    hasEmbeddedCard,
  });

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{ maxWidth: hasEmbeddedCard ? "min(540px, 96%)" : "80%", width: "100%" }}>
        <div style={assistantBubbleShellStyle}>
          <s-box padding="base" borderRadius="base" background="transparent">
            <div style={{ marginBottom: "0.25rem" }}>
              <s-badge tone="neutral">AI Assistant</s-badge>
            </div>
            <div style={{ marginTop: "0.35rem", minHeight: !hasContent ? "3rem" : undefined }}>
              {!hasContent && !streamingThinkingText ? (
                <div style={thinkingWrapStyle}>
                  <ThinkingDots />
                  <ChatStreamingSkeleton />
                </div>
              ) : null}

              {skillSteps.length > 0 ? <StreamingSkillSteps steps={skillSteps} /> : null}

              {streamingText ? (
                <div style={textWrapStyle}>
                  <ChatMessageContent content={streamingText} />
                  {isStreaming ? <StreamingCursor /> : null}
                </div>
              ) : null}

              {streamingTranslationPayload ? (
                <div style={cardSlotStyle}>
                  <TranslationTaskChatCard
                    embedded
                    initialPayload={streamingTranslationPayload as TranslationTaskFormPayload}
                    onSuccess={() => {}}
                  />
                </div>
              ) : null}

              {showProductImproveCard ? (
                <div style={cardSlotStyle}>
                  <ProductImproveChatCard embedded initialResult={streamingProductImprovePayload} />
                </div>
              ) : null}

              {streamingPictureTranslateCard ? (
                <div style={cardSlotStyle}>
                  <PictureTranslateChatCard
                    embedded
                    initialFormPayload={streamingPictureTranslateFormPayload}
                  />
                </div>
              ) : null}

              {streamingImageGenerationCard ? (
                <div style={cardSlotStyle}>
                  <ImageGenerationChatCard
                    embedded
                    initialFormPayload={streamingImageGenerationFormPayload}
                  />
                </div>
              ) : null}

              {streamingBatchTasksCard ? (
                <div style={cardSlotStyle}>
                  <BatchTasksChatCard
                    embedded
                    initialPayload={streamingBatchTasksResolvedPayload}
                    contextProducts={workspaceBatchProducts}
                  />
                </div>
              ) : null}

              {streamingThinkingText ? (
                <ThinkingProgressPanel
                  isStreaming={isStreaming}
                  progressPercent={thinkingProgressPercent}
                  text={streamingThinkingText}
                  hasContent={hasContent}
                />
              ) : null}
            </div>
          </s-box>
        </div>
      </div>
    </div>
  );
}

const thinkingWrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const thinkingBlockStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(44, 110, 203, 0.2)",
  background: "rgba(44, 110, 203, 0.04)",
  padding: "10px 12px",
  marginTop: 10,
};

const thinkingSummaryStyle: CSSProperties = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(44, 110, 203, 0.8)",
  userSelect: "none",
};

const thinkingPercentStyle: CSSProperties = {
  flexShrink: 0,
  color: "#61666c",
  fontVariantNumeric: "tabular-nums",
};

const thinkingProgressTrackStyle: CSSProperties = {
  position: "relative",
  height: 6,
  overflow: "hidden",
  borderRadius: 999,
  background: "rgba(44, 110, 203, 0.12)",
  margin: "9px 0 8px",
};

const thinkingProgressBarStyle = (
  percent: number,
  isStreaming: boolean,
): CSSProperties => ({
  width: `${Math.max(0, Math.min(100, percent))}%`,
  height: "100%",
  borderRadius: 999,
  background: isStreaming
    ? "linear-gradient(90deg, #2c6ecb, #35b486)"
    : "#008060",
  transition: "width 240ms ease",
});

const thinkingBlockBodyStyle: CSSProperties = {
  fontSize: 13,
  color: "#61666c",
  fontStyle: "italic",
  whiteSpace: "pre-wrap",
  maxHeight: 180,
  overflowY: "auto",
  lineHeight: 1.6,
};

const thinkingTextStyle: CSSProperties = {
  fontSize: 14,
  color: "#61666c",
  fontStyle: "italic",
};

const textWrapStyle: CSSProperties = {
  marginTop: 2,
};

const cursorStyle: CSSProperties = {
  display: "inline-block",
  marginLeft: 2,
  color: "#2c6ecb",
};

const cardSlotStyle: CSSProperties = {
  marginTop: "0.85rem",
};

const skillStepsWrapStyle: CSSProperties = {
  marginBottom: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(44, 110, 203, 0.06)",
  border: "1px solid rgba(44, 110, 203, 0.18)",
  display: "grid",
  gap: 6,
};

const skillStepsHeadingStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(44, 110, 203, 0.85)",
};

const skillStepLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: 13,
  color: "#61666c",
  lineHeight: 1.5,
};

const skillStepStatusStyle = (status: SkillStepProgress["status"]): CSSProperties => ({
  width: 14,
  flexShrink: 0,
  textAlign: "center",
  color:
    status === "running"
      ? "rgba(44, 110, 203, 0.85)"
      : status === "completed"
        ? "#008060"
        : status === "error"
          ? "#d72c0d"
          : "rgba(0, 0, 0, 0.35)",
});
