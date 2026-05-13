/** POST `/api/generate-description` 与 `/app/generate-description` action 响应（与 `generateDescriptionHttp.server` 对齐）。 */
export type GenerateDescriptionApiSuccessBody = {
  success: true;
  errorCode: number;
  errorMsg: string;
  response: {
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
