/**
 * 工作台应用壳：侧边栏导航 + 会话管理 + 面板路由。
 * 各面板见同目录 DashboardPanel / ChatPanel / SkillsPanel / AutomationPanel，
 * 对话上下文状态统一在 useWorkspaceContext。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";
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
  serializeWorkspaceMessagePayloads,
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
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
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

function NavIcon({ name }: { name: Exclude<WorkspacePanel, "chat"> }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "dashboard") {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="1.2" y="1.2" width="4.8" height="4.8" rx="1.2" />
        <rect x="8" y="1.2" width="4.8" height="4.8" rx="1.2" />
        <rect x="1.2" y="8" width="4.8" height="4.8" rx="1.2" />
        <rect x="8" y="8" width="4.8" height="4.8" rx="1.2" />
      </svg>
    );
  }
  if (name === "skills") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M7 1.4 L8.4 5.6 L12.6 7 L8.4 8.4 L7 12.6 L5.6 8.4 L1.4 7 L5.6 5.6 Z" />
      </svg>
    );
  }
  if (name === "automation") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12.4 7a5.4 5.4 0 1 1-1.7-3.9" />
        <path d="M12.6 1.6 v2.5 h-2.5" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M1.4 3.2 l1 1 l1.7-2" />
      <path d="M6.4 3.4 h6.2" />
      <path d="M1.4 8.4 l1 1 l1.7-2" />
      <path d="M6.4 8.6 h6.2" />
      <path d="M6.4 12.4 h6.2" />
    </svg>
  );
}

const panelItems: Array<{ key: Exclude<WorkspacePanel, "chat">; label: string }> = [
  { key: "dashboard", label: "经营看板" },
  { key: "skills", label: "技能" },
  { key: "automation", label: "自动化" },
  { key: "tasks", label: "任务列表" },
];

// ── 左栏会话列表：时间分组与相对时间 ─────────────────────────────────────────

/** 账户展示名（与左栏底部既有硬编码保持一处定义；待接入真实用户信息） */
const ACCOUNT_DISPLAY_NAME = "Cedric hu";

const CONVERSATION_GROUP_ORDER = ["今天", "昨天", "7 天内", "更早"] as const;

