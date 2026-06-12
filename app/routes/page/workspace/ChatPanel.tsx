/** 工作台对话 Panel：消息列表 + 输入区 + 上下文工具栏（从 WorkspaceAppShellPage 拆出）。 */
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type {
  ContextTool,
  Conversation,
  WorkspaceConversationMessage,
} from "./types";
import type { WorkspaceContextController } from "./useWorkspaceContext";
import {
  buttonRowStyle,
  chatLayoutStyle,
  composerBoxStyle,
  composerFooterStyle,
  conversationMetaRowStyle,
  conversationMetaTitleStyle,
  footerLeftStyle,
  ghostButtonStyle,
  messageListStyle,
  mobileButtonRowStyle,
  mobileChatLayoutStyle,
  mobileComposerFooterStyle,
  mobileConversationMetaRowStyle,
  mobileFixedComposerCardStyle,
  mobileFixedComposerWrapStyle,
  mobileSurfaceCardStyle,
  mobileTextareaStyle,
  mobileToolbarBarStyle,
  mobileToolbarStatusGroupStyle,
  mutedMetaStyle,
  primaryButtonStyle,
  scrollBottomButtonStyle,
  scrollBottomOverlayStyle,
  sectionTextStyle,
  selectionBubbleCloseStyle,
  selectionBubbleRowStyle,
  selectionBubbleStyle,
  surfaceCardStyle,
  textareaStyle,
  toolbarBarStyle,
  toolbarClearStyle,
  toolbarCountStyle,
  toolbarDockStyle,
  toolbarIconGlyphStyle,
  toolbarIconGroupStyle,
  toolbarPillButtonStyle,
  toolbarStatusGroupStyle,
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
  onAbortStream,
  onTranslationCardSuccess,
  onPictureTranslateCardSuccess,
  onImageGenerationCardSuccess,
}: {
  conversation: Conversation;
  messages: WorkspaceConversationMessage[];
  draft: string;
  context: WorkspaceContextController;
  stream: ChatStreamController;
  showStreamingReply: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onAbortStream: () => void;
  onTranslationCardSuccess: (
    conversationId: string,
    messageIndex: number,
    detail: { jobId?: string; jobIds?: string[]; message: string },
  ) => void;
  onPictureTranslateCardSuccess: (
    conversationId: string,
    messageIndex: number,
    detail: { taskId: string; batchId: string },
  ) => void;
  onImageGenerationCardSuccess: (
    conversationId: string,
    messageIndex: number,
    detail: { taskId: string; batchId: string },
  ) => void;
}) {
  const { isMobile } = useResponsiveLayout();
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mobileComposerRef = useRef<HTMLDivElement | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
  const [mobileComposerHeight, setMobileComposerHeight] = useState(0);

  const {
    isStreaming,
    streamingText,
    streamingThinkingText,
    streamingTranslationForm,
    streamingGenerateCard,
    streamingGeneratePayload,
    streamingPictureTranslateCard,
    streamingPictureTranslatePayload,
    streamingImageGenerationCard,
    streamingImageGenerationPayload,
    streamingTaskProposal,
    skillSteps,
  } = stream;

  const {
    activeContextTool,
    toggleContextTool,
    selectedObjectsByType,
    objectQuerySelectionByType,
    constraints,
    selectedFileIds,
    selectedMediaIds,
    filledContextCount,
    clearContext,
    clearToolSelection,
    workspaceBatchProducts,
  } = context;

  const contextTokens = useMemo(
    () => estimateMessagesTokens(messages),
    [messages],
  );

  const queryToolLabel = (type: "product" | "article", base: string) => {
    const manualCount = selectedObjectsByType[type].length;
    if (manualCount > 0) return `${base} ${manualCount}`;
    const query = objectQuerySelectionByType[type];
    if (query) return query.matchCount != null ? `${base} 条件·${query.matchCount}` : `${base} 条件`;
    return base;
  };

  const toolItems: Array<{ key: ContextTool; label: string; icon: string; active: boolean }> = [
    { key: "product", label: queryToolLabel("product", "商品"), icon: "◫", active: activeContextTool === "product" },
    { key: "order", label: selectedObjectsByType.order.length > 0 ? `订单 ${selectedObjectsByType.order.length}` : "订单", icon: "◎", active: activeContextTool === "order" },
    { key: "article", label: queryToolLabel("article", "文章"), icon: "≣", active: activeContextTool === "article" },
    { key: "file", label: selectedFileIds.length > 0 ? `文件 ${selectedFileIds.length}` : "文件", icon: "↑", active: activeContextTool === "file" },
    { key: "media", label: selectedMediaIds.length > 0 ? `富媒体 ${selectedMediaIds.length}` : "富媒体", icon: "◇", active: activeContextTool === "media" },
    { key: "constraint", label: constraints.length > 0 ? `约束 ${constraints.length}` : "约束", icon: "⚐", active: activeContextTool === "constraint" },
  ];

  const selectedSummaryBubbles: Array<{ key: ContextTool; label: string }> = [
    ...(selectedObjectsByType.product.length > 0 ? [{ key: "product" as const, label: `已选择 ${selectedObjectsByType.product.length} 个商品` }] : []),
    ...(objectQuerySelectionByType.product ? [{ key: "product" as const, label: `按条件圈定商品${objectQuerySelectionByType.product.matchCount != null ? `（约 ${objectQuerySelectionByType.product.matchCount} 个）` : ""}` }] : []),
    ...(selectedObjectsByType.order.length > 0 ? [{ key: "order" as const, label: `已选择 ${selectedObjectsByType.order.length} 个订单` }] : []),
    ...(selectedObjectsByType.article.length > 0 ? [{ key: "article" as const, label: `已选择 ${selectedObjectsByType.article.length} 篇文章` }] : []),
    ...(objectQuerySelectionByType.article ? [{ key: "article" as const, label: `按条件圈定文章${objectQuerySelectionByType.article.matchCount != null ? `（约 ${objectQuerySelectionByType.article.matchCount} 篇）` : ""}` }] : []),
    ...(selectedFileIds.length > 0 ? [{ key: "file" as const, label: `已选择 ${selectedFileIds.length} 个文件` }] : []),
    ...(selectedMediaIds.length > 0 ? [{ key: "media" as const, label: `已选择 ${selectedMediaIds.length} 个富媒体` }] : []),
    ...(constraints.length > 0 ? [{ key: "constraint" as const, label: `约束 ${constraints.length} 条` }] : []),
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
    <div style={isMobile ? mobileFixedComposerCardStyle : undefined}>
      {selectedSummaryBubbles.length > 0 ? (
        <div style={selectionBubbleRowStyle}>
          {selectedSummaryBubbles.map((item) => (
            <span key={item.key} style={selectionBubbleStyle}>
              <span>{item.label}</span>
              <button type="button" style={selectionBubbleCloseStyle} onClick={() => clearToolSelection(item.key)} aria-label={`清空${item.label}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleTextareaKeyDown}
        className="workspace-composer-input"
        style={isMobile ? mobileTextareaStyle : textareaStyle}
        placeholder="继续补充你的任务目标，并结合商品、订单、文章、文件或富媒体上下文..."
        disabled={isStreaming}
        autoFocus
      />
      <div style={toolbarDockStyle}>
        <div style={isMobile ? mobileToolbarBarStyle : toolbarBarStyle}>
          <div style={toolbarIconGroupStyle}>
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
          <div style={isMobile ? mobileToolbarStatusGroupStyle : toolbarStatusGroupStyle}>
            {filledContextCount > 0 ? (
              <span style={toolbarCountStyle}>已补充 {filledContextCount} 项</span>
            ) : null}
            <button type="button" style={toolbarClearStyle} onClick={clearContext}>
              清空上下文
            </button>
          </div>
        </div>
      </div>
      <div style={isMobile ? mobileComposerFooterStyle : composerFooterStyle}>
        <div style={footerLeftStyle}>
          <span style={sectionTextStyle}>
            {isStreaming ? "AI Assistant 正在回复，可随时停止。" : <span style={mutedMetaStyle}>Enter 发送，Shift+Enter 换行</span>}
          </span>
          <ContextWindowIndicator currentTokens={contextTokens} maxTokens={MAX_CONTEXT_TOKENS} />
        </div>
        <div style={isMobile ? mobileButtonRowStyle : buttonRowStyle}>
          <button type="button" className="workspace-ghost-btn" style={ghostButtonStyle} disabled={isStreaming}>
            生成任务建议
          </button>
          {isStreaming ? (
            <button type="button" style={ghostButtonStyle} onClick={onAbortStream}>
              停止
            </button>
          ) : null}
          <button
            type="button"
            className="workspace-primary-btn"
            style={{ ...primaryButtonStyle, opacity: isStreaming ? 0.6 : 1 }}
            onClick={() => void onSend()}
            disabled={isStreaming}
          >
            {isStreaming ? "发送中…" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={isMobile ? { ...mobileChatLayoutStyle, paddingBottom: mobileComposerOffset } : chatLayoutStyle}>
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
                  streamingTranslationForm={streamingTranslationForm}
                  streamingGenerateCard={streamingGenerateCard}
                  streamingGeneratePayload={streamingGeneratePayload}
                  streamingPictureTranslateCard={streamingPictureTranslateCard}
                  streamingPictureTranslatePayload={streamingPictureTranslatePayload}
                  streamingImageGenerationCard={streamingImageGenerationCard}
                  streamingImageGenerationPayload={streamingImageGenerationPayload}
                  streamingTaskProposal={streamingTaskProposal}
                  workspaceBatchProducts={workspaceBatchProducts}
                  workspaceProductQuery={objectQuerySelectionByType.product}
                />
              }
              onTranslationCardSuccess={(messageIndex, detail) =>
                onTranslationCardSuccess(conversation.id, messageIndex, detail)
              }
              onPictureTranslateCardSuccess={(messageIndex, detail) =>
                onPictureTranslateCardSuccess(conversation.id, messageIndex, detail)
              }
              onImageGenerationCardSuccess={(messageIndex, detail) =>
                onImageGenerationCardSuccess(conversation.id, messageIndex, detail)
              }
            />
          </div>
          {isScrolledUp ? (
            <div style={scrollBottomOverlayStyle}>
              <button type="button" style={scrollBottomButtonStyle} onClick={() => scrollToBottom(true)}>
                ↓ 查看最新消息
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

      {!isMobile ? <ChatContextSidebar context={context} /> : null}
    </div>
  );
}
