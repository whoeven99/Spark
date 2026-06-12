import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import { extractUserIntentText } from "../../../lib/chatCardFallback";
import {
  coerceBatchTasksFormPayload,
  mergeBatchTasksPayloadWithContext,
} from "../../../lib/batchTasksFormPayload";
import {
  coerceImageGenerationFormPayload,
  defaultImageGenerationFormPayload,
} from "../../../lib/imageGenerationFormPayload";
import {
  coercePictureTranslateFormPayload,
  defaultPictureTranslateFormPayload,
} from "../../../lib/pictureTranslateFormPayload";
import {
  coerceProductImproveFormPayload,
  defaultProductImproveFormPayload,
} from "../../../lib/productImproveFormPayload";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { defaultTranslationTaskFormPayload } from "../skills/translation/translation.extract";
import {
  taskProposalFromBatchTasksPayload,
  type TaskProposalPayload,
} from "../../../lib/taskProposalPayload";
import { parseWorkspaceProductsFromText } from "../../../lib/workspaceContextProducts";
import { extractMessageText } from "../utils/langchainMessageText";
import { getShopChatModel } from "./shopChatGraph.server";

type CardStreamChunk =
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "task_proposal"; payload: TaskProposalPayload };

export const CHAT_CARD_TYPES = [
  "none",
  "translation_task_form",
  "image_generation_form",
  "picture_translate_form",
  "product_improve_form",
  "batch_tasks_form",
] as const;

export type ChatCardType = (typeof CHAT_CARD_TYPES)[number];

const ChatCardIntentSchema = z.object({
  cardType: z
    .enum(CHAT_CARD_TYPES)
    .describe("本轮应展示的交互卡片；none 表示无需卡片"),
  shouldShowCard: z
    .boolean()
    .describe("是否向用户下发可交互卡片（与助手文案必须一致）"),
  assistantClaimsCardOpened: z
    .boolean()
    .describe("助手回复是否声称已打开/展示配置卡片"),
  imageDescription: z.string().optional().describe("文生图画面描述预填"),
  translationTargetLocales: z
    .array(z.string())
    .optional()
    .describe("店铺翻译目标语言 locale 列表"),
  translationLimitPerType: z.number().optional().describe("每种资源翻译上限"),
  translationResourceTypes: z
    .array(z.string())
    .optional()
    .describe("翻译模块：PRODUCT/COLLECTION/PAGE 等"),
  pictureTranslateTargetLanguage: z.string().optional(),
  productImproveProductId: z.string().optional(),
  batchTaskType: z
    .enum(["product_improve", "picture_translate"])
    .optional()
    .describe("批量任务类型，仅 batch_tasks_form 时使用"),
});

export type ChatCardIntent = z.infer<typeof ChatCardIntentSchema>;

export type LlmChatCardResolution = {
  uiPayloads: Record<string, unknown>;
  streamChunks: CardStreamChunk[];
  adjustedReply?: string;
};

const CARD_TYPE_GUIDE = `卡片类型说明：
- translation_task_form：店铺内容批量翻译（商品/集合/页面等），非「图片翻译」
- image_generation_form：AI 文生图 / 图片生成
- picture_translate_form：整图翻译（翻译图片中的文字）
- product_improve_form：单个商品描述/文案生成
- batch_tasks_form：工作台已选多个商品时的批量文案或批量图片翻译
- none：普通问答，不需要卡片`;

export function hasAnyChatCardInUiPayloads(uiPayloads: Record<string, unknown>): boolean {
  return Boolean(
    uiPayloads.translationTaskForm ||
      uiPayloads.imageGenerationCard ||
      uiPayloads.pictureTranslateCard ||
      uiPayloads.productImproveCardPayload ||
      uiPayloads.taskProposal ||
      uiPayloads.batchTasksCard,
  );
}

