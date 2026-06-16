export type AutomationFrequency = "DAILY" | "EVERY_3_DAYS" | "WEEKLY" | "MONTHLY";

export type TranslationAutomationItem = {
  id: string;
  shopName: string;
  source: string;
  targets: string[];
  modules: string[];
  frequency: AutomationFrequency;
  enabled?: boolean;
  createdAt: string;
  lastTriggeredAt: string;
};

export const AUTOMATION_FREQUENCY_OPTIONS: Array<{
  value: AutomationFrequency;
  label: string;
}> = [
  { value: "DAILY", label: "1 天 / 次" },
  { value: "EVERY_3_DAYS", label: "3 天 / 次" },
  { value: "WEEKLY", label: "1 周 / 次" },
  { value: "MONTHLY", label: "1 月 / 次" },
];

const TRANSLATION_AUTOMATION_STORAGE_KEY = "translation-v4-automations";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

function resolveBrowserStorage():
  | (ReadStorage & WriteStorage)
  | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function getTranslationAutomationStorageKey(shopName: string): string {
  return `${TRANSLATION_AUTOMATION_STORAGE_KEY}:${shopName}`;
}

export function isTranslationAutomationItem(value: unknown): value is TranslationAutomationItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TranslationAutomationItem>;
  return Boolean(
    typeof candidate.id === "string" &&
      typeof candidate.shopName === "string" &&
      typeof candidate.source === "string" &&
      Array.isArray(candidate.targets) &&
      Array.isArray(candidate.modules) &&
      typeof candidate.frequency === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.lastTriggeredAt === "string",
  );
}

function normalizeTranslationAutomationItem(
  item: TranslationAutomationItem,
): TranslationAutomationItem {
  return {
    ...item,
    enabled: item.enabled ?? true,
  };
}

export function readTranslationAutomationItems(
  shopName: string,
  storage: ReadStorage | null = resolveBrowserStorage(),
): TranslationAutomationItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(getTranslationAutomationStorageKey(shopName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTranslationAutomationItem).map(normalizeTranslationAutomationItem);
  } catch {
    return [];
  }
}

export function persistTranslationAutomationItems(
  shopName: string,
  items: TranslationAutomationItem[],
  storage: WriteStorage | null = resolveBrowserStorage(),
): void {
  if (!storage) return;
  storage.setItem(getTranslationAutomationStorageKey(shopName), JSON.stringify(items));
}
