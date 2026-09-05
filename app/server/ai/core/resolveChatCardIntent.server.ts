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
  buildBulkCollectionEditProposal,
  buildBulkCostImportProposal,
  buildBulkInventoryImportProposal,
  buildBulkMetafieldEditProposal,
  buildBulkPriceEditProposal,
  buildBulkPriceImportProposal,
  buildBulkSeoEditProposal,
  buildBulkStatusEditProposal,
  buildBulkTagEditProposal,
  taskProposalFromBatchTasksPayload,
  type TaskProposalPayload,
} from "../../../lib/taskProposalPayload";
import { parseWorkspaceProductsFromText } from "../../../lib/workspaceContextProducts";
import { parseWorkspaceFilesFromText } from "../../../lib/workspaceContextFiles";
import {
  isBulkEditRecommendKey,
  skillNamesFromFocus,
  skillNamesFromUserText,
} from "../../../lib/promptSkillFocus";
import { getShopChatModel } from "./shopChatGraph.server";
import { recordChatTokenUsage } from "../../tokenUsage/index.server";
import type { ShopifyAdminGraphqlClient } from "../skills/shopifyInfo/shopifyInfo.tool";
import { loadBulkMetafieldEditFieldOptions } from "../skills/bulkMetafieldEdit/bulkMetafieldEdit.form.tool";
import { loadBulkInventoryLocationOptions } from "../skills/bulkInventoryImport/bulkInventoryImport.form.tool";

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

/** Skill onStreamEvent 已下发过卡片时写入的 flag（避免二次补卡重复推送）。 */
const CHAT_CARD_EMITTED_FLAGS = [
  "batchTasksForm",
  "bulkStatusEditForm",
  "bulkPriceEditForm",
  "bulkTagEditForm",
  "bulkCollectionEditForm",
  "bulkSeoEditForm",
  "bulkMetafieldEditForm",
  "bulkPriceImportForm",
  "bulkCostImportForm",
  "bulkInventoryImportForm",
  "productImproveForm",
  "pictureTranslateForm",
  "imageGenerationForm",
  "productQualityForm",
  "healthDiagnosisForm",
] as const;

export function hasEmittedChatCardFlag(emittedFlags: Set<string> | undefined): boolean {
  if (!emittedFlags || emittedFlags.size === 0) return false;
  return CHAT_CARD_EMITTED_FLAGS.some((flag) => emittedFlags.has(flag));
}

/**
 * 可确定性补出的 TaskProposal 开卡 Skill。
 * 表格导入允许空 fileId：确认卡内上传，执行端仍会拒绝空文件。
 */
const DETERMINISTIC_TASK_PROPOSAL_BY_SKILL: Array<{
  skill: string;
  build: (ctx: {
    products: Array<{ id: string; title: string; imageUrl?: string | null }>;
    files: Array<{ id: string; name: string }>;
  }) => TaskProposalPayload;
}> = [
  {
    skill: "bulkStatusEdit",
    build: ({ products }) => buildBulkStatusEditProposal({ products }),
  },
  {
    skill: "bulkTagEdit",
    build: ({ products }) => buildBulkTagEditProposal({ products }),
  },
  {
    skill: "bulkPriceEdit",
    build: ({ products }) => buildBulkPriceEditProposal({ products }),
  },
  {
    skill: "bulkSeoEdit",
    build: ({ products }) => buildBulkSeoEditProposal({ products }),
  },
  {
    skill: "bulkCollectionEdit",
    build: ({ products }) => buildBulkCollectionEditProposal({ products }),
  },
  {
    skill: "bulkMetafieldEdit",
    build: ({ products }) => buildBulkMetafieldEditProposal({ products }),
  },
  {
    skill: "bulkPriceImport",
    build: ({ files }) =>
      buildBulkPriceImportProposal({
        fileId: files[0]?.id,
        fileName: files[0]?.name,
      }),
  },
  {
    skill: "bulkCostImport",
    build: ({ files }) =>
      buildBulkCostImportProposal({
        fileId: files[0]?.id,
        fileName: files[0]?.name,
      }),
  },
  {
    skill: "bulkInventoryImport",
    build: ({ files }) =>
      buildBulkInventoryImportProposal({
        fileId: files[0]?.id,
        fileName: files[0]?.name,
      }),
  },
];

export function tryDeterministicTaskProposalFromSkills(
  skillNames: readonly string[],
  lastUserText: string,
): TaskProposalPayload | null {
  if (skillNames.length === 0) return null;
  const skillSet = new Set(skillNames);
  const ctx = {
    products: parseWorkspaceProductsFromText(lastUserText),
    files: parseWorkspaceFilesFromText(lastUserText),
  };
  for (const entry of DETERMINISTIC_TASK_PROPOSAL_BY_SKILL) {
    if (!skillSet.has(entry.skill)) continue;
    return entry.build(ctx);
  }
  return null;
}