export function extractToolsCalledFromMessages(messages: BaseMessage[]): string[] {
  const names = new Set<string>();
  for (const msg of messages) {
    if (ToolMessage.isInstance(msg) && msg.name) {
      names.add(msg.name);
    }
    if (AIMessage.isInstance(msg) && Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls) {
        if (call.name) names.add(call.name);
      }
    }
  }
  return [...names];
}

function normalizeLlmIntent(intent: ChatCardIntent): ChatCardIntent {
  if (intent.assistantClaimsCardOpened && intent.cardType !== "none") {
    return { ...intent, shouldShowCard: true };
  }
  if (intent.shouldShowCard && intent.cardType === "none") {
    return { ...intent, shouldShowCard: false };
  }
  return intent;
}

export function reconcileReplyWithChatCards(
  reply: string,
  uiPayloads: Record<string, unknown>,
): string {
  if (hasAnyChatCardInUiPayloads(uiPayloads)) return reply;

  const lines = reply.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !/已(经)?为(您|你)打开|已打开|卡片已打开|配置卡片/.test(trimmed);
  });
  return filtered.join("\n").trim() || reply;
}

export function buildChatCardPayloadFromIntent(
  intent: ChatCardIntent,
  lastUserText: string,
): Record<string, unknown> {
  const normalized = normalizeLlmIntent(intent);
  if (!normalized.shouldShowCard || normalized.cardType === "none") {
    return {};
  }

  switch (normalized.cardType) {
    case "translation_task_form":
      return {
        translationTaskForm: coerceTranslationTaskFormPayload({
          targetLocales: normalized.translationTargetLocales,
          limitPerType: normalized.translationLimitPerType,
          resourceTypes: normalized.translationResourceTypes,
        }),
      };
    case "image_generation_form":
      return {
        imageGenerationCard: coerceImageGenerationFormPayload({
          description: normalized.imageDescription ?? "",
        }),
      };
    case "picture_translate_form":
      return {
        pictureTranslateCard: coercePictureTranslateFormPayload({
          targetLanguage: normalized.pictureTranslateTargetLanguage,
        }),
      };
    case "product_improve_form":
      return {
        productImproveCardPayload: coerceProductImproveFormPayload({
          productId: normalized.productImproveProductId,
        }),
      };
    case "batch_tasks_form": {
      const workspaceProducts = parseWorkspaceProductsFromText(lastUserText);
      if (workspaceProducts.length < 2) return {};
      const batchPayload = mergeBatchTasksPayloadWithContext(
        coerceBatchTasksFormPayload({
          taskType: normalized.batchTaskType ?? "product_improve",
          products: [],
          targetLanguage: "en",
          sourceLanguage: "auto",
        }),
        workspaceProducts,
      );
      if (batchPayload.products.length === 0) return {};
      const proposal = taskProposalFromBatchTasksPayload(batchPayload);
      if (proposal) return { taskProposal: proposal };
      return { batchTasksCard: batchPayload };
    }
    default: {
      const _exhaustive: never = normalized.cardType;
      return _exhaustive;
    }
  }
}

function streamChunksForUiPayloads(
  uiPayloads: Record<string, unknown>,
  emittedFlags: Set<string>,
): CardStreamChunk[] {
  const chunks: CardStreamChunk[] = [];

  if (uiPayloads.translationTaskForm && !emittedFlags.has("translationTaskForm")) {
    chunks.push({
      type: "tool_call",
      name: "open_translation_task_form",
      args: uiPayloads.translationTaskForm,
    });
  }
  if (uiPayloads.imageGenerationCard && !emittedFlags.has("imageGenerationForm")) {
    chunks.push({
      type: "tool_call",
      name: "open_image_generation_form",
      args: uiPayloads.imageGenerationCard,
    });
  }
  if (uiPayloads.pictureTranslateCard && !emittedFlags.has("pictureTranslateForm")) {
    chunks.push({
      type: "tool_call",
      name: "open_picture_translate_form",
      args: uiPayloads.pictureTranslateCard,
    });
  }
  if (uiPayloads.productImproveCardPayload && !emittedFlags.has("productImproveForm")) {
    chunks.push({
      type: "tool_call",
      name: "open_product_improve_form",
      args: uiPayloads.productImproveCardPayload,
    });
  }
  if (uiPayloads.taskProposal && !emittedFlags.has("batchTasksForm")) {
    chunks.push({
      type: "task_proposal",
      payload: uiPayloads.taskProposal as TaskProposalPayload,
    });
  }

  return chunks;
}

