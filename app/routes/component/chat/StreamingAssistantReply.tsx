import type { CSSProperties } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  chatBubbleMaxWidth,
  type ProductImproveCardPayload,
} from "../../../lib/chatMessage";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import { ChatMessageContent } from "./ChatMessageContent";
import { ThinkingIndicator, ThinkingPanel } from "./StreamingThinking";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { ProductQualityScoreChatCard } from "./ProductQualityScoreChatCard";
import { HealthDiagnosisChatCard } from "./HealthDiagnosisChatCard";
import { coerceProductQualityFormPayload } from "../../../lib/productQualityFormPayload";
import { coerceHealthDiagnosisFormPayload } from "../../../lib/healthDiagnosisCardPayload";
import type { HealthDiagnosisFormPayload } from "../../../lib/healthDiagnosisCardPayload";
import { TaskProposalCard } from "./TaskProposalCard";
import type { TaskProposalPayload } from "../../../lib/taskProposalPayload";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import { SparkMark } from "../common/SparkMark";
import { shopifyUi } from "../../page/workspace/styles";
import { WorkspaceActionsInMessage } from "./WorkspaceActionsInMessage";
import type { WorkspaceActionsPayload } from "../../../lib/workspaceSuggestedActions";
import { resolveThinkingStepLabel } from "../../../lib/thinkingSteps";
import {
  hasStreamingVisualContent,
  type SkillStepProgress,
} from "../../page/chat/chatStreamUtils";
import styles from "./StreamingAssistantReply.module.css";

/** 流式文本的订阅式数据源（由 useChatStream 提供，逐 token 更新不经过壳层 state） */
export type StreamingTextStore = {
  subscribe: (listener: () => void) => () => void;
  getText: () => string;
  getThinkingText: () => string;
};