function conversationGroupLabel(iso: string): (typeof CONVERSATION_GROUP_ORDER)[number] {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "更早";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = date.getTime();
  if (t >= startOfToday) return "今天";
  if (t >= startOfToday - 24 * 60 * 60 * 1000) return "昨天";
  if (t >= startOfToday - 6 * 24 * 60 * 60 * 1000) return "7 天内";
  return "更早";
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function conversationTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const group = conversationGroupLabel(iso);
  if (group === "今天") {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  if (group === "昨天") return "昨天";
  if (group === "7 天内") return WEEKDAY_LABELS[date.getDay()];
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const conversationGroupLabelStyle = {
  fontSize: 11,
  color: "#8c9196",
  padding: "8px 10px 2px",
} as const;

const conversationTimeStyle = {
  fontSize: 10,
  color: "#8c9196",
  flexShrink: 0,
  marginLeft: 6,
} as const;

const conversationSearchInputStyle = {
  width: "100%",
  border: "1px solid #e1e3e5",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 12,
  color: "#202223",
  background: "#ffffff",
  marginBottom: 6,
  boxSizing: "border-box",
} as const;

const navBadgeStyle = {
  marginLeft: "auto",
  fontSize: 10,
  fontWeight: 700,
  padding: "0px 6px",
  borderRadius: 999,
  background: "rgba(64,112,244,0.12)",
  color: "#2c4fc4",
  flexShrink: 0,
} as const;

const navDotStyle = {
  marginLeft: "auto",
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "#f0a01d",
  flexShrink: 0,
} as const;

const conversationMenuStyle = {
  position: "absolute",
  top: "100%",
  right: 0,
  zIndex: 30,
  background: "#ffffff",
  border: "1px solid #e1e3e5",
  borderRadius: 10,
  boxShadow: "0 6px 20px rgba(0,0,0,0.1)",
  padding: 4,
  minWidth: 112,
  display: "flex",
  flexDirection: "column",
} as const;

const conversationMenuItemStyle = (danger = false) =>
  ({
    textAlign: "left",
    border: "none",
    background: "none",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    color: danger ? "#d72c0d" : "#202223",
    cursor: "pointer",
  }) as const;

const pinnedStarStyle = {
  fontSize: 10,
  color: "#f0a01d",
  flexShrink: 0,
  marginRight: 4,
} as const;

const collapseToggleStyle = {
  marginLeft: "auto",
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
  color: "#6d7175",
  fontSize: 12,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
} as const;

const collapsedIconButtonStyle = (active: boolean) =>
  ({
    width: 36,
    height: 36,
    borderRadius: 10,
    border: `1px solid ${active ? "rgba(0,128,96,0.4)" : "#e1e3e5"}`,
    background: active ? "rgba(0,128,96,0.08)" : "#ffffff",
    color: active ? "#008060" : "#5f6368",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    position: "relative",
    flexShrink: 0,
  }) as const;

const collapsedDotStyle = (color: string) =>
  ({
    position: "absolute",
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: color,
  }) as const;

const sidebarQuotaRowStyle = {
  borderTop: "1px solid rgba(225,227,229,0.6)",
  marginTop: 8,
  padding: "8px 10px 0",
  fontSize: 11,
  color: "#8c9196",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

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
  currentPlanLabel = "付费计划",
  accountEmail = "",
}: {
  initialConversationList?: ConversationSummary[];
  dashboardSnapshot?: WorkspaceDashboardSnapshot;
  currentPlanLabel?: string;
  accountEmail?: string;
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
  const processedPrefillPromptRef = useRef<string | null>(null);
  const [automationView, setAutomationView] = useState<AutomationView>("configured");
  const [runningTaskCount, setRunningTaskCount] = useState(0);
  const [conversationSearch, setConversationSearch] = useState("");
  // 置顶与折叠均为本机偏好（localStorage），不进数据库
  const pinnedStorageKey = useMemo(() => {
    const shop =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("shop") ?? "default"
        : "default";
    return `spark-pinned-conversations:${shop}`;
  }, []);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(pinnedStorageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("spark-sidebar-collapsed") === "1";
  });
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null);

  // 会话 ··· 菜单：点击菜单外任意处关闭
  useEffect(() => {
    if (!conversationMenuId) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".sidebar-conv-menu")) return;
      setConversationMenuId(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [conversationMenuId]);

  const togglePinned = (conversationId: string) => {
    setPinnedIds((current) => {
      const next = current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [conversationId, ...current];
      try {
        window.localStorage.setItem(pinnedStorageKey, JSON.stringify(next));
      } catch {
        // localStorage 不可用时置顶仅本次会话生效
      }
      return next;
    });
  };

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      try {
        window.localStorage.setItem("spark-sidebar-collapsed", current ? "0" : "1");
      } catch {
        // ignore
      }
      return !current;
    });
  };

  const startRenameConversation = (conversationId: string, currentTitle: string) => {
    setRenamingConversationId(conversationId);
    setRenameDraft(currentTitle);
  };

  const commitRenameConversation = async () => {
    const conversationId = renamingConversationId;
    if (!conversationId) return;
    const nextTitle = renameDraft.trim();
    setRenamingConversationId(null);
    const existing = conversationList.find((item) => item.id === conversationId);
    if (!existing || !nextTitle || nextTitle === existing.title) return;

    setConversationList((current) =>
      current.map((item) => (item.id === conversationId ? { ...item, title: nextTitle } : item)),
    );
    if (isDraftConversationId(conversationId)) return;
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    try {
      const res = await fetch(`/api/conversations/${conversationId}${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [], title: nextTitle }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("[WorkspaceAppShellPage] rename conversation failed:", err);
      shopify.toast.show("重命名失败");
      setConversationList((current) =>
        current.map((item) =>
          item.id === conversationId ? { ...item, title: existing.title } : item,
        ),
      );
    }
  };

  // 任务列表导航徽章：30s 轮询全局进行中任务数（确认执行后做乐观更新）
  useEffect(() => {
    let cancelled = false;
    const fetchRunningCount = async () => {
      try {
        const authQuery = typeof window !== "undefined" ? window.location.search : "";
        const params = new URLSearchParams(
          authQuery.startsWith("?") ? authQuery.slice(1) : authQuery,
        );
        params.set("view", "current");
        params.set("pageSize", "1");
        const res = await fetch(`/api/ai-task?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { metrics?: { runningCount?: number } };
        if (!cancelled) setRunningTaskCount(data.metrics?.runningCount ?? 0);
      } catch {
        // 静默失败，下个周期重试
      }
    };
    void fetchRunningCount();
    const timer = window.setInterval(() => void fetchRunningCount(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
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

  const createConversation = (options?: {
    draft?: string;
    assistantText?: string;
  }) => {
    const nextDraft = options?.draft ?? "";
    const assistantText =
      options?.assistantText ??
      "新的对话已经创建。你可以先在下方工具栏补充商品、订单、文章、文件或富媒体，再发送任务需求。";
    // 已存在空会话（草稿或落库的"新对话"）时直接复用，避免列表里堆积重复空会话
    const existingEmpty = conversationList.find(
      (conversation) =>
        conversation.title === "新对话" &&
        !conversation.preview?.trim() &&
        !(messagesByConversation[conversation.id] ?? []).some((m) => m.role === "user"),
    );
    if (existingEmpty) {
      workspaceContext.clearContext();
      setDraftByConversation((current) => ({ ...current, [existingEmpty.id]: nextDraft }));
      openConversation(existingEmpty.id);
      if (isMobile) setSidebarOpen(false);
      return;
    }
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
      text: assistantText,
      time: formatTimeLabel(new Date()),
    };
    loadedConvIdsRef.current.add(conv.id);
    setConversationList((current) => [conv, ...current].slice(0, 50));
    setMessagesByConversation((current) => ({ ...current, [conv.id]: [welcomeMsg] }));
    setDraftByConversation((current) => ({ ...current, [conv.id]: nextDraft }));
    workspaceContext.clearContext();
    setActiveConversationId(conv.id);
    switchPanel("chat");
    if (isMobile) setSidebarOpen(false);
  };

  useEffect(() => {
    const prefillPrompt = searchParams.get("prefillTaskPrompt");
    if (!prefillPrompt) return;
    if (processedPrefillPromptRef.current === prefillPrompt) return;
    processedPrefillPromptRef.current = prefillPrompt;
    createConversation({
      draft: prefillPrompt,
      assistantText: "已根据经营任务生成新对话，你可以直接发送或继续补充上下文。",
    });
    const next = new URLSearchParams(searchParams);
    next.delete("prefillTaskPrompt");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

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
        workspaceProductQuery: workspaceContext.objectQuerySelectionByType.product,
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
    if (ids.length) {
      const params = new URLSearchParams(
        typeof window !== "undefined"
          ? window.location.search.startsWith("?")
            ? window.location.search.slice(1)
            : window.location.search
          : "",
      );
      params.set("page", "tasks");
      params.set("expandJob", ids.join(","));
      navigate(`/app/translation-v4?${params.toString()}`);
    }
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

  /**
   * TaskProposal 确认执行成功：向对话追加一轮「开始执行」交互
   * （用户侧指令 + 助手侧 TaskRunChatCard），并落库持久化。
   */
  const handleTaskProposalExecuted = (conversationId: string, run: TaskRunPayload) => {
    // 导航徽章乐观更新（30s 轮询会校正）
    setRunningTaskCount((current) => current + run.taskIds.length);
    const userText = `开始执行：${run.title}（${run.taskIds.length} 个任务）`;
    const assistantText =
      run.errors.length > 0
        ? `已创建 ${run.taskIds.length} 个任务（${run.errors.length} 个对象创建失败），进度见下方卡片与任务列表。`
        : `已创建 ${run.taskIds.length} 个任务，进度见下方卡片与任务列表。`;
    const userMessage: WorkspaceConversationMessage = {
      role: "user",
      text: userText,
      time: "刚刚",
    };
    const assistantMessage: WorkspaceConversationMessage = {
      role: "assistant",
      text: assistantText,
      time: "刚刚",
      taskRun: run,
    };

    setMessagesByConversation((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] ?? []), userMessage, assistantMessage],
    }));

    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    fetch(`/api/conversations/${conversationId}${authQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: userText },
          {
            role: "assistant",
            content: assistantText,
            payloads: serializeWorkspaceMessagePayloads(assistantMessage),
          },
        ],
        preview: userText,
      }),
    }).catch((err) =>
      console.error("[WorkspaceAppShellPage] persist task run messages failed:", err),
    );
  };

  const handleAiTaskUpdated = (
    conversationId: string,
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => {
    setMessagesByConversation((current) => ({
      ...current,
      [conversationId]: (current[conversationId] ?? []).map((message) => {
        if (message.aiTask?.id !== taskId) return message;
        return {
          ...message,
          aiTask: {
            ...message.aiTask,
            status,
            result: result ?? message.aiTask.result,
            completedAt:
              status !== "running" && !message.aiTask.completedAt
                ? new Date().toISOString()
                : message.aiTask.completedAt,
            updatedAt: new Date().toISOString(),
          },
        };
      }),
    }));
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

  const openBillingPage = () => {
    setAccountMenuOpen(false);
    if (isMobile) setSidebarOpen(false);
    navigate("/app/billing");
  };

  const sidebarContent = (
    <>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <div style={brandRowStyle}>
          <div style={brandBadgeStyle}>S</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={brandTitleStyle}>Spark</div>
            <div style={brandMetaStyle}>Shopify AI Workspace</div>
          </div>
          {!isMobile ? (
            <button
              type="button"
              style={collapseToggleStyle}
              onClick={toggleSidebarCollapsed}
              title="折叠侧栏"
              aria-label="折叠侧栏"
            >
              «
            </button>
          ) : null}
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
              <span style={{ ...navIconStyle(activePanel === item.key), display: "inline-flex", alignItems: "center" }}>
                <NavIcon name={item.key} />
              </span>
              <span>{item.label}</span>
              {item.key === "tasks" && runningTaskCount > 0 ? (
                <span style={navBadgeStyle} title={`${runningTaskCount} 个任务进行中`}>
                  {runningTaskCount}
                </span>
              ) : null}
              {item.key === "dashboard" && dashboardSnapshot.automation?.status === "attention" ? (
                <span style={navDotStyle} title="今日巡检发现需关注项" />
              ) : null}
            </button>
          ))}
        </div>

        <div style={sidebarDividerStyle} />

        <div style={sidebarSectionStyle}>
          <div style={sidebarSectionHeadStyle}>
            <span>最近对话</span>
          </div>
          <input
            value={conversationSearch}
            onChange={(event) => setConversationSearch(event.target.value)}
            placeholder="搜索对话"
            style={conversationSearchInputStyle}
          />
          <div style={conversationListStyle}>
            {(() => {
              const keyword = conversationSearch.trim().toLowerCase();
              const filtered = conversationList
                .slice(0, 50)
                .filter(
                  (conversation) =>
                    !keyword ||
                    conversation.title.toLowerCase().includes(keyword) ||
                    conversation.preview.toLowerCase().includes(keyword),
                );
              if (filtered.length === 0) {
                return (
                  <div style={{ fontSize: 12, color: "#8c9196", padding: "8px 10px" }}>
                    {keyword ? "没有匹配的对话" : "暂无对话"}
                  </div>
                );
              }
              const pinnedSet = new Set(pinnedIds);
              const pinned = filtered.filter((conversation) => pinnedSet.has(conversation.id));
              const rest = filtered.filter((conversation) => !pinnedSet.has(conversation.id));
              const groups = new Map<string, typeof filtered>();
              if (pinned.length > 0) groups.set("置顶", pinned);
              for (const conversation of rest) {
                const label = conversationGroupLabel(conversation.updatedAt);
                const bucket = groups.get(label);
                if (bucket) bucket.push(conversation);
                else groups.set(label, [conversation]);
              }
              const renderRow = (conversation: ConversationSummary) => {
                const active =
                  activePanel === "chat" && activeConversationId === conversation.id;
                const isPinned = pinnedSet.has(conversation.id);
                const isRenaming = renamingConversationId === conversation.id;
                return (
                  <div
                    key={conversation.id}
                    className="sidebar-history-row"
                    style={historyRowStyle}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => void commitRenameConversation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            void commitRenameConversation();
                          } else if (event.key === "Escape") {
                            setRenamingConversationId(null);
                          }
                        }}
                        style={{ ...conversationSearchInputStyle, marginBottom: 0, flex: 1 }}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`sidebar-history-item workspace-history-item${active ? " is-active" : ""}`}
                          style={historyItemStyle(active)}
                          onClick={() => openConversation(conversation.id)}
                          title={conversation.title}
                        >
                          {isPinned ? (
                            <span style={pinnedStarStyle} aria-label="已置顶">
                              ★
                            </span>
                          ) : null}
                          <span
                            style={{
                              ...historyTitleStyle(active),
                              width: undefined,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {conversation.title}
                          </span>
                          <span style={conversationTimeStyle}>
                            {conversationTimeLabel(conversation.updatedAt)}
                          </span>
                        </button>
                        <div className="sidebar-conv-menu" style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="sidebar-history-delete"
                            style={{
                              ...historyDeleteButtonStyle,
                              ...(conversationMenuId === conversation.id ? { opacity: 1 } : {}),
                            }}
                            aria-label={`对话操作：${conversation.title}`}
                            title="更多操作"
                            onClick={() =>
                              setConversationMenuId((current) =>
                                current === conversation.id ? null : conversation.id,
                              )
                            }
                          >
                            ⋯
                          </button>
                          {conversationMenuId === conversation.id ? (
                            <div style={conversationMenuStyle}>
                              <button
                                type="button"
                                style={conversationMenuItemStyle()}
                                onClick={() => {
                                  togglePinned(conversation.id);
                                  setConversationMenuId(null);
                                }}
                              >
                                {isPinned ? "取消置顶" : "置顶"}
                              </button>
                              <button
                                type="button"
                                style={conversationMenuItemStyle()}
                                onClick={() => {
                                  startRenameConversation(conversation.id, conversation.title);
                                  setConversationMenuId(null);
                                }}
                              >
                                重命名
                              </button>
                              <button
                                type="button"
                                style={conversationMenuItemStyle(true)}
                                onClick={() => {
                                  setConversationMenuId(null);
                                  void removeConversation(conversation.id);
                                }}
                              >
                                删除
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                );
              };
              return ["置顶", ...CONVERSATION_GROUP_ORDER]
                .filter((label) => groups.has(label))
                .map((label) => (
                  <div key={label}>
                    <div style={conversationGroupLabelStyle}>{label}</div>
                    {groups.get(label)!.map(renderRow)}
                  </div>
                ));
            })()}
          </div>
          <div style={sidebarQuotaRowStyle}>
            <span>
              对话{" "}
              {Math.min(
                conversationList.filter((conversation) => conversation.preview?.trim()).length,
                50,
              )}
              /50
            </span>
            {runningTaskCount > 0 ? <span>任务进行中 {runningTaskCount}</span> : null}
          </div>
        </div>
      </div>

      <div ref={accountMenuRef} style={accountMenuWrapStyle}>
        {accountMenuOpen ? (
          <div style={accountMenuStyle}>
            <div style={accountMenuLabelStyle}>设置</div>
            <div style={accountMenuSectionStyle}>
              <LanguageSelector variant="panel" />
            </div>
            <button
              type="button"
              style={accountMenuItemStyle}
              onClick={openBillingPage}
            >
              管理套餐
            </button>
          </div>
        ) : null}
        <button type="button" style={sidebarFooterButtonStyle} onClick={() => setAccountMenuOpen((current) => !current)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={brandTitleStyle}>{ACCOUNT_DISPLAY_NAME}</div>
            <div
              style={{
                ...brandMetaStyle,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={accountEmail || undefined}
            >
              {accountEmail}
            </div>
          </div>
          <div style={footerTagStyle}>{currentPlanLabel}</div>
        </button>
      </div>
    </>
  );

  const collapsedSidebarContent = (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flex: 1, minHeight: 0 }}>
        <div style={brandBadgeStyle}>S</div>
        <button
          type="button"
          style={collapsedIconButtonStyle(false)}
          onClick={toggleSidebarCollapsed}
          title="展开侧栏"
          aria-label="展开侧栏"
        >
          »
        </button>
        <button
          type="button"
          style={{
            ...collapsedIconButtonStyle(false),
            background: "#008060",
            color: "#ffffff",
            border: "1px solid #008060",
            fontSize: 18,
          }}
          onClick={createConversation}
          title="新建对话"
          aria-label="新建对话"
        >
          +
        </button>
        <div style={{ height: 1, width: 28, background: "#e1e3e5", margin: "2px 0" }} />
        {panelItems.map((item) => (
          <button
            key={item.key}
            type="button"
            style={collapsedIconButtonStyle(activePanel === item.key)}
            onClick={() => switchPanel(item.key)}
            title={item.label}
            aria-label={item.label}
          >
            <NavIcon name={item.key} />
            {item.key === "tasks" && runningTaskCount > 0 ? (
              <span style={collapsedDotStyle("#4070f4")} title={`${runningTaskCount} 个任务进行中`} />
            ) : null}
            {item.key === "dashboard" && dashboardSnapshot.automation?.status === "attention" ? (
              <span style={collapsedDotStyle("#f0a01d")} title="今日巡检发现需关注项" />
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        style={{ ...collapsedIconButtonStyle(false), borderRadius: "50%" }}
        onClick={toggleSidebarCollapsed}
        title="展开侧栏查看账户"
        aria-label="展开侧栏查看账户"
      >
        {ACCOUNT_DISPLAY_NAME.slice(0, 1).toUpperCase()}
      </button>
    </>
  );

  return (
    <div
      style={
        isMobile
          ? mobileShellStyle
          : {
              ...shellStyle,
              gridTemplateColumns: sidebarCollapsed
                ? "64px minmax(0, 1fr)"
                : "220px minmax(0, 1fr)",
            }
      }
    >
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
        <aside
          style={
            sidebarCollapsed
              ? { ...sidebarStyle, padding: "16px 10px", alignItems: "center" }
              : sidebarStyle
          }
        >
          {sidebarCollapsed ? collapsedSidebarContent : sidebarContent}
        </aside>
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
            onAiTaskUpdated={handleAiTaskUpdated}
            onOpenTasks={() => switchPanel("tasks")}
            onTaskProposalExecuted={handleTaskProposalExecuted}
          />
        ) : null}
        {activePanel === "skills" ? <SkillsPanel onOpenTool={(path: string) => navigate(path)} /> : null}
        {activePanel === "automation" ? (
          <AutomationPanel
            activeView={automationView}
            onChangeView={setAutomationView}
            onRunInChat={(prompt: string) => {
              if (activeConversation) {
                setDraftByConversation((current: Record<string, string>) => ({
                  ...current,
                  [activeConversation.id]: prompt,
                }));
              }
              switchPanel("chat");
            }}
          />
        ) : null}
        {activePanel === "tasks" ? (
          <UnifiedTaskListPage locationSearch={typeof window !== "undefined" ? window.location.search : ""} />
        ) : null}
      </main>
    </div>
  );
}
