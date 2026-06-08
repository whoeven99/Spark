export type AppEntry =
  | "chat"
  | "diagnosis"
  | "translation-v4"
  | "product-improve"
  | "image-studio"
  | "picture-translate"
  | "generate-image"
  | "order-monitor";

export type NavItemKey = AppEntry | "billing";

type AppEntryConfig = {
  home: string;
  nav: readonly NavItemKey[];
};

const APP_ENTRY_CONFIGS = {
  chat: {
    home: "/app",
    nav: [
      "chat",
      "diagnosis",
      "translation-v4",
      "product-improve",
      "image-studio",
    ],
  },
  diagnosis: {
    home: "/app/additional",
    nav: ["diagnosis"],
  },
  "translation-v4": {
    home: "/app/translation-v4",
    nav: ["translation-v4"],
  },
  "product-improve": {
    home: "/app/product-improve",
    nav: ["product-improve", "image-studio", "billing"],
  },
  "image-studio": {
    home: "/app/image-studio",
    nav: ["image-studio"],
  },
  "picture-translate": {
    home: "/app/image-studio?tab=translate",
    nav: ["image-studio"],
  },
  "generate-image": {
    home: "/app/image-studio?tab=generate",
    nav: ["image-studio"],
  },
  "order-monitor": {
    home: "/app/order-monitor",
    nav: ["order-monitor", "billing"],
  },
} as const satisfies Record<AppEntry, AppEntryConfig>;

function isAppEntry(value: string): value is AppEntry {
  return value in APP_ENTRY_CONFIGS;
}

/** 通过 APP_ENTRY 环境变量切换旗舰 App 与卫星 App 的默认入口。 */
export function getAppEntry(): AppEntry {
  const raw = process.env.APP_ENTRY?.trim();
  if (raw && isAppEntry(raw)) return raw;
  return "chat";
}

export function getAppEntryConfig(): AppEntryConfig {
  return APP_ENTRY_CONFIGS[getAppEntry()];
}

/** 当前 APP_ENTRY 对应的嵌入式 App 首页路径（如 /app、/app/product-improve）。 */
export function getAppHomePath(): string {
  return getAppEntryConfig().home;
}

/** 嵌入式 Admin 跳转时保留 shop/host/id_token 等查询参数，避免鉴权循环。 */
export function buildEmbeddedAppPath(path: string, request: Request): string {
  const url = new URL(request.url);
  const target = new URL(path, url.origin);
  target.search = url.search;
  return `${target.pathname}${target.search}`;
}
