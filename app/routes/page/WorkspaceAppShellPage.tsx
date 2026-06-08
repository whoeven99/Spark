import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type {
  ChatMessage,
  ChatMessageAttachment,
  ProductImproveCardPayload,
} from "../../lib/chatMessage";
import type { ImageGenerationFormPayload } from "../../lib/imageGenerationFormPayload";
import { coerceImageGenerationFormPayload } from "../../lib/imageGenerationFormPayload";
import type { PictureTranslateFormPayload } from "../../lib/pictureTranslateFormPayload";
import { coercePictureTranslateFormPayload } from "../../lib/pictureTranslateFormPayload";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { coerceTranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { ChatMessages } from "../component/chat/ChatMessages";
import { StreamingAssistantReply } from "../component/chat/StreamingAssistantReply";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { useChatStream, type ChatStreamFinishPayload, type SkillStepProgress } from "./chat/useChatStream";
import { ContextWindowIndicator } from "../component/chat/ContextWindowIndicator";
import { WorkspaceContextObjectPicker } from "../component/chat/WorkspaceContextObjectPicker";
import { estimateMessagesTokens } from "../../lib/tokenEstimate";
import type { SelectedShopifyObject } from "../../lib/shopifyObjectTypes";

type WorkspacePanel = "dashboard" | "chat" | "skills" | "automation" | "tasks";
type AutomationView = "configured" | "history" | "templates";
type TaskKind = "automation" | "one_off";
type TaskStatus = "executing" | "review_required" | "completed" | "failed";
type ObjectType = "product" | "article" | "order";
type ContextTool = ObjectType | "file" | "media";

type WorkspaceConversationMessage = {
  role: "assistant" | "user";
  text: string;
  time: string;
  attachments?: ChatMessageAttachment[];
  translationTaskForm?: TranslationTaskFormPayload;
  productImproveCard?: boolean;
  productImproveCardPayload?: ProductImproveCardPayload;
  pictureTranslateCard?: boolean;
  pictureTranslateFormPayload?: PictureTranslateFormPayload;
  imageGenerationCard?: boolean;
  imageGenerationFormPayload?: ImageGenerationFormPayload;
  thinkingContent?: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
};

type Conversation = ConversationSummary;

type TaskRecord = {
  id: string;
  title: string;
  kind: TaskKind;
  source: string;
  status: TaskStatus;
  progress: number;
  updatedAt: string;
  summary: string;
  action: string;
};

type DashboardMetric = {
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "negative" | "neutral";
};

type SkillApp = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  path: string;
};

type AutomationConfiguredItem = {
  id: string;
  title: string;
  schedule: string;
  lastRun: string;
  status: "healthy" | "attention";
  outcome: string;
};

type ObjectOption = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

type LocalFileItem = {
  id: string;
  name: string;
  size: string;
  note: string;
  /** 服务端上传后返回的真实文件 ID（用于注入 agent 上下文） */
  serverId: string | null;
  charCount?: number;
  uploading?: boolean;
  uploadError?: string;
};

type RichMediaItem = {
  id: string;
  title: string;
  kind: "url" | "image" | "video";
  value: string;
  note: string;
};

type ObjectFilterKey = "all" | "focus" | "draft" | "issue";

const panelItems: Array<{ key: Exclude<WorkspacePanel, "chat">; label: string; icon: string }> = [
  { key: "dashboard", label: "经营看板", icon: "◫" },
  { key: "skills", label: "技能", icon: "✦" },
  { key: "automation", label: "自动化", icon: "↻" },
  { key: "tasks", label: "任务列表", icon: "≡" },
];

const objectTypeLabels: Record<ObjectType, string> = {
  product: "商品",
  article: "文章",
  order: "订单",
};

const objectOptions: Record<ObjectType, ObjectOption[]> = {
  product: [
    { id: "prd-1001", title: "Summer Breeze Dress", subtitle: "女装 / 连衣裙 / 夏季新品", meta: "SKU SB-1001 · 库存 28" },
    { id: "prd-1002", title: "Cloud Knit Cardigan", subtitle: "女装 / 针织衫 / 低转化", meta: "SKU CK-2020 · 库存 16" },
    { id: "prd-1003", title: "Travel Mini Bag", subtitle: "配饰 / 包袋 / 高访问", meta: "SKU TB-4402 · 库存 52" },
    { id: "prd-1004", title: "Linen Resort Shirt", subtitle: "男装 / 衬衫 / 夏季新品", meta: "SKU LR-3011 · 库存 9" },
    { id: "prd-1005", title: "Weekend Sandals", subtitle: "鞋履 / 凉鞋 / 广告主推", meta: "SKU WS-2201 · 库存 41" },
  ],
  article: [
    { id: "art-201", title: "夏季穿搭趋势指南", subtitle: "Blog / 内容营销 / 已发布", meta: "最近更新 2 天前 · 浏览 1.2k" },
    { id: "art-202", title: "度假系列面料故事", subtitle: "Blog / 品牌内容 / 草稿", meta: "作者 Luna · 草稿" },
    { id: "art-203", title: "客户常见尺码问题", subtitle: "Help Center / FAQ", meta: "最近更新 1 周前" },
    { id: "art-204", title: "新品上市邮件脚本", subtitle: "Campaign / 邮件素材", meta: "最近使用 昨天" },
  ],
  order: [
    { id: "ord-9101", title: "#9101", subtitle: "美国站 / 高客单 / 待发货", meta: "$182.00 · 2 件商品" },
    { id: "ord-9102", title: "#9102", subtitle: "英国站 / 退款申请", meta: "$64.00 · 退款中" },
    { id: "ord-9103", title: "#9103", subtitle: "美国站 / 异常履约", meta: "$119.00 · 超时 16h" },
    { id: "ord-9104", title: "#9104", subtitle: "日本站 / 正常", meta: "$73.00 · 已发货" },
  ],
};

const initialLocalFiles: LocalFileItem[] = [
  { id: "file-1", name: "brand-guideline.pdf", size: "2.3 MB", note: "品牌语气和禁用词说明", serverId: null },
  { id: "file-2", name: "product-seo-rules.docx", size: "540 KB", note: "商品标题与描述 SEO 规范", serverId: null },
];

const initialRichMediaItems: RichMediaItem[] = [
  { id: "media-1", title: "Summer campaign landing", kind: "url", value: "https://spark-demo.shop/summer", note: "活动落地页 URL" },
  { id: "media-2", title: "hero-reference.jpg", kind: "image", value: "https://cdn.spark.demo/hero-reference.jpg", note: "主视觉参考图" },
  { id: "media-3", title: "product-demo.mp4", kind: "video", value: "https://cdn.spark.demo/product-demo.mp4", note: "商品讲解视频" },
];

const objectFilterLabels: Record<ObjectType, Array<{ key: ObjectFilterKey; label: string }>> = {
  product: [
    { key: "all", label: "全部" },
    { key: "focus", label: "新品" },
    { key: "draft", label: "低转化" },
    { key: "issue", label: "高访问" },
  ],
  article: [
    { key: "all", label: "全部" },
    { key: "focus", label: "已发布" },
    { key: "draft", label: "草稿" },
    { key: "issue", label: "帮助中心" },
  ],
  order: [
    { key: "all", label: "全部" },
    { key: "focus", label: "待发货" },
    { key: "draft", label: "退款中" },
    { key: "issue", label: "异常" },
  ],
};


const dashboardMetrics: DashboardMetric[] = [
  { label: "销售额", value: "$12,540", delta: "+8.4%", tone: "positive" },
  { label: "订单数", value: "186", delta: "+5.1%", tone: "positive" },
  { label: "转化率", value: "2.84%", delta: "-0.3%", tone: "negative" },
  { label: "客单价", value: "$67.4", delta: "+3.8%", tone: "positive" },
  { label: "退款率", value: "1.2%", delta: "-0.4%", tone: "positive" },
  { label: "库存风险 SKU", value: "7", delta: "+2", tone: "negative" },
];

const dashboardSuggestions = [
  "SKU-204 库存仅剩 3 件，建议今天内补货，避免周末断货。",
  "新品系列访问量上涨但转化率偏低，优先补齐商品描述和场景图。",
  "美国站移动端退款率连续 3 天上升，建议排查尺码描述与物流时效。",
  "表现最好的 12 个商品关键词已收敛，可批量同步到同类商品标题。",
];

const dashboardAlerts = [
  { title: "库存预警", detail: "7 个高销量 SKU 库存低于安全阈值", tone: "warning" as const },
  { title: "转化波动", detail: "新品页访问量增加，但转化率低于 7 天均值", tone: "info" as const },
  { title: "退款异常", detail: "美国站某尺码退款订单占比偏高", tone: "critical" as const },
];

const dashboardTaskSummary = [
  { title: "商品描述生成", result: "已完成 24 个商品，预计提升搜索匹配度 3%-5%" },
  { title: "日语翻译", result: "已翻译 42 个商品，准备进入人工审核" },
  { title: "库存预警", result: "今日已发送 150 条预警通知，覆盖 9 个高销量系列" },
];

