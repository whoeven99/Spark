import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { ProductImproveCardPayload } from "../../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import { ChatMessageContent } from "./ChatMessageContent";
import { ThinkingIndicator, ThinkingPanel } from "./StreamingThinking";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { TranslationTaskChatCard } from "../translation/TranslationTaskChatCard";
import { TaskProposalCard } from "./TaskProposalCard";
import type { TaskProposalPayload } from "../../../lib/taskProposalPayload";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
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
  streamingTaskProposal?: TaskProposalPayload;
  workspaceBatchProducts?: BatchTaskProduct[];
  /** 工作台按条件圈定的商品 query（TaskProposal 兜底 targets 用） */
  workspaceProductQuery?: ObjectQuerySelection | null;
  /** TaskProposal 执行成功（向对话追加「任务已开始」新一轮） */
  onTaskProposalExecuted?: (run: TaskRunPayload) => void;
};

const PLAYBOOK_RUN_META: Record<
  string,
  { title: string; icon: string; reviewMetrics: string[] }
> = {
  shopHealthCheck: {
    title: "经营体检 Playbook",
    icon: "OPS",
    reviewMetrics: ["activeRiskCount", "openTaskCount", "salesAmount7d"],
  },
  productLaunchPipeline: {
    title: "上新流水线 Playbook",
    icon: "NEW",
    reviewMetrics: ["completenessScore", "missingFields"],
  },
  inventoryRiskMitigation: {
    title: "库存止损 Playbook",
    icon: "INV",
    reviewMetrics: ["riskSkuCount", "estimatedInventoryLoss"],
  },
  refundIssueReview: {
    title: "退款治理 Playbook",
    icon: "REF",
    reviewMetrics: ["refundRate30d", "refundRateDelta", "topRefundSkus"],
  },
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
  const playbookGroups: Array<{
    skill: string;
    meta: (typeof PLAYBOOK_RUN_META)[string];
    steps: SkillStepProgress[];
  }> = [];
  const atomicSteps: SkillStepProgress[] = [];

  for (const step of steps) {
    const meta = PLAYBOOK_RUN_META[step.skill];
    if (!meta) {
      atomicSteps.push(step);
      continue;
    }
    let group = playbookGroups.find((item) => item.skill === step.skill);
    if (!group) {
      group = { skill: step.skill, meta, steps: [] };
      playbookGroups.push(group);
    }
    group.steps.push(step);
  }

  return (
    <div style={skillStepStackStyle}>
      {playbookGroups.map((group) => (
        <PlaybookRunCard
          key={group.skill}
          title={group.meta.title}
          icon={group.meta.icon}
          steps={group.steps}
          reviewMetrics={group.meta.reviewMetrics}
        />
      ))}
      {atomicSteps.length > 0 ? (
        <div style={skillStepsWrapStyle}>
          <div style={skillStepsHeadingStyle}>正在执行</div>
          {atomicSteps.map((step) => (
            <SkillStepLine key={`${step.skill}-${step.stepId}`} step={step} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlaybookRunCard({
  title,
  icon,
  steps,
  reviewMetrics,
}: {
  title: string;
  icon: string;
  steps: SkillStepProgress[];
  reviewMetrics: string[];
}) {
  const completed = steps.filter((step) => step.status === "completed").length;
  const hasError = steps.some((step) => step.status === "error");
  const running = steps.some((step) => step.status === "running");
  const statusText = hasError
    ? "执行异常"
    : running
      ? "执行中"
      : completed === steps.length
        ? "已完成"
        : "排队中";
  const progressPercent =
    steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;

  return (
    <div style={playbookRunCardStyle}>
      <div style={playbookRunHeaderStyle}>
        <div style={playbookRunTitleWrapStyle}>
          <div style={playbookRunIconStyle}>{icon}</div>
          <div>
            <div style={playbookRunEyebrowStyle}>Playbook Run</div>
            <div style={playbookRunTitleStyle}>{title}</div>
          </div>
        </div>
        <span style={playbookRunStatusStyle(hasError ? "error" : running ? "running" : "completed")}>
          {statusText}
        </span>
      </div>
      <div style={playbookProgressTrackStyle}>
        <div style={playbookProgressFillStyle(progressPercent)} />
      </div>
      <div style={playbookRunSectionStyle}>
        <div style={playbookRunSectionTitleStyle}>执行步骤</div>
        <div style={playbookRunStepListStyle}>
          {steps.map((step) => (
            <SkillStepLine key={`${step.skill}-${step.stepId}`} step={step} compact />
          ))}
        </div>
      </div>
      {reviewMetrics.length > 0 ? (
        <div style={playbookReviewStyle}>
          <span style={playbookRunSectionTitleStyle}>复盘指标</span>
          <span>{reviewMetrics.join(" / ")}</span>
        </div>
      ) : null}
    </div>
  );
}

function SkillStepLine({
  step,
  compact = false,
}: {
  step: SkillStepProgress;
  compact?: boolean;
}) {
  return (
    <div style={compact ? compactSkillStepLineStyle : skillStepLineStyle}>
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
  streamingTaskProposal,
  workspaceBatchProducts = [],
  workspaceProductQuery = null,
  onTaskProposalExecuted,
}: StreamingAssistantReplyProps) {
  if (!active) return null;

  const streamingTranslationPayload = streamingTranslationForm
    ? coerceTranslationTaskFormPayload(streamingTranslationForm)
    : undefined;
  const streamingProductImprovePayload =
    streamingGeneratePayload as ProductImproveCardPayload | undefined;
  const showProductImproveCard =
    streamingGenerateCard &&
    !streamingTaskProposal &&
    workspaceBatchProducts.length < 2;
  const hasContent = hasStreamingVisualContent({
    streamingText,
    skillSteps,
    streamingTranslationForm,
    streamingGenerateCard: showProductImproveCard,
    streamingTaskProposal,
  });
  const hasEmbeddedCard = Boolean(
    streamingTranslationPayload ||
      showProductImproveCard ||
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

              {streamingTaskProposal ? (
                <div style={cardSlotStyle}>
                  <TaskProposalCard
                    embedded
                    proposal={streamingTaskProposal}
                    contextProducts={workspaceBatchProducts}
                    contextProductQuery={workspaceProductQuery}
                    onExecuted={onTaskProposalExecuted}
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

const skillStepStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 10,
};

const skillStepsWrapStyle: CSSProperties = {
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

const compactSkillStepLineStyle: CSSProperties = {
  ...skillStepLineStyle,
  fontSize: 12,
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

const playbookRunCardStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(44, 110, 203, 0.22)",
  background: "#ffffff",
  padding: 12,
  display: "grid",
  gap: 10,
};

const playbookRunHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
};

const playbookRunTitleWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const playbookRunIconStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "#f1f6ff",
  border: "1px solid rgba(44, 110, 203, 0.18)",
  color: "#2c6ecb",
  display: "grid",
  placeItems: "center",
  fontSize: 10,
  fontWeight: 800,
  flexShrink: 0,
};

const playbookRunEyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6d7175",
};

const playbookRunTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#1f2124",
};

const playbookRunStatusStyle = (
  status: "running" | "completed" | "error",
): CSSProperties => ({
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 700,
  color:
    status === "error" ? "#d72c0d" : status === "running" ? "#8a6116" : "#008060",
  background:
    status === "error" ? "#fff0ee" : status === "running" ? "#fff7e0" : "#e9f7ef",
  whiteSpace: "nowrap",
});

const playbookProgressTrackStyle: CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: "#eef0f2",
  overflow: "hidden",
};

const playbookProgressFillStyle = (percent: number): CSSProperties => ({
  width: `${Math.max(0, Math.min(100, percent))}%`,
  height: "100%",
  borderRadius: 999,
  background: "#2c6ecb",
  transition: "width 0.2s ease",
});

const playbookRunSectionStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const playbookRunSectionTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6d7175",
};

const playbookRunStepListStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const playbookReviewStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  paddingTop: 8,
  borderTop: "1px solid #eef0f2",
  fontSize: 12,
  color: "#61666c",
};
