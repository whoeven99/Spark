import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { toProductGid } from "../../../productImprove/productContextFetcher.server";
import { invokeDescriptionModels } from "../../../productImprove/descriptionAiClient.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";
import { DEFAULT_DESCRIPTION_TEMPERATURE } from "../../../productImprove/constants.server";
import type { ShopifyAdminGraphqlClient } from "../shopifyInfo/tool";
import type {
  ProductQualityScoreOutcome,
  ProductQualityScoreData,
} from "../../../../lib/productQualityScoreTypes";

export const SCORE_PRODUCT_QUALITY_TOOL_NAME = "score_product_quality";

const LOG_PREFIX = "[ScoreProductQuality]";

const PRODUCT_QUALITY_QUERY = `#graphql
  query ProductQualityScore($id: ID!) {
    product(id: $id) {
      id
      title
      vendor
      productType
      tags
      descriptionHtml
      images(first: 20) {
        nodes { id }
      }
      variants(first: 50) {
        nodes {
          id
          title
          sku
          price
          availableForSale
        }
      }
    }
  }
`;

type VariantNode = {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  availableForSale: boolean;
};

type GqlResponse = {
  data?: {
    product?: {
      id?: string;
      title?: string | null;
      vendor?: string | null;
      productType?: string | null;
      tags?: string[];
      descriptionHtml?: string | null;
      images?: { nodes: Array<{ id: string }> };
      variants?: { nodes: VariantNode[] };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

type ProductQualityData = {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  imageCount: number;
  descriptionText: string;
  variants: Array<{ title: string; hasSku: boolean; price: string; availableForSale: boolean }>;
};

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchProductQualityData(
  admin: ShopifyAdminGraphqlClient,
  productId: string,
): Promise<ProductQualityData | null> {
  const id = toProductGid(productId);
  const response = await admin.graphql(PRODUCT_QUALITY_QUERY, { variables: { id } });
  const payload = (await response.json()) as GqlResponse;

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((e) => e.message).join("; ") ?? `HTTP ${response.status}`,
    );
  }

  const p = payload.data?.product;
  if (!p?.id) return null;

  return {
    id: p.id,
    title: (p.title ?? "").trim(),
    vendor: (p.vendor ?? "").trim(),
    productType: (p.productType ?? "").trim(),
    tags: p.tags ?? [],
    imageCount: p.images?.nodes.length ?? 0,
    descriptionText: htmlToText(p.descriptionHtml ?? ""),
    variants: (p.variants?.nodes ?? []).map((v) => ({
      title: v.title,
      hasSku: !!(v.sku?.trim()),
      price: v.price,
      availableForSale: v.availableForSale,
    })),
  };
}

const SCORING_SYSTEM_PROMPT = `你是专业电商商品质量评审专家。根据商品信息对页面质量进行评分并给出具体改进建议。

评分维度（每项 0-10 分）：
1. 标题质量：核心关键词是否清晰、长度是否适中（25-70字符）、是否包含品牌/规格/卖点
2. 主图数量：≥5张=10分，≥3张=7分，≥1张=4分，0张=0分
3. 描述完整度：是否有实质内容、包含卖点/场景/规格，内容是否详细（200字以上为佳）
4. Variant结构：变体是否有SKU、价格是否合理、默认变体名称是否已自定义
5. 标签与分类：productType 和 tags 是否存在且具有描述性

综合分（满分100）= (标题×25 + 图片×25 + 描述×30 + Variant×10 + 标签×10) / 10

仅输出以下格式的 JSON，不包含任何其他内容：
{"score":<0-100>,"dimensions":{"title":{"score":<0-10>,"suggestion":"<改进建议>"},"images":{"score":<0-10>,"suggestion":"<改进建议>"},"description":{"score":<0-10>,"suggestion":"<改进建议>"},"variants":{"score":<0-10>,"suggestion":"<改进建议>"},"tags":{"score":<0-10>,"suggestion":"<改进建议>"}},"overallSuggestions":["<综合改进建议1>","<综合改进建议2>"]}`;

function buildScoringUserPrompt(data: ProductQualityData): string {
  const variantLines = data.variants
    .map(
      (v) =>
        `- 名称: ${v.title}, SKU: ${v.hasSku ? "已设置" : "未设置"}, 价格: ${v.price}, 可售: ${v.availableForSale}`,
    )
    .join("\n");

  return `商品信息如下：

标题: ${data.title || "(未设置)"}
品牌/供应商: ${data.vendor || "(未设置)"}
商品类型: ${data.productType || "(未设置)"}
标签: ${data.tags.length > 0 ? data.tags.join(", ") : "(未设置)"}
主图数量: ${data.imageCount}
描述（纯文本，最多1000字）: ${data.descriptionText ? data.descriptionText.slice(0, 1000) : "(无)"}
变体列表（共${data.variants.length}个）:
${variantLines || "(无变体)"}`;
}

/**
 * Core scoring service — shared by the agent tool and the HTTP API route.
 */
export async function runProductQualityScore(params: {
  admin: ShopifyAdminGraphqlClient;
  productId: string;
  requestId: string;
}): Promise<ProductQualityScoreOutcome> {
  const { admin, productId, requestId } = params;
  try {
    const data = await fetchProductQualityData(admin, productId.trim());
    if (!data) {
      return { ok: false, errorCode: "PRODUCT_NOT_FOUND", errorMsg: "未找到该商品" };
    }

    const userPrompt = buildScoringUserPrompt(data);
    const { rawText } = await invokeDescriptionModels(
      SCORING_SYSTEM_PROMPT,
      userPrompt,
      DEFAULT_DESCRIPTION_TEMPERATURE,
      requestId,
    );

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.info(`${LOG_PREFIX} requestId=${requestId} LLM returned no JSON`);
      return { ok: false, errorCode: "PARSE_ERROR", errorMsg: "模型返回格式异常" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as ProductQualityScoreData;
    console.info(`${LOG_PREFIX} done requestId=${requestId} score=${String(parsed.score)}`);
    return { ok: true, productId: data.id, title: data.title, ...parsed };
  } catch (e) {
    logDetailedError(LOG_PREFIX, `requestId=${requestId} failed`, e);
    return { ok: false, errorCode: "INTERNAL_ERROR", errorMsg: String(e) };
  }
}

export function createScoreProductQualityTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: SCORE_PRODUCT_QUALITY_TOOL_NAME,
    description:
      "对 Shopify 商品页面质量进行评分，覆盖标题、主图、描述、Variant、标签五个维度，并返回各维度评分与改进建议。当用户想了解商品页质量、要求评分或诊断商品页时使用。",
    schema: z.object({
      productId: z
        .string()
        .min(1)
        .describe("Shopify 商品 ID，可为纯数字或 gid://shopify/Product/… 完整 GID"),
    }),
    func: async ({ productId }) => {
      const requestId = crypto.randomUUID();
      console.info(`${LOG_PREFIX} start requestId=${requestId} productId=${productId}`);
      const result = await runProductQualityScore({ admin, productId, requestId });
      return JSON.stringify(result);
    },
  });
}

export const scoreProductQualityToolDefinition: ToolDefinition = {
  name: "productQualityScore",
  description: "评估商品页面质量（标题/图片/描述/Variant/标签）并给出改进建议",
  systemPromptExtension:
    "当用户想要评估、诊断或了解某个商品的页面质量，或要求对商品页内容进行评分时，调用工具 score_product_quality，传入 productId。工具返回各维度评分（0-10分）与改进建议；请用简洁中文向用户说明评分结果，重点突出低分项与改进优先级。若用户未提供商品 ID，先请其提供。",
  createTool: (context) => createScoreProductQualityTool(context),
};