const skillApps: SkillApp[] = [
  { id: "s1", title: "商品文案优化", description: "批量生成和优化商品标题、卖点与描述。", status: "最近使用", category: "内容", path: "/app/product-improve" },
  { id: "s2", title: "多语言翻译", description: "支持商品内容、页面文案与术语统一翻译。", status: "可用", category: "翻译", path: "/app/translation" },
  { id: "s3", title: "店铺诊断", description: "汇总经营指标并给出异常原因和建议。", status: "推荐", category: "分析", path: "/app/additional" },
  { id: "s4", title: "图片工具", description: "处理商品图翻译、文生图和素材优化。", status: "可用", category: "视觉", path: "/app/image-studio" },
  { id: "s5", title: "广告素材建议", description: "结合商品和活动目标生成广告文案建议。", status: "内测", category: "营销", path: "/app" },
  { id: "s6", title: "邮件运营助手", description: "根据商品和分群生成邮件主题与正文。", status: "可用", category: "运营", path: "/app" },
];

const automationConfigured: AutomationConfiguredItem[] = [
  { id: "auto-01", title: "每日经营简报", schedule: "每天 09:00", lastRun: "今天 09:00", status: "healthy", outcome: "已生成日报并推送到工作台" },
  { id: "auto-02", title: "订单异常巡检", schedule: "每 2 小时", lastRun: "10 分钟前", status: "attention", outcome: "发现 6 条高风险订单待复核" },
  { id: "auto-03", title: "库存风险提醒", schedule: "每天 12:00", lastRun: "今天 12:00", status: "healthy", outcome: "已通知 7 个低库存 SKU" },
];

const automationHistory = [
  { id: "run-201", title: "经营简报", detail: "今天 09:00 执行成功，覆盖销售额、订单和退款摘要" },
  { id: "run-200", title: "订单异常巡检", detail: "今天 08:00 执行完成，标记 3 条异常退款订单" },
  { id: "run-199", title: "库存风险提醒", detail: "昨天 12:00 执行完成，推送 9 条补货建议" },
];

const automationTemplates = [
  { id: "tpl-1", title: "新品发布监控", detail: "围绕新品流量、转化和评价生成每日摘要" },
  { id: "tpl-2", title: "退款异常告警", detail: "按站点和 SKU 追踪退款率波动并推送提醒" },
  { id: "tpl-3", title: "SEO 标题优化批次", detail: "定时扫描表现弱的商品并生成标题优化建议" },
];

const initialTasks: TaskRecord[] = [
  { id: "TASK-241198", title: "每日订单异常巡检", kind: "automation", source: "订单监控", status: "executing", progress: 64, updatedAt: "2 分钟前", summary: "正在扫描退款、超时履约和异常金额订单。", action: "查看运行日志" },
  { id: "TASK-241190", title: "多语言商品翻译", kind: "one_off", source: "翻译工具", status: "executing", progress: 51, updatedAt: "11 分钟前", summary: "英语与日语翻译已过半，正在写回结果。", action: "查看进度" },
  { id: "TASK-241177", title: "新品描述补齐", kind: "one_off", source: "AI 对话", status: "review_required", progress: 100, updatedAt: "今天 09:03", summary: "已补齐 24 个新品描述，待人工审核。", action: "进入审核" },
  { id: "TASK-241160", title: "每日经营简报", kind: "automation", source: "经营看板", status: "completed", progress: 100, updatedAt: "今天 09:00", summary: "已生成日报并同步到 Dashboard。", action: "查看简报" },
  { id: "TASK-241155", title: "异常订单重跑", kind: "automation", source: "订单监控", status: "failed", progress: 100, updatedAt: "昨天 19:04", summary: "重跑失败，原因是订单数据源响应超时。", action: "重新执行" },
];

function isWorkspacePanel(value: string | null): value is WorkspacePanel {
  return value === "dashboard" || value === "chat" || value === "skills" || value === "automation" || value === "tasks";
}

function isObjectType(value: ContextTool | null): value is ObjectType {
  return value === "product" || value === "article" || value === "order";
}

