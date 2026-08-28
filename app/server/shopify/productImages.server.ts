/**
 * 按商品 ID 拉取图片列表（供 TaskProposal 图片翻译选图）。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { toProductGid } from "../productImprove/productContextFetcher.server";

const PRODUCT_IMAGES_QUERY = `#graphql
  query ProductImagesForTranslate($id: ID!) {
    product(id: $id) {
      id
      title
      featuredImage {
        url
      }
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

type ProductImagesQueryResponse = {
  data?: {
    product?: {
      id?: string;
      title?: string | null;
      featuredImage?: { url?: string | null } | null;
      images?: {
        edges?: Array<{
          node?: { url?: string | null; altText?: string | null };
        }>;
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export type ProductImageItem = {
  url: string;
  altText: string | null;
};

export type ProductImagesResult = {
  id: string;
  title: string;
  featuredImageUrl: string | null;
  images: ProductImageItem[];
};

export async function fetchProductImages(
  admin: ShopifyAdminGraphqlClient,
  productId: string,
): Promise<ProductImagesResult | null> {
  const id = toProductGid(productId);
  const response = await admin.graphql(PRODUCT_IMAGES_QUERY, { variables: { id } });
  const payload = (await response.json()) as ProductImagesQueryResponse;

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((e) => e.message).join("; ") ?? `HTTP ${response.status}`,
    );
  }

  const product = payload.data?.product;
  if (!product?.id) return null;

  const images = (product.images?.edges ?? [])
    .map((edge) => {
      const url = edge?.node?.url?.trim();
      if (!url) return null;
      return { url, altText: edge?.node?.altText?.trim() || null };
    })
    .filter((img): img is ProductImageItem => img !== null);

  return {
    id: product.id,
    title: (product.title ?? "").trim() || "未命名商品",
    featuredImageUrl: product.featuredImage?.url?.trim() || images[0]?.url || null,
    images,
  };
}
