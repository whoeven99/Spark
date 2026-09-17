/**
 * 首页输入框下的自然语言提问案例。
 * 点击后按自由输入发出（不带 skillFocus），走建议链路而非直接开卡。
 */
export type HomePromptCase = {
  key: string;
  /** i18n key under workspace.homeV2.promptCases.* */
  labelKey: string;
};

export const HOME_PROMPT_CASES: readonly HomePromptCase[] = [
  { key: "storeHow", labelKey: "storeHow" },
  { key: "productPageBetter", labelKey: "productPageBetter" },
  { key: "sellMore", labelKey: "sellMore" },
  { key: "worthOptimizing", labelKey: "worthOptimizing" },
  { key: "whatCanYouDo", labelKey: "whatCanYouDo" },
  { key: "seoCheck", labelKey: "seoCheck" },
] as const;