export function WorkspaceAppShellPage({ initialConversationList = [] }: { initialConversationList?: ConversationSummary[] }) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [conversationList, setConversationList] = useState<Conversation[]>(initialConversationList);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationList.length > 0 ? initialConversationList[0].id : null,
  );
  const [draftByConversation, setDraftByConversation] = useState<Record<string, string>>({});
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, WorkspaceConversationMessage[]>>({});
  const loadedConvIdsRef = useRef<Set<string>>(new Set());
  const [automationView, setAutomationView] = useState<AutomationView>("configured");
  const [taskFilter, setTaskFilter] = useState<"all" | TaskKind>("all");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeContextTool, setActiveContextTool] = useState<ContextTool | null>(null);
  const [objectQueryByType, setObjectQueryByType] = useState<Record<ObjectType, string>>({
    product: "",
    article: "",
    order: "",
  });
  const [selectedObjectsByType, setSelectedObjectsByType] = useState<
    Record<ObjectType, SelectedShopifyObject[]>
  >({
    product: [],
    article: [],
    order: [],
  });
  const [localFiles, setLocalFiles] = useState<LocalFileItem[]>(initialLocalFiles);
  const [richMediaItems, setRichMediaItems] = useState<RichMediaItem[]>(initialRichMediaItems);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
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
    skillSteps,
    sendMessage: streamConversation,
    prepareStreaming,
    abort: abortStream,
  } = useChatStream();
  const replyEpochRef = useRef(0);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);

  const panelParam = searchParams.get("panel");
  const activePanel: WorkspacePanel = isWorkspacePanel(panelParam) ? panelParam : "dashboard";
  const activeConversation = conversationList.find((item) => item.id === activeConversationId) ?? null;
  const activeMessages = activeConversation ? (messagesByConversation[activeConversation.id] ?? []) : [];
  const filteredTasks = useMemo(
    () => (taskFilter === "all" ? initialTasks : initialTasks.filter((task) => task.kind === taskFilter)),
    [taskFilter],
  );

  // Lazy-load messages when switching to a conversation for the first time
  useEffect(() => {
    if (!activeConversationId) return;
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
    const next = new URLSearchParams(searchParams);
    if (panel === "dashboard") {
      next.delete("panel");
    } else {
      next.set("panel", panel);
    }
    setSearchParams(next);
  };

  const openConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    switchPanel("chat");
  };

  const removeConversation = async (conversationId: string) => {
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    try {
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
    } catch (err) {
      console.error("[WorkspaceAppShellPage] delete conversation failed:", err);
      shopify.toast.show("删除对话失败");
    }
  };

  const createConversation = async () => {
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    try {
      const res = await fetch(`/api/conversations${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { conversation: ConversationSummary };
      const conv = data.conversation;
      const welcomeMsg: WorkspaceConversationMessage = {
        role: "assistant",
        text: "新的对话已经创建。你可以先在下方工具栏补充商品、订单、文章、文件或富媒体，再发送任务需求。",
        time: formatTimeLabel(new Date()),
      };
      loadedConvIdsRef.current.add(conv.id);
      setConversationList((current) => [conv, ...current].slice(0, 50));
      setMessagesByConversation((current) => ({ ...current, [conv.id]: [welcomeMsg] }));
      setDraftByConversation((current) => ({ ...current, [conv.id]: "" }));
      setActiveContextTool(null);
      setActiveConversationId(conv.id);
      switchPanel("chat");
    } catch (err) {
      console.error("[WorkspaceAppShellPage] create conversation failed:", err);
    }
  };

  const clearContext = () => {
    setSelectedObjectsByType({ product: [], article: [], order: [] });
    setSelectedFileIds([]);
    setSelectedMediaIds([]);
    setActiveContextTool(null);
  };

  const clearToolSelection = (tool: ContextTool) => {
    if (isObjectType(tool)) {
      setSelectedObjectsByType((current) => ({ ...current, [tool]: [] }));
      return;
    }
    if (tool === "file") {
      setSelectedFileIds([]);
      return;
    }
    setSelectedMediaIds([]);
  };

  const toggleObjectSelection = (type: ObjectType, object: SelectedShopifyObject) => {
    setSelectedObjectsByType((current) => {
      const currentItems = current[type];
      return {
        ...current,
        [type]: currentItems.some((item) => item.id === object.id)
          ? currentItems.filter((item) => item.id !== object.id)
          : [...currentItems, object],
      };
    });
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((current) => (current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]));
  };

  const toggleMediaSelection = (mediaId: string) => {
    setSelectedMediaIds((current) => (current.includes(mediaId) ? current.filter((id) => id !== mediaId) : [...current, mediaId]));
  };

  const addLocalFile = async (payload: { file: File; note: string }) => {
    const localId = `file-${Date.now()}`;
    const sizeLabel = payload.file.size > 1024 * 1024
      ? `${(payload.file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(payload.file.size / 1024)} KB`;

    setLocalFiles((current) => [
      { id: localId, name: payload.file.name, note: payload.note || "已上传", size: sizeLabel, serverId: null, uploading: true },
      ...current,
    ]);
    setSelectedFileIds((current) => [localId, ...current]);

    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("note", payload.note);
      const res = await fetch(`/api/upload-file${authQuery}`, { method: "POST", body: formData });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `上传失败 (${res.status})`);
      }
      const data = (await res.json()) as { id: string; charCount?: number };
      setLocalFiles((current) =>
        current.map((f) =>
          f.id === localId
            ? { ...f, serverId: data.id, charCount: data.charCount, uploading: false, uploadError: undefined }
            : f,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalFiles((current) =>
        current.map((f) =>
          f.id === localId ? { ...f, uploading: false, uploadError: msg } : f,
        ),
      );
    }
  };

  const deleteLocalFile = async (localId: string, serverId: string | null) => {
    setLocalFiles((current) => current.filter((f) => f.id !== localId));
    setSelectedFileIds((current) => current.filter((id) => id !== localId));
    if (!serverId) return;
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    await fetch(`/api/files/${serverId}/delete${authQuery}`, { method: "DELETE" }).catch(() => {});
  };

  const addRichMediaItem = (payload: { title: string; kind: RichMediaItem["kind"]; value: string; note: string }) => {
    const id = `media-${Date.now()}`;
    setRichMediaItems((current) => [{ id, ...payload }, ...current]);
    setSelectedMediaIds((current) => [id, ...current]);
  };

  const sendMessage = async () => {
    if (!activeConversation) return;
    const content = (draftByConversation[activeConversation.id] ?? "").trim();
    const conversationId = activeConversation.id;
    if (!content || streamingConversationId === conversationId) return;

    replyEpochRef.current += 1;
    const epoch = replyEpochRef.current;
    const priorMessages = messagesByConversation[conversationId] ?? [];
    const nextPreview = content.length > 28 ? `${content.slice(0, 28)}...` : content;
    const isNewTitle = activeConversation.title === "新对话";
    const nextTitle = isNewTitle
      ? (content.length > 18 ? `${content.slice(0, 18)}...` : content)
      : activeConversation.title;
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

    const contextBlock = buildWorkspaceContextBlock({
      selectedObjectsByType,
      selectedFileIds,
      selectedMediaIds,
      localFiles,
      richMediaItems,
    });
    const apiMessages: ChatMessage[] = [
      ...priorMessages.map((message) => workspaceMessageToApiMessage(message)),
      { role: "user", content: augmentUserMessage(content, contextBlock) },
    ];

    const uploadedFileIds = selectedFileIds
      .map((id) => localFiles.find((f) => f.id === id)?.serverId)
      .filter((sid): sid is string => typeof sid === "string");

    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      await streamConversation(apiMessages, {
        url: `/chat-stream${authQuery}`,
        fileIds: uploadedFileIds,
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
                ...(current[conversationId] ?? []),
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
    if (!accountMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [accountMenuOpen]);

  return (
    <div style={shellStyle}>
      <aside style={sidebarStyle}>
        <div>
          <div style={brandRowStyle}>
            <div style={brandBadgeStyle}>S</div>
            <div>
              <div style={brandTitleStyle}>Spark</div>
              <div style={brandMetaStyle}>Shopify AI Workspace</div>
            </div>
          </div>

          <button type="button" style={newTaskButtonStyle} onClick={createConversation}>
            + 新建对话
          </button>

          <div style={navGroupStyle}>
            {panelItems.map((item) => (
              <button
                key={item.key}
                type="button"
                style={navButtonStyle(activePanel === item.key)}
                onClick={() => switchPanel(item.key)}
              >
                <span style={navLabelStyle}>
                  <span style={navIconStyle}>{item.icon}</span>
                  <span>{item.label}</span>
                </span>
              </button>
            ))}
          </div>

          <div style={sidebarSectionStyle}>
            <div style={sidebarSectionHeadStyle}>
              <span>对话记录</span>
              <span style={mutedMetaStyle}>{Math.min(conversationList.length, 50)} / 50</span>
            </div>
            <div style={conversationListStyle}>
              {conversationList.slice(0, 50).map((conversation) => {
                const active = activeConversationId === conversation.id;
                return (
                  <div key={conversation.id} style={historyRowStyle}>
                    <button
                      type="button"
                      style={historyItemStyle(active)}
                      onClick={() => openConversation(conversation.id)}
                    >
                      <span style={historyTitleStyle}>{conversation.title}</span>
                      {conversation.preview ? (
                        <span style={historyPreviewStyle}>{conversation.preview}</span>
                      ) : null}
                      <span style={mutedMetaStyle}>{formatRelativeTime(conversation.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
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
      </aside>

      <main style={contentStyle}>
        {activePanel === "dashboard" ? <DashboardPanel /> : null}
        {activePanel === "chat" && activeConversation ? (
          <ChatPanel
            conversation={activeConversation}
            messages={activeMessages}
            draft={draftByConversation[activeConversation.id] ?? ""}
            activeContextTool={activeContextTool}
            objectQueryByType={objectQueryByType}
            selectedObjectsByType={selectedObjectsByType}
            localFiles={localFiles}
            richMediaItems={richMediaItems}
            selectedFileIds={selectedFileIds}
            selectedMediaIds={selectedMediaIds}
            onDraftChange={(value) =>
              setDraftByConversation((current: Record<string, string>) => ({
                ...current,
                [activeConversation.id]: value,
              }))
            }
            onContextToolChange={(tool) =>
              setActiveContextTool((current) => (current === tool ? null : tool))
            }
            onObjectQueryChange={(type, value) =>
              setObjectQueryByType((current) => ({
                ...current,
                [type]: value,
              }))
            }
            onToggleObjectSelection={toggleObjectSelection}
            onToggleFileSelection={toggleFileSelection}
            onToggleMediaSelection={toggleMediaSelection}
            onAddLocalFile={addLocalFile}
            onDeleteLocalFile={deleteLocalFile}
            onAddRichMediaItem={addRichMediaItem}
            onCloseToolPicker={() => setActiveContextTool(null)}
            onClearToolSelection={clearToolSelection}
            onClearContext={clearContext}
            onSend={sendMessage}
            isStreaming={isStreaming}
            showStreamingReply={streamingConversationId === activeConversation.id}
            streamingText={streamingText}
            streamingThinkingText={streamingThinkingText}
            streamingTranslationForm={streamingTranslationForm}
            streamingGenerateCard={streamingGenerateCard}
            streamingGeneratePayload={streamingGeneratePayload}
            streamingPictureTranslateCard={streamingPictureTranslateCard}
            streamingPictureTranslatePayload={streamingPictureTranslatePayload}
            streamingImageGenerationCard={streamingImageGenerationCard}
            streamingImageGenerationPayload={streamingImageGenerationPayload}
            skillSteps={skillSteps}
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
          <TasksPanel tasks={filteredTasks} filter={taskFilter} onFilterChange={setTaskFilter} />
        ) : null}
      </main>
    </div>
  );
}

function DashboardPanel() {
  return (
    <div style={panelStackStyle}>
      <div style={metricGridStyle}>
        {dashboardMetrics.map((metric) => (
          <article key={metric.label} style={surfaceCardStyle}>
            <div style={metricLabelStyle}>{metric.label}</div>
            <div style={metricValueStyle}>{metric.value}</div>
            <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
          </article>
        ))}
      </div>

      <div style={twoColumnStyle}>
        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>经营提醒</div>
              <div style={sectionTextStyle}>优先处理影响销售、库存和退款的核心问题。</div>
            </div>
            <button type="button" style={ghostButtonStyle}>查看全部</button>
          </div>
          <div style={alertListStyle}>
            {dashboardAlerts.map((alert) => (
              <div key={alert.title} style={alertItemStyle(alert.tone)}>
                <div style={sectionTitleSmallStyle}>{alert.title}</div>
                <div style={sectionTextStyle}>{alert.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>关键趋势</div>
              <div style={sectionTextStyle}>今天、昨天和 7 天均值的简化对比。</div>
            </div>
            <div style={trendLegendStyle}>
              <span style={legendItemStyle("#111827")}>Today</span>
              <span style={legendItemStyle("#94a3b8")}>Yesterday</span>
              <span style={legendItemStyle("#d1d5db")}>7d Avg</span>
            </div>
          </div>
          <div style={chartStyle}>
            {[
              { label: "销售额", values: [88, 74, 66] },
              { label: "订单", values: [72, 68, 61] },
              { label: "转化", values: [49, 54, 57] },
            ].map((group) => (
              <div key={group.label} style={chartRowStyle}>
                <div style={chartLabelStyle}>{group.label}</div>
                <div style={barGroupStyle}>
                  {group.values.map((value, index) => (
                    <div key={`${group.label}-${value}`} style={barTrackStyle}>
                      <div
                        style={{
                          ...barFillStyle,
                          width: `${value}%`,
                          background: index === 0 ? "#111827" : index === 1 ? "#94a3b8" : "#d1d5db",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={twoColumnStyle}>
        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>AI 自动化执行摘要</div>
              <div style={sectionTextStyle}>今天自动化和单次任务带来的实际产出。</div>
            </div>
            <div style={mutedMetaStyle}>{initialTasks.length} 个任务</div>
          </div>
          <div style={listColumnStyle}>
            {dashboardTaskSummary.map((item) => (
              <div key={item.title} style={summaryItemStyle}>
                <div style={sectionTitleSmallStyle}>{item.title}</div>
                <div style={sectionTextStyle}>{item.result}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={surfaceCardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={sectionTitleStyle}>经营建议</div>
              <div style={sectionTextStyle}>基于当前店铺数据和任务结果生成的建议。</div>
            </div>
            <button type="button" style={ghostButtonStyle}>生成完整报告</button>
          </div>
          <div style={listColumnStyle}>
            {dashboardSuggestions.map((item) => (
              <div key={item} style={suggestionItemStyle}>
                <span style={bulletStyle} />
                <span style={sectionTextStyle}>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ChatPanel({
  conversation,
  messages,
  draft,
  activeContextTool,
  objectQueryByType,
  selectedObjectsByType,
  localFiles,
  richMediaItems,
  selectedFileIds,
  selectedMediaIds,
  onDraftChange,
  onContextToolChange,
  onObjectQueryChange,
  onToggleObjectSelection,
  onToggleFileSelection,
  onToggleMediaSelection,
  onAddLocalFile,
  onDeleteLocalFile,
  onAddRichMediaItem,
  onCloseToolPicker,
  onClearToolSelection,
  onClearContext,
  onSend,
  isStreaming,
  showStreamingReply,
  streamingText,
  streamingThinkingText,
  streamingTranslationForm,
  streamingGenerateCard,
  streamingGeneratePayload,
  streamingPictureTranslateCard,
  streamingPictureTranslatePayload,
  streamingImageGenerationCard,
  streamingImageGenerationPayload,
  skillSteps,
  onAbortStream,
  onTranslationCardSuccess,
  onPictureTranslateCardSuccess,
  onImageGenerationCardSuccess,
}: {
  conversation: Conversation;
  messages: WorkspaceConversationMessage[];
  draft: string;
  activeContextTool: ContextTool | null;
  objectQueryByType: Record<ObjectType, string>;
  selectedObjectsByType: Record<ObjectType, SelectedShopifyObject[]>;
  localFiles: LocalFileItem[];
  richMediaItems: RichMediaItem[];
  selectedFileIds: string[];
  selectedMediaIds: string[];
  onDraftChange: (value: string) => void;
  onContextToolChange: (tool: ContextTool) => void;
  onObjectQueryChange: (type: ObjectType, value: string) => void;
  onToggleObjectSelection: (type: ObjectType, object: SelectedShopifyObject) => void;
  onToggleFileSelection: (fileId: string) => void;
  onToggleMediaSelection: (mediaId: string) => void;
  onAddLocalFile: (payload: { file: File; note: string }) => void;
  onDeleteLocalFile: (localId: string, serverId: string | null) => void;
  onAddRichMediaItem: (payload: { title: string; kind: RichMediaItem["kind"]; value: string; note: string }) => void;
  onCloseToolPicker: () => void;
  onClearToolSelection: (tool: ContextTool) => void;
  onClearContext: () => void;
  onSend: () => void | Promise<void>;
  isStreaming: boolean;
  showStreamingReply: boolean;
  streamingText: string;
  streamingThinkingText?: string;
  streamingTranslationForm: unknown;
  streamingGenerateCard: boolean;
  streamingGeneratePayload: unknown;
  streamingPictureTranslateCard: boolean;
  streamingPictureTranslatePayload: unknown;
  streamingImageGenerationCard: boolean;
  streamingImageGenerationPayload: unknown;
  skillSteps: SkillStepProgress[];
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
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [activeObjectFilter, setActiveObjectFilter] = useState<Record<ObjectType, ObjectFilterKey>>({
    product: "all",
    article: "all",
    order: "all",
  });
  const [newFileObj, setNewFileObj] = useState<File | null>(null);
  const [newFileNote, setNewFileNote] = useState("");
  const [newMediaTitle, setNewMediaTitle] = useState("");
  const [newMediaValue, setNewMediaValue] = useState("");
  const [newMediaNote, setNewMediaNote] = useState("");
  const [newMediaKind, setNewMediaKind] = useState<RichMediaItem["kind"]>("url");
  const totalSelectedObjects = Object.values(selectedObjectsByType).reduce((count, ids) => count + ids.length, 0);
  const MAX_CONTEXT_TOKENS = 8000;
  const contextTokens = useMemo(
    () => estimateMessagesTokens(messages),
    [messages],
  );
  const activeObjectOptions = isObjectType(activeContextTool)
    ? objectOptions[activeContextTool].filter((item) => {
        const query = objectQueryByType[activeContextTool].trim().toLowerCase();
        if (!query) return true;
        return `${item.title} ${item.subtitle} ${item.meta}`.toLowerCase().includes(query);
      })
    : [];
  const filteredObjectOptions = isObjectType(activeContextTool)
    ? activeObjectOptions.filter((item) => {
        const filterKey = activeObjectFilter[activeContextTool];
        if (filterKey === "all") return true;
        const haystack = `${item.subtitle} ${item.meta}`.toLowerCase();
        if (activeContextTool === "product") {
          if (filterKey === "focus") return haystack.includes("夏季新品");
          if (filterKey === "draft") return haystack.includes("低转化");
          return haystack.includes("高访问");
        }
        if (activeContextTool === "article") {
          if (filterKey === "focus") return haystack.includes("已发布");
          if (filterKey === "draft") return haystack.includes("草稿");
          return haystack.includes("help center");
        }
        if (filterKey === "focus") return haystack.includes("待发货");
        if (filterKey === "draft") return haystack.includes("退款");
        return haystack.includes("异常");
      })
    : [];
  const filledContextCount =
    (totalSelectedObjects > 0 ? 1 : 0) +
    (selectedFileIds.length > 0 ? 1 : 0) +
    (selectedMediaIds.length > 0 ? 1 : 0);
  const toolItems: Array<{ key: ContextTool; label: string; icon: string; active: boolean }> = [
    { key: "product", label: selectedObjectsByType.product.length > 0 ? `商品 ${selectedObjectsByType.product.length}` : "商品", icon: "◫", active: activeContextTool === "product" },
    { key: "order", label: selectedObjectsByType.order.length > 0 ? `订单 ${selectedObjectsByType.order.length}` : "订单", icon: "◎", active: activeContextTool === "order" },
    { key: "article", label: selectedObjectsByType.article.length > 0 ? `文章 ${selectedObjectsByType.article.length}` : "文章", icon: "≣", active: activeContextTool === "article" },
    { key: "file", label: selectedFileIds.length > 0 ? `文件 ${selectedFileIds.length}` : "文件", icon: "↑", active: activeContextTool === "file" },
    { key: "media", label: selectedMediaIds.length > 0 ? `富媒体 ${selectedMediaIds.length}` : "富媒体", icon: "◇", active: activeContextTool === "media" },
  ];
  const selectedSummaryBubbles: Array<{ key: ContextTool; label: string }> = [
    ...(selectedObjectsByType.product.length > 0 ? [{ key: "product" as const, label: `已选择 ${selectedObjectsByType.product.length} 个商品` }] : []),
    ...(selectedObjectsByType.order.length > 0 ? [{ key: "order" as const, label: `已选择 ${selectedObjectsByType.order.length} 个订单` }] : []),
    ...(selectedObjectsByType.article.length > 0 ? [{ key: "article" as const, label: `已选择 ${selectedObjectsByType.article.length} 篇文章` }] : []),
    ...(selectedFileIds.length > 0 ? [{ key: "file" as const, label: `已选择 ${selectedFileIds.length} 个文件` }] : []),
    ...(selectedMediaIds.length > 0 ? [{ key: "media" as const, label: `已选择 ${selectedMediaIds.length} 个富媒体` }] : []),
  ];

  const scrollToBottom = () => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
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

  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;
    setTimeout(() => {
      if (!messageListRef.current) return;
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      setIsScrolledUp(false);
    }, 0);
  }, [conversation.id, messages.length, showStreamingReply]);

  useEffect(() => {
    if (!showStreamingReply || isScrolledUp) return;
    scrollToBottom();
  }, [showStreamingReply, streamingText, skillSteps.length, isStreaming, isScrolledUp]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    focusComposerInput();
  }, [conversation.id, isStreaming]);

  useEffect(() => {
    if (!activeContextTool) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseToolPicker();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeContextTool, onCloseToolPicker]);

  return (
    <div style={chatLayoutStyle}>
      <section style={{ ...surfaceCardStyle, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={conversationMetaRowStyle}>
          <span style={conversationMetaTitleStyle}>{conversation.title}</span>
          <span style={mutedMetaStyle}>{conversation.updatedAt}</span>
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <div ref={messageListRef} style={messageListStyle} onScroll={handleMessageListScroll}>
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
              <button type="button" style={scrollBottomButtonStyle} onClick={scrollToBottom}>
                ↓ 查看最新消息
              </button>
            </div>
          ) : null}
        </div>

        <div style={composerBoxStyle}>
          {selectedSummaryBubbles.length > 0 ? (
            <div style={selectionBubbleRowStyle}>
              {selectedSummaryBubbles.map((item) => (
                <span key={item.key} style={selectionBubbleStyle}>
                  <span>{item.label}</span>
                  <button type="button" style={selectionBubbleCloseStyle} onClick={() => onClearToolSelection(item.key)} aria-label={`清空${item.label}`}>
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
            style={textareaStyle}
            placeholder="继续补充你的任务目标，并结合商品、订单、文章、文件或富媒体上下文..."
            disabled={isStreaming}
            autoFocus
          />
          <div style={toolbarDockStyle}>
            <div style={toolbarBarStyle}>
              <div style={toolbarIconGroupStyle}>
                {toolItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    style={toolbarPillButtonStyle(item.active)}
                    onClick={() => onContextToolChange(item.key)}
                    title={item.label}
                  >
                    <span style={toolbarIconGlyphStyle}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div style={toolbarStatusGroupStyle}>
                {filledContextCount > 0 ? (
                  <span style={toolbarCountStyle}>已补充 {filledContextCount} 项</span>
                ) : null}
                <button type="button" style={toolbarClearStyle} onClick={onClearContext}>
                  清空上下文
                </button>
              </div>
            </div>
          </div>
          <div style={composerFooterStyle}>
            <div style={footerLeftStyle}>
              <span style={sectionTextStyle}>
                {isStreaming ? "AI Assistant 正在回复，可随时停止。" : <span style={mutedMetaStyle}>Enter 发送，Shift+Enter 换行</span>}
              </span>
              <ContextWindowIndicator currentTokens={contextTokens} maxTokens={MAX_CONTEXT_TOKENS} />
            </div>
            <div style={buttonRowStyle}>
              <button type="button" style={ghostButtonStyle} disabled={isStreaming}>
                生成任务建议
              </button>
              {isStreaming ? (
                <button type="button" style={ghostButtonStyle} onClick={onAbortStream}>
                  停止
                </button>
              ) : null}
              <button
                type="button"
                style={{ ...primaryButtonStyle, opacity: isStreaming ? 0.6 : 1 }}
                onClick={() => void onSend()}
                disabled={isStreaming}
              >
                {isStreaming ? "发送中…" : "发送"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {activeContextTool ? (
        <div style={toolModalBackdropStyle} onClick={onCloseToolPicker}>
          <div style={toolModalCardStyle} onClick={(event) => event.stopPropagation()}>
            <div style={toolModalHeaderStyle}>
              <div>
                <div style={sectionTitleSmallStyle}>
                  {isObjectType(activeContextTool)
                    ? `${objectTypeLabels[activeContextTool]}选择器`
                    : activeContextTool === "file"
                      ? "文件选择"
                      : "富媒体选择"}
                </div>
                <div style={sectionTextStyle}>
                  {isObjectType(activeContextTool)
                    ? "在当前页面弹窗内完成批量勾选和筛选。"
                    : activeContextTool === "file"
                      ? "选择需要附加到这次对话的本地文件。"
                      : "选择需要附加到这次对话的 URL、图片或视频。"}
                </div>
              </div>
              <button type="button" style={toolModalCloseStyle} onClick={onCloseToolPicker} aria-label="关闭">
                ✕
              </button>
            </div>

            {activeContextTool === "product" || activeContextTool === "article" ? (
              <WorkspaceContextObjectPicker
                kind={activeContextTool}
                label={objectTypeLabels[activeContextTool]}
                query={objectQueryByType[activeContextTool]}
                onQueryChange={(value) => onObjectQueryChange(activeContextTool, value)}
                selected={selectedObjectsByType[activeContextTool]}
                onToggle={(item) => onToggleObjectSelection(activeContextTool, item)}
                locationSearch={typeof window !== "undefined" ? window.location.search : ""}
              />
            ) : null}

            {activeContextTool === "order" ? (
              <>
                <input
                  value={objectQueryByType.order}
                  onChange={(event) => onObjectQueryChange("order", event.target.value)}
                  placeholder="搜索订单号、站点或状态"
                  style={selectorSearchInputStyle}
                />
                <div style={filterChipRowStyle}>
                  {objectFilterLabels.order.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      style={filterChipStyle(activeObjectFilter.order === filter.key)}
                      onClick={() =>
                        setActiveObjectFilter((current) => ({
                          ...current,
                          order: filter.key,
                        }))
                      }
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div style={selectorListCompactStyle}>
                  {filteredObjectOptions.map((item) => {
                    const checked = selectedObjectsByType.order.some((selected) => selected.id === item.id);
                    return (
                      <label key={item.id} style={selectorItemStyle(checked)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            onToggleObjectSelection("order", { id: item.id, title: item.title })
                          }
                        />
                        <div style={selectorItemContentStyle}>
                          <span style={sectionTitleSmallStyle}>{item.title}</span>
                          <span style={sectionTextStyle}>{item.subtitle}</span>
                          <span style={mutedMetaStyle}>{item.meta}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {activeContextTool === "file" ? (
              <>
                <div style={mockCreateBoxStyle}>
                  <input
                    type="file"
                    accept=".txt,.md,.pdf,.docx,.csv,.xlsx,.xls,.json"
                    style={selectorSearchInputStyle}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setNewFileObj(file);
                    }}
                  />
                  <div style={inlineFieldRowStyle}>
                    <input
                      value={newFileNote}
                      onChange={(event) => setNewFileNote(event.target.value)}
                      placeholder="补充文件用途说明（可选）"
                      style={compactFieldStyle}
                    />
                    <button
                      type="button"
                      style={ghostButtonStyle}
                      onClick={() => {
                        if (!newFileObj) return;
                        void onAddLocalFile({ file: newFileObj, note: newFileNote.trim() });
                        setNewFileObj(null);
                        setNewFileNote("");
                      }}
                    >
                      上传
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    支持：PDF、DOCX、TXT、MD、CSV、XLSX、JSON，最大 10 MB
                  </div>
                </div>
                <div style={selectorListCompactStyle}>
                  {localFiles.map((file) => {
                    const checked = selectedFileIds.includes(file.id);
                    const authQuery = typeof window !== "undefined" ? window.location.search : "";
                    return (
                      <label key={file.id} style={selectorItemStyle(checked)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={Boolean(file.uploading)}
                          onChange={() => onToggleFileSelection(file.id)}
                        />
                        <div style={selectorItemContentStyle}>
                          <span style={sectionTitleSmallStyle}>{file.name}</span>
                          <span style={sectionTextStyle}>{file.note}</span>
                          <span style={mutedMetaStyle}>
                            {file.size}
                            {file.uploading ? " · 上传中…" : ""}
                            {file.uploadError ? ` · ⚠ ${file.uploadError}` : ""}
                            {!file.uploading && !file.uploadError && file.serverId ? ` · 已解析 ${file.charCount ? `(${(file.charCount / 1000).toFixed(0)}k 字符)` : ""}` : ""}
                            {!file.serverId && !file.uploading && !file.uploadError ? " · 示例" : ""}
                          </span>
                          {file.serverId && !file.uploading ? (
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              <a
                                href={`/api/files/${file.serverId}${authQuery}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 11, color: "rgba(44,110,203,0.8)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                下载原始文件
                              </a>
                              <button
                                type="button"
                                style={{ fontSize: 11, color: "#d72c0d", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void onDeleteLocalFile(file.id, file.serverId);
                                }}
                              >
                                删除
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {activeContextTool === "media" ? (
              <>
                <div style={mockCreateBoxStyle}>
                  <div style={inlineFieldRowStyle}>
                    <select value={newMediaKind} onChange={(event) => setNewMediaKind(event.target.value as RichMediaItem["kind"])} style={selectFieldStyle}>
                      <option value="url">URL</option>
                      <option value="image">图片</option>
                      <option value="video">视频</option>
                    </select>
                    <input
                      value={newMediaTitle}
                      onChange={(event) => setNewMediaTitle(event.target.value)}
                      placeholder="输入标题"
                      style={compactFieldStyle}
                    />
                  </div>
                  <input
                    value={newMediaValue}
                    onChange={(event) => setNewMediaValue(event.target.value)}
                    placeholder="输入 URL 或资源地址"
                    style={selectorSearchInputStyle}
                  />
                  <div style={inlineFieldRowStyle}>
                    <input
                      value={newMediaNote}
                      onChange={(event) => setNewMediaNote(event.target.value)}
                      placeholder="补充备注"
                      style={compactFieldStyle}
                    />
                    <button
                      type="button"
                      style={ghostButtonStyle}
                      onClick={() => {
                        const title = newMediaTitle.trim();
                        const value = newMediaValue.trim();
                        if (!title || !value) return;
                        onAddRichMediaItem({
                          title,
                          value,
                          kind: newMediaKind,
                          note: newMediaNote.trim() || "新添加的富媒体资源",
                        });
                        setNewMediaTitle("");
                        setNewMediaValue("");
                        setNewMediaNote("");
                        setNewMediaKind("url");
                      }}
                    >
                      添加资源
                    </button>
                  </div>
                </div>
                <div style={selectorListCompactStyle}>
                  {richMediaItems.map((item) => {
                    const checked = selectedMediaIds.includes(item.id);
                    return (
                      <label key={item.id} style={selectorItemStyle(checked)}>
                        <input type="checkbox" checked={checked} onChange={() => onToggleMediaSelection(item.id)} />
                        <div style={selectorItemContentStyle}>
                          <span style={sectionTitleSmallStyle}>{item.title}</span>
                          <span style={sectionTextStyle}>{item.note}</span>
                          <span style={mutedMetaStyle}>{item.kind} · {item.value}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <section style={{ ...sidePanelStyle, alignSelf: "start" }}>
        <div style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>当前上下文</div>
          <div style={listColumnStyle}>
            {[
              [
                "对象范围",
                totalSelectedObjects > 0
                  ? (Object.keys(objectTypeLabels) as ObjectType[])
                      .filter((type) => selectedObjectsByType[type].length > 0)
                      .map((type) => `${objectTypeLabels[type]} ${selectedObjectsByType[type].length}`)
                      .join(" / ")
                  : "尚未选择对象",
              ],
              ["本地文件", selectedFileIds.length > 0 ? `${selectedFileIds.length} 个已选择文件` : "尚未添加文件"],
              ["富媒体", selectedMediaIds.length > 0 ? `${selectedMediaIds.length} 个已选择 URL / 图片 / 视频` : "尚未添加富媒体"],
            ].map(([label, value]) => (
              <div key={label} style={keyValueRowStyle}>
                <span style={mutedMetaStyle}>{label}</span>
                <span style={sectionTextStyle}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>推荐下一步</div>
          <div style={listColumnStyle}>
            {[
              "先生成任务确认卡片，再统一审核成本和影响范围。",
              "把这次规则保存为自动化，后续可定时执行。",
              "完成后将结果同步到任务列表和 Dashboard。",
            ].map((item) => (
              <div key={item} style={suggestionItemStyle}>
                <span style={bulletStyle} />
                <span style={sectionTextStyle}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SkillsPanel({ onOpenTool }: { onOpenTool: (path: string) => void }) {
  return (
    <section style={surfaceCardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>常用工具</div>
          <div style={sectionTextStyle}>将已有 tools 作为可直接进入的应用入口。</div>
        </div>
        <button type="button" style={ghostButtonStyle}>管理排序</button>
      </div>
      <div style={skillGridStyle}>
        {skillApps.map((skill) => (
          <button key={skill.id} type="button" style={skillCardButtonStyle} onClick={() => onOpenTool(skill.path)}>
            <div style={skillCategoryStyle}>{skill.category}</div>
            <div style={sectionTitleSmallStyle}>{skill.title}</div>
            <div style={sectionTextStyle}>{skill.description}</div>
            <div style={skillFooterStyle}>
              <span style={statusBadgeStyle("neutral")}>{skill.status}</span>
              <span style={textButtonStyle}>进入</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function AutomationPanel({
  activeView,
  onChangeView,
}: {
  activeView: AutomationView;
  onChangeView: (value: AutomationView) => void;
}) {
  const items =
    activeView === "configured"
      ? automationConfigured
      : activeView === "history"
        ? automationHistory
        : automationTemplates;

  return (
    <section style={surfaceCardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>自动化任务</div>
          <div style={sectionTextStyle}>配置和管理可持续运行的任务流。</div>
        </div>
        <div style={buttonRowStyle}>
          <button type="button" style={ghostButtonStyle}>手动新建</button>
          <button type="button" style={primaryButtonStyle}>在对话中创建</button>
        </div>
      </div>

      <div style={tabRowStyle}>
        {[
          ["configured", "已配置"],
          ["history", "执行历史"],
          ["templates", "任务模板"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            style={tabButtonStyle(activeView === key)}
            onClick={() => onChangeView(key as AutomationView)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={listColumnStyle}>
        {items.map((item) => (
          <article key={item.id} style={automationCardStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={sectionTitleSmallStyle}>{item.title}</div>
                <div style={sectionTextStyle}>{"schedule" in item ? item.schedule : item.detail}</div>
              </div>
              {"status" in item ? (
                <span style={statusBadgeStyle(item.status === "healthy" ? "positive" : "warning")}>
                  {item.status === "healthy" ? "正常" : "关注中"}
                </span>
              ) : null}
            </div>
            {"lastRun" in item ? <div style={mutedMetaStyle}>最近执行：{item.lastRun}</div> : null}
            {"outcome" in item ? <div style={sectionTextStyle}>{item.outcome}</div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function TasksPanel({
  tasks,
  filter,
  onFilterChange,
}: {
  tasks: TaskRecord[];
  filter: "all" | TaskKind;
  onFilterChange: (value: "all" | TaskKind) => void;
}) {
  return (
    <section style={surfaceCardStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>统一任务列表</div>
          <div style={sectionTextStyle}>自动化任务与单次任务共用总表，再按类型和状态进行筛选。</div>
        </div>
        <div style={buttonRowStyle}>
          {[
            ["all", "全部"],
            ["automation", "自动化"],
            ["one_off", "单次任务"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={filterChipStyle(filter === key)}
              onClick={() => onFilterChange(key as "all" | TaskKind)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={listColumnStyle}>
        {tasks.map((task) => (
          <article key={task.id} style={taskCardStyle}>
            <div style={taskCardTopStyle}>
              <div>
                <div style={mutedMetaStyle}>{task.id}</div>
                <div style={sectionTitleSmallStyle}>{task.title}</div>
              </div>
              <div style={buttonRowStyle}>
                <span style={kindBadgeStyle(task.kind)}>{task.kind === "automation" ? "自动化" : "单次"}</span>
                <span style={statusBadgeStyle(taskStatusTone(task.status))}>{taskStatusLabel(task.status)}</span>
              </div>
            </div>
            <div style={sectionTextStyle}>{task.summary}</div>
            <div style={progressTrackStyle}>
              <div style={{ ...progressFillStyle, width: `${task.progress}%`, background: progressColor(task.status) }} />
            </div>
            <div style={taskFooterStyle}>
              <span style={mutedMetaStyle}>
                {task.source} · {task.updatedAt}
              </span>
              <button type="button" style={textButtonStyle}>{task.action}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function workspaceMessageToApiMessage(message: WorkspaceConversationMessage): ChatMessage {
  return { role: message.role, content: message.text };
}

function workspaceMessageToChatMessage(message: WorkspaceConversationMessage): ChatMessage {
  if (message.role === "user") {
    return { role: "user", content: message.text };
  }

  return {
    role: "assistant",
    content: message.text,
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    ...(message.translationTaskForm ? { translationTaskForm: message.translationTaskForm } : {}),
    ...(message.productImproveCard || message.productImproveCardPayload
      ? { productImproveCard: true }
      : {}),
    ...(message.productImproveCardPayload
      ? { productImproveCardPayload: message.productImproveCardPayload }
      : {}),
    ...(message.pictureTranslateCard || message.pictureTranslateFormPayload
      ? { pictureTranslateCard: true }
      : {}),
    ...(message.pictureTranslateFormPayload
      ? { pictureTranslateFormPayload: message.pictureTranslateFormPayload }
      : {}),
    ...(message.imageGenerationCard || message.imageGenerationFormPayload
      ? { imageGenerationCard: true }
      : {}),
    ...(message.imageGenerationFormPayload
      ? { imageGenerationFormPayload: message.imageGenerationFormPayload }
      : {}),
    ...(message.thinkingContent ? { thinkingContent: message.thinkingContent } : {}),
  };
}

function buildAssistantWorkspaceMessage(
  text: string,
  payload: ChatStreamFinishPayload,
): WorkspaceConversationMessage {
  const translationTaskForm = payload.translationTaskForm
    ? coerceTranslationTaskFormPayload(payload.translationTaskForm)
    : undefined;
  const hasProductImproveCard =
    payload.productImproveCard || Boolean(payload.productImproveCardPayload);
  const pictureTranslateFormPayload = payload.pictureTranslateFormPayload
    ? coercePictureTranslateFormPayload(payload.pictureTranslateFormPayload)
    : undefined;
  const hasPictureTranslateCard =
    payload.pictureTranslateCard || Boolean(pictureTranslateFormPayload);
  const imageGenerationFormPayload = payload.imageGenerationFormPayload
    ? coerceImageGenerationFormPayload(payload.imageGenerationFormPayload)
    : undefined;
  const hasImageGenerationCard =
    payload.imageGenerationCard || Boolean(imageGenerationFormPayload);

  return {
    role: "assistant",
    text,
    time: "刚刚",
    ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
    ...(translationTaskForm ? { translationTaskForm } : {}),
    ...(hasProductImproveCard ? { productImproveCard: true } : {}),
    ...(payload.productImproveCardPayload
      ? { productImproveCardPayload: payload.productImproveCardPayload as ProductImproveCardPayload }
      : {}),
    ...(hasPictureTranslateCard ? { pictureTranslateCard: true } : {}),
    ...(pictureTranslateFormPayload
      ? { pictureTranslateFormPayload }
      : {}),
    ...(hasImageGenerationCard ? { imageGenerationCard: true } : {}),
    ...(imageGenerationFormPayload
      ? { imageGenerationFormPayload }
      : {}),
    ...(payload.thinkingContent ? { thinkingContent: payload.thinkingContent } : {}),
  };
}

function formatTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  if (hours < 48) return "昨天";
  return `${Math.floor(hours / 24)} 天前`;
}

function serializeAssistantPayloads(payload: ChatStreamFinishPayload): string | null {
  const result: Record<string, unknown> = {};
  if (payload.translationTaskForm) result.translationTaskForm = payload.translationTaskForm;
  if (payload.attachments?.length) result.attachments = payload.attachments;
  if (payload.productImproveCard || payload.productImproveCardPayload) {
    result.productImproveCard = true;
    if (payload.productImproveCardPayload) result.productImproveCardPayload = payload.productImproveCardPayload;
  }
  if (payload.pictureTranslateCard || payload.pictureTranslateFormPayload) {
    result.pictureTranslateCard = true;
    if (payload.pictureTranslateFormPayload) {
      result.pictureTranslateFormPayload = coercePictureTranslateFormPayload(
        payload.pictureTranslateFormPayload,
      );
    }
  }
  if (payload.imageGenerationCard || payload.imageGenerationFormPayload) {
    result.imageGenerationCard = true;
    if (payload.imageGenerationFormPayload) {
      result.imageGenerationFormPayload = coerceImageGenerationFormPayload(
        payload.imageGenerationFormPayload,
      );
    }
  }
  return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
}

function dbMessageToUiMessage(msg: {
  role: string;
  content: string;
  payloads: string | null;
  createdAt: string;
}): WorkspaceConversationMessage {
  const extras = msg.payloads ? (JSON.parse(msg.payloads) as Record<string, unknown>) : {};
  const translationTaskForm = extras.translationTaskForm
    ? coerceTranslationTaskFormPayload(extras.translationTaskForm)
    : undefined;
  return {
    role: msg.role as "user" | "assistant",
    text: msg.content,
    time: formatTimeLabel(new Date(msg.createdAt)),
    ...(extras.attachments ? { attachments: extras.attachments as ChatMessageAttachment[] } : {}),
    ...(translationTaskForm ? { translationTaskForm } : {}),
    ...(extras.productImproveCard ? { productImproveCard: true } : {}),
    ...(extras.productImproveCardPayload
      ? { productImproveCardPayload: extras.productImproveCardPayload as ProductImproveCardPayload }
      : {}),
    ...(extras.pictureTranslateCard || extras.pictureTranslateFormPayload
      ? { pictureTranslateCard: true }
      : {}),
    ...(extras.pictureTranslateFormPayload
      ? {
          pictureTranslateFormPayload: coercePictureTranslateFormPayload(
            extras.pictureTranslateFormPayload,
          ),
        }
      : {}),
    ...(extras.imageGenerationCard || extras.imageGenerationFormPayload
      ? { imageGenerationCard: true }
      : {}),
    ...(extras.imageGenerationFormPayload
      ? {
          imageGenerationFormPayload: coerceImageGenerationFormPayload(
            extras.imageGenerationFormPayload,
          ),
        }
      : {}),
  };
}

function buildWorkspaceContextBlock(params: {
  selectedObjectsByType: Record<ObjectType, SelectedShopifyObject[]>;
  selectedFileIds: string[];
  selectedMediaIds: string[];
  localFiles: LocalFileItem[];
  richMediaItems: RichMediaItem[];
}): string | null {
  const lines: string[] = [];

  for (const type of Object.keys(objectTypeLabels) as ObjectType[]) {
    const items = params.selectedObjectsByType[type];
    if (items.length === 0) continue;
    const names = items.map((item) => item.title || item.id);
    lines.push(`- ${objectTypeLabels[type]}：${names.join("、")}（共 ${items.length} 个）`);
  }

  if (params.selectedFileIds.length > 0) {
    const names = params.selectedFileIds.map(
      (id) => params.localFiles.find((item) => item.id === id)?.name ?? id,
    );
    lines.push(`- 文件：${names.join("、")}（共 ${params.selectedFileIds.length} 个）`);
  }

  if (params.selectedMediaIds.length > 0) {
    const names = params.selectedMediaIds.map(
      (id) => params.richMediaItems.find((item) => item.id === id)?.title ?? id,
    );
    lines.push(`- 富媒体：${names.join("、")}（共 ${params.selectedMediaIds.length} 个）`);
  }

  if (lines.length === 0) return null;
  return `[工作台上下文]\n${lines.join("\n")}`;
}

function augmentUserMessage(content: string, contextBlock: string | null) {
  if (!contextBlock) return content;
  return `${contextBlock}\n\n[用户消息]\n${content}`;
}
function taskStatusLabel(status: TaskStatus) {
  if (status === "executing") return "执行中";
  if (status === "review_required") return "待审核";
  if (status === "completed") return "已完成";
  return "失败";
}

function taskStatusTone(status: TaskStatus): "positive" | "warning" | "critical" | "neutral" {
  if (status === "completed") return "positive";
  if (status === "executing" || status === "review_required") return "warning";
  if (status === "failed") return "critical";
  return "neutral";
}

function progressColor(status: TaskStatus) {
  if (status === "completed") return "#008060";
  if (status === "failed") return "#d82c0d";
  return "#c05717";
}

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "252px minmax(0, 1fr)",
  background: "#f6f6f7",
};

const sidebarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "20px 12px 16px",
  borderRight: "1px solid #e1e3e5",
  background: "#f6f6f7",
  gap: 16,
};

const contentStyle: CSSProperties = {
  padding: "28px 32px 40px",
  display: "flex",
  flexDirection: "column",
  gap: 24,
  minWidth: 0,
};

const brandRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 18,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
};
const brandBadgeStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9,
  background: "#202223",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 13,
};
const brandTitleStyle: CSSProperties = { fontSize: 14, fontWeight: 700, color: "#202223" };
const brandMetaStyle: CSSProperties = { fontSize: 12, color: "#6d7175" };

const newTaskButtonStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #202223",
  borderRadius: 10,
  background: "#202223",
  padding: "11px 12px",
  textAlign: "left",
  fontSize: 14,
  fontWeight: 600,
  color: "#ffffff",
  cursor: "pointer",
};

const navGroupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginTop: 14 };
const navButtonStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  border: `1px solid ${active ? "#c9cccf" : "transparent"}`,
  borderRadius: 10,
  background: active ? "#ffffff" : "transparent",
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: active ? 700 : 600,
  color: "#202223",
  cursor: "pointer",
});
const navLabelStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const navIconStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "#f1f2f3",
  color: "#61666c",
  fontSize: 12,
  flexShrink: 0,
};

const sidebarSectionStyle: CSSProperties = { marginTop: 18, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 };
const sidebarSectionHeadStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, color: "#6d7175", padding: "0 4px" };
const conversationListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 330px)", overflowY: "auto", paddingRight: 2 };
const historyRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 4,
};
const historyItemStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "flex-start",
  flex: 1,
  minWidth: 0,
  textAlign: "left",
  border: `1px solid ${active ? "#c9cccf" : "transparent"}`,
  borderRadius: 10,
  background: active ? "#ffffff" : "#f6f6f7",
  padding: "10px 12px",
  cursor: "pointer",
});
const historyDeleteButtonStyle: CSSProperties = {
  width: 32,
  flexShrink: 0,
  alignSelf: "center",
  border: "1px solid transparent",
  borderRadius: 8,
  background: "transparent",
  color: "#8c9196",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};
const historyTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#202223" };
const historyPreviewStyle: CSSProperties = { fontSize: 12, color: "#61666c", lineHeight: 1.5 };
const accountMenuWrapStyle: CSSProperties = {
  position: "relative",
  paddingTop: 12,
  borderTop: "1px solid #e1e3e5",
};
const sidebarFooterButtonStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  border: "1px solid transparent",
  borderRadius: 12,
  background: "transparent",
  padding: "10px 10px 0",
  textAlign: "left",
  cursor: "pointer",
};
const accountMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "calc(100% + 10px)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
  boxShadow: "0 16px 36px rgba(15, 23, 42, 0.12)",
  zIndex: 10,
};
const accountMenuSectionStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const accountMenuLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#6d7175" };
const accountMenuItemStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #dfe3e8",
  borderRadius: 10,
  background: "#ffffff",
  color: "#202223",
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
};
const footerTagStyle: CSSProperties = { padding: "4px 8px", borderRadius: 999, background: "#e9f7ef", color: "#008060", fontSize: 12, fontWeight: 600 };

const panelStackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 };
const surfaceCardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e1e3e5",
  borderRadius: 14,
  boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
  padding: 20,
};
const sectionHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 };
const sectionTitleStyle: CSSProperties = { fontSize: 18, fontWeight: 700, color: "#202223", letterSpacing: "-0.01em" };
const sectionTitleSmallStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: "#202223" };
const sectionTextStyle: CSSProperties = { fontSize: 14, color: "#61666c", lineHeight: 1.6 };
const mutedMetaStyle: CSSProperties = { fontSize: 12, color: "#8c9196" };

const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 };
const metricLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: "#6d7175" };
const metricValueStyle: CSSProperties = { marginTop: 10, fontSize: 26, fontWeight: 700, color: "#202223", letterSpacing: "-0.02em" };
const metricDeltaStyle = (tone: DashboardMetric["tone"]): CSSProperties => ({
  marginTop: 8,
  fontSize: 12,
  fontWeight: 600,
  color: tone === "positive" ? "#008060" : tone === "negative" ? "#8a2e0f" : "#8c9196",
});

const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 };
const listColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const summaryItemStyle: CSSProperties = { padding: 14, borderRadius: 12, border: "1px solid #e9eaeb", background: "#ffffff" };
const suggestionItemStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #f1f2f3" };
const bulletStyle: CSSProperties = { width: 8, height: 8, marginTop: 7, borderRadius: 999, background: "#8c9196", flexShrink: 0 };
const alertListStyle: CSSProperties = { display: "grid", gap: 12 };
const alertItemStyle = (tone: "warning" | "info" | "critical"): CSSProperties => ({
  padding: 14,
  borderRadius: 12,
  border: `1px solid ${tone === "critical" ? "#e4b7af" : tone === "warning" ? "#dfc78a" : "#b8cbeb"}`,
  background: "#ffffff",
});

const trendLegendStyle: CSSProperties = { display: "flex", gap: 12, alignItems: "center" };
const legendItemStyle = (color: string): CSSProperties => ({ fontSize: 12, color, fontWeight: 600 });
const chartStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
const chartRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "70px minmax(0, 1fr)", gap: 14, alignItems: "center" };
const chartLabelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#202223" };
const barGroupStyle: CSSProperties = { display: "grid", gap: 8 };
const barTrackStyle: CSSProperties = { height: 10, borderRadius: 999, background: "#f1f2f3", overflow: "hidden" };
const barFillStyle: CSSProperties = { height: "100%", borderRadius: 999 };

const chatLayoutStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, height: "calc(100vh - 100px)" };
const conversationMetaRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexShrink: 0 };
const conversationMetaTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#202223" };
const messageListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  height: "100%",
  overflowY: "auto",
  paddingRight: 6,
  scrollBehavior: "smooth",
};
const composerBoxStyle: CSSProperties = { flexShrink: 0, marginTop: 14, paddingTop: 14, borderTop: "1px solid #ebedf0" };
const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 96,
  maxHeight: 320,
  borderRadius: 12,
  border: "1px solid #c9cdd2",
  padding: 14,
  fontSize: 14,
  lineHeight: 1.6,
  color: "#202223",
  background: "#ffffff",
  resize: "none",
  overflowY: "auto",
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s",
};
const composerFooterStyle: CSSProperties = { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };
const footerLeftStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const sidePanelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
const keyValueRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, paddingBottom: 10, borderBottom: "1px solid #f0f1f3" };
const toolbarDockStyle: CSSProperties = { marginTop: 12, position: "relative" };
const toolbarBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};
const toolbarIconGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const toolbarTriggerWrapStyle: CSSProperties = { position: "relative", display: "inline-flex" };
const toolbarIconButtonStyle = (active: boolean): CSSProperties => ({
  width: 32,
  height: 32,
  display: "inline-grid",
  placeItems: "center",
  border: `1px solid ${active ? "#202223" : "#dfe3e8"}`,
  background: active ? "#202223" : "#ffffff",
  color: active ? "#ffffff" : "#202223",
  borderRadius: 10,
  padding: 0,
  cursor: "pointer",
});
const toolbarPillButtonStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 30,
  padding: "0 10px",
  border: `1px solid ${active ? "#202223" : "#dfe3e8"}`,
  background: active ? "#202223" : "#ffffff",
  color: active ? "#ffffff" : "#202223",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: active ? 700 : 600,
  whiteSpace: "nowrap",
  transition: "background 0.12s, border-color 0.12s",
});
const toolbarIconGlyphStyle: CSSProperties = { fontSize: 11, lineHeight: 1, flexShrink: 0 };
const toolbarTooltipStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(100% + 8px)",
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  padding: "4px 8px",
  borderRadius: 8,
  background: "#202223",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
  pointerEvents: "none",
  zIndex: 2,
};
const scrollBottomOverlayStyle: CSSProperties = {
  position: "absolute",
  bottom: 10,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 2,
};
const scrollBottomButtonStyle: CSSProperties = {
  pointerEvents: "all",
  border: "1px solid #c9cdd2",
  borderRadius: 999,
  background: "#ffffff",
  color: "#202223",
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
  whiteSpace: "nowrap",
};
const toolbarStatusGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" };
const toolbarCountStyle: CSSProperties = { fontSize: 12, color: "#6d7175", fontWeight: 600 };
const toolbarClearStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#8a2e0f",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};
const selectionBubbleRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 };
const selectionBubbleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 999,
  border: "1px solid #c9cccf",
  background: "#f6f6f7",
  color: "#202223",
  fontSize: 12,
  fontWeight: 600,
};
const selectionBubbleCloseStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 999,
  border: "none",
  background: "#e1e3e5",
  color: "#202223",
  fontSize: 11,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};
const toolModalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.16)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 30,
};
const toolModalCardStyle: CSSProperties = {
  width: "min(720px, calc(100vw - 48px))",
  maxHeight: "min(82vh, 760px)",
  overflowY: "auto",
  padding: 18,
  borderRadius: 16,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
  boxShadow: "0 24px 56px rgba(15, 23, 42, 0.16)",
};
const toolModalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};
const toolModalCloseStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  border: "1px solid #dfe3e8",
  borderRadius: 10,
  background: "#f6f6f7",
  color: "#6d7175",
  fontSize: 14,
  fontWeight: 400,
  padding: 0,
  cursor: "pointer",
  flexShrink: 0,
};
const filterChipRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const mockCreateBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e9eaeb",
  background: "#fafbfb",
  marginBottom: 14,
};
const inlineFieldRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" };
const compactFieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "#202223",
  background: "#ffffff",
};
const selectFieldStyle: CSSProperties = {
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "#202223",
  background: "#ffffff",
  cursor: "pointer",
  appearance: "auto",
};
const selectorSearchInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "#202223",
  background: "#ffffff",
};
const selectorListCompactStyle: CSSProperties = { display: "grid", gap: 10, marginTop: 14, maxHeight: 240, overflowY: "auto" };
const selectorItemStyle = (checked: boolean): CSSProperties => ({
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${checked ? "#c9cccf" : "#e1e3e5"}`,
  background: checked ? "#ffffff" : "#f6f6f7",
});
const selectorItemContentStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

const skillGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 };
const skillCardStyle: CSSProperties = { padding: 18, borderRadius: 14, border: "1px solid #e1e3e5", background: "#ffffff", display: "flex", flexDirection: "column", gap: 10 };
const skillCardButtonStyle: CSSProperties = { ...skillCardStyle, width: "100%", textAlign: "left", cursor: "pointer" };
const skillCategoryStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#6d7175" };
const skillFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 };

const buttonRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const primaryButtonStyle: CSSProperties = { border: "1px solid #202223", borderRadius: 10, background: "#202223", color: "#ffffff", padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostButtonStyle: CSSProperties = { border: "1px solid #c9cdd2", borderRadius: 10, background: "#ffffff", color: "#202223", padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const textButtonStyle: CSSProperties = { border: "none", background: "transparent", color: "#005bd3", padding: 0, fontSize: 13, fontWeight: 600, cursor: "pointer" };

const tabRowStyle: CSSProperties = { display: "flex", gap: 8, marginBottom: 16 };
const tabButtonStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? "#c9cccf" : "#dfe3e8"}`,
  borderRadius: 10,
  background: active ? "#ffffff" : "#f6f6f7",
  color: "#202223",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: active ? 700 : 600,
  cursor: "pointer",
});
const automationCardStyle: CSSProperties = { padding: 16, borderRadius: 12, border: "1px solid #e1e3e5", background: "#ffffff" };

const filterChipStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? "#c9cccf" : "#c9cdd2"}`,
  borderRadius: 999,
  background: active ? "#202223" : "#ffffff",
  color: active ? "#ffffff" : "#202223",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});
const taskCardStyle: CSSProperties = { padding: 16, borderRadius: 14, border: "1px solid #e1e3e5", background: "#ffffff", display: "flex", flexDirection: "column", gap: 12 };
const taskCardTopStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const progressTrackStyle: CSSProperties = { height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" };
const progressFillStyle: CSSProperties = { height: "100%", borderRadius: 999 };
const taskFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };

const kindBadgeStyle = (kind: TaskKind): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  background: kind === "automation" ? "#f1f8ff" : "#f1f2f3",
  color: kind === "automation" ? "#005bd3" : "#61666c",
  fontSize: 12,
  fontWeight: 600,
});
const statusBadgeStyle = (tone: "positive" | "warning" | "critical" | "neutral"): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  background: tone === "positive" ? "#e9f7ef" : tone === "warning" ? "#fff5ea" : tone === "critical" ? "#fff1ef" : "#f1f2f3",
  color: tone === "positive" ? "#008060" : tone === "warning" ? "#b98900" : tone === "critical" ? "#d72c0d" : "#61666c",
  fontSize: 12,
  fontWeight: 600,
});