type StreamingAssistantReplyProps = {
  active: boolean;
  isStreaming: boolean;
  textStore: StreamingTextStore;
  skillSteps: SkillStepProgress[];
  streamingGenerateCard: boolean;
  streamingGeneratePayload?: unknown;
  streamingQualityCard?: boolean;
  streamingQualityPayload?: unknown;
  streamingHealthDiagnosisCard?: boolean;
  streamingHealthDiagnosisPayload?: unknown;
  streamingTaskProposal?: TaskProposalPayload;
  streamingWorkspaceActions?: WorkspaceActionsPayload | false;
  workspaceBatchProducts?: BatchTaskProduct[];
  /** 工作台按条件圈定的商品 query（TaskProposal 兜底 targets 用） */
  workspaceProductQuery?: ObjectQuerySelection | null;
  fallbackFileId?: string;
  /** 打开与底部工具栏相同的商品选择弹窗 */
  onOpenProductPicker?: () => void;
  /** TaskProposal 执行成功（向对话追加「任务已开始」新一轮） */
  onTaskProposalExecuted?: (run: TaskRunPayload) => void;
  /** 健康诊断刷新成功（向对话追加结果卡） */
  onHealthDiagnosisRefreshed?: (payload: HealthDiagnosisFormPayload) => void;
  /** 能力介绍下方可点操作（与底部推荐同源） */
  onRecommendedPrompt?: (prompt: string, skillFocus?: string) => void | Promise<void>;
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

/** Playbook 步骤单独出卡，其余原子步骤堆进思考面板。 */
function splitSkillSteps(steps: SkillStepProgress[]) {
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

  return { playbookGroups, atomicSteps };
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

function StreamingPlaybookRuns({
  groups,
}: {
  groups: ReturnType<typeof splitSkillSteps>["playbookGroups"];
}) {
  if (groups.length === 0) return null;
  return (
    <div style={skillStepStackStyle}>
      {groups.map((group) => (
        <PlaybookRunCard
          key={group.skill}
          title={group.meta.title}
          icon={group.meta.icon}
          steps={group.steps}
          reviewMetrics={group.meta.reviewMetrics}
        />
      ))}
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
  const label = resolveThinkingStepLabel(step.label, t);

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
  textStore,
  skillSteps,
  streamingGenerateCard,
  streamingGeneratePayload,
  streamingQualityCard = false,
  streamingQualityPayload,
  streamingHealthDiagnosisCard = false,
  streamingHealthDiagnosisPayload,
  streamingTaskProposal,
  streamingWorkspaceActions = false,
  workspaceBatchProducts = [],
  workspaceProductQuery = null,
  fallbackFileId,
  onOpenProductPicker,
  onTaskProposalExecuted,
  onHealthDiagnosisRefreshed,
  onRecommendedPrompt,
}: StreamingAssistantReplyProps) {
  const { t } = useTranslation();
  const streamingText = useSyncExternalStore(textStore.subscribe, textStore.getText);
  const streamingThinkingText = useSyncExternalStore(
    textStore.subscribe,
    textStore.getThinkingText,
  );
  if (!active) return null;

  const streamingProductImprovePayload =
    streamingGeneratePayload as ProductImproveCardPayload | undefined;
  const showProductImproveCard =
    streamingGenerateCard &&
    !streamingTaskProposal &&
    workspaceBatchProducts.length < 2;
  const qualityPayload = coerceProductQualityFormPayload(streamingQualityPayload);
  const showQualityCard = streamingQualityCard;
  const healthPayload = coerceHealthDiagnosisFormPayload(streamingHealthDiagnosisPayload);
  const showHealthDiagnosisCard = streamingHealthDiagnosisCard;
  const workspaceActionsPayload = streamingWorkspaceActions || null;
  const { playbookGroups, atomicSteps } = splitSkillSteps(skillSteps);
  // 没有 reasoning 的模型也要有面板，否则步骤没地方落
  const hasThinkingPanel = Boolean(streamingThinkingText) || atomicSteps.length > 0;
  /**
   * 卡片不在正文流式期间挂：正文插在思考面板和卡片中间逐 token 生长，
   * 挂早了卡片会被一路往下顶。流结束与落库消息接管是同一帧（onFinish 里 flushSync），
   * 卡片由落库消息呈现；这里保留一帧兜底，避免交接不同帧时闪空。
   */
  const cardsVisible = !isStreaming;
  const hasContent = hasStreamingVisualContent({
    streamingText,
    skillSteps,
    streamingGenerateCard: showProductImproveCard,
    streamingQualityCard: showQualityCard,
    streamingHealthDiagnosisCard: showHealthDiagnosisCard,
    streamingTaskProposal,
  });
  const hasEmbeddedCard = Boolean(
    showProductImproveCard || showQualityCard || showHealthDiagnosisCard || streamingTaskProposal,
  );

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          // 宽度口径与落库消息一致，避免交接时横跳；卡片出现前先平滑过渡到位
          maxWidth: chatBubbleMaxWidth({ hasCard: hasEmbeddedCard }),
          width: "100%",
          transition: "max-width 180ms ease",
        }}
      >
        <div style={assistantBubbleShellStyle}>
          <s-box padding="base" borderRadius="base" background="transparent">
            <div style={assistantIdentityStyle}>
              <span style={assistantAvatarStyle}>
                <SparkMark size={24} />
              </span>
              <span>{t("workspace.shell.brand.name")}</span>
            </div>
            <div style={{ marginTop: "0.35rem", minHeight: !hasContent ? "3rem" : undefined }}>
              {!hasContent && !hasThinkingPanel ? (
                <div style={thinkingWrapStyle}>
                  <ThinkingIndicator label={t("workspace.execution.preparing")} />
                </div>
              ) : null}

              {hasThinkingPanel ? (
                <div style={thinkingPanelSlotStyle}>
                  <ThinkingPanel
                    isStreaming={isStreaming}
                    text={streamingThinkingText}
                    steps={atomicSteps.map(({ label, status }) => ({ label, status }))}
                    answerStarted={Boolean(streamingText)}
                  />
                </div>
              ) : null}

              <StreamingPlaybookRuns groups={playbookGroups} />

              {streamingText ? (
                <div className={styles.replyText} style={textWrapStyle}>
                  {isStreaming ? (
                    // 流式期间纯文本渲染：避免每个 token 对累积全文重跑 markdown 解析（O(n²)），
                    // 排版与 ChatMessageContent 根节点对齐，done 后由落库消息呈现 markdown。
                    <div style={streamingPlainTextStyle}>
                      {streamingText}
                      <StreamingCursor />
                    </div>
                  ) : (
                    <ChatMessageContent content={streamingText} />
                  )}
                </div>
              ) : null}

              {cardsVisible && showProductImproveCard ? (
                <div className={styles.cardSlot} style={cardSlotStyle}>
                  <ProductImproveChatCard embedded initialResult={streamingProductImprovePayload} />
                </div>
              ) : null}

              {cardsVisible && showQualityCard ? (
                <div className={styles.cardSlot} style={cardSlotStyle}>
                  <ProductQualityScoreChatCard
                    embedded
                    initialPayload={qualityPayload}
                    contextProducts={workspaceBatchProducts}
                    onOpenProductPicker={onOpenProductPicker}
                  />
                </div>
              ) : null}

              {cardsVisible && showHealthDiagnosisCard ? (
                <div className={styles.cardSlot} style={cardSlotStyle}>
                  <HealthDiagnosisChatCard
                    embedded
                    initialPayload={healthPayload}
                    onDiagnosisRefreshed={onHealthDiagnosisRefreshed}
                    onAskTodo={onRecommendedPrompt}
                  />
                </div>
              ) : null}

              {cardsVisible && streamingTaskProposal ? (
                <div className={styles.cardSlot} style={cardSlotStyle}>
                  <TaskProposalCard
                    embedded
                    proposal={streamingTaskProposal}
                    contextProducts={workspaceBatchProducts}
                    contextProductQuery={workspaceProductQuery}
                    fallbackFileId={fallbackFileId}
                    onOpenProductPicker={onOpenProductPicker}
                    onExecuted={onTaskProposalExecuted}
                  />
                </div>
              ) : null}

              {cardsVisible && workspaceActionsPayload && onRecommendedPrompt ? (
                <WorkspaceActionsInMessage
                  hasProductContext={workspaceBatchProducts.length > 0}
                  actions={workspaceActionsPayload}
                  disabled={isStreaming}
                  onAction={(prompt, skillFocus) => {
                    void onRecommendedPrompt(prompt, skillFocus);
                  }}
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

// 与 ChatMessageContent.module.css 的 .root 排版一致，避免纯文本 → markdown 切换时跳动
const streamingPlainTextStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: "#1f2124",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};

const cursorStyle: CSSProperties = {
  display: "inline-block",
  marginLeft: 2,
  color: shopifyUi.link,
};

const cardSlotStyle: CSSProperties = {
  marginTop: "0.85rem",
};

const skillStepStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 10,
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
      ? shopifyUi.link
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
      ? shopifyUi.link
      : status === "completed"
        ? "#008060"
        : status === "error"
          ? "#d72c0d"
          : "rgba(0, 0, 0, 0.35)",
});

const playbookRunCardStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${shopifyUi.linkBorder}`,
  background: shopifyUi.surface,
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
  background: shopifyUi.linkSurface,
  border: `1px solid ${shopifyUi.linkBorder}`,
  color: shopifyUi.link,
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
  background: shopifyUi.link,
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