export async function resolveChatCardIntentWithLlm(params: {
  lastUserText: string;
  assistantReply: string;
  toolsCalled: string[];
}): Promise<ChatCardIntent> {
  const userIntent = extractUserIntentText(params.lastUserText);
  const model = getShopChatModel().withStructuredOutput(ChatCardIntentSchema, {
    name: "chat_card_intent",
  });

  const result = await model.invoke([
    new SystemMessage(
      `你是 Spark 聊天 UI 协调器。根据用户意图、助手回复、实际工具调用，判断是否需要展示交互卡片，并保证文案与 UI 一致。

规则：
1. 若助手声称「已打开卡片」但 toolsCalled 中没有对应 open_*_form 工具，必须 shouldShowCard=true 并选出正确 cardType。
2. 若用户仅需普通问答（查数据、解释概念），cardType=none。
3. 图片翻译与店铺翻译不可混淆。
4. 批量任务卡片仅当用户消息含工作台已选商品（≥2）且意图为批量处理时使用 batch_tasks_form。
5. 禁止在 shouldShowCard=false 时让 assistantClaimsCardOpened=true（不一致）。

${CARD_TYPE_GUIDE}`,
    ),
    new HumanMessage(
      `用户消息：${userIntent || "（空）"}

助手回复：
${params.assistantReply.trim() || "（空）"}

实际工具调用：${params.toolsCalled.length ? params.toolsCalled.join(", ") : "（无）"}`,
    ),
  ]);

  return normalizeLlmIntent(result);
}

export async function resolveMissingChatCardsWithLlm(params: {
  messages: BaseMessage[];
  lastUserText: string;
  assistantReply: string;
  existingUiPayloads: Record<string, unknown>;
  emittedFlags?: Set<string>;
}): Promise<LlmChatCardResolution> {
  if (hasAnyChatCardInUiPayloads(params.existingUiPayloads)) {
    return { uiPayloads: {}, streamChunks: [] };
  }

  const intent = await resolveChatCardIntentWithLlm({
    lastUserText: params.lastUserText,
    assistantReply: params.assistantReply,
    toolsCalled: extractToolsCalledFromMessages(params.messages),
  });

  const llmPayloads = buildChatCardPayloadFromIntent(intent, params.lastUserText);
  if (Object.keys(llmPayloads).length === 0) {
    const adjustedReply = intent.assistantClaimsCardOpened
      ? reconcileReplyWithChatCards(params.assistantReply, params.existingUiPayloads)
      : undefined;
    return { uiPayloads: {}, streamChunks: [], adjustedReply };
  }

  const streamChunks = streamChunksForUiPayloads(
    llmPayloads,
    params.emittedFlags ?? new Set(),
  );

  return {
    uiPayloads: llmPayloads,
    streamChunks,
  };
}

/** 工具未返回载荷但 LLM 判定需要卡片时，填充各类型默认卡片。 */
export function defaultPayloadForCardType(cardType: ChatCardType): Record<string, unknown> {
  switch (cardType) {
    case "translation_task_form":
      return { translationTaskForm: defaultTranslationTaskFormPayload() };
    case "image_generation_form":
      return { imageGenerationCard: defaultImageGenerationFormPayload() };
    case "picture_translate_form":
      return { pictureTranslateCard: defaultPictureTranslateFormPayload() };
    case "product_improve_form":
      return { productImproveCardPayload: defaultProductImproveFormPayload() };
    default:
      return {};
  }
}
