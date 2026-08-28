/** WorkspaceAppShellPage 拆分出的消息转换 / 上下文拼装纯函数。 */
import type {
  ChatMessage,
  ChatMessageAttachment,
  ProductImproveCardPayload,
} from "../../../lib/chatMessage";
import {
  coerceImageGenerationFormPayload,
  type ImageGenerationFormPayload,
} from "../../../lib/imageGenerationFormPayload";
import {
  coerceProductQualityFormPayload,
  type ProductQualityFormPayload,
} from "../../../lib/productQualityFormPayload";
import {
  coerceHealthDiagnosisFormPayload,
  type HealthDiagnosisFormPayload,
} from "../../../lib/healthDiagnosisCardPayload";
import { coercePictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import { coerceBatchTasksFormPayload } from "../../../lib/batchTasksFormPayload";
import {
  buildBatchProductImproveProposal,
  buildSinglePictureTranslateProposal,
  coerceTaskProposalPayload,
  taskProposalFromBatchTasksPayload,
} from "../../../lib/taskProposalPayload";
import { coerceTaskRunPayload } from "../../../lib/taskRunPayload";
import type { SelectedShopifyObject } from "../../../lib/shopifyObjectTypes";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import {
  describeObjectQuery,
  objectQueryKindLabel,
  serializeObjectQueryForAI,
} from "../../../lib/objectQuerySpec";
import type { ChatStreamFinishPayload } from "../chat/useChatStream";
import {
  fileRoleDescriptions,
  fileRoleLabels,
  objectTypeLabels,
  WORKSPACE_HISTORY_UPLOAD_NOTE,
  type FileRole,
  type LocalFileItem,
  type WorkspaceConversationMessage,
  type ObjectType,
  type QueryableObjectType,
} from "./types";
import { parseManagedAiLaunchContext, type ManagedAiLaunchContext } from "../../../lib/managedAiLaunchContext";
import type { ManagedAiOutputParseResult } from "../../../lib/managedAiOutputRuntime";

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
    ...(message.productImproveCard || message.productImproveCardPayload
      ? { productImproveCard: true }
      : {}),
    ...(message.productImproveCardPayload
      ? { productImproveCardPayload: message.productImproveCardPayload }
      : {}),
    ...(message.imageGenerationCard || message.imageGenerationCardPayload
      ? { imageGenerationCard: true }
      : {}),
    ...(message.imageGenerationCardPayload
      ? { imageGenerationCardPayload: message.imageGenerationCardPayload }
      : {}),
    ...(message.productQualityCard || message.productQualityCardPayload
      ? { productQualityCard: true }
      : {}),
    ...(message.productQualityCardPayload
      ? { productQualityCardPayload: message.productQualityCardPayload }
      : {}),
    ...(message.healthDiagnosisCard || message.healthDiagnosisCardPayload
      ? { healthDiagnosisCard: true }
      : {}),
    ...(message.healthDiagnosisCardPayload
      ? { healthDiagnosisCardPayload: message.healthDiagnosisCardPayload }
      : {}),
    ...(message.taskProposal ? { taskProposal: message.taskProposal } : {}),
    ...(message.taskRun ? { taskRun: message.taskRun } : {}),
    ...(message.aiTask ? { aiTask: message.aiTask } : {}),
    ...(message.thinkingContent ? { thinkingContent: message.thinkingContent } : {}),
    ...(message.assistantLaunchContext ? { assistantLaunchContext: message.assistantLaunchContext } : {}),
    ...(message.managedAiResult ? { managedAiResult: message.managedAiResult } : {}),
  };
}

