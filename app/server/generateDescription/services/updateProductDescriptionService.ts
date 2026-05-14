import type { ShopifyAdminGraphqlClient } from "../../ai/tool/shopifyShopInfoTool";
import { logDetailedError } from "../generateDescriptionLog.server";
import { plainDescriptionTextToDescriptionHtml } from "../plainDescriptionTextToHtml.server";
import { toProductGid } from "../productContextFetcher.server";

const LOG = "[UpdateProductDescription][Service]";

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation ProductUpdateForDescription($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type UserError = { field?: string[] | null; message?: string | null };

type ProductUpdateMutationResponse = {
  data?: {
    productUpdate?: {
      product?: { id?: string | null; title?: string | null } | null;
      userErrors?: UserError[];
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export type UpdateProductDescriptionOkPayload = {
  id: string;
  title: string;
};

export type UpdateProductDescriptionServiceResult =
  | { ok: true; data: UpdateProductDescriptionOkPayload }
  | { ok: false; errorCode: number; errorMsg: string };

export const UPDATE_PRODUCT_DESCRIPTION_ERROR = {
  SHOPIFY_TOP_LEVEL: 50201,
  SHOPIFY_USER_ERRORS: 42202,
  EMPTY_DESCRIPTION_HTML: 40002,
} as const;

function formatUserErrors(errors: UserError[]): string {
  return errors
    .map((e) => {
      const field = e.field?.filter(Boolean).join(".") ?? "";
      const msg = (e.message ?? "").trim();
      if (field && msg) return `${field}: ${msg}`;
      return msg || field || "未知错误";
    })
    .join("；");
}

/**
 * 将编辑后的标题与纯文本描述写回 Shopify（description 经转义后写入 descriptionHtml）。
 */
export async function updateProductTitleAndDescriptionHtml(params: {
  admin: ShopifyAdminGraphqlClient;
  productId: string;
  title: string;
  descriptionPlain: string;
  requestId: string;
}): Promise<UpdateProductDescriptionServiceResult> {
  const { admin, productId, title, descriptionPlain, requestId } = params;
  const gid = toProductGid(productId);
  const descriptionHtml = plainDescriptionTextToDescriptionHtml(descriptionPlain);
  if (!descriptionHtml) {
    console.info(
      `${LOG} requestId=${requestId} reject empty descriptionHtml after trim`,
    );
    return {
      ok: false,
      errorCode: UPDATE_PRODUCT_DESCRIPTION_ERROR.EMPTY_DESCRIPTION_HTML,
      errorMsg: "描述不能为空",
    };
  }

  console.info(
    `${LOG} requestId=${requestId} mutation start gid=${gid} titleLen=${title.length} descPlainLen=${descriptionPlain.length}`,
  );

  try {
    const response = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
      variables: {
        input: {
          id: gid,
          title: title.trim(),
          descriptionHtml,
        },
      },
    });

    const payload = (await response.json()) as ProductUpdateMutationResponse;

    if (!response.ok) {
      const msg = `Shopify HTTP ${response.status}`;
      console.info(`${LOG} requestId=${requestId} ${msg}`);
      return {
        ok: false,
        errorCode: UPDATE_PRODUCT_DESCRIPTION_ERROR.SHOPIFY_TOP_LEVEL,
        errorMsg: msg,
      };
    }

    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) {
      const joined = gqlErrors.join("；");
      console.info(`${LOG} requestId=${requestId} GraphQL errors: ${joined}`);
      return {
        ok: false,
        errorCode: UPDATE_PRODUCT_DESCRIPTION_ERROR.SHOPIFY_TOP_LEVEL,
        errorMsg: joined,
      };
    }

    const userErrors = payload.data?.productUpdate?.userErrors ?? [];
    const relevant = userErrors.filter((e) => (e.message ?? "").trim().length > 0);
    if (relevant.length > 0) {
      const msg = formatUserErrors(relevant);
      console.info(`${LOG} requestId=${requestId} userErrors: ${msg}`);
      return {
        ok: false,
        errorCode: UPDATE_PRODUCT_DESCRIPTION_ERROR.SHOPIFY_USER_ERRORS,
        errorMsg: msg,
      };
    }

    const product = payload.data?.productUpdate?.product;
    const id = product?.id?.trim();
    const outTitle = (product?.title ?? "").trim();
    if (!id) {
      return {
        ok: false,
        errorCode: UPDATE_PRODUCT_DESCRIPTION_ERROR.SHOPIFY_TOP_LEVEL,
        errorMsg: "Shopify 未返回商品数据",
      };
    }

    console.info(
      `${LOG} requestId=${requestId} ok id=${id} titleLen=${outTitle.length}`,
    );
    return {
      ok: true,
      data: { id, title: outTitle || title.trim() },
    };
  } catch (e) {
    logDetailedError(`${LOG} requestId=${requestId}`, "productUpdate failed", e);
    return {
      ok: false,
      errorCode: UPDATE_PRODUCT_DESCRIPTION_ERROR.SHOPIFY_TOP_LEVEL,
      errorMsg: e instanceof Error ? e.message : "Shopify 请求失败",
    };
  }
}
