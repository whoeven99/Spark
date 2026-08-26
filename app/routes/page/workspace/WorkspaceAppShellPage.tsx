/**
 * 工作台应用壳：侧边栏导航 + 会话管理 + 面板路由。
 * 面板已精简为 首页(HomePanel) + 对话(ChatPanel)；看板/技能/自动化/任务已上升为顶级目的地
 * 经营(/app/today) / 创作(/app/studio) / 任务(/app/tasks)。对话上下文状态统一在 useWorkspaceContext。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useEmbeddedNavigate } from "../../../hooks/useEmbeddedNavigate";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";
import type { ChatMessage } from "../../../lib/chatMessage";
import { LanguageSelector } from "../../component/common/LanguageSelector";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { WorkspaceDashboardSnapshot } from "../../../lib/workspaceDashboardTypes";
import { normalizeWorkspaceDashboardSnapshot } from "../../../lib/workspaceDashboardTypes";
import { useChatStream } from "../chat/useChatStream";
import { ChatPanel } from "./ChatPanel";
import { HomePanel } from "./HomePanel";
import { HomeV2Panel } from "./HomeV2Panel";
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
  type ContextTool,
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
  if (name === "home") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M2.2 6.8 L7 3.2 L11.8 6.8" />
        <path d="M3.8 6.9 V11.4 H10.2 V6.9" />
      </svg>
    );
  }
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

// 工作台左栏只保留 首页（其余 看板/技能/自动化/任务列表 已上升为顶级目的地 经营/创作/任务）。
const panelItems: Array<{
  key: Exclude<WorkspacePanel, "chat">;
  labelKey: "workspace.shell.panels.home";
}> = [
  { key: "home", labelKey: "workspace.shell.panels.home" },
];

function isLaunchContextTool(value: string | null): value is ContextTool {
  return value === "product" || value === "article" || value === "order" || value === "file";
}

// ── 左栏会话列表：时间分组与相对时间 ─────────────────────────────────────────

/** 账户展示名兜底（无 session 在线用户信息时，退回到店铺名/通用名，由 loader 传入 accountName）。 */
const CONVERSATION_GROUP_ORDER = ["today", "yesterday", "last7Days", "earlier"] as const;

type ConversationGroupKey = (typeof CONVERSATION_GROUP_ORDER)[number];

function conversationGroupKey(iso: string): ConversationGroupKey {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = date.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfToday - 24 * 60 * 60 * 1000) return "yesterday";
  if (t >= startOfToday - 6 * 24 * 60 * 60 * 1000) return "last7Days";
  return "earlier";
}

function conversationGroupLabel(
  group: "pinned" | ConversationGroupKey,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const map = {
    pinned: "workspace.shell.groups.pinned",
    today: "workspace.shell.groups.today",
    yesterday: "workspace.shell.groups.yesterday",
    last7Days: "workspace.shell.groups.last7Days",
    earlier: "workspace.shell.groups.earlier",
  } as const;
  return t(map[group]);
}

