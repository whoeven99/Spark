import enCommon from "../locales/en/common.json";
import zhCommon from "../locales/zh/common.json";
import jaCommon from "../locales/ja/common.json";
import koCommon from "../locales/ko/common.json";
import esCommon from "../locales/es/common.json";
import frCommon from "../locales/fr/common.json";
import deCommon from "../locales/de/common.json";
import itCommon from "../locales/it/common.json";
import ptCommon from "../locales/pt/common.json";

export const translationResources = {
  en: { common: enCommon },
  "zh-CN": { common: zhCommon },
  ja: { common: jaCommon },
  ko: { common: koCommon },
  es: { common: esCommon },
  fr: { common: frCommon },
  de: { common: deCommon },
  it: { common: itCommon },
  pt: { common: ptCommon },
} as const;
