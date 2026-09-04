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
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import type { HealthDiagnosisFormPayload } from "../../../lib/healthDiagnosisCardPayload";
import {
  resolveTaskRunTitle,
  skillIdFromAiTaskType,
} from "../../../lib/taskProposalDisplay";
import type { WorkspaceContextController } from "./useWorkspaceContext";
import { useConversationTaskStatuses } from "./useConversationTaskStatuses";
import type { OpenWorkspaceTasksOptions } from "../../../lib/productImproveDeepLink";
import { buildWorkspaceRecommendedGroups } from "../../../lib/workspaceRecommendedActions";
import { ProductImproveTaskDetailPage } from "../../component/productImprove/ProductImproveTaskDetailPage";
import { PictureTranslateTaskDetailPage } from "../../component/imageStudio/PictureTranslateTaskDetailPage";
import { ImageGenerationTaskDetailPage } from "../../component/imageStudio/ImageGenerationTaskDetailPage";
import { BulkPriceEditTaskDetailPage } from "../../component/bulkPriceEdit/BulkPriceEditTaskDetailPage";
import { BulkTagEditTaskDetailPage } from "../../component/bulkTagEdit/BulkTagEditTaskDetailPage";
import { BulkStatusEditTaskDetailPage } from "../../component/bulkStatusEdit/BulkStatusEditTaskDetailPage";
import { BulkCollectionEditTaskDetailPage } from "../../component/bulkCollectionEdit/BulkCollectionEditTaskDetailPage";
import { BulkSeoEditTaskDetailPage } from "../../component/bulkSeoEdit/BulkSeoEditTaskDetailPage";
import { BulkMetafieldEditTaskDetailPage } from "../../component/bulkMetafieldEdit/BulkMetafieldEditTaskDetailPage";
import { BulkPriceImportTaskDetailPage } from "../../component/bulkPriceImport/BulkPriceImportTaskDetailPage";
import { BulkCostImportTaskDetailPage } from "../../component/bulkCostImport/BulkCostImportTaskDetailPage";
import { BulkInventoryImportTaskDetailPage } from "../../component/bulkInventoryImport/BulkInventoryImportTaskDetailPage";
import { DialogShell } from "../../component/shared/DialogShell";
import { pageColorTokens } from "../pageUiStyles";

import {
  isChatInlineReviewTask,
  resolveChatReviewDialogTitleKey,
} from "../../component/chat/chatInlineReviewTasks";
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
  recommendedMenuGroupLabelStyle,
  recommendedMenuGroupStyle,
  recommendedMenuItemBadgeStyle,
  recommendedMenuItemIconStyle,
  recommendedMenuItemLabelStyle,
  recommendedMenuItemStyle,
  recommendedMenuStyle,
  recommendedMenuTitleIconStyle,
  recommendedMenuTitleStyle,
  recommendedTriggerGlyphStyle,
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

const reviewNavButtonStyle = (disabled: boolean) =>
  ({
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: 8,
    background: disabled ? pageColorTokens.surfaceSubtle : "#fff",
    color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textPrimary,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  }) as const;

