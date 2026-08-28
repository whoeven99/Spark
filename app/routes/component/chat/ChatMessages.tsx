import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../../lib/chatMessage";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import type { SelectedShopifyObject } from "../../../lib/shopifyObjectTypes";
import { ChatMessageContent } from "./ChatMessageContent";
import { ThinkingReview } from "./StreamingThinking";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { TaskProposalCard } from "./TaskProposalCard";
import { TaskRunChatCard } from "./TaskRunChatCard";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import { ChatEmbeddedAiTaskCard } from "./ChatEmbeddedAiTaskCard";
import { ManagedAiResultCard } from "./ManagedAiResultCard";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import type { OpenWorkspaceTasksOptions } from "../../../lib/productImproveDeepLink";
import { SparkMark } from "../common/SparkMark";

type ChatMessagesProps = {
  messages: ChatMessage[];
  streamingSlot?: ReactNode;
  onAiTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  onOpenTasks?: (opts?: OpenWorkspaceTasksOptions) => void;
  /** TaskProposal 执行成功（工作台据此向对话追加「任务已开始」新一轮） */
  onTaskProposalExecuted?: (run: TaskRunPayload) => void;
  /** 工作台已选商品，供 TaskProposalCard 空目标时补全 */
  contextProducts?: BatchTaskProduct[];
  contextProductQuery?: ObjectQuerySelection | null;
  /** 卡片内单选商品写回工作台上下文 */
  onContextProductPicked?: (product: SelectedShopifyObject) => void;
  /** 会话级任务状态（ChatPanel 统一轮询）；提供时 TaskRunChatCard 不再自行轮询 */
  tasksById?: Record<string, AITaskItem>;
};

