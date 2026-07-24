import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { toProductGid } from "../../../productImprove/productContextFetcher.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";
import type { ShopifyAdminGraphqlClient } from "../shopifyInfo/shopifyInfo.tool";

export const GET_PRODUCT_DETAIL_TOOL_NAME = "get_product_detail";
const LOG_PREFIX = "[GetProductDetail]";

const PRODUCT_DETAIL_QUERY = `#graphql
  query ProductDetail($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      images(first: 20) {
        edges {
          node {
            url
            altText
          }
        }
      }
    }
  }
`;

type ProductDetailQueryResponse = {
  data?: {
    product?: {
      id?: string;
      title?: string | null;
      descriptionHtml?: string | null;
      images?: {
        edges?: Array<{
          node?: { url?: string | null; altText?: string | null };
        }>;
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchProductDetail(admin: ShopifyAdminGraphqlClient, productId: string) {
  const id = toProductGid(productId);
  const response = await admin.graphql(PRODUCT_DETAIL_QUERY, { variables: { id } });
  const payload = (await response.json()) as ProductDetailQueryResponse;

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((e) => e.message).join("; ") ?? `HTTP ${response.status}`,
    );
  }

  const p = payload.data?.product;
  if (!p?.id) return null;

  const images = (p.images?.edges ?? [])
    .map((edge) => {
      const url = edge?.node?.url?.trim();
      if (!url) return null;
      return { url, altText: edge?.node?.altText?.trim() || null };
    })
    .filter((img): img is { url: string; altText: string | null } => img !== null);

  return {
    id: p.id,
    title: (p.title ?? "").trim() || "未命名商品",
    text: htmlToPlainText(p.descriptionHtml ?? "") || "（无描述）",
    images,
  };
}

function createGetProductDetailTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: GET_PRODUCT_DETAIL_TOOL_NAME,
    description:
      "查询指定 Shopify 商品的当前标题、文案（纯文本）与图片列表。在生成或优化文案前、或需要了解商品现状时使用。若不知道商品 ID，请先调用 search_products。",
    schema: z.object({
      productId: z
        .string()
        .min(1)
        .describe("Shopify 商品 ID，可为纯数字或 gid://shopify/Product/… 完整 GID"),
    }),
    func: async ({ productId }) => {
      const requestId = crypto.randomUUID();
      console.info(`${LOG_PREFIX} start requestId=${requestId} productId=${productId}`);
      try {
        const detail = await fetchProductDetail(admin, productId);
        if (!detail) {
          return JSON.stringify({ ok: false, errorMsg: "未找到该商品" });
        }
        console.info(
          `${LOG_PREFIX} done requestId=${requestId} imageCount=${detail.images.length} textLen=${detail.text.length}`,
        );
        return JSON.stringify({ ok: true, ...detail });
      } catch (e) {
        logDetailedError(LOG_PREFIX, `requestId=${requestId} failed`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}

export const getProductDetailToolDefinition: ToolDefinition = {
  name: "getProductDetail",
  displayName: "查询商品详情",
  category: "商品目录",
  stage: "monitor",
  description: "按商品 ID 查询当前标题、文案（纯文本）与图片列表",
  systemPromptExtension:
    "当需要了解某商品的当前标题、描述或图片时，调用工具 get_product_detail 传入 productId。若用户未提供商品 ID，先用 search_products 查找。返回的 text 字段为现有文案纯文本，images 为图片 URL 列表。",
  createTool: (context) => createGetProductDetailTool(context),
};
