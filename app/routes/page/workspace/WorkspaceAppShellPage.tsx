/**
 * 工作台应用壳：侧边栏导航 + 会话管理 + 面板路由。
 * 各面板见同目录 DashboardPanel / ChatPanel / SkillsPanel / AutomationPanel，
 * 对话上下文状态统一在 useWorkspaceContext。
 */
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../../lib/chatMessage";
import { LanguageSelector } from "../../component/common/LanguageSelector";
import { UnifiedTaskListPage } from "../../component/unifiedTaskList/UnifiedTaskListPage";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { WorkspaceDashboardSnapshot } from "../../../lib/workspaceDashboardTypes";
import { useChatStream } from "../chat/useChatStream";
import { AutomationPanel } from "./AutomationPanel";
import { ChatPanel } from "./ChatPanel";
import { DashboardPanel } from "./DashboardPanel";
import { SkillsPanel } from "./SkillsPanel";
import {
  augmentUserMessage,
  buildAssistantWorkspaceMessage,
  dbMessageToUiMessage,
  formatTimeLabel,
  serializeAssistantPayloads,
  workspaceMessageToApiMessage,
} from "./messageTransforms";
import {
  isWorkspacePanel,
  type AutomationView,
  type Conversation,
  type ConversationSummary,
  type WorkspaceConversationMessage,
  type WorkspacePanel,
} from "./types";
import { useWorkspaceContext } from "./useWorkspaceContext";
import {
  accountMenuItemStyle,
  accountMenuLabelStyle,
  accountMenuSectionStyle,
  accountMenuStyle,
  accountMenuWrapStyle,
  brandBadgeStyle,
  brandMetaStyle,
  brandRowStyle,
  brandTitleStyle,
  contentStyle,
  conversationListStyle,
  footerTagStyle,
  historyDeleteButtonStyle,
  historyItemStyle,
  historyRowStyle,
  historyTitleStyle,
  mobileContentStyle,
  mobileShellStyle,
  mobileSidebarBackdropStyle,
  mobileSidebarStyle,
  mobileTopBarButtonStyle,
  mobileTopBarStyle,
  mobileTopBarTitleStyle,
  mobileTopBarTitleWrapStyle,
  mutedMetaStyle,
  navButtonStyle,
  navGroupStyle,
  navIconStyle,
  newChatButtonStyle,
  newChatPlusBadgeStyle,
  shellStyle,
  sidebarDividerStyle,
  sidebarFooterButtonStyle,
  sidebarSectionHeadStyle,
  sidebarSectionStyle,
  sidebarStyle,
} from "./styles";

const panelItems: Array<{ key: Exclude<WorkspacePanel, "chat">; label: string; icon: string }> = [
  { key: "dashboard", label: "经营看板", icon: "◫" },
  { key: "skills", label: "技能", icon: "✦" },
  { key: "automation", label: "自动化", icon: "↻" },
  { key: "tasks", label: "任务列表", icon: "≡" },
];

const DRAFT_CONVERSATION_PREFIX = "draft-";

function isDraftConversationId(id: string): boolean {
  return id.startsWith(DRAFT_CONVERSATION_PREFIX);
}

function createDraftConversationId(): string {
  return `${DRAFT_CONVERSATION_PREFIX}${crypto.randomUUID()}`;
}

function conversationHasUserMessage(
  messagesByConversation: Record<string, WorkspaceConversationMessage[]>,
  conversationId: string,
): boolean {
  return (messagesByConversation[conversationId] ?? []).some((message) => message.role === "user");
}

function listEmptyDraftConversationIds(
  conversations: ConversationSummary[],
  messagesByConversation: Record<string, WorkspaceConversationMessage[]>,
  keepConversationId?: string | null,
): string[] {
  return conversations
    .filter((conversation) => {
      if (keepConversationId && conversation.id === keepConversationId) return false;
      if (!isDraftConversationId(conversation.id)) return false;
      return !conversationHasUserMessage(messagesByConversation, conversation.id);
    })
    .map((conversation) => conversation.id);
}

