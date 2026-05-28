import type { TFunction } from "i18next";
import { TRANSLATION_V4_MODULES } from "../server/translation/v4/types";

const MODULE_LABEL_KEYS: Record<string, string> = {
  PRODUCT: "translationRuntime.moduleProduct",
  PRODUCT_OPTION: "translationRuntime.moduleProductOption",
  PRODUCT_OPTION_VALUE: "translationRuntime.moduleProductOptionValue",
  COLLECTION: "translationRuntime.moduleCollection",
  ONLINE_STORE_THEME_APP_EMBED: "translationRuntime.moduleOnlineStoreThemeAppEmbed",
  ONLINE_STORE_THEME_JSON_TEMPLATE: "translationRuntime.moduleOnlineStoreThemeJsonTemplate",
  ONLINE_STORE_THEME_SECTION_GROUP: "translationRuntime.moduleOnlineStoreThemeSectionGroup",
  ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS:
    "translationRuntime.moduleOnlineStoreThemeSettingsDataSections",
  MENU: "translationRuntime.moduleMenu",
  LINK: "translationRuntime.moduleLink",
  DELIVERY_METHOD_DEFINITION: "translationRuntime.moduleDeliveryMethodDefinition",
  FILTER: "translationRuntime.moduleFilter",
  METAFIELD: "translationRuntime.moduleMetafield",
  METAOBJECT: "translationRuntime.moduleMetaobject",
  PAYMENT_GATEWAY: "translationRuntime.modulePaymentGateway",
  SELLING_PLAN: "translationRuntime.moduleSellingPlan",
  SELLING_PLAN_GROUP: "translationRuntime.moduleSellingPlanGroup",
  SHOP: "translationRuntime.moduleShop",
  ARTICLE: "translationRuntime.moduleArticle",
  BLOG: "translationRuntime.moduleBlog",
  PAGE: "translationRuntime.modulePage",
};

function humanizeModule(module: string): string {
  return module
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getTranslationModuleLabel(module: string, t: TFunction): string {
  const key = MODULE_LABEL_KEYS[module];
  if (key) {
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  return humanizeModule(module);
}

export function getTranslationModuleOptions(t: TFunction): { value: string; label: string }[] {
  return TRANSLATION_V4_MODULES.map((module) => ({
    value: module,
    label: getTranslationModuleLabel(module, t),
  }));
}
