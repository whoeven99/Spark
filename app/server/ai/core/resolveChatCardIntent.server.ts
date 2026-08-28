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
import {
  coerceProductQualityFormPayload,
  defaultProductQualityFormPayload,
} from "../../../lib/productQualityFormPayload";
import {
  coerceHealthDiagnosisFormPayload,
  defaultHealthDiagnosisFormPayload,
} from "../../../lib/healthDiagnosisCardPayload";
import {
  taskProposalFromBatchTasksPayload,
  type TaskProposalPayload,
} from "../../../lib/taskProposalPayload";
import { parseWorkspaceProductsFromText } from "../../../lib/workspaceContextProducts";
import { extractMessageText } from "../utils/langchainMessageText";
import { getShopChatModel } from "./shopChatGraph.server";
import { recordChatTokenUsage } from "../../tokenUsage/index.server";

type CardStreamChunk =
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "task_proposal"; payload: TaskProposalPayload };

export const CHAT_CARD_TYPES = [
  "none",
  "image_generation_form",
  "picture_translate_form",
  "product_improve_form",
  "product_quality_form",
  "health_diagnosis_form",
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
  pictureTranslateTargetLanguage: z.string().optional(),
  productImproveProductId: z.string().optional(),
  productQualityProductId: z.string().optional(),
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
- image_generation_form：AI 文生图 / 图片生成
- picture_translate_form：整图翻译（翻译图片中的文字）
- product_improve_form：单个商品描述/文案生成
- product_quality_form：商品页质量评分（诊断标题/主图/描述/规格/标签）
- health_diagnosis_form：店铺今日健康诊断与待办（规则引擎快照，非商品页评分）
- batch_tasks_form：工作台已选多个商品时的批量文案或批量图片翻译
- none：普通问答，不需要卡片
（整店批量翻译已迁移至 Ciwi Translator，Spark 内不提供 translation_task_form）`;

export function hasAnyChatCardInUiPayloads(uiPayloads: Record<string, unknown>): boolean {
  return Boolean(
    uiPayloads.imageGenerationCard ||
      uiPayloads.pictureTranslateCard ||
      uiPayloads.productImproveCardPayload ||
      uiPayloads.productQualityCard ||
      uiPayloads.healthDiagnosisCard ||
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
    case "image_generation_form": {
      const products = parseWorkspaceProductsFromText(lastUserText);
      const first = products[0];
      return {
        imageGenerationCard: coerceImageGenerationFormPayload({
          description: normalized.imageDescription ?? "",
          productId: first?.id,
          productTitle: first?.title,
        }),
      };
    }
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
    case "product_quality_form":
      return {
        productQualityCard: coerceProductQualityFormPayload({
          productId: normalized.productQualityProductId,
        }),
      };
    case "health_diagnosis_form":
      return {
        healthDiagnosisCard: coerceHealthDiagnosisFormPayload(
          defaultHealthDiagnosisFormPayload(),
        ),
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
  if (uiPayloads.productQualityCard && !emittedFlags.has("productQualityForm")) {
    chunks.push({
      type: "tool_call",
      name: "open_product_quality_form",
      args: uiPayloads.productQualityCard,
    });
  }
  if (uiPayloads.healthDiagnosisCard && !emittedFlags.has("healthDiagnosisForm")) {
    chunks.push({
      type: "tool_call",
      name: "open_health_diagnosis_form",
      args: uiPayloads.healthDiagnosisCard,
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
  shop?: string;
}): Promise<ChatCardIntent> {
  const userIntent = extractUserIntentText(params.lastUserText);
  const model = getShopChatModel().withStructuredOutput(ChatCardIntentSchema, {
    name: "chat_card_intent",
    includeRaw: true,
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
6. 商品页质量评分（诊断）用 product_quality_form，不要与商品文案 product_improve_form 混淆。
7. 店铺「今日健康诊断 / 待办与风险」用 health_diagnosis_form，不要与商品页质量评分混淆。

${CARD_TYPE_GUIDE}`,
    ),
    new HumanMessage(
      `用户消息：${userIntent || "（空）"}

助手回复：
${params.assistantReply.trim() || "（空）"}

实际工具调用：${params.toolsCalled.length ? params.toolsCalled.join(", ") : "（无）"}`,
    ),
  ]);

  const raw =
    result && typeof result === "object" && "raw" in result
      ? (result as { raw?: { usage_metadata?: unknown } }).raw
      : undefined;
  const parsed =
    result && typeof result === "object" && "parsed" in result
      ? (result as { parsed: unknown }).parsed
      : result;

  if (params.shop?.trim() && raw?.usage_metadata) {
    await recordChatTokenUsage({
      shop: params.shop,
      usage: raw.usage_metadata,
    });
  }

  return normalizeLlmIntent(parsed as ChatCardIntent);
}

export async function resolveMissingChatCardsWithLlm(params: {
  messages: BaseMessage[];
  lastUserText: string;
  assistantReply: string;
  existingUiPayloads: Record<string, unknown>;
  emittedFlags?: Set<string>;
  shop?: string;
}): Promise<LlmChatCardResolution> {
  if (hasAnyChatCardInUiPayloads(params.existingUiPayloads)) {
    return { uiPayloads: {}, streamChunks: [] };
  }

  const intent = await resolveChatCardIntentWithLlm({
    lastUserText: params.lastUserText,
    assistantReply: params.assistantReply,
    toolsCalled: extractToolsCalledFromMessages(params.messages),
    shop: params.shop,
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
    case "image_generation_form":
      return { imageGenerationCard: defaultImageGenerationFormPayload() };
    case "picture_translate_form":
      return { pictureTranslateCard: defaultPictureTranslateFormPayload() };
    case "product_improve_form":
      return { productImproveCardPayload: defaultProductImproveFormPayload() };
    case "product_quality_form":
      return { productQualityCard: defaultProductQualityFormPayload() };
    case "health_diagnosis_form":
      return { healthDiagnosisCard: defaultHealthDiagnosisFormPayload() };
    case "batch_tasks_form":
    case "none":
      return {};
    default: {
      const _exhaustive: never = cardType;
      return _exhaustive;
    }
  }
}