export function ChatPanel({
  conversation,
  conversationTimeZone = "UTC",
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
  onHealthDiagnosisRefreshed,
}: {
  conversation: Conversation;
  conversationTimeZone?: string;
  messages: WorkspaceConversationMessage[];
  draft: string;
  context: WorkspaceContextController;
  stream: ChatStreamController;
  showStreamingReply: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onRecommendedPrompt: (prompt: string, skillFocus?: string) => void | Promise<void>;
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
  /** 健康诊断刷新成功：向对话追加诊断结果卡 */
  onHealthDiagnosisRefreshed: (
    conversationId: string,
    payload: HealthDiagnosisFormPayload,
  ) => void;
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
  const [reviewTaskIds, setReviewTaskIds] = useState<string[]>([]);
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [reviewTask, setReviewTask] = useState<AITaskItem | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const {
    isStreaming,
    streamingText,
    streamingThinkingText,
    streamingGenerateCard,
    streamingGeneratePayload,
    streamingQualityCard,
    streamingQualityPayload,
    streamingHealthDiagnosisCard,
    streamingHealthDiagnosisPayload,
    streamingTaskProposal,
    streamingWorkspaceActions,
    skillSteps,
  } = stream;

  const {
    activeContextTool,
    toggleContextTool,
    openContextTool,
    selectedObjectsByType,
    objectQuerySelectionByType,
    selectedFileIds,
    filledContextCount,
    clearContext,
    clearToolSelection,
    workspaceBatchProducts,
  } = context;

  const handleOpenProductPicker = useCallback(() => {
    openContextTool("product");
  }, [openContextTool]);

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
          targets: message.taskRun.targets,
          startedAt: message.taskRun.startedAt,
        });
      } else if (message.aiTask) {
        const skillId = skillIdFromAiTaskType(message.aiTask.taskType);
        const fallbackTitle = message.aiTask.taskType;
        const cfg = message.aiTask.config as Record<string, unknown>;
        const result = message.aiTask.result as Record<string, unknown> | null | undefined;
        const productId =
          typeof cfg.productId === "string" && cfg.productId.trim()
            ? cfg.productId.trim()
            : null;
        const title =
          (typeof cfg.originalTitle === "string" && cfg.originalTitle.trim()) ||
          (typeof cfg.title === "string" && cfg.title.trim()) ||
          productId;
        const imageUrl =
          (typeof cfg.imageUrl === "string" && cfg.imageUrl.trim()) ||
          (typeof result?.imageUrl === "string" && result.imageUrl.trim()) ||
          null;
        runs.push({
          runId: message.aiTask.id,
          skillId,
          title: skillId
            ? resolveTaskRunTitle({ skillId, title: fallbackTitle }, t)
            : fallbackTitle,
          taskIds: [message.aiTask.id],
          errorCount: 0,
          paramsSummary: [],
          ...(productId && title
            ? {
                targets: [
                  {
                    id: productId,
                    title,
                    imageUrl,
                  },
                ],
              }
            : imageUrl
              ? {
                  targets: [
                    {
                      id: message.aiTask.id,
                      title: fallbackTitle,
                      imageUrl,
                    },
                  ],
                }
              : {}),
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

  const closeReviewDialog = useCallback(() => {
    setReviewTaskIds([]);
    setReviewTaskId(null);
    setReviewTask(null);
    setReviewLoading(false);
  }, []);

  const handleOpenTasks = useCallback(
    (opts?: OpenWorkspaceTasksOptions) => {
      if (opts?.intent === "review" && opts.taskId && isChatInlineReviewTask(opts.taskType)) {
        const nextTaskIds = Array.isArray(opts.taskIds)
          ? opts.taskIds.filter((id, index, list) => Boolean(id) && list.indexOf(id) === index)
          : [];
        const normalizedTaskIds = nextTaskIds.includes(opts.taskId)
          ? nextTaskIds
          : [...nextTaskIds, opts.taskId];
        setReviewTaskIds(normalizedTaskIds.length > 0 ? normalizedTaskIds : [opts.taskId]);
        setReviewTaskId(opts.taskId);
        return;
      }
      onOpenTasks(opts);
    },
    [onOpenTasks],
  );

  const reviewTaskIndex = useMemo(() => {
    if (!reviewTaskId) return -1;
    return reviewTaskIds.indexOf(reviewTaskId);
  }, [reviewTaskId, reviewTaskIds]);

  const reviewTaskTotal = reviewTaskIds.length;
  const canOpenPrevReviewTask = reviewTaskIndex > 0;
  const canOpenNextReviewTask =
    reviewTaskIndex >= 0 && reviewTaskIndex < reviewTaskTotal - 1;

  const openAdjacentReviewTask = useCallback(
    (direction: "prev" | "next") => {
      if (reviewTaskIndex < 0) return;
      const nextIndex = direction === "prev" ? reviewTaskIndex - 1 : reviewTaskIndex + 1;
      const nextTaskId = reviewTaskIds[nextIndex];
      if (!nextTaskId) return;
      setReviewTaskId(nextTaskId);
    },
    [reviewTaskIds, reviewTaskIndex],
  );

  useEffect(() => {
    if (!reviewTaskId) {
      setReviewTask(null);
      setReviewLoading(false);
      return;
    }

    const cached = tasksById[reviewTaskId];
    if (cached && isChatInlineReviewTask(cached.taskType)) {
      setReviewTask((prev) => (prev?.id === reviewTaskId ? prev : cached));
      setReviewLoading(false);
      return;
    }

    let alreadyLoaded = false;
    setReviewTask((prev) => {
      if (prev?.id === reviewTaskId) {
        alreadyLoaded = true;
        return prev;
      }
      return null;
    });
    if (alreadyLoaded) {
      setReviewLoading(false);
      return;
    }

    let cancelled = false;
    setReviewLoading(true);
    const query = new URLSearchParams(
      locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
    );
    void fetch(`/api/ai-task/${encodeURIComponent(reviewTaskId)}?${query.toString()}`)
      .then(async (resp) => {
        if (cancelled) return;
        if (!resp.ok) {
          closeReviewDialog();
          return;
        }
        const body = (await resp.json()) as { task?: AITaskItem };
        if (body.task && isChatInlineReviewTask(body.task.taskType)) {
          setReviewTask((prev) => (prev?.id === reviewTaskId ? prev : body.task!));
          return;
        }
        closeReviewDialog();
      })
      .catch(() => {
        if (!cancelled) closeReviewDialog();
      })
      .finally(() => {
        if (!cancelled) setReviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [closeReviewDialog, locationSearch, reviewTaskId, tasksById]);

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
  // 已选商品（含按条件圈定）时，商品优化类推荐改为针对当前上下文，并排到最前
  const hasProductContext =
    selectedObjectsByType.product.length > 0 || objectQuerySelectionByType.product != null;
  const recommendedGroups = useMemo(
    () => buildWorkspaceRecommendedGroups(t, hasProductContext),
    [hasProductContext, t],
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
    <div
      className="workspace-chat-composer"
      style={isMobile ? mobileFixedComposerCardStyle : composerSurfaceStyle}
    >
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
                <span style={recommendedTriggerGlyphStyle}>✦</span>
                <span>{t("workspace.shell.chat.recommended")}</span>
                <span aria-hidden="true" style={recommendedChevronStyle}>
                  ⌄
                </span>
              </button>
              {isRecommendedMenuOpen ? (
                <div style={recommendedMenuStyle} role="menu">
                  <div style={recommendedMenuTitleStyle}>
                    <span style={recommendedMenuTitleIconStyle} aria-hidden="true">
                      ▶
                    </span>
                    {hasProductContext
                      ? t("workspace.shell.chat.recommend.titleWithProduct")
                      : t("workspace.shell.chat.recommendedActions")}
                  </div>
                  {recommendedGroups.map((group) => (
                    <div key={group.key} style={recommendedMenuGroupStyle}>
                      <div style={recommendedMenuGroupLabelStyle}>{group.label}</div>
                      {group.items.map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          className="workspace-recommended-action"
                          style={recommendedMenuItemStyle}
                          role="menuitem"
                          onClick={() => {
                            setIsRecommendedMenuOpen(false);
                            void onRecommendedPrompt(action.prompt, action.key);
                          }}
                        >
                          <span style={recommendedMenuItemLabelStyle}>
                            <span style={recommendedMenuItemIconStyle} aria-hidden="true">
                              ▶
                            </span>
                            <span>{action.label}</span>
                          </span>
                          {action.createsTask ? (
                            <span style={recommendedMenuItemBadgeStyle}>
                              {t("workspace.shell.chat.recommend.createsTask")}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ))}
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
          <span style={mutedMetaStyle}>
            {formatConversationTimestamp(conversation.updatedAt, conversationTimeZone)}
          </span>
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
                  streamingQualityCard={streamingQualityCard}
                  streamingQualityPayload={streamingQualityPayload}
                  streamingHealthDiagnosisCard={streamingHealthDiagnosisCard}
                  streamingHealthDiagnosisPayload={streamingHealthDiagnosisPayload}
                  streamingTaskProposal={streamingTaskProposal}
                  streamingWorkspaceActions={streamingWorkspaceActions}
                  workspaceBatchProducts={workspaceBatchProducts}
                  workspaceProductQuery={objectQuerySelectionByType.product}
                  onOpenProductPicker={handleOpenProductPicker}
                  onTaskProposalExecuted={(run) =>
                    onTaskProposalExecuted(conversation.id, run)
                  }
                  onHealthDiagnosisRefreshed={(payload) =>
                    onHealthDiagnosisRefreshed(conversation.id, payload)
                  }
                  onRecommendedPrompt={onRecommendedPrompt}
                />
              }
              onAiTaskUpdated={(taskId, status, result) => {
                upsertTaskStatus(taskId, status, result);
                onAiTaskUpdated(conversation.id, taskId, status, result);
              }}
              onOpenTasks={handleOpenTasks}
              onRecommendedPrompt={onRecommendedPrompt}
              onTaskProposalExecuted={(run) =>
                onTaskProposalExecuted(conversation.id, run)
              }
              onHealthDiagnosisRefreshed={(payload) =>
                onHealthDiagnosisRefreshed(conversation.id, payload)
              }
              contextProducts={workspaceBatchProducts}
              contextProductQuery={objectQuerySelectionByType.product}
              onOpenProductPicker={handleOpenProductPicker}
              tasksById={tasksById}
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

      <DialogShell
        open={Boolean(reviewTaskId)}
        width={980}
        onClose={closeReviewDialog}
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
            }}
          >
            <span>{t(resolveChatReviewDialogTitleKey(reviewTask?.taskType))}</span>
            {reviewTaskTotal > 1 ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: pageColorTokens.textSecondary,
                }}
              >
                {`${Math.max(reviewTaskIndex + 1, 1)} / ${reviewTaskTotal}`}
              </span>
            ) : null}
          </div>
        }
        description={
          reviewTaskTotal > 1 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                width: "100%",
              }}
            >
              <span>{t("workspace.taskProposal.taskRunCard.createdCount", { count: reviewTaskTotal })}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => openAdjacentReviewTask("prev")}
                  disabled={!canOpenPrevReviewTask}
                  style={reviewNavButtonStyle(!canOpenPrevReviewTask)}
                >
                  {t("common.previous")}
                </button>
                <button
                  type="button"
                  onClick={() => openAdjacentReviewTask("next")}
                  disabled={!canOpenNextReviewTask}
                  style={reviewNavButtonStyle(!canOpenNextReviewTask)}
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          ) : undefined
        }
        destroyOnHidden
      >
        {reviewTask?.taskType === "product_improve" ? (
          <ProductImproveTaskDetailPage
            task={reviewTask}
            locationSearch={locationSearch}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "picture_translate" ? (
          <PictureTranslateTaskDetailPage
            task={reviewTask}
            locationSearch={locationSearch}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "image_generation" ? (
          <ImageGenerationTaskDetailPage
            task={reviewTask}
            locationSearch={locationSearch}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_price_edit" ? (
          <BulkPriceEditTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_tag_edit" ? (
          <BulkTagEditTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_status_edit" ? (
          <BulkStatusEditTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_collection_edit" ? (
          <BulkCollectionEditTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_seo_edit" ? (
          <BulkSeoEditTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_metafield_edit" ? (
          <BulkMetafieldEditTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_price_import" ? (
          <BulkPriceImportTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_cost_import" ? (
          <BulkCostImportTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewTask?.taskType === "bulk_inventory_import" ? (
          <BulkInventoryImportTaskDetailPage
            task={reviewTask}
            onBack={closeReviewDialog}
            showBackButton={false}
            onTaskUpdated={(taskId, status, result) => {
              upsertTaskStatus(taskId, status, result);
              setReviewTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, status, ...(result !== undefined ? { result } : {}) }
                  : prev,
              );
              onAiTaskUpdated(conversation.id, taskId, status, result);
            }}
          />
        ) : reviewLoading ? (
          <div
            style={{
              minHeight: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: pageColorTokens.textSecondary,
              fontSize: 14,
            }}
          >
            {t("common.loading")}
          </div>
        ) : null}
      </DialogShell>

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
