/**
 * 站内 SEO 体检的读侧。
 *
 * 和 `productSeoReader.server.ts` 刻意分开：那个是「批量改 SEO」的读侧，
 * 只取模板占位符需要的几个轻字段，一次要读 200 个商品做渲染，必须保持轻量。
 * 体检要的字段更多（handle、正文、上架状态），塞进去会白白拖慢批量改写。
 *
 * scope 只用 `read_products`。正文用 `description(truncateAt:)` 取纯文本并在
 * 服务端截断——体检只需要判断「够不够长」，不需要把整篇正文拉回来。
 * 图片 alt 的检查这一期不做：`featuredMedia` 会额外要求 `read_files` /
 * `read_images`，加 scope 会让所有已安装店铺弹一次重新授权，不值得。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { SeoAuditProductInput } from "../../lib/seoAudit";

/** 超过这个长度就不必再关心具体多长了，正文肯定不算过薄。 */
const DESCRIPTION_TRUNCATE_AT = 400;

const PAGE_SIZE = 100;

const SEO_AUDIT_QUERY = `#graphql
  query SeoAuditProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        publishedAt
        description(truncateAt: ${DESCRIPTION_TRUNCATE_AT})
        seo { title description }
      }
    }
  }
`;

type ProductNode = {
  id: string;
  title?: string | null;
  handle?: string | null;
  publishedAt?: string | null;
  description?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

/**
 * 翻页响应显式命名：游标既是入参又来自出参，
 * 靠推断会形成自引用（TS7022），必须给具名类型断开。
 */
type SeoAuditQueryData = {
  products?: { pageInfo: PageInfo; nodes: ProductNode[] };
};

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function mapNode(node: ProductNode): SeoAuditProductInput | null {
  const productId = node.id?.trim();
  if (!productId) return null;
  return {
    productId,
    productTitle: node.title?.trim() || productId,
    handle: node.handle?.trim() ?? "",
    publishedAt: emptyToNull(node.publishedAt),
    descriptionText: node.description ?? "",
    seoTitle: emptyToNull(node.seo?.title),
    seoDescription: emptyToNull(node.seo?.description),
  };
}

/**
 * 扫店内商品的 SEO 现状。
 *
 * 重复标题/描述的判定要覆盖尽量多的商品才有意义（只看 20 个商品得不出
 * 「整店有 37 个商品共用同一个标题」这种结论），所以这里是分页全扫，
 * 撞到 maxProducts 才停并置 truncated。
 */
export async function fetchProductsForSeoAudit(
  admin: ShopifyAdminGraphqlClient,
  options: { maxProducts: number; query?: string },
): Promise<{ products: SeoAuditProductInput[]; truncated: boolean }> {
  const collected: SeoAuditProductInput[] = [];
  let after: string | null = null;
  let truncated = false;

  for (;;) {
    const response = await admin.graphql(SEO_AUDIT_QUERY, {
      variables: {
        first: Math.min(PAGE_SIZE, options.maxProducts),
        after,
        query: options.query?.trim() || null,
      },
    });
    if (!response.ok) {
      throw new Error(`Shopify products query failed: HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      data?: SeoAuditQueryData;
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(
        `Shopify products GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }

    const connection: SeoAuditQueryData["products"] = json.data?.products;
    if (!connection) break;

    for (const node of connection.nodes) {
      if (collected.length >= options.maxProducts) {
        truncated = true;
        break;
      }
      const mapped = mapNode(node);
      if (mapped) collected.push(mapped);
    }

    if (truncated) break;
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return { products: collected, truncated };
}
