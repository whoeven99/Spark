export type AppEntry =
  | "chat"
  | "diagnosis"
  | "translation"
  | "generate-description"
  | "image-studio"
  | "picture-translate"
  | "generate-image";

export type NavItemKey = AppEntry | "billing";

type AppEntryConfig = {
  home: string;
  nav: readonly NavItemKey[];
  /** Prisma Client 委托名，供 `PrismaSessionStorage` 使用。 */
  sessionPrismaTable: "session" | "generateDescriptionSession";
};

const APP_ENTRY_CONFIGS = {
  chat: {
    home: "/app",
    nav: [
      "chat",
      "diagnosis",
      "translation",
      "generate-description",
      "image-studio",
    ],
    sessionPrismaTable: "session",
  },
  diagnosis: {
    home: "/app/additional",
    nav: ["diagnosis"],
    sessionPrismaTable: "session",
  },
  translation: {
    home: "/app/translation",
    nav: ["translation"],
    sessionPrismaTable: "session",
  },
  "generate-description": {
    home: "/app/generate-description",
    nav: ["generate-description", "image-studio", "billing"],
    sessionPrismaTable: "generateDescriptionSession",
  },
  "image-studio": {
    home: "/app/image-studio",
    nav: ["image-studio"],
    sessionPrismaTable: "session",
  },
  "picture-translate": {
    home: "/app/image-studio?tab=translate",
    nav: ["image-studio"],
    sessionPrismaTable: "session",
  },
  "generate-image": {
    home: "/app/image-studio?tab=generate",
    nav: ["image-studio"],
    sessionPrismaTable: "session",
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

/** 当前 App 使用的 Session 表（Prisma 委托名）。主 App 为 `session`，卫星 App 为独立表。 */
export function getSessionPrismaTableName(): AppEntryConfig["sessionPrismaTable"] {
  const override = process.env.SESSION_PRISMA_TABLE?.trim();
  if (override === "session" || override === "generateDescriptionSession") {
    return override;
  }
  return getAppEntryConfig().sessionPrismaTable;
}

/** 嵌入式 Admin 跳转时保留 shop/host/id_token 等查询参数，避免鉴权循环。 */
export function buildEmbeddedAppPath(path: string, request: Request): string {
  const url = new URL(request.url);
  const target = new URL(path, url.origin);
  target.search = url.search;
  return `${target.pathname}${target.search}`;
}
