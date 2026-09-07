/**
 * 已选商品导出读取：Shopify CSV 所需字段。TikTok 格式复用 ads catalog fetcher。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { ProductExportShopifyProduct } from "../../lib/productExport";
import { fetchProductConnectionByIds } from "./productIdQuery.server";

const QUERY = `#graphql
  query ProductExportProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          tags
          status
          publishedAt
          seo { title description }
          featuredImage { url }
          variants(first: 100) {
            edges {
              node {
                sku
                barcode
                price
                compareAtPrice
                selectedOptions { name value }
              }
            }
          }
        }
      }
    }
  }
`;

type VariantNode = {
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
};

type ProductNode = {
  id?: string | null;
  title?: string | null;
  handle?: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  status?: string | null;
  publishedAt?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
  featuredImage?: { url?: string | null } | null;
  variants?: { edges?: Array<{ node: VariantNode }> };
};

function mapNode(node: ProductNode): ProductExportShopifyProduct | null {
  if (!node.id) return null;
  const options = node.variants?.edges?.[0]?.node.selectedOptions ?? [];
  return {
    handle: node.handle?.trim() ?? "",
    title: node.title?.trim() ?? "",
    bodyHtml: node.descriptionHtml ?? "",
    vendor: node.vendor?.trim() ?? "",
    productType: node.productType?.trim() ?? "",
    tags: (node.tags ?? []).join(", "),
    published: Boolean(node.publishedAt),
    status: node.status?.trim() ?? "",
    seoTitle: node.seo?.title?.trim() ?? "",
    seoDescription: node.seo?.description?.trim() ?? "",
    imageSrc: node.featuredImage?.url?.trim() ?? "",
    variants: (node.variants?.edges ?? []).map((edge) => {
      const selected = edge.node.selectedOptions ?? [];
      return {
        sku: edge.node.sku?.trim() ?? "",
        barcode: edge.node.barcode?.trim() ?? "",
        price: edge.node.price ?? "",
        compareAtPrice: edge.node.compareAtPrice ?? "",
        option1Name: options[0]?.name ?? selected[0]?.name ?? "",
        option1Value: selected[0]?.value ?? "",
        option2Name: options[1]?.name ?? selected[1]?.name ?? "",
        option2Value: selected[1]?.value ?? "",
        option3Name: options[2]?.name ?? selected[2]?.name ?? "",
        option3Value: selected[2]?.value ?? "",
      };
    }),
  };
}

export async function fetchProductsForShopifyCsvExport(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { maxProducts: number },
): Promise<{ products: ProductExportShopifyProduct[]; truncated: boolean }> {
  const { items, truncated } = await fetchProductConnectionByIds(admin, productIds, {
    query: QUERY,
    maxProducts: options.maxProducts,
    mapNode,
  });
  return { products: items, truncated };
}
