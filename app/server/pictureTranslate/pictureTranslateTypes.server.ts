/** POST /api/picture-translate 响应：成功与失败字段形状分离（discriminated union）。 */

export type PictureTranslateSuccess = {
  success: true;
  imageUrl: string;
};

export type PictureTranslateError = {
  success: false;
  errorCode: number;
  errorMsg: string;
};

export type PictureTranslateResponse =
  | PictureTranslateSuccess
  | PictureTranslateError;
