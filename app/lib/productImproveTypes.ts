/** POST `/api/product-improve` 与 `/app/product-improve` action 响应（与 `generateDescriptionHttp.server` 对齐）。 */
export type GenerateDescriptionApiSuccessBody = {
  success: true;
  errorCode: number;
  errorMsg: string;
  response: {
    /** 商品在 Shopify 中的 title（来自 Admin GraphQL，非模型生成）。 */
    title: string;
    description: string;
  };
};

export type GenerateDescriptionApiErrorBody = {
  success: false;
  errorCode: number;
  errorMsg: string;
  response: null;
};

export type GenerateDescriptionApiResponse =
  | GenerateDescriptionApiSuccessBody
  | GenerateDescriptionApiErrorBody;
