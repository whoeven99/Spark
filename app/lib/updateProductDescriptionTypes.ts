/** POST `/api/update-product-description` 响应（与 `updateProductDescriptionHttp.server` 对齐）。 */
export type UpdateProductDescriptionApiSuccessBody = {
  success: true;
  errorCode: number;
  errorMsg: string;
  response: {
    id: string;
    title: string;
  };
};

export type UpdateProductDescriptionApiErrorBody = {
  success: false;
  errorCode: number;
  errorMsg: string;
  response: null;
};

export type UpdateProductDescriptionApiResponse =
  | UpdateProductDescriptionApiSuccessBody
  | UpdateProductDescriptionApiErrorBody;
