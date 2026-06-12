import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { ImageGenerationFormPayload } from "../../../lib/imageGenerationFormPayload";
import type { PictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import type { ProductImproveCardPayload } from "../../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import { ChatMessageContent } from "./ChatMessageContent";
import { ThinkingIndicator, ThinkingPanel } from "./StreamingThinking";
import { ImageGenerationChatCard } from "./ImageGenerationChatCard";
import { PictureTranslateChatCard } from "./PictureTranslateChatCard";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { TranslationTaskChatCard } from "../translation/TranslationTaskChatCard";
import { TaskProposalCard } from "./TaskProposalCard";
import type { TaskProposalPayload } from "../../../lib/taskProposalPayload";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
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
  streamingTaskProposal?: TaskProposalPayload;
  workspaceBatchProducts?: BatchTaskProduct[];
  /** 工作台按条件圈定的商品 query（TaskProposal 兜底 targets 用） */
  workspaceProductQuery?: ObjectQuerySelection | null;
};

const assistantBubbleShellStyle: CSSProperties = {
  borderRadius: "12px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(44, 110, 203, 0.35)",
  background:
    "linear-gradient(180deg, rgba(44, 110, 203, 0.08), rgba(44, 110, 203, 0.02))",
};

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
  streamingThinkingText = "",
  skillSteps,
  streamingTranslationForm,
  streamingGenerateCard,
  streamingGeneratePayload,
  streamingPictureTranslateCard = false,
  streamingPictureTranslatePayload,
  streamingImageGenerationCard = false,
  streamingImageGenerationPayload,
  streamingTaskProposal,
  workspaceBatchProducts = [],
  workspaceProductQuery = null,
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
  const showProductImproveCard =
    streamingGenerateCard &&
    !streamingTaskProposal &&
    workspaceBatchProducts.length < 2;
  const hasContent = hasStreamingVisualContent({
    streamingText,
    skillSteps,
    streamingTranslationForm,
    streamingGenerateCard: showProductImproveCard,
    streamingPictureTranslateCard,
    streamingImageGenerationCard,
    streamingTaskProposal,
  });
  const hasEmbeddedCard = Boolean(
    streamingTranslationPayload ||
      showProductImproveCard ||
      streamingPictureTranslateCard ||
      streamingImageGenerationCard ||
      streamingTaskProposal,
  );

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
                  <ThinkingIndicator />
                </div>
              ) : null}

              {streamingThinkingText ? (
                <div style={thinkingPanelSlotStyle}>
                  <ThinkingPanel
                    isStreaming={isStreaming}
                    text={streamingThinkingText}
                    answerStarted={Boolean(streamingText) || hasEmbeddedCard}
                  />
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

              {streamingTaskProposal ? (
                <div style={cardSlotStyle}>
                  <TaskProposalCard
                    embedded
                    proposal={streamingTaskProposal}
                    contextProducts={workspaceBatchProducts}
                    contextProductQuery={workspaceProductQuery}
                  />
                </div>
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

const thinkingPanelSlotStyle: CSSProperties = {
  marginBottom: 10,
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
  background: "rgba(99, 110, 124, 0.05)",
  border: "1px solid rgba(99, 110, 124, 0.16)",
  display: "grid",
  gap: 6,
};

const skillStepsHeadingStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#5c6370",
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
