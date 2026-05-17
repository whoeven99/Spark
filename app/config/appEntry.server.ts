export type AppEntry =
  | "chat"
  | "diagnosis"
  | "translation"
  | "generate-description";

export type NavItemKey = AppEntry;

type AppEntryConfig = {
  home: string;
  nav: readonly NavItemKey[];
};

const APP_ENTRY_CONFIGS = {
  chat: {
    home: "/app",
    nav: ["chat", "diagnosis", "translation", "generate-description"],
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
