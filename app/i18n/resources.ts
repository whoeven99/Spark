import enCommon from "../locales/en/common.json";
import zhCommon from "../locales/zh/common.json";
import jaCommon from "../locales/ja/common.json";
import koCommon from "../locales/ko/common.json";

export const translationResources = {
  en: { common: enCommon },
  "zh-CN": { common: zhCommon },
  ja: { common: jaCommon },
  ko: { common: koCommon },
} as const;
