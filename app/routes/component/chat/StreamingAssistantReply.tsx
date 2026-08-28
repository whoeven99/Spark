import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProductImproveCardPayload } from "../../../lib/chatMessage";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import { ChatMessageContent } from "./ChatMessageContent";
import { ThinkingIndicator, ThinkingPanel } from "./StreamingThinking";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { TaskProposalCard } from "./TaskProposalCard";
import type { TaskProposalPayload } from "../../../lib/taskProposalPayload";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import { SparkMark } from "../common/SparkMark";
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
  streamingGenerateCard: boolean;
  streamingGeneratePayload?: unknown;
  streamingTaskProposal?: TaskProposalPayload;
  workspaceBatchProducts?: BatchTaskProduct[];
  /** 工作台按条件圈定的商品 query（TaskProposal 兜底 targets 用） */
  workspaceProductQuery?: ObjectQuerySelection | null;
  /** 打开与底部工具栏相同的商品选择弹窗 */
  onOpenProductPicker?: () => void;
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
  border: "none",
  background: "transparent",
};

const TOOL_LABEL_KEYS: Record<string, string> = {
  chat_card_intent: "prepareTask",
  generate_product_description: "generateDescription",
  get_current_time: "currentTime",
  get_shopify_inventory_health: "inventoryHealth",
  get_shopify_shop_info: "shopInfo",
  get_shopify_today_abandonment_rate: "abandonmentRate",
  get_shopify_today_aov: "averageOrderValue",
  get_shopify_today_conversion_rate: "conversionRate",
  get_shopify_today_order_count: "orderCount",
  get_shopify_today_refund_return_rate: "refundRate",
  get_shopify_today_sales: "sales",
  get_shopify_today_source_performance: "trafficSources",
  get_weather: "weather",
  open_batch_tasks_form: "batchTask",
  open_image_generation_form: "imageGeneration",
  open_picture_translate_form: "pictureTranslation",
  open_product_improve_form: "productCopy",
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
  const { t } = useTranslation();
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
          <div style={skillStepsHeaderStyle}>
            <div style={skillStepsHeadingStyle}>
              {t("workspace.execution.title")}
            </div>
            <span style={skillStepsCountStyle}>
              {t("workspace.execution.progress", {
                completed: atomicSteps.filter((step) => step.status === "completed").length,
                total: atomicSteps.length,
              })}
            </span>
          </div>
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
  const { t } = useTranslation();
  const toolName = step.label.startsWith("tool:") ? step.label.slice(5) : null;
  const toolLabelKey = toolName ? TOOL_LABEL_KEYS[toolName] : null;
  const label = toolName
    ? toolLabelKey
      ? t(`workspace.execution.tools.${toolLabelKey}`)
      : t("workspace.execution.tools.fallback", {
          name: toolName.replaceAll("_", " "),
        })
    : step.label;

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
      <span style={skillStepLabelStyle}>
        {label}
        {step.detail ? ` · ${step.detail}` : ""}
      </span>
      <span style={skillStepStateStyle(step.status)}>
        {t(`workspace.execution.status.${step.status}`)}
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
  streamingGenerateCard,
  streamingGeneratePayload,
  streamingTaskProposal,
  workspaceBatchProducts = [],
  workspaceProductQuery = null,
  onOpenProductPicker,
  onTaskProposalExecuted,
}: StreamingAssistantReplyProps) {
  const { t } = useTranslation();
  if (!active) return null;

  const streamingProductImprovePayload =
    streamingGeneratePayload as ProductImproveCardPayload | undefined;
  const showProductImproveCard =
    streamingGenerateCard &&
    !streamingTaskProposal &&
    workspaceBatchProducts.length < 2;
  const hasContent = hasStreamingVisualContent({
    streamingText,
    skillSteps,
    streamingGenerateCard: showProductImproveCard,
    streamingTaskProposal,
  });
  const hasEmbeddedCard = Boolean(showProductImproveCard || streamingTaskProposal);

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{ maxWidth: hasEmbeddedCard ? "min(540px, 96%)" : "80%", width: "100%" }}>
        <div style={assistantBubbleShellStyle}>
          <s-box padding="base" borderRadius="base" background="transparent">
            <div style={assistantIdentityStyle}>
              <span style={assistantAvatarStyle}>
                <SparkMark size={24} />
              </span>
              <span>{t("workspace.shell.brand.name")}</span>
            </div>
            <div style={{ marginTop: "0.35rem", minHeight: !hasContent ? "3rem" : undefined }}>
              {!hasContent && !streamingThinkingText ? (
                <div style={thinkingWrapStyle}>
                  <ThinkingIndicator label={t("workspace.execution.preparing")} />
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
                    onOpenProductPicker={onOpenProductPicker}
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

const assistantIdentityStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 8,
  color: "#5c6370",
  fontSize: 12,
  fontWeight: 700,
};

const assistantAvatarStyle: CSSProperties = {
  width: 24,
  height: 24,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  overflow: "hidden",
  flexShrink: 0,
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

const skillStepsHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const skillStepsCountStyle: CSSProperties = {
  padding: "2px 7px",
  borderRadius: 999,
  background: "#eef4ff",
  color: "#2c6ecb",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const skillStepLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: 13,
  color: "#61666c",
  lineHeight: 1.5,
};

const skillStepLabelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const skillStepStateStyle = (
  status: SkillStepProgress["status"],
): CSSProperties => ({
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 600,
  color:
    status === "running"
      ? "#2c6ecb"
      : status === "completed"
        ? "#008060"
        : status === "error"
          ? "#d72c0d"
          : "#8c9196",
});

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
