export type ProviderItem = {
  id: string;
  name: string;
};

export const GENERATE_DESCRIPTION_QUICK_PROMPT = "生成商品描述";

export const INITIAL_ASSISTANT_MESSAGE =
  "你好，我是 AI Assistant。\n\n我目前支持：\n1. 店铺经营分析与诊断建议\n2. 广告与物流授权相关引导\n3. 运营文案和促销活动建议\n4. 常见业务问题问答\n5. 创建翻译任务（对我说「创建翻译任务」等，我会在同一条回复里附上表单卡片）\n6. 商品描述生成（对我说出商品 ID 我可调用工具生成；也可点击快捷问题「生成商品描述」在卡片中填写，或前往「Generate Description」独立页）\n\n你可以直接告诉我你的目标。";

export const quickPrompts = [
  "你有哪些功能",
  "看今天店铺+广告数据",
  "今天适合做什么活动",
  "创建翻译任务",
  GENERATE_DESCRIPTION_QUICK_PROMPT,
];

export const quickPromptTones: Array<"neutral" | "auto" | "critical"> = [
  "neutral",
  "auto",
  "critical",
  "auto",
  "neutral",
];

export const adProviders: ProviderItem[] = [
  { id: "google", name: "Google Ads" },
  { id: "tiktok", name: "TikTok Ads" },
  { id: "microsoft", name: "Microsoft Ads（Bing）" },
];

export const logisticsProviders: ProviderItem[] = [
  { id: "sf", name: "顺丰速运（SF Express）" },
  { id: "fedex", name: "FedEx" },
];
