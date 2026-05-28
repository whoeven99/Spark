/** Aligns with Spring JudgeTranslateUtils + TranslateConstants */

export const MODULE_METAFIELD = "METAFIELD";
export const MODULE_METAOBJECT = "METAOBJECT";
export const MODULE_ONLINE_STORE_THEME_LOCALE_CONTENT = "ONLINE_STORE_THEME_LOCALE_CONTENT";

export const NON_TRANSLATABLE_TYPES = new Set([
  "FILE_REFERENCE",
  "LINK",
  "URL",
  "LIST_FILE_REFERENCE",
  "LIST_LINK",
  "LIST_URL",
  "JSON_STRING",
]);

export const TRANSLATABLE_RESOURCE_TYPES = new Set([
  "ONLINE_STORE_THEME",
  "ONLINE_STORE_THEME_APP_EMBED",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  "ONLINE_STORE_THEME_LOCALE_CONTENT",
]);

export const NO_TRANSLATE_KEYS = [
  "general.rtl_languages",
  "general.custom_css",
  "shopify.checkout.order_summary.shipping_pending_value",
  "customer_accounts.order_details.no_data_provided",
  "checkout.contact",
  "_font",
  "spacing",
  "items_resp",
  "animations_type",
  "units",
  "abbreviation",
  "Abbreviation",
];

export const JSON_NO_TRANSLATE_SUBSTRINGS = [
  "order_number",
  "custom_color",
  "padding",
  "margin",
  "height",
  "width",
  "checksum",
  "general.discount_rate",
  "font",
  "templates.404.subtext",
  "date_formats",
  "grid_",
  "variant_",
  "code",
];

export const OLD_NO_TRANSLATE = [
  "metafield:",
  "formId:",
  "phone_text",
  "email_text",
  "carousel_easing",
  "rtl",
  "css:",
  "icon:",
  "swatch",
  "zindex",
  "wborder",
  "option:",
];

export const URL_PREFIXES = ["http://", "https://", "shopify://", "gid://shopify"];

export const WHITELIST_WORDS = [
  "heading",
  "text",
  "description",
  "content",
  "title",
  "label",
  "product",
  "faq",
  "header",
  "des",
  "custom_html",
  "slide",
  "name",
  "checkout",
];

export const BLACKLIST_WORDS = new Set([
  "Example heading",
  "Heading",
  "Heading 1",
  "Heading 2",
  "Heading 3",
  "Heading 4",
  "Image heading",
  "Video heading",
  "VIDEO SLIDE",
  "Video slide 1",
  "Video slide 2",
  "Video slide 3",
  "Video slide 4",
  "Example title",
  "Image with text",
  "Image with text overlay",
  "Collapsible row",
  "Collapsible row 1",
  "Collapsible row 2",
  "Collapsible row 3",
  "Collapsible row 4",
  "IMAGE SLIDE 1",
  "IMAGE SLIDE 2",
]);

export const HASH_PREFIX_MAX_LENGTH = 90;
export const SLASH_CONTAINS_MAX_LENGTH = 20;

export const SUSPICIOUS_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9]{9,}$/;
export const SUSPICIOUS2_PATTERN = /^(?=.*[A-Z])[A-Za-z0-9]{10}$/;
export const BASE64_PATTERN =
  /^(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])(?=[A-Za-z0-9+/]*[0-9])(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const ICON_KEY_PATTERN = /\.icon_\d+:/;
export const GENERAL_OR_SECTION_PATTERN = /^(general|section)\./;
export const IMAGE_PATTERN = /\b\S+\.(jpg|jpeg|png|gif|bmp|webp|svg|mp4)\b/i;
export const PATH_PATTERN = /^\/[a-zA-Z0-9_\-./?=&%]*$/;
export const ISO_OFFSET_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?[+-]\d{2}:\d{2}$/;
export const EMPTY_BODY_TAG_PATTERN = /^<body\s*>\s*<\/body\s*>$/i;

export const LOCALE_CONTENT_KEY_BLOCKLIST = ["gempage", "pagefly", "ecom", "beae", "error"] as const;
