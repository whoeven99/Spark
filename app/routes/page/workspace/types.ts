/** WorkspaceAppShellPage 拆分出的共享类型与类型守卫。 */
import type { AITaskItem } from "../../../lib/aiTaskTypes";
import type {
  ChatMessageAttachment,
  ProductImproveCardPayload,
} from "../../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import type { TaskProposalPayload } from "../../../lib/taskProposalPayload";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";

export type WorkspacePanel = "home" | "dashboard" | "chat" | "skills" | "automation" | "tasks";
export type AutomationView = "configured" | "history" | "templates";
export type ObjectType = "product" | "article" | "order";
export type ContextTool = ObjectType | "file" | "media" | "constraint";

/** 支持「按条件圈定」的对象类型（订单选择器走独立 API，暂不支持 query 形态） */
export type QueryableObjectType = "product" | "article";

/** 文件在上下文中的角色：决定 AI 如何使用该文件内容 */
export type FileRole = "reference" | "data" | "style";

export const fileRoleLabels: Record<FileRole, string> = {
  reference: "参考文档",
  data: "数据源",
  style: "风格示例",
};

export const fileRoleDescriptions: Record<FileRole, string> = {
  reference: "背景知识，AI 可引用其中信息",
  data: "其中的数据可直接作为任务输入",
  style: "模仿其语气与结构，不照搬内容",
};

export type WorkspaceConversationMessage = {
  role: "assistant" | "user";
  text: string;
  time: string;
  attachments?: ChatMessageAttachment[];
  translationTaskForm?: TranslationTaskFormPayload;
  productImproveCard?: boolean;
  productImproveCardPayload?: ProductImproveCardPayload;
  taskProposal?: TaskProposalPayload;
  taskRun?: TaskRunPayload;
  aiTask?: AITaskItem;
  thinkingContent?: string;
};

/** 侧栏「本会话任务」的批次条目（从消息流的 taskRun / 历史 aiTask 派生） */
export type ConversationTaskRunEntry = {
  runId: string;
  title: string;
  taskIds: string[];
  errorCount: number;
  paramsSummary: string[];
  startedAt: string;
};

export const aiTaskTypeLabels: Record<string, string> = {
  picture_translate: "图片翻译",
  image_generation: "AI 生成商品图片",
  product_improve: "商品描述生成",
};

export type ConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
};

export type Conversation = ConversationSummary;

export type OrderFilterKey = "all" | "paid" | "unfulfilled" | "refunded";

export type LocalFileItem = {
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

export type RichMediaItem = {
  id: string;
  title: string;
  kind: "url" | "image" | "video";
  value: string;
  note: string;
};

export const objectTypeLabels: Record<ObjectType, string> = {
  product: "商品",
  article: "文章",
  order: "订单",
};

export function isWorkspacePanel(value: string | null): value is WorkspacePanel {
  return (
    value === "home" ||
    value === "dashboard" ||
    value === "chat" ||
    value === "skills" ||
    value === "automation" ||
    value === "tasks"
  );
}

export function isObjectType(value: ContextTool | null): value is ObjectType {
  return value === "product" || value === "article" || value === "order";
}

export function isQueryableObjectType(value: ContextTool | null): value is QueryableObjectType {
  return value === "product" || value === "article";
}
