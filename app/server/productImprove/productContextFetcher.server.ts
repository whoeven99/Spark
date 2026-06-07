import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { logDetailedError } from "./generateDescriptionLog.server";

const LOG_PREFIX = "[ProductContextFetcher]";

export type ProductDescriptionContext = {
  id: string;
  title: string;
  /** 由 descriptionHtml 去标签后的纯文本，供 Prompt 注入。 */
  text: string;
};

const PRODUCT_FOR_DESCRIPTION_QUERY = `#graphql
  query ProductForDescription($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
    }
  }
`;

type ProductQueryResponse = {
  data?: {
    product?: {
      id?: string;
      title?: string | null;
      descriptionHtml?: string | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

/** 与写回商品等 mutation 共用，避免各处 ID 格式不一致。 */
export function toProductGid(productId: string): string {
  const trimmed = productId.trim();
  if (trimmed.startsWith("gid://")) return trimmed;
  return `gid://shopify/Product/${trimmed}`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 按 productId 精准查询单个商品（Admin GraphQL），只取文案生成所需字段。
 */
export async function fetchProductDescriptionContext(
  admin: ShopifyAdminGraphqlClient,
  productId: string,
): Promise<ProductDescriptionContext | null> {
  const fetchStart = Date.now();
  console.info(`${LOG_PREFIX} fetchProductDescriptionContext start`);
  console.info(`${LOG_PREFIX} input params: productId=${productId}`);

  const id = toProductGid(productId);
  console.info(`${LOG_PREFIX} key vars: resolvedGid=${id}`);

  try {
    console.info(`${LOG_PREFIX} step: 开始 Shopify Admin GraphQL 查询商品`);
    console.info(`${LOG_PREFIX} before await admin.graphql(ProductForDescription)`);
    const response = await admin.graphql(PRODUCT_FOR_DESCRIPTION_QUERY, {
      variables: { id },
    });
    console.info(
      `${LOG_PREFIX} after await admin.graphql httpStatus=${response.status} ok=${response.ok}`,
    );

    console.info(`${LOG_PREFIX} before await response.json()`);
    const payload = (await response.json()) as ProductQueryResponse;
    console.info(`${LOG_PREFIX} after await response.json()`);

    if (!response.ok) {
      const err = new Error(`Shopify HTTP ${response.status}`);
      logDetailedError(LOG_PREFIX, "Shopify GraphQL HTTP 非成功", err);
      throw err;
    }
    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) {
      console.info(`${LOG_PREFIX} GraphQL errors: ${gqlErrors.join("；")}`);
      throw new Error(gqlErrors.join("；"));
    }
    const product = payload.data?.product;
    if (!product?.id) {
      console.info(
        `${LOG_PREFIX} step: GraphQL 返回无商品 product=null or missing id`,
      );
      console.info(
        `${LOG_PREFIX} fetchProductDescriptionContext total cost: ${Date.now() - fetchStart} ms (null)`,
      );
      return null;
    }
    const title = (product.title ?? "").trim() || "未命名商品";
    const html = product.descriptionHtml ?? "";
    const text = htmlToPlainText(html);
    const ctx: ProductDescriptionContext = {
      id: product.id,
      title,
      text: text || "（无原始描述）",
    };
    console.info(
      `${LOG_PREFIX} step: Shopify 商品查询完成 id=${ctx.id} titleLen=${ctx.title.length} textLen=${ctx.text.length}`,
    );
    console.info(
      `${LOG_PREFIX} fetchProductDescriptionContext total cost: ${Date.now() - fetchStart} ms`,
    );
    return ctx;
  } catch (e) {
    logDetailedError(LOG_PREFIX, "fetchProductDescriptionContext failed", e);
    console.info(
      `${LOG_PREFIX} fetchProductDescriptionContext total cost: ${Date.now() - fetchStart} ms (error)`,
    );
    throw e;
  }
}