async function enrichDeterministicBulkProposal(
  proposal: TaskProposalPayload,
  admin?: ShopifyAdminGraphqlClient,
): Promise<TaskProposalPayload> {
  if (!admin) return proposal;
  if (proposal.skillId === "bulk_metafield_edit") {
    const hasOptions = proposal.params.some(
      (field) => field.key === "fieldKey" && (field.options?.length ?? 0) > 0,
    );
    if (hasOptions) return proposal;
    try {
      const loaded = await loadBulkMetafieldEditFieldOptions(admin);
      const products = proposal.targets.items.map((item) => ({
        id: item.id,
        title: item.title,
        imageUrl: item.imageUrl,
      }));
      return buildBulkMetafieldEditProposal({
        products,
        fieldOptions: loaded.fieldOptions,
        fieldKey: loaded.fieldKey,
        fieldsTruncated: loaded.fieldsTruncated,
      });
    } catch (err) {
      console.error("[ChatCard] prefetch metafield options failed:", err);
      return proposal;
    }
  }
  if (proposal.skillId === "bulk_inventory_import") {
    const hasOptions = proposal.params.some(
      (field) => field.key === "locationId" && (field.options?.length ?? 0) > 0,
    );
    if (hasOptions) return proposal;
    try {
      const loaded = await loadBulkInventoryLocationOptions(admin);
      const fileId = proposal.params.find((field) => field.key === "fileId")?.value ?? "";
      const fileName = proposal.params.find((field) => field.key === "fileName")?.value ?? "";
      return buildBulkInventoryImportProposal({
        fileId,
        fileName,
        locationId: loaded.locationId,
        locationOptions: loaded.locationOptions,
      });
    } catch (err) {
      console.error("[ChatCard] prefetch inventory locations failed:", err);
      return proposal;
    }
  }
  return proposal;
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

/** 单行是否在「声称已开卡 / 请到卡片里操作」却没有实际卡片时需要剥掉。 */
const MISLEADING_CARD_CLAIM_LINE_RE =
  /(我来|我将|我会|让我|来为|为(您|你)|已经?为?(您|你)?)?.{0,6}(打开|展示|生成|准备|创建|调出|弹出).{0,16}(卡片|表单|面板)|(请(您|你)?在卡片中|卡片中(确认|选择|填写)|配置卡片|卡片已?(打开|展示|准备|生成|就绪))/;

export function reconcileReplyWithChatCards(
  reply: string,
  uiPayloads: Record<string, unknown>,
): string {
  if (hasAnyChatCardInUiPayloads(uiPayloads)) return reply;

  const lines = reply.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !MISLEADING_CARD_CLAIM_LINE_RE.test(trimmed);
  });
  const next = filtered.join("\n").trim();
  // 若整段都被剥光，保留原文以免空白气泡；调用方应优先补卡而非依赖纠偏。
  return next || reply;
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
  if (uiPayloads.taskProposal && !hasEmittedChatCardFlag(emittedFlags)) {
    chunks.push({
      type: "task_proposal",
      payload: uiPayloads.taskProposal as TaskProposalPayload,
    });
  }

  return chunks;
}

/** 命中即可能需要卡片的 Skill 名（与 CHAT_CARD_TYPES + 批量 TaskProposal 对应）。 */
const CARD_RELEVANT_SKILL_NAMES = new Set<string>([
  "imageGenerationForm",
  "imageGeneration",
  "pictureTranslateForm",
  "pictureTranslate",
  "productImprove",
  "productQualityScore",
  "healthDiagnosisForm",
  "bulkStatusEdit",
  "bulkPriceEdit",
  "bulkTagEdit",
  "bulkCollectionEdit",
  "bulkSeoEdit",
  "bulkMetafieldEdit",
  "bulkPriceImport",
  "bulkCostImport",
  "bulkInventoryImport",
]);

/** 助手回复里“已为你打开/准备好卡片/表单”之类的开卡话术。 */
export const CARD_CLAIM_RE =
  /(我来|我将|我会|让我|来为|为(您|你)|已经?为?(您|你)?)?.{0,8}(打开|展示|生成|准备|创建|调出|弹出|填写|确认).{0,16}(卡片|表单|面板|配置)|(卡片|表单|面板)已?(打开|展示|准备|生成|就绪)|请(您|你)?在卡片中/;

export function assistantClaimsChatCard(reply: string): boolean {
  return CARD_CLAIM_RE.test(reply ?? "");
}

/**
 * 二次补卡 LLM 的前置门：仅当本轮有卡片信号时才值得再调一次模型。
 * 高精度、偏向召回卡片：只有在「回复无开卡话术」且「用户话术未命中卡片类 Skill」
 * 且「工作台未选 ≥2 商品」时才判定为普通问答、跳过 LLM。
 */
