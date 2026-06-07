import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { ProductImproveCardPayload } from "../../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { ChatMessageContent } from "./ChatMessageContent";
import { ChatStreamingSkeleton } from "./ChatStreamingSkeleton";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { TranslationTaskChatCard } from "../translation/TranslationTaskChatCard";
import {
  hasStreamingVisualContent,
  type SkillStepProgress,
} from "../../page/chat/useChatStream";

type StreamingAssistantReplyProps = {
  active: boolean;
  isStreaming: boolean;
  streamingText: string;
  skillSteps: SkillStepProgress[];
  streamingTranslationForm?: unknown;
  streamingGenerateCard: boolean;
  streamingGeneratePayload?: unknown;
};

function ThinkingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 450);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={thinkingTextStyle}>
      AI Assistant 正在思考
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

export function StreamingAssistantReply({
  active,
  isStreaming,
  streamingText,
  skillSteps,
  streamingTranslationForm,
  streamingGenerateCard,
  streamingGeneratePayload,
}: StreamingAssistantReplyProps) {
  if (!active) return null;

  const streamingTranslationPayload = streamingTranslationForm
    ? coerceTranslationTaskFormPayload(streamingTranslationForm)
    : undefined;
  const streamingProductImprovePayload =
    streamingGeneratePayload as ProductImproveCardPayload | undefined;
  const hasContent = hasStreamingVisualContent({
    streamingText,
    skillSteps,
    streamingTranslationForm,
    streamingGenerateCard,
  });

  return (
    <div style={wrapStyle}>
      <div style={shellStyle}>
        <div style={badgeStyle}>AI Assistant</div>

        {!hasContent ? (
          <div style={thinkingWrapStyle}>
            <ThinkingDots />
            <div style={skeletonSlotStyle}>
              <ChatStreamingSkeleton />
            </div>
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

        {streamingGenerateCard ? (
          <div style={cardSlotStyle}>
            <ProductImproveChatCard embedded initialResult={streamingProductImprovePayload} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  marginTop: "1rem",
};

const shellStyle: CSSProperties = {
  maxWidth: "min(540px, 96%)",
  minHeight: 88,
  padding: "12px 14px",
  borderRadius: 14,
  background: "linear-gradient(180deg, rgba(44, 110, 203, 0.08), rgba(44, 110, 203, 0.02))",
  border: "1px solid rgba(44, 110, 203, 0.35)",
  fontSize: 14,
  lineHeight: 1.6,
  color: "#202223",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  color: "#2c6ecb",
  background: "rgba(44, 110, 203, 0.12)",
  marginBottom: 8,
};

const thinkingWrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const thinkingTextStyle: CSSProperties = {
  fontSize: 14,
  color: "#61666c",
  fontStyle: "italic",
};

const skeletonSlotStyle: CSSProperties = {
  paddingTop: 2,
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
