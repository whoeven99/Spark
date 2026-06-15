import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../../lib/chatMessage";
import { ChatMessageContent } from "./ChatMessageContent";
import { ThinkingReview } from "./StreamingThinking";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { TranslationTaskChatCard } from "../translation/TranslationTaskChatCard";
import { TaskProposalCard } from "./TaskProposalCard";
import { TaskRunChatCard } from "./TaskRunChatCard";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import { ChatEmbeddedAiTaskCard } from "./ChatEmbeddedAiTaskCard";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type ChatMessagesProps = {
  messages: ChatMessage[];
  streamingSlot?: ReactNode;
  onTranslationCardSuccess: (
    messageIndex: number,
    detail: { jobId?: string; jobIds?: string[]; message: string },
  ) => void;
  onAiTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  onOpenTasks?: () => void;
  /** TaskProposal 执行成功（工作台据此向对话追加「任务已开始」新一轮） */
  onTaskProposalExecuted?: (run: TaskRunPayload) => void;
  /** 会话级任务状态（ChatPanel 统一轮询）；提供时 TaskRunChatCard 不再自行轮询 */
  tasksById?: Record<string, AITaskItem>;
};

export function ChatMessages({
  messages,
  streamingSlot,
  onTranslationCardSuccess,
  onAiTaskUpdated,
  onOpenTasks,
  onTaskProposalExecuted,
  tasksById,
}: ChatMessagesProps) {
  const { t } = useTranslation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";
  return (
    <s-stack direction="block" gap="base">
      {messages.map((item, index) => {
        const hasTranslationCard =
          item.role === "assistant" && Boolean(item.translationTaskForm);
        const hasTaskProposalCard =
          item.role === "assistant" && Boolean(item.taskProposal);
        const hasGenerateDescriptionCard =
          item.role === "assistant" &&
          Boolean(item.productImproveCard) &&
          !hasTaskProposalCard;
        const hasAiTaskCard = item.role === "assistant" && Boolean(item.aiTask);
        const hasTaskRunCard = item.role === "assistant" && Boolean(item.taskRun);
        const imageAttachments =
          item.role === "assistant"
            ? item.attachments?.filter((attachment) => attachment.type === "image") ?? []
            : [];
        const hasImageAttachments = imageAttachments.length > 0;
        const hasEmbeddedCard =
          hasTranslationCard ||
          hasGenerateDescriptionCard ||
          hasTaskProposalCard ||
          hasTaskRunCard ||
          hasAiTaskCard ||
          hasImageAttachments;

        const bubbleShellStyle: CSSProperties = {
          borderRadius: "12px",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor:
            item.role === "assistant"
              ? "rgba(44, 110, 203, 0.35)"
              : "rgba(0, 128, 96, 0.35)",
          background:
            item.role === "assistant"
              ? "linear-gradient(180deg, rgba(44, 110, 203, 0.08), rgba(44, 110, 203, 0.02))"
              : "linear-gradient(180deg, rgba(0, 128, 96, 0.08), rgba(0, 128, 96, 0.02))",
        };

        return (
          <div
            key={`${item.role}-${index}`}
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
                <s-box padding="base" borderRadius="base" background="transparent">
                  <div style={{ marginBottom: "0.25rem" }}>
                    <s-badge tone={item.role === "assistant" ? "neutral" : "success"}>
                      {item.role === "assistant" ? "AI Assistant" : "你"}
                    </s-badge>
                  </div>
                  {item.role === "assistant" && item.thinkingContent ? (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <ThinkingReview text={item.thinkingContent} />
                    </div>
                  ) : null}
                  <div style={{ marginTop: "0.35rem" }}>
                    {item.role === "assistant" ? (
                      <ChatMessageContent content={item.content} />
                    ) : (
                      <span style={{ whiteSpace: "pre-wrap" }}>{item.content}</span>
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

                  {hasTranslationCard && item.translationTaskForm ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <TranslationTaskChatCard
                        embedded
                        initialPayload={item.translationTaskForm}
                        onSuccess={(detail) =>
                          onTranslationCardSuccess(index, detail)
                        }
                      />
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
                </s-box>
              </div>
            </div>
          </div>
        );
      })}
      {streamingSlot}
    </s-stack>
  );
}


const thinkingDetailsStyle: CSSProperties = {
  marginTop: 10,
  borderRadius: 8,
  border: "1px solid rgba(44, 110, 203, 0.2)",
  background: "rgba(44, 110, 203, 0.04)",
  padding: "6px 10px",
};

const thinkingSummaryStyle: CSSProperties = {
  cursor: "pointer",
  fontSize: 12,
  color: "rgba(44, 110, 203, 0.8)",
  fontWeight: 500,
  userSelect: "none",
};

const thinkingContentStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#61666c",
  fontStyle: "italic",
  whiteSpace: "pre-wrap",
  maxHeight: 220,
  overflowY: "auto",
  lineHeight: 1.6,
};
