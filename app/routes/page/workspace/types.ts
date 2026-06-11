/** WorkspaceAppShellPage 拆分出的共享类型与类型守卫。 */
import type {
  ChatMessageAttachment,
  ProductImproveCardPayload,
} from "../../../lib/chatMessage";
import type { ImageGenerationFormPayload } from "../../../lib/imageGenerationFormPayload";
import type { PictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import type { TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import type { BatchTasksFormPayload } from "../../../lib/batchTasksFormPayload";
import type { TaskProposalPayload } from "../../../lib/taskProposalPayload";

export type WorkspacePanel = "dashboard" | "chat" | "skills" | "automation" | "tasks";
export type AutomationView = "configured" | "history" | "templates";
export type ObjectType = "product" | "article" | "order";
export type ContextTool = ObjectType | "file" | "media";

export type WorkspaceConversationMessage = {
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
  batchTasksCard?: boolean;
  batchTasksFormPayload?: BatchTasksFormPayload;
  taskProposal?: TaskProposalPayload;
  thinkingContent?: string;
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
  return value === "dashboard" || value === "chat" || value === "skills" || value === "automation" || value === "tasks";
}

export function isObjectType(value: ContextTool | null): value is ObjectType {
  return value === "product" || value === "article" || value === "order";
}
