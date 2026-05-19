export type AppEntry =
  | "chat"
  | "diagnosis"
  | "translation"
  | "generate-description"
  | "picture-translate";

export type NavItemKey = AppEntry;

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
      "translation",
      "generate-description",
      "picture-translate",
    ],
  },
  diagnosis: {
    home: "/app/additional",
    nav: ["diagnosis"],
  },
  translation: {
    home: "/app/translation",
    nav: ["translation"],
  },
  "generate-description": {
    home: "/app/generate-description",
    nav: ["generate-description"],
  },
  "picture-translate": {
    home: "/app/picture-translate",
    nav: ["picture-translate"],
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

/** 嵌入式 Admin 跳转时保留 shop/host/id_token 等查询参数，避免鉴权循环。 */
export function buildEmbeddedAppPath(path: string, request: Request): string {
  const url = new URL(request.url);
  const target = new URL(path, url.origin);
  target.search = url.search;
  return `${target.pathname}${target.search}`;
}
