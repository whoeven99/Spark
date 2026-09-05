import type { AITaskItem } from "./aiTaskTypes";
import type { ImageGenerationFormPayload } from "./imageGenerationFormPayload";
import type { ManagedAiLaunchContext } from "./managedAiLaunchContext";
import type { ManagedAiOutputParseResult } from "./managedAiOutputRuntime";
import type { ProductQualityFormPayload } from "./productQualityFormPayload";
import type { HealthDiagnosisFormPayload } from "./healthDiagnosisCardPayload";
import type { TaskProposalPayload } from "./taskProposalPayload";
import type { TaskRunPayload } from "./taskRunPayload";

export type ChatMessageImageAttachment = {
  type: "image";
  url: string;
  alt?: string;
};

export type ChatMessageAttachment = ChatMessageImageAttachment;

export type ProductImproveCardPayload = {
  productId: string;
  title: string;
  description: string;
  targetLanguage?: string;
};

function coerceImageAttachment(value: unknown): ChatMessageImageAttachment | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const candidate = value as {
    type?: unknown;
    url?: unknown;
    alt?: unknown;
  };

  if (candidate.type !== "image") return undefined;
  if (typeof candidate.url !== "string" || !candidate.url.trim()) return undefined;

  return {
    type: "image",
    url: candidate.url.trim(),
    ...(typeof candidate.alt === "string" && candidate.alt.trim()
      ? { alt: candidate.alt.trim() }
      : {}),
  };
}

export function coerceChatMessageAttachments(
  value: unknown,
): ChatMessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceImageAttachment(item))
    .filter((item): item is ChatMessageAttachment => Boolean(item));
}

/** 首页对话消息：助手回复可为「文本 + 可选交互卡片」。 */
export type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      attachments?: ChatMessageAttachment[];
      /** 为 true 时在气泡内渲染「商品描述生成结果」卡片（即时生成结果展示/应用）。 */
      productImproveCard?: boolean;
      /** 通用任务确认卡片（TaskProposal 协议，走 /api/task-proposal）。 */
      taskProposal?: TaskProposalPayload;
      /** 「任务已开始」回执卡片（TaskProposal 执行成功后追加的新对话轮）。 */
      taskRun?: TaskRunPayload;
      productImproveCardPayload?: ProductImproveCardPayload;
      /** 对话内文生图卡片（选商品 / 描述 / 出图 / 积分，不跳页）。 */
      imageGenerationCard?: boolean;
      imageGenerationCardPayload?: ImageGenerationFormPayload;
      /** 为 true 时在气泡内渲染「商品页质量评分」表单/结果卡。 */
      productQualityCard?: boolean;
      productQualityCardPayload?: ProductQualityFormPayload;
      /** 为 true 时在气泡内渲染「今日健康诊断与待办」卡。 */
      healthDiagnosisCard?: boolean;
      healthDiagnosisCardPayload?: HealthDiagnosisFormPayload;
      /**
       * 能力总览回复下方展示与工作台「推荐」同源的可点操作。
       * 由服务端在用户问「有什么功能」时写入 uiPayloads.workspaceActions。
       */
      workspaceActions?: boolean;
      /** 提交后在气泡内展示运行态任务卡片（文生图 / 图片翻译等）。 */
      aiTask?: AITaskItem;
      thinkingContent?: string;
      assistantLaunchContext?: ManagedAiLaunchContext;
      managedAiResult?: ManagedAiOutputParseResult;
    };