const fallbackDashboardSnapshot: WorkspaceDashboardSnapshot = {
  hasData: false,
  metrics: [
    { label: "销售额", value: "—", delta: "—", tone: "neutral" },
    { label: "订单数", value: "—", delta: "—", tone: "neutral" },
    { label: "转化率", value: "—", delta: "—", tone: "neutral", pendingIntegration: true },
    { label: "客单价", value: "—", delta: "—", tone: "neutral" },
    { label: "退款率", value: "—", delta: "—", tone: "neutral" },
    { label: "库存风险 SKU", value: "—", delta: "—", tone: "neutral" },
  ],
  alerts: [],
  suggestions: [],
  recentTaskSummaries: [],
};

export function WorkspaceAppShellPage({
  initialConversationList = [],
  dashboardSnapshot = fallbackDashboardSnapshot,
}: {
  initialConversationList?: ConversationSummary[];
  dashboardSnapshot?: WorkspaceDashboardSnapshot;
}) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const { isMobile } = useResponsiveLayout();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationList, setConversationList] = useState<Conversation[]>(initialConversationList);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationList.length > 0 ? initialConversationList[0].id : null,
  );
  const [draftByConversation, setDraftByConversation] = useState<Record<string, string>>({});
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, WorkspaceConversationMessage[]>>({});
  const loadedConvIdsRef = useRef<Set<string>>(new Set());
  const [automationView, setAutomationView] = useState<AutomationView>("configured");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const workspaceContext = useWorkspaceContext();
  const stream = useChatStream();
  const { sendMessage: streamConversation, prepareStreaming, abort: abortStream } = stream;
  const replyEpochRef = useRef(0);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);

  const panelParam = searchParams.get("panel");
  const activePanel: WorkspacePanel = isWorkspacePanel(panelParam) ? panelParam : "dashboard";
  const activeConversation = conversationList.find((item) => item.id === activeConversationId) ?? null;
  const activeMessages = activeConversation ? (messagesByConversation[activeConversation.id] ?? []) : [];

  const removeConversationsFromState = (conversationIds: string[]) => {
    if (conversationIds.length === 0) return;
    const removeSet = new Set(conversationIds);
    for (const id of conversationIds) {
      loadedConvIdsRef.current.delete(id);
    }
    setConversationList((current) => current.filter((item) => !removeSet.has(item.id)));
    setMessagesByConversation((current) => {
      const next = { ...current };
      for (const id of conversationIds) {
        delete next[id];
      }
      return next;
    });
    setDraftByConversation((current) => {
      const next = { ...current };
      for (const id of conversationIds) {
        delete next[id];
      }
      return next;
    });
    setActiveConversationId((current) =>
      current && removeSet.has(current) ? null : current,
    );
  };

  const pruneEmptyDraftConversations = (keepConversationId?: string | null) => {
    const removedIds = listEmptyDraftConversationIds(
      conversationList,
      messagesByConversation,
      keepConversationId,
    );
    removeConversationsFromState(removedIds);
  };

  const renameConversationInState = (oldId: string, nextConversation: ConversationSummary) => {
    loadedConvIdsRef.current.delete(oldId);
    loadedConvIdsRef.current.add(nextConversation.id);
    setConversationList((current) =>
      current.map((conversation) =>
        conversation.id === oldId ? nextConversation : conversation,
      ),
    );
    setMessagesByConversation((current) => {
      const existing = current[oldId];
      const next = { ...current };
      delete next[oldId];
      if (existing) {
        next[nextConversation.id] = existing;
      }
      return next;
    });
    setDraftByConversation((current) => {
      const existing = current[oldId];
      const next = { ...current };
      delete next[oldId];
      if (existing !== undefined) {
        next[nextConversation.id] = existing;
      }
      return next;
    });
    setActiveConversationId((current) =>
      current === oldId ? nextConversation.id : current,
    );
  };

  // Lazy-load messages when switching to a conversation for the first time
  useEffect(() => {
    if (!activeConversationId) return;
    if (isDraftConversationId(activeConversationId)) return;
    if (loadedConvIdsRef.current.has(activeConversationId)) return;
    loadedConvIdsRef.current.add(activeConversationId);
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    fetch(`/api/conversations/${activeConversationId}${authQuery}`)
      .then((res) => res.json())
      .then((data: { messages?: unknown[] }) => {
        setMessagesByConversation((current) => {
          const existing = current[activeConversationId] ?? [];
          if (existing.length > 0) {
            return current;
          }
          return {
            ...current,
            [activeConversationId]: ((data.messages ?? []) as Parameters<typeof dbMessageToUiMessage>[0][]).map(dbMessageToUiMessage),
          };
        });
      })
      .catch((err) => {
        console.error("[WorkspaceAppShellPage] load messages failed:", err);
        setMessagesByConversation((current) => ({ ...current, [activeConversationId]: [] }));
      });
  }, [activeConversationId]);

  const switchPanel = (panel: WorkspacePanel) => {
    if (panel !== "chat") {
      pruneEmptyDraftConversations();
    }
    const next = new URLSearchParams(searchParams);
    if (panel === "dashboard") {
      next.delete("panel");
    } else {
      next.set("panel", panel);
    }
    setSearchParams(next);
    if (isMobile) setSidebarOpen(false);
  };

  const openConversation = (conversationId: string) => {
    pruneEmptyDraftConversations(conversationId);
    setActiveConversationId(conversationId);
    switchPanel("chat");
  };

  const removeConversation = async (conversationId: string) => {
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    try {
      if (isDraftConversationId(conversationId)) {
        const wasActive = activeConversationId === conversationId;
        const nextList = conversationList.filter((item) => item.id !== conversationId);
        removeConversationsFromState([conversationId]);
        if (wasActive) {
          const nextConversation = nextList[0] ?? null;
          setActiveConversationId(nextConversation?.id ??  null);
          if (nextConversation) {
            switchPanel("chat");
          } else {
            switchPanel("dashboard");
          }
        }
        shopify.toast.show("对话已删除");
        return;
      }

      const res = await fetch(`/api/conversations/${conversationId}${authQuery}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        shopify.toast.show("删除对话失败");
        return;
      }

      const wasActive = activeConversationId === conversationId;
      const nextList = conversationList.filter((item) => item.id !== conversationId);
      setConversationList(nextList);
      loadedConvIdsRef.current.delete(conversationId);
      setMessagesByConversation((current) => {
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
      setDraftByConversation((current) => {
        const next = { ...current };
        delete next[conversationId];
        return next;
      });

      if (wasActive) {
        const nextConversation = nextList[0] ?? null;
        setActiveConversationId(nextConversation?.id ?? null);
        if (nextConversation) {
          switchPanel("chat");
        } else {
          switchPanel("dashboard");
        }
      }
      shopify.toast.show("对话已删除");
      if (isMobile) setSidebarOpen(false);
    } catch (err) {
      console.error("[WorkspaceAppShellPage] delete conversation failed:", err);
      shopify.toast.show("删除对话失败");
    }
  };

  const createConversation = () => {
    pruneEmptyDraftConversations();
    const now = new Date().toISOString();
    const conv: ConversationSummary = {
      id: createDraftConversationId(),
      title: "新对话",
      preview: "",
      updatedAt: now,
    };
    const welcomeMsg: WorkspaceConversationMessage = {
      role: "assistant",
      text: "新的对话已经创建。你可以先在下方工具栏补充商品、订单、文章、文件或富媒体，再发送任务需求。",
      time: formatTimeLabel(new Date()),
    };
    loadedConvIdsRef.current.add(conv.id);
    setConversationList((current) => [conv, ...current].slice(0, 50));
    setMessagesByConversation((current) => ({ ...current, [conv.id]: [welcomeMsg] }));
    setDraftByConversation((current) => ({ ...current, [conv.id]: "" }));
    workspaceContext.closeContextTool();
    setActiveConversationId(conv.id);
    switchPanel("chat");
    if (isMobile) setSidebarOpen(false);
  };

  const sendMessage = async () => {
    if (!activeConversation) return;
    const content = (draftByConversation[activeConversation.id] ?? "").trim();
    if (!content || streamingConversationId === activeConversation.id) return;

    let conversationId = activeConversation.id;
    let conversationTitle = activeConversation.title;
    const priorMessages = messagesByConversation[conversationId] ?? [];
    if (isDraftConversationId(conversationId)) {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      try {
        const res = await fetch(`/api/conversations${authQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          shopify.toast.show("创建对话失败，请稍后重试");
          return;
        }
        const data = (await res.json()) as { conversation: ConversationSummary };
        renameConversationInState(conversationId, data.conversation);
        conversationId = data.conversation.id;
        conversationTitle = data.conversation.title;
      } catch (err) {
        console.error("[WorkspaceAppShellPage] persist draft conversation failed:", err);
        shopify.toast.show("创建对话失败，请稍后重试");
        return;
      }
    }

    replyEpochRef.current += 1;
    const epoch = replyEpochRef.current;
    const nextPreview = content.length > 28 ? `${content.slice(0, 28)}...` : content;
    const isNewTitle = conversationTitle === "新对话";
    const nextTitle = isNewTitle
      ? (content.length > 18 ? `${content.slice(0, 18)}...` : content)
      : conversationTitle;
    const userTime = formatTimeLabel(new Date());

    flushSync(() => {
      setStreamingConversationId(conversationId);
      setConversationList((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: nextTitle,
                preview: nextPreview,
                updatedAt: new Date().toISOString(),
              }
            : conversation,
        ),
      );
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] ?? []),
          { role: "user", text: content, time: userTime },
        ],
      }));
      setDraftByConversation((current: Record<string, string>) => ({ ...current, [conversationId]: "" }));
    });
    prepareStreaming();

    const contextBlock = workspaceContext.buildContextBlock();
    const apiMessages: ChatMessage[] = [
      ...priorMessages.map((message) => workspaceMessageToApiMessage(message)),
      { role: "user", content: augmentUserMessage(content, contextBlock) },
    ];

    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";

      await streamConversation(apiMessages, {
        url: `/chat-stream${authQuery}`,
        fileIds: workspaceContext.uploadedFileIds,
        workspaceBatchProducts: workspaceContext.workspaceBatchProducts,
        onFinish: (payload) => {
          if (epoch !== replyEpochRef.current) return;

          const assistantText =
            payload.httpStatus !== undefined
              ? `请求失败（${payload.httpStatus}），请稍后重试。`
              : payload.aborted && !payload.reply.trim()
                ? "回复已停止。"
                : payload.reply.trim() || "AI Assistant 未返回有效内容，请重试。";

          flushSync(() => {
            setMessagesByConversation((current) => ({
              ...current,
              [conversationId]: [
                ...(current[conversationId] ??  []),
                buildAssistantWorkspaceMessage(assistantText, payload),
              ],
            }));
            setStreamingConversationId(null);
          });

          // Persist user + assistant messages (fire and forget)
          if (!payload.httpStatus) {
            const assistantPayloads = serializeAssistantPayloads(payload);
            fetch(`/api/conversations/${conversationId}${authQuery}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [
                  { role: "user", content },
                  { role: "assistant", content: assistantText, payloads: assistantPayloads },
                ],
                ...(isNewTitle ? { title: nextTitle } : {}),
                preview: nextPreview,
              }),
            }).catch((err) => console.error("[WorkspaceAppShellPage] persist messages failed:", err));
          }
        },
      });
    } catch (error) {
      console.error("[WorkspaceAppShellPage] chat stream failed:", error);
      setStreamingConversationId(null);
      if (epoch !== replyEpochRef.current) return;
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] ?? []),
          { role: "assistant", text: "抱歉，发送失败，请稍后重试。", time: "刚刚" },
        ],
      }));
    }
  };

  const handleTranslationCardSuccess = (
    conversationId: string,
    messageIndex: number,
    detail: { jobId?: string; jobIds?: string[]; message: string },
  ) => {
    shopify.toast.show(detail.message || t("chat.translationCreateSuccess"));
    const ids = detail.jobIds ?? (detail.jobId ? [detail.jobId] : []);
    setMessagesByConversation((current) => {
      const existing = current[conversationId] ?? [];
      const next = existing.map((message, index) =>
        index === messageIndex && message.role === "assistant"
          ? {
              role: "assistant" as const,
              text: message.text,
              time: message.time,
            }
          : message,
      );
      next.push({
        role: "assistant",
        text:
          ids.length > 1
            ? detail.message
            : ids.length === 1
              ? t("chat.translationSubmittedWithId", { jobId: ids[0] })
              : t("chat.translationSubmitted"),
        time: "刚刚",
      });
      return { ...current, [conversationId]: next };
    });
  };

  const handlePictureTranslateCardSuccess = (
    _conversationId: string,
    _messageIndex: number,
    _detail: { taskId: string; batchId: string },
  ) => {
    shopify.toast.show(t("pictureTranslate.submitSuccess"));
  };

  const handleImageGenerationCardSuccess = (
    _conversationId: string,
    _messageIndex: number,
    _detail: { taskId: string; batchId: string },
  ) => {
    shopify.toast.show(t("imageGeneration.submitSuccess"));
  };

  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [accountMenuOpen]);

  const activePanelLabel = activePanel === "chat"
    ? activeConversation?.title ?? "新对话"
    : panelItems.find((item) => item.key === activePanel)?.label ?? "工作台";

  const sidebarContent = (
    <>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <div style={brandRowStyle}>
          <div style={brandBadgeStyle}>S</div>
          <div>
            <div style={brandTitleStyle}>Spark</div>
            <div style={brandMetaStyle}>Shopify AI Workspace</div>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-new-chat-btn workspace-primary-btn"
          style={newChatButtonStyle}
          onClick={createConversation}
        >
          <span style={newChatPlusBadgeStyle}>+</span>
          <span>新建对话</span>
        </button>

        <div style={navGroupStyle}>
          {panelItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`workspace-nav-btn${activePanel === item.key ? " is-active" : ""}`}
              style={navButtonStyle(activePanel === item.key)}
              onClick={() => switchPanel(item.key)}
            >
              <span style={navIconStyle(activePanel === item.key)}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div style={sidebarDividerStyle} />

        <div style={sidebarSectionStyle}>
          <div style={sidebarSectionHeadStyle}>
            <span>最近对话</span>
            <span style={mutedMetaStyle}>{Math.min(conversationList.length, 50)} / 50</span>
          </div>
          <div style={conversationListStyle}>
            {conversationList.slice(0, 50).map((conversation) => {
              const active =
                activePanel === "chat" && activeConversationId === conversation.id;
              return (
                <div key={conversation.id} className="sidebar-history-row" style={historyRowStyle}>
                  <button
                    type="button"
                    className={`sidebar-history-item workspace-history-item${active ? " is-active" : ""}`}
                    style={historyItemStyle(active)}
                    onClick={() => openConversation(conversation.id)}
                    title={conversation.title}
                  >
                    <span style={historyTitleStyle(active)}>{conversation.title}</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-history-delete"
                    style={historyDeleteButtonStyle}
                    aria-label={`删除对话：${conversation.title}`}
                    title="删除对话"
                    onClick={() => void removeConversation(conversation.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div ref={accountMenuRef} style={accountMenuWrapStyle}>
        {accountMenuOpen ? (
          <div style={accountMenuStyle}>
            <div style={accountMenuSectionStyle}>
              <div style={accountMenuLabelStyle}>语言</div>
              <LanguageSelector />
            </div>
            <button
              type="button"
              style={accountMenuItemStyle}
              onClick={() => {
                setAccountMenuOpen(false);
                if (isMobile) setSidebarOpen(false);
                navigate("/app/billing");
              }}
            >
              Billing
            </button>
          </div>
        ) : null}
        <button type="button" style={sidebarFooterButtonStyle} onClick={() => setAccountMenuOpen((current) => !current)}>
          <div>
            <div style={brandTitleStyle}>Cedric hu</div>
            <div style={brandMetaStyle}>Spark Workspace</div>
          </div>
          <div style={footerTagStyle}>在线</div>
        </button>
      </div>
    </>
  );

  return (
    <div style={isMobile ? mobileShellStyle : shellStyle}>
      {isMobile ? (
        <>
          <div style={mobileTopBarStyle}>
            <button
              type="button"
              style={mobileTopBarButtonStyle}
              onClick={() => setSidebarOpen(true)}
              aria-label="打开导航菜单"
            >
              ☰
            </button>
            <div style={mobileTopBarTitleWrapStyle}>
              <div style={brandMetaStyle}>Spark Workspace</div>
              <div style={mobileTopBarTitleStyle}>{activePanelLabel}</div>
            </div>
            <button
              type="button"
              style={mobileTopBarButtonStyle}
              onClick={createConversation}
              aria-label="新建对话"
            >
              +
            </button>
          </div>
          {sidebarOpen ? (
            <div style={mobileSidebarBackdropStyle} onClick={() => setSidebarOpen(false)}>
              <aside
                style={{ ...sidebarStyle, ...mobileSidebarStyle }}
                onClick={(event) => event.stopPropagation()}
              >
                {sidebarContent}
              </aside>
            </div>
          ) : null}
        </>
      ) : (
        <aside style={sidebarStyle}>{sidebarContent}</aside>
      )}

      <main style={isMobile ? mobileContentStyle : contentStyle}>
        {activePanel === "dashboard" ? (
          <DashboardPanel
            snapshot={dashboardSnapshot}
            onOpenDailyOps={() => navigate("/app/daily-operations")}
            onOpenTasks={() => switchPanel("tasks")}
          />
        ) : null}
        {activePanel === "chat" && activeConversation ? (
          <ChatPanel
            conversation={activeConversation}
            messages={activeMessages}
            draft={draftByConversation[activeConversation.id] ?? ""}
            context={workspaceContext}
            stream={stream}
            showStreamingReply={streamingConversationId === activeConversation.id}
            onDraftChange={(value) =>
              setDraftByConversation((current: Record<string, string>) => ({
                ...current,
                [activeConversation.id]: value,
              }))
            }
            onSend={sendMessage}
            onAbortStream={() => {
              replyEpochRef.current += 1;
              setStreamingConversationId(null);
              abortStream();
            }}
            onTranslationCardSuccess={handleTranslationCardSuccess}
            onPictureTranslateCardSuccess={handlePictureTranslateCardSuccess}
            onImageGenerationCardSuccess={handleImageGenerationCardSuccess}
          />
        ) : null}
        {activePanel === "skills" ? <SkillsPanel onOpenTool={(path: string) => navigate(path)} /> : null}
        {activePanel === "automation" ? (
          <AutomationPanel activeView={automationView} onChangeView={setAutomationView} />
        ) : null}
        {activePanel === "tasks" ? (
          <UnifiedTaskListPage locationSearch={typeof window !== "undefined" ? window.location.search : ""} />
        ) : null}
      </main>
    </div>
  );
}
