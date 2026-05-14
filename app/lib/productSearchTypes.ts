/** GET `/api/product-search` 响应（与生成描述等 API 的 success / errorMsg 契约一致）。 */

export type ProductSearchItem = {
  /** Admin GraphQL `Product.id`，一般为 `gid://shopify/Product/…`，可直接作为生成描述接口的 `productId`。 */
  id: string;
  title: string;
  featuredImageUrl: string | null;
};

export type ProductSearchApiSuccessBody = {
  success: true;
  errorCode: number;
  errorMsg: string;
  response: {
    products: ProductSearchItem[];
  };
};

export type ProductSearchApiErrorBody = {
  success: false;
  errorCode: number;
  errorMsg: string;
  response: null;
};

export type ProductSearchApiResponse =
  | ProductSearchApiSuccessBody
  | ProductSearchApiErrorBody;

/** 与 `ProductSearchItem` 一致，用于选择器受控值命名语义。 */
export type ProductSelectorSelection = ProductSearchItem;