function chatCardResolutionMightBeNeeded(params: {
  lastUserText: string;
  assistantReply: string;
}): boolean {
  if (assistantClaimsChatCard(params.assistantReply ?? "")) return true;
  const intentText = extractUserIntentText(params.lastUserText);
  if (skillNamesFromUserText(intentText).some((name) => CARD_RELEVANT_SKILL_NAMES.has(name))) {
    return true;
  }
  if (parseWorkspaceProductsFromText(params.lastUserText).length >= 2) return true;
  return false;
}

function resolutionFromTaskProposal(
  proposal: TaskProposalPayload,
  emittedFlags: Set<string>,
): LlmChatCardResolution {
  const uiPayloads = { taskProposal: proposal };
  return {
    uiPayloads,
    streamChunks: streamChunksForUiPayloads(uiPayloads, emittedFlags),
  };
}

/**
 * 文案声称开卡但工具未下发时的一致性兜底：
 * 1) 按用户意图确定性补 TaskProposal（批量上下架等）；
 * 2) 再走原有 LLM 补卡（图片生成等旧卡类型）；
 * 3) 仍无卡则改掉误导开卡话术，禁止「说了有卡却没有」。
 */
export async function resolveMissingChatCardsWithLlm(params: {
  messages: BaseMessage[];
  lastUserText: string;
  assistantReply: string;
  existingUiPayloads: Record<string, unknown>;
  emittedFlags?: Set<string>;
  shop?: string;
  skillFocus?: string | null;
  admin?: ShopifyAdminGraphqlClient;
  signal?: AbortSignal;
}): Promise<LlmChatCardResolution> {
  const emittedFlags = params.emittedFlags ?? new Set<string>();

  if (hasAnyChatCardInUiPayloads(params.existingUiPayloads) || hasEmittedChatCardFlag(emittedFlags)) {
    return { uiPayloads: {}, streamChunks: [] };
  }

  const claimed = assistantClaimsChatCard(params.assistantReply);
  const intentText = extractUserIntentText(params.lastUserText);
  const skillNames = skillNamesFromUserText(intentText);
  const focusNames = skillNamesFromFocus(params.skillFocus);
  const focusSkillNames = focusNames === "all" ? [] : (focusNames ?? []);

  // 点了批量编辑推荐按钮：本轮必须出卡，不依赖模型是否声称已开卡。
  if (isBulkEditRecommendKey(params.skillFocus) && focusSkillNames.length > 0) {
    const proposal = tryDeterministicTaskProposalFromSkills(
      focusSkillNames,
      params.lastUserText,
    );
    if (proposal) {
      const enriched = await enrichDeterministicBulkProposal(proposal, params.admin);
      return resolutionFromTaskProposal(enriched, emittedFlags);
    }
  }

  // 硬保证：声称开卡时，能识别出批量 TaskProposal Skill 就直接补卡，不依赖二次 LLM。
  if (claimed) {
    const proposal = tryDeterministicTaskProposalFromSkills(skillNames, params.lastUserText);
    if (proposal) {
      const enriched = await enrichDeterministicBulkProposal(proposal, params.admin);
      return resolutionFromTaskProposal(enriched, emittedFlags);
    }
  }

  // 前置门：普通问答（无开卡话术、无卡片类意图、无多选商品）直接跳过二次 LLM，
  // 避免每轮结束都多打一次结构化模型调用，缩短尾延迟与 token 成本。
  if (
    !chatCardResolutionMightBeNeeded({
      lastUserText: params.lastUserText,
      assistantReply: params.assistantReply,
    })
  ) {
    return { uiPayloads: {}, streamChunks: [] };
  }

  const intent = await resolveChatCardIntentWithLlm({
    lastUserText: params.lastUserText,
    assistantReply: params.assistantReply,
    toolsCalled: extractToolsCalledFromMessages(params.messages),
    shop: params.shop,
    signal: params.signal,
  });

  const llmPayloads = buildChatCardPayloadFromIntent(intent, params.lastUserText);
  if (Object.keys(llmPayloads).length > 0) {
    return {
      uiPayloads: llmPayloads,
      streamChunks: streamChunksForUiPayloads(llmPayloads, emittedFlags),
    };
  }

  // LLM 也补不出时：若文案仍声称开卡，剥掉误导句，保证文案与 UI 一致。
  if (claimed || intent.assistantClaimsCardOpened) {
    return {
      uiPayloads: {},
      streamChunks: [],
      adjustedReply: reconcileReplyWithChatCards(
        params.assistantReply,
        params.existingUiPayloads,
      ),
    };
  }

  return { uiPayloads: {}, streamChunks: [] };
}

export async function resolveChatCardIntentWithLlm(params: {
  lastUserText: string;
  assistantReply: string;
  toolsCalled: string[];
  shop?: string;
  signal?: AbortSignal;
}): Promise<ChatCardIntent> {
  const userIntent = extractUserIntentText(params.lastUserText);
  const model = getShopChatModel().withStructuredOutput(ChatCardIntentSchema, {
    name: "chat_card_intent",
    includeRaw: true,
  });

  const result = await model.invoke(
    [
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
    ],
    params.signal ? { signal: params.signal } : undefined,
  );

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
