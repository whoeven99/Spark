export type ProviderItem = {
  id: string;
  name: string;
};

export const GENERATE_DESCRIPTION_QUICK_PROMPT = "生成商品描述";

export function buildInitialAssistantMessage(t: (key: string) => string): string {
  return t("chat.initialAssistantMessage");
}

export function buildQuickPrompts(t: (key: string) => string): string[] {
  return [
    t("chat.quickPromptFeatures"),
    t("chat.quickPromptTodayData"),
    t("chat.quickPromptCampaign"),
    t("chat.quickPromptCreateTranslation"),
    t("chat.quickPromptGenerateDescription"),
    t("chat.quickPromptPictureTranslate"),
    t("chat.quickPromptShopHealthCheck"),
    t("chat.quickPromptProductLaunchPipeline"),
  ];
}

export const quickPromptTones: Array<"neutral" | "auto" | "critical"> = [
  "neutral",
  "auto",
  "critical",
  "auto",
  "neutral",
  "auto",
  "auto",
  "auto",
];

export const adProviders: ProviderItem[] = [
  { id: "google", name: "credentials.providerGoogle" },
  { id: "tiktok", name: "credentials.providerTiktok" },
  { id: "microsoft", name: "credentials.providerMicrosoft" },
];

export const logisticsProviders: ProviderItem[] = [
  { id: "sf", name: "credentials.providerSf" },
  { id: "fedex", name: "credentials.providerFedex" },
];