export function ChatMessages({
  messages,
  streamingSlot,
  onAiTaskUpdated,
  onOpenTasks,
  onTaskProposalExecuted,
  contextProducts = [],
  contextProductQuery = null,
  onContextProductPicked,
  tasksById,
}: ChatMessagesProps) {
  const { t } = useTranslation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copiedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyMessage = async (index: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      return;
    }
    setCopiedIndex(index);
    if (copiedResetTimer.current) {
      clearTimeout(copiedResetTimer.current);
    }
    copiedResetTimer.current = setTimeout(() => {
      setCopiedIndex(null);
    }, 1600);
  };

  return (
    <s-stack direction="block" gap="base">
      {messages.map((item, index) => {
        const hasTaskProposalCard =
          item.role === "assistant" && Boolean(item.taskProposal);
        const hasGenerateDescriptionCard =
          item.role === "assistant" &&
          Boolean(item.productImproveCard) &&
          !hasTaskProposalCard;
        const hasAiTaskCard = item.role === "assistant" && Boolean(item.aiTask);
        const hasTaskRunCard = item.role === "assistant" && Boolean(item.taskRun);
        const hasManagedAiCard = item.role === "assistant" && Boolean(item.managedAiResult);
        const imageAttachments =
          item.role === "assistant"
            ? item.attachments?.filter((attachment) => attachment.type === "image") ?? []
            : [];
        const hasImageAttachments = imageAttachments.length > 0;
        const hasEmbeddedCard =
          hasGenerateDescriptionCard ||
          hasTaskProposalCard ||
          hasTaskRunCard ||
          hasAiTaskCard ||
          hasManagedAiCard ||
          hasImageAttachments;

        const isAssistant = item.role === "assistant";

        const bubbleShellStyle: CSSProperties = {
          borderRadius: isAssistant ? "12px" : "14px",
          borderWidth: isAssistant ? 0 : 1,
          borderStyle: "solid",
          borderColor: isAssistant ? "transparent" : "#e6e8ea",
          background: isAssistant ? "transparent" : "#f1f2f4",
          padding: isAssistant ? "16px" : "8px 13px",
        };

        return (
          <div
            key={`${item.role}-${index}`}
            className={isAssistant ? "chat-message-row" : undefined}
            {...(item.role === "assistant" && item.taskRun
              ? { "data-task-run-id": item.taskRun.runId }
              : {})}
            style={{
              display: "flex",
              justifyContent:
                item.role === "assistant" ? "flex-start" : "flex-end",
            }}
          >
            <div
              style={{
                maxWidth: hasEmbeddedCard ? "min(540px, 96%)" : "80%",
              }}
            >
              <div style={bubbleShellStyle}>
                <div>
                  {isAssistant ? (
                    <div style={assistantIdentityRowStyle}>
                      <div style={assistantIdentityStyle}>
                        <span style={assistantAvatarStyle}>
                          <SparkMark size={24} />
                        </span>
                        <span>{t("workspace.shell.brand.name")}</span>
                      </div>
                      <button
                        type="button"
                        className="chat-message-copy-btn"
                        style={copyMessageButtonStyle}
                        onClick={() => handleCopyMessage(index, item.content)}
                      >
                        {copiedIndex === index
                          ? t("workspace.shell.chat.copied")
                          : t("workspace.shell.chat.copy")}
                      </button>
                    </div>
                  ) : null}
                  {item.role === "assistant" && item.thinkingContent ? (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <ThinkingReview text={item.thinkingContent} />
                    </div>
                  ) : null}
                  {item.role === "assistant" && item.managedAiResult ? (
                    <ManagedAiResultCard result={item.managedAiResult} />
                  ) : null}
                  <div style={isAssistant ? { marginTop: "0.35rem" } : undefined}>
                    {isAssistant ? (
                      <ChatMessageContent content={item.content} />
                    ) : (
                      <span style={userMessageTextStyle}>{item.content}</span>
                    )}
                  </div>

                  {hasImageAttachments ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <s-stack direction="block" gap="small">
                        {imageAttachments.map((attachment, attachmentIndex) => (
                          <div
                            key={`${attachment.url}-${attachmentIndex}`}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.45rem",
                            }}
                          >
                            <img
                              src={attachment.url}
                              alt={attachment.alt ?? t("pictureTranslate.translatedImageAlt")}
                              loading="lazy"
                              style={{
                                display: "block",
                                maxWidth: "100%",
                                maxHeight: "520px",
                                objectFit: "contain",
                                borderRadius: "10px",
                                border: "1px solid rgba(44, 110, 203, 0.18)",
                              }}
                            />
                            <a
                              href={attachment.url}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: "0.875rem" }}
                            >
                              {t("pictureTranslate.downloadImage")}
                            </a>
                          </div>
                        ))}
                      </s-stack>
                    </div>
                  ) : null}

                  {hasGenerateDescriptionCard ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <ProductImproveChatCard
                        embedded
                        initialResult={item.productImproveCardPayload}
                      />
                    </div>
                  ) : null}

                  {hasTaskProposalCard && item.role === "assistant" && item.taskProposal ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <TaskProposalCard
                        embedded
                        proposal={item.taskProposal}
                        contextProducts={contextProducts}
                        contextProductQuery={contextProductQuery}
                        onContextProductPicked={onContextProductPicked}
                        onExecuted={onTaskProposalExecuted}
                      />
                    </div>
                  ) : null}

                  {hasTaskRunCard && item.role === "assistant" && item.taskRun ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <TaskRunChatCard
                        run={item.taskRun}
                        locationSearch={locationSearch}
                        onOpenTasks={onOpenTasks}
                        tasksById={tasksById}
                      />
                    </div>
                  ) : null}

                  {hasAiTaskCard && item.role === "assistant" && item.aiTask ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <ChatEmbeddedAiTaskCard
                        task={item.aiTask}
                        locationSearch={locationSearch}
                        onOpenTasks={onOpenTasks}
                        onTaskUpdated={onAiTaskUpdated}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {streamingSlot}
    </s-stack>
  );
}

const assistantIdentityRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
};

const userMessageTextStyle: CSSProperties = {
  display: "block",
  whiteSpace: "pre-wrap",
  fontSize: 13.5,
  lineHeight: 1.5,
  color: "#202223",
};

const assistantIdentityStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  color: "#5c6370",
  fontSize: 12,
  fontWeight: 700,
};

const copyMessageButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#8c9196",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  padding: "2px 6px",
  borderRadius: 6,
  fontFamily: "inherit",
  flexShrink: 0,
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