export function buildAssistantWorkspaceMessage(
  text: string,
  payload: ChatStreamFinishPayload,
  options?: {
    assistantLaunchContext?: ManagedAiLaunchContext | null;
    managedAiResult?: ManagedAiOutputParseResult | null;
    /** 新消息时间戳；缺省英文 Just now，调用方应传入 i18n。 */
    time?: string;
  },
): WorkspaceConversationMessage {
  const hasProductImproveCard =
    payload.productImproveCard || Boolean(payload.productImproveCardPayload);
  const hasImageGenerationCard =
    payload.imageGenerationCard || Boolean(payload.imageGenerationCardPayload);
  const hasProductQualityCard =
    payload.productQualityCard || Boolean(payload.productQualityCardPayload);
  const hasHealthDiagnosisCard =
    payload.healthDiagnosisCard || Boolean(payload.healthDiagnosisCardPayload);

  return {
    role: "assistant",
    text,
    time: options?.time?.trim() || "Just now",
    ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
    ...(hasProductImproveCard ? { productImproveCard: true } : {}),
    ...(payload.productImproveCardPayload
      ? { productImproveCardPayload: payload.productImproveCardPayload as ProductImproveCardPayload }
      : {}),
    ...(hasImageGenerationCard ? { imageGenerationCard: true } : {}),
    ...(payload.imageGenerationCardPayload
      ? {
          imageGenerationCardPayload:
            payload.imageGenerationCardPayload as ImageGenerationFormPayload,
        }
      : {}),
    ...(hasProductQualityCard ? { productQualityCard: true } : {}),
    ...(payload.productQualityCardPayload
      ? {
          productQualityCardPayload: coerceProductQualityFormPayload(
            payload.productQualityCardPayload,
          ),
        }
      : {}),
    ...(hasHealthDiagnosisCard ? { healthDiagnosisCard: true } : {}),
    ...(payload.healthDiagnosisCardPayload
      ? {
          healthDiagnosisCardPayload: coerceHealthDiagnosisFormPayload(
            payload.healthDiagnosisCardPayload,
          ),
        }
      : {}),
    ...(payload.taskProposal ? { taskProposal: payload.taskProposal } : {}),
    ...(payload.thinkingContent ? { thinkingContent: payload.thinkingContent } : {}),
    ...(options?.assistantLaunchContext ? { assistantLaunchContext: options.assistantLaunchContext } : {}),
    ...(options?.managedAiResult ? { managedAiResult: options.managedAiResult } : {}),
  };
}

export function formatTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * 对话更新时间：库内 ISO UTC；默认按 UTC 展示。
 * 仅当调用方确认中国 IP 时传入 Asia/Shanghai。
 */
