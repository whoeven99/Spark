/** 工作台对话 Panel：消息列表 + 输入区 + 上下文工具栏（从 WorkspaceAppShellPage 拆出）。 */
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatMessages } from "../../component/chat/ChatMessages";
import { StreamingAssistantReply } from "../../component/chat/StreamingAssistantReply";
import { ContextWindowIndicator } from "../../component/chat/ContextWindowIndicator";
import { estimateMessagesTokens } from "../../../lib/tokenEstimate";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { useChatStream } from "../chat/useChatStream";
import { ChatContextSidebar } from "./ChatContextSidebar";
import { ContextToolModal } from "./ContextToolModal";
import {
  formatConversationTimestamp,
  workspaceMessageToChatMessage,
} from "./messageTransforms";
import {
  type ContextTool,
  type Conversation,
  type ConversationTaskRunEntry,
  type WorkspaceConversationMessage,
} from "./types";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import {
  resolveTaskRunTitle,
  skillIdFromAiTaskType,
} from "../../../lib/taskProposalDisplay";
import type { WorkspaceContextController } from "./useWorkspaceContext";
import { useConversationTaskStatuses } from "./useConversationTaskStatuses";
import {
  shouldOpenInPageReview,
  type OpenWorkspaceTasksOptions,
} from "../../../lib/productImproveDeepLink";
import { ProductImproveReviewDialog } from "../../component/productImprove/ProductImproveReviewDialog";
import {
  chatLayoutStyle,
  composerBoxStyle,
  composerSurfaceStyle,
  conversationMetaRowStyle,
  conversationMetaTitleStyle,
  ghostButtonStyle,
  messageListStyle,
  mobileChatLayoutStyle,
  mobileConversationMetaRowStyle,
  mobileFixedComposerCardStyle,
  mobileFixedComposerWrapStyle,
  mobileSurfaceCardStyle,
  mobileTextareaStyle,
  mobileToolbarBarStyle,
  mobileToolbarIconGroupStyle,
  mobileToolbarStatusGroupStyle,
  mutedMetaStyle,
  primaryButtonStyle,
  recommendedMenuGridStyle,
  recommendedMenuItemStyle,
  recommendedMenuStyle,
  recommendedMenuTitleStyle,
  recommendedTriggerStyle,
  recommendedChevronStyle,
  scrollBottomButtonStyle,
  scrollBottomOverlayStyle,
  selectionBubbleCloseStyle,
  selectionBubbleRowStyle,
  selectionBubbleStyle,
  surfaceCardStyle,
  textareaStyle,
  toolbarBarStyle,
  toolbarClearStyle,
  toolbarCountStyle,
  toolbarDockStyle,
  toolbarContextGroupStyle,
  toolbarGroupDividerStyle,
  toolbarGroupLabelStyle,
  toolbarIconGlyphStyle,
  toolbarIconGroupStyle,
  toolbarPillButtonStyle,
  toolbarStatusGroupStyle,
  toolbarTriggerWrapStyle,
} from "./styles";

type ChatStreamController = ReturnType<typeof useChatStream>;

const MAX_CONTEXT_TOKENS = 8000;

