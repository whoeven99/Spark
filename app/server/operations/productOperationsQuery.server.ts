/**
 * 商品运营诊断查询层（§7.9 商品运营诊断）。
 *
 * 从 Shopify GraphQL API 实时查询 DRAFT 商品、缺图、缺描述等状态。
 */

/**
 * 可注入的 Shopify GraphQL 客户端签名（与 shopifyInfo.tool.ts 兼容）。
 */
export type ShopifyAdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type ProductOperationsData = {
  /** DRAFT（草稿）商品数 */
  draftProductCount: number;
  /** DRAFT 商品列表（样本） */
  draftProducts: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  /** 无图片商品数 */
  noImagesProductCount: number;
  /** 缺描述商品数（description 为空或全是空格） */
  noDescriptionProductCount: number;
  /** 样本汇总 */
  samples: {
    draftSample: Array<{ title: string }>;
    noImagesSample: Array<{ title: string }>;
    noDescriptionSample: Array<{ title: string }>;
  };
};

const PRODUCTS_OPERATIONS_QUERY = `#graphql
  query ProductsOperations($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        status
        images(first: 1) {
          nodes {
            id
          }
        }
        description
      }
    }
  }
`;

/**
 * 查询商品运营状态。**纯函数**拆离，便于单测。
 */
export function parseProductOperationsRows(
  draft: Array<{ title: string }>,
  noImages: Array<{ title: string }>,
  noDescription: Array<{ title: string }>,
): ProductOperationsData {
  return {
    draftProductCount: draft.length,
    draftProducts: draft.map((p, i) => ({
      id: `draft-${i}`,
      title: p.title,
      status: "DRAFT",
    })),
    noImagesProductCount: noImages.length,
    noDescriptionProductCount: noDescription.length,
    samples: {
      draftSample: draft.slice(0, 5),
      noImagesSample: noImages.slice(0, 3),
      noDescriptionSample: noDescription.slice(0, 3),
    },
  };
}

/**
 * 查询单次请求的商品运营数据。配置缺失 / 查询异常 → 返回 null（静默降级）。
 */
export async function queryProductOperations(
  client: ShopifyAdminGraphqlClient,
): Promise<ProductOperationsData | null> {
  try {
    const draftProducts: Array<{ title: string }> = [];
    const noImagesProducts: Array<{ title: string }> = [];
    const noDescriptionProducts: Array<{ title: string }> = [];

    let after: string | undefined;
    let iterCount = 0;
    const maxIterations = 5; // 最多查 5 页（即 250 个商品）

    while (iterCount < maxIterations) {
      // 第一轮查 DRAFT，第二轮查其他条件
      const query = iterCount === 0 ? `status:DRAFT` : `status:ACTIVE`;
      const response = await client.graphql(PRODUCTS_OPERATIONS_QUERY, {
        variables: { first: 50, after, query },
      });

      if (!response.ok) {
        console.warn(`[productOps] GraphQL query failed (status=${response.status})`);
        break;
      }

      type ProductNode = {
        title: string;
        status: string;
        images: { nodes: Array<{ id: string }> };
        description: string | null;
      };

      const payload = (await response.json()) as {
        data?: { products?: { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } } };
        errors?: Array<{ message: string }>;
      };

      if (payload.errors?.length) {
        console.warn(`[productOps] GraphQL errors:`, payload.errors);
        break;
      }

      const products = payload.data?.products?.nodes ?? [];
      for (const p of products) {
        if (p.status === "DRAFT") {
          draftProducts.push({ title: p.title });
        } else {
          // ACTIVE 商品：检查图片和描述
          if (!p.images?.nodes?.length) {
            noImagesProducts.push({ title: p.title });
          }
          if (!p.description || p.description.trim().length === 0) {
            noDescriptionProducts.push({ title: p.title });
          }
        }
      }

      const hasNextPage = payload.data?.products?.pageInfo?.hasNextPage;
      const endCursor = payload.data?.products?.pageInfo?.endCursor;
      if (!hasNextPage || !endCursor) break;
      after = endCursor;
      iterCount += 1;
    }

    return parseProductOperationsRows(draftProducts, noImagesProducts, noDescriptionProducts);
  } catch (err) {
    console.warn(`[productOps] query failed:`, err);
    return null;
  }
}

/**
 * 默认加载器：查询商品运营状态。
 */
export const loadProductOperations = async (
  client: ShopifyAdminGraphqlClient | null,
): Promise<ProductOperationsData | null> => {
  if (!client) return null;
  return queryProductOperations(client);
};
