/** WorkspaceAppShellPage 拆分出的消息转换 / 上下文拼装纯函数。 */
import type {
  ChatMessage,
  ChatMessageAttachment,
  ProductImproveCardPayload,
} from "../../../lib/chatMessage";
import { coerceImageGenerationFormPayload } from "../../../lib/imageGenerationFormPayload";
import { coercePictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { coerceBatchTasksFormPayload } from "../../../lib/batchTasksFormPayload";
import { coerceTaskProposalPayload } from "../../../lib/taskProposalPayload";
import type { SelectedShopifyObject } from "../../../lib/shopifyObjectTypes";
import type { ChatStreamFinishPayload } from "../chat/useChatStream";
import {
  objectTypeLabels,
  type LocalFileItem,
  type ObjectType,
  type RichMediaItem,
  type WorkspaceConversationMessage,
} from "./types";

export function workspaceMessageToApiMessage(message: WorkspaceConversationMessage): ChatMessage {
  return { role: message.role, content: message.text };
}

export function workspaceMessageToChatMessage(message: WorkspaceConversationMessage): ChatMessage {
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
    ...(message.batchTasksCard || message.batchTasksFormPayload
      ? { batchTasksCard: true }
      : {}),
    ...(message.batchTasksFormPayload
      ? { batchTasksFormPayload: message.batchTasksFormPayload }
      : {}),
    ...(message.taskProposal ? { taskProposal: message.taskProposal } : {}),
    ...(message.thinkingContent ? { thinkingContent: message.thinkingContent } : {}),
  };
}

export function buildAssistantWorkspaceMessage(
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
  const batchTasksFormPayload = payload.batchTasksFormPayload
    ? coerceBatchTasksFormPayload(payload.batchTasksFormPayload)
    : undefined;
  const hasBatchTasksCard = payload.batchTasksCard || Boolean(batchTasksFormPayload);
  const suppressProductImprove =
    hasBatchTasksCard && (batchTasksFormPayload?.products?.length ?? 0) > 0;

  return {
    role: "assistant",
    text,
    time: "刚刚",
    ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
    ...(translationTaskForm ? { translationTaskForm } : {}),
    ...(hasProductImproveCard && !suppressProductImprove ? { productImproveCard: true } : {}),
    ...(payload.productImproveCardPayload && !suppressProductImprove
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
    ...(hasBatchTasksCard ? { batchTasksCard: true } : {}),
    ...(batchTasksFormPayload ? { batchTasksFormPayload } : {}),
    ...(payload.taskProposal ? { taskProposal: payload.taskProposal } : {}),
    ...(payload.thinkingContent ? { thinkingContent: payload.thinkingContent } : {}),
  };
}

export function formatTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 对话更新时间：上海时区，精确到秒（YYYY-MM-DD HH:mm:ss）。 */
export function formatConversationTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString.slice(0, 19).replace("T", " ");
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function serializeAssistantPayloads(payload: ChatStreamFinishPayload): string | null {
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
  if (payload.batchTasksCard || payload.batchTasksFormPayload) {
    result.batchTasksCard = true;
    if (payload.batchTasksFormPayload) {
      result.batchTasksFormPayload = coerceBatchTasksFormPayload(payload.batchTasksFormPayload);
    }
  }
  if (payload.taskProposal) {
    result.taskProposal = payload.taskProposal;
  }
  return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
}

export function dbMessageToUiMessage(msg: {
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
    ...(extras.batchTasksCard || extras.batchTasksFormPayload
      ? { batchTasksCard: true }
      : {}),
    ...(extras.batchTasksFormPayload
      ? {
          batchTasksFormPayload: coerceBatchTasksFormPayload(extras.batchTasksFormPayload),
        }
      : {}),
    ...(extras.taskProposal
      ? (() => {
          const proposal = coerceTaskProposalPayload(extras.taskProposal);
          return proposal ? { taskProposal: proposal } : {};
        })()
      : {}),
  };
}

export function buildWorkspaceContextBlock(params: {
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
    if (type === "product") {
      // Structured product data so AI can extract IDs + images for batch tasks
      lines.push(`- 已选商品（共 ${items.length} 个）：`);
      for (const item of items) {
        const parts = [`  • ${item.title}`, `[ID: ${item.id}]`];
        if (item.imageUrl) parts.push(`[图片: ${item.imageUrl}]`);
        lines.push(parts.join(" "));
      }
    } else if (type === "article") {
      // Structured article data so AI can extract IDs for batch tasks
      lines.push(`- 已选文章（共 ${items.length} 个）：`);
      for (const item of items) {
        const parts = [`  • ${item.title}`, `[ID: ${item.id}]`];
        if (item.imageUrl) parts.push(`[封面: ${item.imageUrl}]`);
        lines.push(parts.join(" "));
      }
    } else {
      const names = items.map((item) => item.title || item.id);
      lines.push(`- ${objectTypeLabels[type]}：${names.join("、")}（共 ${items.length} 个）`);
    }
  }

  if (params.selectedFileIds.length > 0) {
    lines.push(`- 已选文件（共 ${params.selectedFileIds.length} 个，文件完整内容已注入系统消息，可直接引用）：`);
    for (const id of params.selectedFileIds) {
      const file = params.localFiles.find((item) => item.id === id);
      if (!file) continue;
      const notePart = file.note ? `（${file.note}）` : "";
      const sizePart = file.charCount ? `，已解析 ${Math.round(file.charCount / 1000)}k 字符` : "";
      lines.push(`  • ${file.name}${notePart}${sizePart}`);
    }
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

export function augmentUserMessage(content: string, contextBlock: string | null) {
  if (!contextBlock) return content;
  return `${contextBlock}\n\n[用户消息]\n${content}`;
}