export function formatConversationTimestamp(
  isoString: string,
  timeZone = "UTC",
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString.slice(0, 19).replace("T", " ");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function serializeAssistantPayloads(payload: ChatStreamFinishPayload): string | null {
  const result: Record<string, unknown> = {};
  if (payload.attachments?.length) result.attachments = payload.attachments;
  if (payload.productImproveCard || payload.productImproveCardPayload) {
    result.productImproveCard = true;
    if (payload.productImproveCardPayload) result.productImproveCardPayload = payload.productImproveCardPayload;
  }
  if (payload.imageGenerationCard || payload.imageGenerationCardPayload) {
    result.imageGenerationCard = true;
    if (payload.imageGenerationCardPayload) {
      result.imageGenerationCardPayload = payload.imageGenerationCardPayload;
    }
  }
  if (payload.productQualityCard || payload.productQualityCardPayload) {
    result.productQualityCard = true;
    if (payload.productQualityCardPayload) {
      result.productQualityCardPayload = coerceProductQualityFormPayload(
        payload.productQualityCardPayload,
      );
    }
  }
  if (payload.healthDiagnosisCard || payload.healthDiagnosisCardPayload) {
    result.healthDiagnosisCard = true;
    if (payload.healthDiagnosisCardPayload) {
      result.healthDiagnosisCardPayload = coerceHealthDiagnosisFormPayload(
        payload.healthDiagnosisCardPayload,
      );
    }
  }
  if (payload.taskProposal) {
    result.taskProposal = payload.taskProposal;
  }
  return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
}

export function serializeWorkspaceMessagePayloads(
  message: WorkspaceConversationMessage,
): string | null {
  const result: Record<string, unknown> = {};
  if (message.attachments?.length) result.attachments = message.attachments;
  if (message.productImproveCard || message.productImproveCardPayload) {
    result.productImproveCard = true;
    if (message.productImproveCardPayload) {
      result.productImproveCardPayload = message.productImproveCardPayload;
    }
  }
  if (message.imageGenerationCard || message.imageGenerationCardPayload) {
    result.imageGenerationCard = true;
    if (message.imageGenerationCardPayload) {
      result.imageGenerationCardPayload = message.imageGenerationCardPayload;
    }
  }
  if (message.productQualityCard || message.productQualityCardPayload) {
    result.productQualityCard = true;
    if (message.productQualityCardPayload) {
      result.productQualityCardPayload = message.productQualityCardPayload;
    }
  }
  if (message.healthDiagnosisCard || message.healthDiagnosisCardPayload) {
    result.healthDiagnosisCard = true;
    if (message.healthDiagnosisCardPayload) {
      result.healthDiagnosisCardPayload = message.healthDiagnosisCardPayload;
    }
  }
  if (message.taskProposal) result.taskProposal = message.taskProposal;
  if (message.taskRun) result.taskRun = message.taskRun;
  if (message.aiTask) result.aiTask = message.aiTask;
  if (message.thinkingContent) result.thinkingContent = message.thinkingContent;
  if (message.assistantLaunchContext) result.assistantLaunchContext = message.assistantLaunchContext;
  if (message.managedAiResult) result.managedAiResult = message.managedAiResult;
  return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
}

export function dbMessageToUiMessage(msg: {
  role: string;
  content: string;
  payloads: string | null;
  createdAt: string;
}): WorkspaceConversationMessage {
  const extras = msg.payloads ? (JSON.parse(msg.payloads) as Record<string, unknown>) : {};
  const assistantLaunchContext = parseManagedAiLaunchContext(
    typeof extras.assistantLaunchContext === "string"
      ? extras.assistantLaunchContext
      : extras.assistantLaunchContext
        ? JSON.stringify(extras.assistantLaunchContext)
        : null,
  );
  return {
    role: msg.role as "user" | "assistant",
    text: msg.content,
    time: formatTimeLabel(new Date(msg.createdAt)),
    ...(extras.attachments ? { attachments: extras.attachments as ChatMessageAttachment[] } : {}),
    ...(extras.productImproveCard ? { productImproveCard: true } : {}),
    ...(extras.productImproveCardPayload
      ? { productImproveCardPayload: extras.productImproveCardPayload as ProductImproveCardPayload }
      : {}),
    ...(extras.productQualityCard || extras.productQualityCardPayload
      ? { productQualityCard: true }
      : {}),
    ...(extras.productQualityCardPayload
      ? {
          productQualityCardPayload: coerceProductQualityFormPayload(
            extras.productQualityCardPayload,
          ) as ProductQualityFormPayload,
        }
      : {}),
    ...(extras.healthDiagnosisCard || extras.healthDiagnosisCardPayload
      ? { healthDiagnosisCard: true }
      : {}),
    ...(extras.healthDiagnosisCardPayload
      ? {
          healthDiagnosisCardPayload: coerceHealthDiagnosisFormPayload(
            extras.healthDiagnosisCardPayload,
          ) as HealthDiagnosisFormPayload,
        }
      : {}),
    // taskProposal 优先；旧批量/单图翻译/文生图卡片（历史落库消息）统一转为通用提案卡
    ...(() => {
      if (extras.imageGenerationCardPayload || extras.imageGenerationFormPayload) {
        return {
          imageGenerationCard: true,
          imageGenerationCardPayload: coerceImageGenerationFormPayload(
            extras.imageGenerationCardPayload ?? extras.imageGenerationFormPayload,
          ),
        };
      }
      if (extras.taskProposal) {
        const proposal = coerceTaskProposalPayload(extras.taskProposal);
        if (proposal) {
          return { taskProposal: proposal };
        }
      }
      if (extras.batchTasksFormPayload) {
        const proposal = taskProposalFromBatchTasksPayload(
          coerceBatchTasksFormPayload(extras.batchTasksFormPayload),
        );
        if (proposal) return { taskProposal: proposal };
      }
      if (extras.pictureTranslateCard || extras.pictureTranslateFormPayload) {
        return {
          taskProposal: buildSinglePictureTranslateProposal(
            coercePictureTranslateFormPayload(extras.pictureTranslateFormPayload ?? {}),
          ),
        };
      }
      if (extras.imageGenerationCard || extras.imageGenerationFormPayload) {
        return {
          imageGenerationCard: true,
          imageGenerationCardPayload: coerceImageGenerationFormPayload(
            extras.imageGenerationFormPayload ?? {},
          ),
        };
      }
      return {};
    })(),
    ...(() => {
      const run = extras.taskRun ? coerceTaskRunPayload(extras.taskRun) : null;
      return run ? { taskRun: run } : {};
    })(),
    ...(extras.aiTask && typeof extras.aiTask === "object"
      ? { aiTask: extras.aiTask as WorkspaceConversationMessage["aiTask"] }
      : {}),
    ...(typeof extras.thinkingContent === "string"
      ? { thinkingContent: extras.thinkingContent }
      : {}),
    ...(assistantLaunchContext ? { assistantLaunchContext } : {}),
    ...(extras.managedAiResult && typeof extras.managedAiResult === "object"
      ? { managedAiResult: extras.managedAiResult as ManagedAiOutputParseResult }
      : {}),
  };
}

export function buildWorkspaceContextBlock(params: {
  selectedObjectsByType: Record<ObjectType, SelectedShopifyObject[]>;
  objectQuerySelectionByType?: Record<QueryableObjectType, ObjectQuerySelection | null>;
  selectedFileIds: string[];
  localFiles: LocalFileItem[];
  fileRolesById?: Record<string, FileRole>;
}): string | null {
  const lines: string[] = [];

  // 按条件圈定的对象：保存的是条件而非 ID 快照，执行时重新求值
  for (const type of ["product", "article"] as QueryableObjectType[]) {
    const query = params.objectQuerySelectionByType?.[type];
    if (!query) continue;
    const countPart = query.matchCount != null ? `当前匹配约 ${query.matchCount} 个；` : "";
    lines.push(
      `- ${objectQueryKindLabel(type)}（按条件圈定）：${describeObjectQuery(query)}（${countPart}执行时将按条件重新求值，不固化 ID）`,
    );
    lines.push(`  [对象查询: ${serializeObjectQueryForAI(query)}]`);
  }

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
    lines.push(`- 已选文件（共 ${params.selectedFileIds.length} 个，文件完整内容已注入系统消息，按角色使用）：`);
    for (const role of ["reference", "data", "style"] as FileRole[]) {
      const filesInRole = params.selectedFileIds
        .map((id) => params.localFiles.find((item) => item.id === id))
        .filter((file): file is LocalFileItem => Boolean(file))
        .filter((file) => (params.fileRolesById?.[file.id] ?? "reference") === role);
      if (filesInRole.length === 0) continue;
      lines.push(`  ◦ ${fileRoleLabels[role]}（${fileRoleDescriptions[role]}）：`);
      for (const file of filesInRole) {
        const displayNote = file.note === WORKSPACE_HISTORY_UPLOAD_NOTE ? "历史上传" : file.note;
        const notePart = displayNote ? `（${displayNote}）` : "";
        const sizePart = file.charCount ? `，已解析 ${Math.round(file.charCount / 1000)}k 字符` : "";
        lines.push(`    • ${file.name}${notePart}${sizePart}`);
      }
    }
  }

  if (lines.length === 0) return null;
  return `[工作台上下文]\n${lines.join("\n")}`;
}

export function augmentUserMessage(content: string, contextBlock: string | null) {
  if (!contextBlock) return content;
  return `${contextBlock}\n\n[用户消息]\n${content}`;
}