function conversationTimeLabel(
  iso: string,
  t: ReturnType<typeof useTranslation>["t"],
  locale: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const group = conversationGroupKey(iso);
  if (group === "today") {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  if (group === "yesterday") return t("workspace.shell.groups.yesterday");
  if (group === "last7Days") {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  }
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
const UNTITLED_CONVERSATION_TITLES = new Set(["新对话", "New chat", "New conversation"]);

function isDraftConversationId(id: string): boolean {
  return id.startsWith(DRAFT_CONVERSATION_PREFIX);
}

function isUntitledConversationTitle(title: string): boolean {
  return UNTITLED_CONVERSATION_TITLES.has(title.trim());
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

export function WorkspaceAppShellPage({
  initialConversationList = [],
  dashboardSnapshot,
  accountName,
  defaultPanel = "home",
  autoCreateConversation = false,
  homeVariant = "default",
  homeRenderTimeIso,
}: {
  initialConversationList?: ConversationSummary[];
  dashboardSnapshot?: WorkspaceDashboardSnapshot;
  accountName?: string;
  defaultPanel?: WorkspacePanel;
  autoCreateConversation?: boolean;
  /** 并行首页预览：v2 用精简 HomeV2Panel，发送后仍在本页进入 ChatPanel。 */
  homeVariant?: "default" | "v2";
  homeRenderTimeIso?: string;
}) {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const navigate = useEmbeddedNavigate();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const defaultDashboardSnapshot = useMemo<WorkspaceDashboardSnapshot>(
    () => ({
      hasData: false,
      metrics: [
        { label: t("workspace.dashboard.metrics.sales"), value: "—", delta: "—", tone: "neutral" },
        { label: t("workspace.dashboard.metrics.orders"), value: "—", delta: "—", tone: "neutral" },
        {
          label: t("workspace.dashboard.metrics.conversionRate"),
          value: "—",
          delta: "—",
          tone: "neutral",
          pendingIntegration: true,
        },
        { label: t("workspace.dashboard.metrics.aov"), value: "—", delta: "—", tone: "neutral" },
        { label: t("workspace.dashboard.metrics.refundRate"), value: "—", delta: "—", tone: "neutral" },
        { label: t("workspace.dashboard.metrics.riskSku"), value: "—", delta: "—", tone: "neutral" },
      ],
      alerts: [],
      suggestions: [],
      recentTaskSummaries: [],
    }),
    [t],
  );
  const effectiveDashboardSnapshot = normalizeWorkspaceDashboardSnapshot(
    dashboardSnapshot,
    defaultDashboardSnapshot,
  );
  const displayName = accountName?.trim() || t("workspace.shell.defaultAccountName");
  const newConversationTitle = t("workspace.shell.newConversationTitle");
  const [searchParams, setSearchParams] = useSearchParams();
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const { isMobile } = useResponsiveLayout();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationList, setConversationList] = useState<Conversation[]>(
    Array.isArray(initialConversationList) ? initialConversationList : [],
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    autoCreateConversation
      ? null
      : Array.isArray(initialConversationList)
        ? initialConversationList[0]?.id ?? null
        : null,
  );
  const [draftByConversation, setDraftByConversation] = useState<Record<string, string>>({});
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, WorkspaceConversationMessage[]>>({});
  const loadedConvIdsRef = useRef<Set<string>>(new Set());
  const createConversationRef = useRef<((options?: { draft?: string; assistantText?: string }) => void) | null>(null);
  const processedPrefillPromptRef = useRef<string | null>(null);
  const initializedAssistantLandingRef = useRef(false);
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
      shopify.toast.show(t("workspace.shell.toast.renameFailed"));
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
  const pendingHomeContextToolRef = useRef<ContextTool | null>(null);
  const pendingAutoSendRef = useRef(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);

  const panelParam = searchParams.get("panel");
  const activePanel: WorkspacePanel = isWorkspacePanel(panelParam) ? panelParam : defaultPanel;
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
          const rawMessages = Array.isArray(data.messages) ? data.messages : [];
          return {
            ...current,
            [activeConversationId]: (rawMessages as Parameters<typeof dbMessageToUiMessage>[0][]).map(
              dbMessageToUiMessage,
            ),
          };
        });
      })
      .catch((err) => {
        console.error("[WorkspaceAppShellPage] load messages failed:", err);
        setMessagesByConversation((current) => ({ ...current, [activeConversationId]: [] }));
      });
  }, [activeConversationId]);

  useEffect(() => {
    const tool = pendingHomeContextToolRef.current;
    if (activePanel !== "chat" || !activeConversationId || !tool) return;
    pendingHomeContextToolRef.current = null;
    workspaceContext.toggleContextTool(tool);
  }, [activePanel, activeConversationId, workspaceContext]);

  const switchPanel = (panel: WorkspacePanel) => {
    if (panel !== "chat") {
      pruneEmptyDraftConversations();
    }
    const next = new URLSearchParams(searchParams);
    if (panel === defaultPanel) {
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
            switchPanel("home");
          }
        }
        shopify.toast.show(t("workspace.shell.toast.deleted"));
        return;
      }

      const res = await fetch(`/api/conversations/${conversationId}${authQuery}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        shopify.toast.show(t("workspace.shell.toast.deleteFailed"));
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
          switchPanel("home");
        }
      }
      shopify.toast.show(t("workspace.shell.toast.deleted"));
      if (isMobile) setSidebarOpen(false);
    } catch (err) {
      console.error("[WorkspaceAppShellPage] delete conversation failed:", err);
      shopify.toast.show(t("workspace.shell.toast.deleteFailed"));
    }
  };

  const createConversation = (options?: {
    draft?: string;
    assistantText?: string;
    autoSend?: boolean;
  }) => {
    const nextDraft = options?.draft ?? "";
    const assistantText =
      options?.assistantText ??
      t("workspace.shell.conversation.welcome");
    pendingAutoSendRef.current = Boolean(options?.autoSend && nextDraft.trim());
    // 已存在空会话（草稿或落库的"新对话"）时直接复用，避免列表里堆积重复空会话
    const existingEmpty = conversationList.find(
      (conversation) =>
        isUntitledConversationTitle(conversation.title) &&
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
      title: newConversationTitle,
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

  createConversationRef.current = createConversation;
  const prefillWelcomeText = t("workspace.shell.conversation.prefillWelcome");

  useEffect(() => {
    const prefillPrompt = searchParams.get("prefillTaskPrompt");
    const rawOpenContextTool = searchParams.get("openContextTool");
    const openContextTool = isLaunchContextTool(rawOpenContextTool)
      ? rawOpenContextTool
      : null;
    const prefillSignature = JSON.stringify({
      prompt: prefillPrompt ?? "",
      openContextTool: openContextTool ?? "",
    });
    if (!prefillPrompt && !openContextTool) {
      processedPrefillPromptRef.current = null;
      return;
    }
    if (processedPrefillPromptRef.current === prefillSignature) return;
    processedPrefillPromptRef.current = prefillSignature;
    if (openContextTool) {
      pendingHomeContextToolRef.current = openContextTool;
    }
    createConversationRef.current?.({
      draft: prefillPrompt ?? "",
      assistantText: prefillWelcomeText,
    });
    const next = new URLSearchParams(searchParams);
    next.delete("prefillTaskPrompt");
    next.delete("prefillConstraint");
    next.delete("openContextTool");
    setSearchParams(next);
  }, [prefillWelcomeText, searchParams, setSearchParams]);

  useEffect(() => {
    if (!autoCreateConversation) return;
    if (initializedAssistantLandingRef.current) return;
    if (activeConversationId) return;
    if (searchParams.get("prefillTaskPrompt")) return;
    if (isLaunchContextTool(searchParams.get("openContextTool"))) return;

    initializedAssistantLandingRef.current = true;
    createConversationRef.current?.();
  }, [activeConversationId, autoCreateConversation, searchParams]);

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
          shopify.toast.show(t("workspace.shell.toast.createFailed"));
          return;
        }
        const data = (await res.json()) as { conversation: ConversationSummary };
        renameConversationInState(conversationId, data.conversation);
        conversationId = data.conversation.id;
        conversationTitle = data.conversation.title;
      } catch (err) {
        console.error("[WorkspaceAppShellPage] persist draft conversation failed:", err);
        shopify.toast.show(t("workspace.shell.toast.createFailed"));
        return;
      }
    }

    replyEpochRef.current += 1;
    const epoch = replyEpochRef.current;
    const nextPreview = content.length > 28 ? `${content.slice(0, 28)}...` : content;
    const isNewTitle = isUntitledConversationTitle(conversationTitle);
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
              ? t("workspace.shell.chat.requestFailed", { status: payload.httpStatus })
              : payload.aborted && !payload.reply.trim()
                ? t("workspace.shell.chat.replyStopped")
                : payload.reply.trim() || t("workspace.shell.chat.invalidReply");

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
          {
            role: "assistant",
            text: t("workspace.shell.chat.sendFailed"),
            time: t("workspace.shell.chat.justNow"),
          },
        ],
      }));
    }
  };

  useEffect(() => {
    if (!pendingAutoSendRef.current) return;
    if (activePanel !== "chat" || !activeConversation) return;
    const content = (draftByConversation[activeConversation.id] ?? "").trim();
    if (!content || streamingConversationId === activeConversation.id) return;
    pendingAutoSendRef.current = false;
    void sendMessage();
    // sendMessage 随渲染重建；只在会话/草稿就绪时触发一次自动发送。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation, activePanel, draftByConversation, streamingConversationId]);

  /**
   * TaskProposal 确认执行成功：向对话追加一轮「开始执行」交互
   * （用户侧指令 + 助手侧 TaskRunChatCard），并落库持久化。
   */
  const handleTaskProposalExecuted = (conversationId: string, run: TaskRunPayload) => {
    // 导航徽章乐观更新（30s 轮询会校正）
    setRunningTaskCount((current) => current + run.taskIds.length);
    const userText = t("workspace.shell.taskRun.userText", {
      title: run.title,
      count: run.taskIds.length,
    });
    const assistantText =
      run.errors.length > 0
        ? t("workspace.shell.taskRun.assistantTextPartial", {
            count: run.taskIds.length,
            failed: run.errors.length,
          })
        : t("workspace.shell.taskRun.assistantText", { count: run.taskIds.length });
    const userMessage: WorkspaceConversationMessage = {
      role: "user",
      text: userText,
      time: t("workspace.shell.chat.justNow"),
    };
    const assistantMessage: WorkspaceConversationMessage = {
      role: "assistant",
      text: assistantText,
      time: t("workspace.shell.chat.justNow"),
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
    ? activeConversation?.title ?? newConversationTitle
    : t(
        panelItems.find((item) => item.key === activePanel)?.labelKey ??
          "workspace.shell.workspaceTitle",
      );

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
              title={t("workspace.shell.actions.collapseSidebar")}
              aria-label={t("workspace.shell.actions.collapseSidebar")}
            >
              «
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="sidebar-new-chat-btn workspace-primary-btn"
          style={newChatButtonStyle}
          onClick={() => createConversation()}
        >
          <span style={newChatPlusBadgeStyle}>+</span>
          <span>{t("workspace.shell.actions.newChat")}</span>
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
              <span>{t(item.labelKey)}</span>
              {item.key === "tasks" && runningTaskCount > 0 ? (
                <span
                  style={navBadgeStyle}
                  title={t("workspace.shell.status.runningTasksCount", { count: runningTaskCount })}
                >
                  {runningTaskCount}
                </span>
              ) : null}
              {item.key === "dashboard" && effectiveDashboardSnapshot.automation?.status === "attention" ? (
                <span style={navDotStyle} title={t("workspace.shell.status.attentionItems")} />
              ) : null}
            </button>
          ))}
        </div>

        <div style={sidebarDividerStyle} />

        <div style={sidebarSectionStyle}>
          <div style={sidebarSectionHeadStyle}>
            <span>{t("workspace.shell.recentConversations")}</span>
          </div>
          <input
            value={conversationSearch}
            onChange={(event) => setConversationSearch(event.target.value)}
            placeholder={t("workspace.shell.searchPlaceholder")}
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
                    {keyword
                      ? t("workspace.shell.noMatchingConversations")
                      : t("workspace.shell.noConversations")}
                  </div>
                );
              }
              const pinnedSet = new Set(pinnedIds);
              const pinned = filtered.filter((conversation) => pinnedSet.has(conversation.id));
              const rest = filtered.filter((conversation) => !pinnedSet.has(conversation.id));
              const groups = new Map<string, typeof filtered>();
              if (pinned.length > 0) groups.set("pinned", pinned);
              for (const conversation of rest) {
                const label = conversationGroupKey(conversation.updatedAt);
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
                            <span
                              style={pinnedStarStyle}
                              aria-label={t("workspace.shell.actions.pinned")}
                            >
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
                            {conversationTimeLabel(conversation.updatedAt, t, locale)}
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
                            aria-label={t("workspace.shell.actions.conversationMenuAria", {
                              title: conversation.title,
                            })}
                            title={t("workspace.shell.actions.moreActions")}
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
                                {isPinned
                                  ? t("workspace.shell.actions.unpin")
                                  : t("workspace.shell.actions.pin")}
                              </button>
                              <button
                                type="button"
                                style={conversationMenuItemStyle()}
                                onClick={() => {
                                  startRenameConversation(conversation.id, conversation.title);
                                  setConversationMenuId(null);
                                }}
                              >
                                {t("workspace.shell.actions.rename")}
                              </button>
                              <button
                                type="button"
                                style={conversationMenuItemStyle(true)}
                                onClick={() => {
                                  setConversationMenuId(null);
                                  void removeConversation(conversation.id);
                                }}
                              >
                                {t("workspace.shell.actions.delete")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                );
              };
              return (["pinned", ...CONVERSATION_GROUP_ORDER] as const)
                .filter((label) => groups.has(label))
                .map((label) => (
                  <div key={label}>
                    <div style={conversationGroupLabelStyle}>
                      {conversationGroupLabel(label, t)}
                    </div>
                    {groups.get(label)!.map(renderRow)}
                  </div>
                ));
            })()}
          </div>
          <div style={sidebarQuotaRowStyle}>
            <span>
              {t("workspace.shell.conversationsQuota", {
                count: Math.min(
                  conversationList.filter((conversation) => conversation.preview?.trim()).length,
                  50,
                ),
              })}
            </span>
            {runningTaskCount > 0 ? (
              <span>{t("workspace.shell.status.runningTasksCount", { count: runningTaskCount })}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={accountMenuRef} style={accountMenuWrapStyle}>
        {accountMenuOpen ? (
          <div style={accountMenuStyle}>
            <div style={accountMenuSectionStyle}>
              <div style={accountMenuLabelStyle}>{t("workspace.shell.account.language")}</div>
              <LanguageSelector />
            </div>
            <button
              type="button"
              style={accountMenuItemStyle}
              onClick={() => {
                setAccountMenuOpen(false);
                if (isMobile) setSidebarOpen(false);
                navigate("/app/account");
              }}
            >
              Billing
            </button>
          </div>
        ) : null}
        <button type="button" style={sidebarFooterButtonStyle} onClick={() => setAccountMenuOpen((current) => !current)}>
          <div>
            <div style={brandTitleStyle}>{displayName}</div>
            <div style={brandMetaStyle}>{t("workspace.shell.account.workspaceLabel")}</div>
          </div>
          <div style={footerTagStyle}>{t("workspace.shell.status.online")}</div>
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
          title={t("workspace.shell.actions.expandSidebar")}
          aria-label={t("workspace.shell.actions.expandSidebar")}
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
          onClick={() => createConversation()}
          title={t("workspace.shell.actions.newChat")}
          aria-label={t("workspace.shell.actions.newChat")}
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
            title={t(item.labelKey)}
            aria-label={t(item.labelKey)}
          >
            <NavIcon name={item.key} />
            {item.key === "tasks" && runningTaskCount > 0 ? (
              <span
                style={collapsedDotStyle("#4070f4")}
                title={t("workspace.shell.status.runningTasksCount", { count: runningTaskCount })}
              />
            ) : null}
            {item.key === "dashboard" && effectiveDashboardSnapshot.automation?.status === "attention" ? (
              <span
                style={collapsedDotStyle("#f0a01d")}
                title={t("workspace.shell.status.attentionItems")}
              />
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        style={{ ...collapsedIconButtonStyle(false), borderRadius: "50%" }}
        onClick={toggleSidebarCollapsed}
        title={t("workspace.shell.actions.expandSidebarAccount")}
        aria-label={t("workspace.shell.actions.expandSidebarAccount")}
      >
        {displayName.slice(0, 1).toUpperCase()}
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
              aria-label={t("workspace.shell.actions.openNavigation")}
            >
              ☰
            </button>
            <div style={mobileTopBarTitleWrapStyle}>
              <div style={brandMetaStyle}>{t("workspace.shell.account.workspaceLabel")}</div>
              <div style={mobileTopBarTitleStyle}>{activePanelLabel}</div>
            </div>
            <button
              type="button"
              style={mobileTopBarButtonStyle}
              onClick={() => createConversation()}
              aria-label={t("workspace.shell.actions.newChat")}
            >
              +
            </button>
          </div>
          {sidebarOpen ? (
            <div
              style={mobileSidebarBackdropStyle}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setSidebarOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSidebarOpen(false);
                }
              }}
            >
              <aside
                style={{ ...sidebarStyle, ...mobileSidebarStyle }}
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
        {activePanel === "home" && homeVariant === "v2" ? (
          <HomeV2Panel
            displayName={displayName}
            initialRenderTimeIso={homeRenderTimeIso}
            onSubmitPrompt={(prompt) => createConversation({ draft: prompt, autoSend: true })}
            onOpenContextTool={(tool) => {
              pendingHomeContextToolRef.current = tool;
              createConversation();
            }}
            onMoreContext={() => {
              pendingHomeContextToolRef.current = "article";
              createConversation();
            }}
          />
        ) : null}
        {activePanel === "home" && homeVariant !== "v2" ? (
          <HomePanel
            displayName={displayName}
            snapshot={effectiveDashboardSnapshot}
            onSubmitPrompt={(prompt) => createConversation({ draft: prompt })}
            onOpenContextTool={(tool) => {
              pendingHomeContextToolRef.current = tool;
              createConversation();
            }}
            onMoreContext={() => {
              pendingHomeContextToolRef.current = "article";
              createConversation();
            }}
            onOpenDashboard={() => navigate("/app/today")}
            onOpenDailyOps={() => navigate("/app/health-monitor")}
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
            onAiTaskUpdated={handleAiTaskUpdated}
            onOpenTasks={() => navigate("/app/tasks")}
            onTaskProposalExecuted={handleTaskProposalExecuted}
          />
        ) : null}
      </main>
    </div>
  );
}
