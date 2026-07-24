export const PICTURE_TRANSLATE_TOOL_NAME = "picture_translate";

export const PICTURE_TRANSLATE_TOOL_LOG_PREFIX = "[PictureTranslate][Tool]";
export const PICTURE_TRANSLATE_TOOL_ERROR_LOG_PREFIX = "[PictureTranslate][Tool Error]";

export const DEFAULT_SOURCE_LANGUAGE = "auto";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const DATA_URL_PREFIX = "data:";
export const BASE64_MARKER = ";base64,";

export const ERROR_MESSAGES = {
  IMAGE_REQUIRED: "请提供 imageUrl 或 imageBase64",
  IMAGE_URL_HTTPS_REQUIRED: "imageUrl 必须为 HTTPS",
  IMAGE_URL_INVALID: "imageUrl 无法访问或已失效",
  IMAGE_BASE64_INVALID: "imageBase64 解码失败或内容非法",
  IMAGE_FORMAT_INVALID: "图片格式错误，当前仅支持 png、jpg、jpeg",
  IMAGE_TOO_LARGE: "图片过大，最大支持 10MB",
  VOLC_CREDENTIALS_MISSING:
    "火山访问未配置：请设置 HUOSHAN_API_KEY / HUOSHAN_API_SECRET（或 VOLC_ACCESSKEY / VOLC_SECRETKEY）",
  VOLC_TIMEOUT: "火山 API 请求超时",
  VOLC_API_FAILED: "火山 API 调用失败",
  VOLC_RESPONSE_INVALID: "火山返回异常",
  AIDGE_CREDENTIALS_MISSING:
    "Aidge 访问未配置：请设置 AIDGE_ACCESS_KEY_ID 与 AIDGE_ACCESS_KEY_SECRET",
  AIDGE_TIMEOUT: "Aidge API 请求超时",
  AIDGE_API_FAILED: "Aidge API 调用失败",
  AIDGE_RESPONSE_INVALID: "Aidge 返回异常",
  LANGUAGE_PAIR_NOT_SUPPORTED:
    "当前源语言与目标语言组合不支持图片翻译，请更换语言后重试",
  AUTO_SOURCE_REQUIRES_EXPLICIT:
    "请指定源语言后再进行图片翻译（当前目标语言无法使用自动检测）",
  BLOB_UPLOAD_FAILED: "译图上传失败",
  TOOL_EXECUTION_FAILED: "图片翻译失败，请稍后重试",
} as const;