export function ChatPanel({
  conversation,
  messages,
  draft,
  context,
  stream,
  showStreamingReply,
  onDraftChange,
  onSend,
  onRecommendedPrompt,
  onAbortStream,
  onAiTaskUpdated,
  onOpenTasks,
  onTaskProposalExecuted,
}: {
  conversation: Conversation;
  messages: WorkspaceConversationMessage[];
  draft: string;
  context: WorkspaceContextController;
  stream: ChatStreamController;
  showStreamingReply: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onRecommendedPrompt: (prompt: string) => void | Promise<void>;
  onAbortStream: () => void;
  onAiTaskUpdated: (
    conversationId: string,
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  onOpenTasks: (opts?: OpenWorkspaceTasksOptions) => void;
  /** TaskProposal 执行成功：向对话追加「任务已开始」新一轮 */
  onTaskProposalExecuted: (conversationId: string, run: TaskRunPayload) => void;
}) {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mobileComposerRef = useRef<HTMLDivElement | null>(null);
  const recommendedMenuRef = useRef<HTMLDivElement | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [isRecommendedMenuOpen, setIsRecommendedMenuOpen] = useState(false);
  const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
  const [mobileComposerHeight, setMobileComposerHeight] = useState(0);
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);

  const {
    isStreaming,
    streamingText,
    streamingThinkingText,
    streamingGenerateCard,
    streamingGeneratePayload,
    streamingTaskProposal,
    skillSteps,
  } = stream;

  const {
    activeContextTool,
    toggleContextTool,
    selectedObjectsByType,
    objectQuerySelectionByType,
    selectedFileIds,
    filledContextCount,
    clearContext,
    clearToolSelection,
    workspaceBatchProducts,
  } = context;

  const contextTokens = useMemo(
    () => estimateMessagesTokens(messages),
    [messages],
  );

  // ── 本会话任务概览：从消息流派生执行批次（taskRun + 历史 aiTask），统一轮询状态 ──
  const conversationRuns = useMemo<ConversationTaskRunEntry[]>(() => {
    const runs: ConversationTaskRunEntry[] = [];
    for (const message of messages) {
      if (message.taskRun) {
        runs.push({
          runId: message.taskRun.runId,
          skillId: message.taskRun.skillId,
          title: message.taskRun.title,
          taskIds: message.taskRun.taskIds,
          errorCount: message.taskRun.errors.length,
          paramsSummary: message.taskRun.paramsSummary,
          params: message.taskRun.params,
          startedAt: message.taskRun.startedAt,
        });
      } else if (message.aiTask) {
        const skillId = skillIdFromAiTaskType(message.aiTask.taskType);
        const fallbackTitle = message.aiTask.taskType;
        runs.push({
          runId: message.aiTask.id,
          skillId,
          title: skillId
            ? resolveTaskRunTitle({ skillId, title: fallbackTitle }, t)
            : fallbackTitle,
          taskIds: [message.aiTask.id],
          errorCount: 0,
          paramsSummary: [],
          startedAt: message.aiTask.createdAt,
        });
      }
    }
    return runs.reverse();
  }, [messages, t]);

  const conversationTaskIds = useMemo(
    () => conversationRuns.flatMap((run) => run.taskIds),
    [conversationRuns],
  );
  const showContextSidebar = filledContextCount > 0 || conversationRuns.length > 0;

  const locationSearch = typeof window !== "undefined" ? window.location.search : "";
  const { tasksById, upsertTaskStatus } = useConversationTaskStatuses(conversationTaskIds, locationSearch);

  const handleOpenTasks = useCallback(
    (opts?: OpenWorkspaceTasksOptions) => {
      if (shouldOpenInPageReview(opts)) {
        setReviewTaskId(opts.taskId);
        return;
      }
      onOpenTasks(opts);
    },
    [onOpenTasks],
  );

  const remainingPendingCount = useMemo(() => {
    if (!reviewTaskId) return 0;
    const run = conversationRuns.find((entry) => entry.taskIds.includes(reviewTaskId));
    const ids = run?.taskIds ?? [reviewTaskId];
    return ids.filter((id) => {
      if (id === reviewTaskId) return false;
      const status = tasksById[id]?.status;
      return status === "pending_review" || status === "scored";
    }).length;
  }, [reviewTaskId, conversationRuns, tasksById]);

  const locateRun = (runId: string) => {
    const el = messageListRef.current?.querySelector(
      `[data-task-run-id="${typeof CSS !== "undefined" ? CSS.escape(runId) : runId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const queryToolLabel = (type: "product" | "article", base: string) => {
    const manualCount = selectedObjectsByType[type].length;
    if (manualCount > 0) return `${base} ${manualCount}`;
    const query = objectQuerySelectionByType[type];
    if (query) {
      return query.matchCount != null
        ? `${base} ${t("workspace.shell.chat.toolQueryCount", { count: query.matchCount })}`
        : `${base} ${t("workspace.shell.chat.toolQuerySuffix")}`;
    }
    return base;
  };

  const toolItems: Array<{ key: ContextTool; label: string; icon: string; active: boolean }> = [
    { key: "product", label: queryToolLabel("product", t("workspace.shell.chat.toolProduct")), icon: "◫", active: activeContextTool === "product" },
    { key: "order", label: selectedObjectsByType.order.length > 0 ? `${t("workspace.shell.chat.toolOrder")} ${selectedObjectsByType.order.length}` : t("workspace.shell.chat.toolOrder"), icon: "◎", active: activeContextTool === "order" },
    { key: "article", label: queryToolLabel("article", t("workspace.shell.chat.toolArticle")), icon: "≣", active: activeContextTool === "article" },
    { key: "file", label: selectedFileIds.length > 0 ? `${t("workspace.shell.chat.toolFile")} ${selectedFileIds.length}` : t("workspace.shell.chat.toolFile"), icon: "↑", active: activeContextTool === "file" },
  ];
  const recommendedActions = useMemo(
    () => [
      {
        label: t("workspace.homeV2.quickPrompts.todayOperations.label"),
        prompt: t("workspace.homeV2.quickPrompts.todayOperations.prompt"),
      },
      {
        label: t("workspace.homeV2.quickPrompts.optimizeCopy.label"),
        prompt: t("workspace.homeV2.quickPrompts.optimizeCopy.prompt"),
      },
      {
        label: t("workspace.homeV2.quickPrompts.generateImage.label"),
        prompt: t("workspace.homeV2.quickPrompts.generateImage.prompt"),
      },
      {
        label: t("workspace.homeV2.quickPrompts.translateImage.label"),
        prompt: t("workspace.homeV2.quickPrompts.translateImage.prompt"),
      },
    ],
    [t],
  );

  const selectedSummaryBubbles: Array<{ key: ContextTool; label: string }> = [
    ...(selectedObjectsByType.product.length > 0
      ? [{ key: "product" as const, label: t("workspace.shell.chat.selectedProducts", { count: selectedObjectsByType.product.length }) }]
      : []),
    ...(objectQuerySelectionByType.product
      ? [{
          key: "product" as const,
          label: objectQuerySelectionByType.product.matchCount != null
            ? t("workspace.shell.chat.queryProductsApprox", { count: objectQuerySelectionByType.product.matchCount })
            : t("workspace.shell.chat.queryProducts"),
        }]
      : []),
    ...(selectedObjectsByType.order.length > 0
      ? [{ key: "order" as const, label: t("workspace.shell.chat.selectedOrders", { count: selectedObjectsByType.order.length }) }]
      : []),
    ...(selectedObjectsByType.article.length > 0
      ? [{ key: "article" as const, label: t("workspace.shell.chat.selectedArticles", { count: selectedObjectsByType.article.length }) }]
      : []),
    ...(objectQuerySelectionByType.article
      ? [{
          key: "article" as const,
          label: objectQuerySelectionByType.article.matchCount != null
            ? t("workspace.shell.chat.queryArticlesApprox", { count: objectQuerySelectionByType.article.matchCount })
            : t("workspace.shell.chat.queryArticles"),
        }]
      : []),
    ...(selectedFileIds.length > 0
      ? [{ key: "file" as const, label: t("workspace.shell.chat.selectedFiles", { count: selectedFileIds.length }) }]
      : []),
  ];

  /**
   * 即时滚到底部（流式期间用，不触发 smooth 动画避免和下一帧的赋值互相打架）。
   * smooth=true 仅用于用户主动点击"查看最新消息"按钮。
   */
  const scrollToBottom = (smooth = false) => {
    const el = messageListRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  };

  const handleMessageListScroll = () => {
    const el = messageListRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsScrolledUp(!atBottom);
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void onSend();
  };

  const focusComposerInput = () => {
    const ta = textareaRef.current;
    if (!ta || isStreaming) return;
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  };

  // 会话切换、新消息落地、流式气泡首次出现时：等下一帧 DOM 高度稳定后再滚底部
  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;
    const raf = requestAnimationFrame(() => {
      if (!messageListRef.current) return;
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      setIsScrolledUp(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [conversation.id, messages.length, showStreamingReply]);

  // 流式过程中自动追底：思考文字、正文、skill steps 任一增长都触发
  useEffect(() => {
    if (!showStreamingReply || isScrolledUp) return;
    scrollToBottom(); // instant，避免与下一帧 smooth 互相打架
  }, [showStreamingReply, streamingText, streamingThinkingText, skillSteps.length, isStreaming, isScrolledUp]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    focusComposerInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, isStreaming]);

  useEffect(() => {
    if (!isRecommendedMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!recommendedMenuRef.current?.contains(event.target as Node)) {
        setIsRecommendedMenuOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsRecommendedMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isRecommendedMenuOpen]);

  useEffect(() => {
    if (!isMobile) {
      setMobileKeyboardInset(0);
      return;
    }
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardInset = () => {
      const nextViewport = window.visualViewport;
      if (!nextViewport) return;
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - nextViewport.height - nextViewport.offsetTop),
      );
      setMobileKeyboardInset(inset);
    };

    updateKeyboardInset();
    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);
    window.addEventListener("orientationchange", updateKeyboardInset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
      window.removeEventListener("orientationchange", updateKeyboardInset);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      setMobileComposerHeight(0);
      return;
    }

    const composerElement = mobileComposerRef.current;
    if (!composerElement) return;

    const updateComposerHeight = () => {
      setMobileComposerHeight(Math.ceil(composerElement.getBoundingClientRect().height));
    };

    updateComposerHeight();
    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(() => {
      updateComposerHeight();
    });
    resizeObserver.observe(composerElement);

    return () => resizeObserver.disconnect();
  }, [isMobile, draft, selectedSummaryBubbles.length, filledContextCount, isStreaming]);

  const mobileComposerOffset = isMobile ? mobileComposerHeight + 18 : 0;

  const composerContent = (
    <div style={isMobile ? mobileFixedComposerCardStyle : composerSurfaceStyle}>
      {selectedSummaryBubbles.length > 0 ? (
        <div style={selectionBubbleRowStyle}>
          {selectedSummaryBubbles.map((item) => (
            <span key={item.key} style={selectionBubbleStyle}>
              <span>{item.label}</span>
              <button type="button" style={selectionBubbleCloseStyle} onClick={() => clearToolSelection(item.key)} aria-label={t("workspace.shell.chat.clearSelectionAria", { label: item.label })}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {/* 纯净 IA：暂不展示 Playbook 快捷条；服务端 Playbook 也已临时全部屏蔽。 */}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleTextareaKeyDown}
        className="workspace-composer-input"
        style={isMobile ? mobileTextareaStyle : textareaStyle}
        placeholder={t("workspace.shell.chat.composerPlaceholder")}
        disabled={isStreaming}
      />
      <div style={toolbarDockStyle}>
        <div style={isMobile ? mobileToolbarBarStyle : toolbarBarStyle}>
          <div style={isMobile ? mobileToolbarIconGroupStyle : toolbarIconGroupStyle}>
            <div style={toolbarContextGroupStyle}>
              <span style={toolbarGroupLabelStyle}>
                {t("workspace.shell.chat.addContext")}
              </span>
              {toolItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  style={toolbarPillButtonStyle(item.active)}
                  onClick={() => toggleContextTool(item.key)}
                  title={item.label}
                >
                  <span style={toolbarIconGlyphStyle}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            {!isMobile ? <span aria-hidden="true" style={toolbarGroupDividerStyle} /> : null}
            <div ref={recommendedMenuRef} style={toolbarTriggerWrapStyle}>
              <button
                type="button"
                className="workspace-recommended-trigger"
                style={recommendedTriggerStyle(isRecommendedMenuOpen)}
                onClick={() => setIsRecommendedMenuOpen((open) => !open)}
                disabled={isStreaming}
                aria-expanded={isRecommendedMenuOpen}
                aria-haspopup="menu"
              >
                <span style={toolbarIconGlyphStyle}>✦</span>
                <span>{t("workspace.shell.chat.recommended")}</span>
                <span aria-hidden="true" style={recommendedChevronStyle}>
                  ⌄
                </span>
              </button>
              {isRecommendedMenuOpen ? (
                <div style={recommendedMenuStyle} role="menu">
                  <div style={recommendedMenuTitleStyle}>
                    {t("workspace.shell.chat.recommendedActions")}
                  </div>
                  <div style={recommendedMenuGridStyle}>
                    {recommendedActions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        className="workspace-recommended-action"
                        style={recommendedMenuItemStyle}
                        role="menuitem"
                        onClick={() => {
                          setIsRecommendedMenuOpen(false);
                          void onRecommendedPrompt(action.prompt);
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div style={isMobile ? mobileToolbarStatusGroupStyle : toolbarStatusGroupStyle}>
            {filledContextCount > 0 ? (
              <>
                <span style={toolbarCountStyle}>
                  {t("workspace.shell.chat.contextCount", {
                    count: filledContextCount,
                  })}
                </span>
                <button type="button" style={toolbarClearStyle} onClick={clearContext}>
                  {t("workspace.shell.chat.clearContext")}
                </button>
              </>
            ) : null}
            <span style={mutedMetaStyle}>
              {isStreaming
                ? t("workspace.shell.chat.replying")
                : t("workspace.shell.chat.keyboardHint")}
            </span>
            <ContextWindowIndicator
              currentTokens={contextTokens}
              maxTokens={MAX_CONTEXT_TOKENS}
            />
            {isStreaming ? (
              <button type="button" style={ghostButtonStyle} onClick={onAbortStream}>
                {t("workspace.shell.chat.stop")}
              </button>
            ) : null}
            <button
              type="button"
              className="workspace-primary-btn"
              style={{ ...primaryButtonStyle, opacity: isStreaming ? 0.6 : 1 }}
              onClick={() => void onSend()}
              disabled={isStreaming}
            >
              {isStreaming
                ? t("workspace.shell.chat.sending")
                : t("workspace.shell.chat.send")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={
        isMobile
          ? { ...mobileChatLayoutStyle, paddingBottom: mobileComposerOffset }
          : {
              ...chatLayoutStyle,
              gridTemplateColumns: showContextSidebar
                ? "minmax(0, 1fr) 320px"
                : "minmax(0, 1fr)",
            }
      }
    >
      <section
        style={{
          ...(isMobile ? mobileSurfaceCardStyle : surfaceCardStyle),
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...(isMobile
            ? {
                minHeight: `calc(100dvh - ${Math.max(mobileComposerOffset + 168, 320)}px)`,
              }
            : {}),
        }}
      >
        <div style={isMobile ? mobileConversationMetaRowStyle : conversationMetaRowStyle}>
          <span style={conversationMetaTitleStyle}>{conversation.title}</span>
          <span style={mutedMetaStyle}>{formatConversationTimestamp(conversation.updatedAt)}</span>
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <div
            ref={messageListRef}
            style={isMobile ? { ...messageListStyle, paddingBottom: 12 } : messageListStyle}
            onScroll={handleMessageListScroll}
          >
            <ChatMessages
              messages={messages.map((message) => workspaceMessageToChatMessage(message))}
              streamingSlot={
                <StreamingAssistantReply
                  active={showStreamingReply}
                  isStreaming={isStreaming}
                  streamingText={streamingText}
                  streamingThinkingText={streamingThinkingText}
                  skillSteps={skillSteps}
                  streamingGenerateCard={streamingGenerateCard}
                  streamingGeneratePayload={streamingGeneratePayload}
                  streamingTaskProposal={streamingTaskProposal}
                  workspaceBatchProducts={workspaceBatchProducts}
                  workspaceProductQuery={objectQuerySelectionByType.product}
                  onTaskProposalExecuted={(run) =>
                    onTaskProposalExecuted(conversation.id, run)
                  }
                />
              }
              onAiTaskUpdated={(taskId, status, result) => {
                upsertTaskStatus(taskId, status, result);
                onAiTaskUpdated(conversation.id, taskId, status, result);
              }}
              onOpenTasks={handleOpenTasks}
              onTaskProposalExecuted={(run) =>
                onTaskProposalExecuted(conversation.id, run)
              }
              tasksById={tasksById}
              workspaceBatchProducts={workspaceBatchProducts}
            />
          </div>
          {isScrolledUp ? (
            <div style={scrollBottomOverlayStyle}>
              <button type="button" style={scrollBottomButtonStyle} onClick={() => scrollToBottom(true)}>
                ↓ {t("workspace.shell.chat.jumpToLatest")}
              </button>
            </div>
          ) : null}
        </div>

        {!isMobile ? <div style={composerBoxStyle}>{composerContent}</div> : null}
      </section>

      {isMobile ? (
        <div
          ref={mobileComposerRef}
          style={mobileFixedComposerWrapStyle(mobileKeyboardInset)}
        >
          {composerContent}
        </div>
      ) : null}

      <ContextToolModal context={context} />

      <ProductImproveReviewDialog
        open={Boolean(reviewTaskId)}
        taskId={reviewTaskId}
        cachedTask={reviewTaskId ? tasksById[reviewTaskId] : undefined}
        locationSearch={locationSearch}
        remainingPendingCount={remainingPendingCount}
        onClose={() => setReviewTaskId(null)}
        onTaskUpdated={(taskId, status, result) => {
          upsertTaskStatus(taskId, status, result);
          onAiTaskUpdated(conversation.id, taskId, status, result);
        }}
      />

      {!isMobile && showContextSidebar ? (
        <ChatContextSidebar
          context={context}
          taskRuns={conversationRuns}
          tasksById={tasksById}
          onOpenTasks={handleOpenTasks}
          onLocateRun={locateRun}
        />
      ) : null}
    </div>
);
}
