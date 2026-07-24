const PRODUCT_IMPROVE_MESSAGE_KEY_BY_RAW: Record<string, string> = {
  "Waiting to start the task": "productImproveStage1.asyncWaiting",
  "正在等待任务开始": "productImproveStage1.asyncWaiting",
  "Loaded the product title, description, and other details":
    "productImproveStage1.asyncContextLoaded",
  "已读取商品标题、描述和其他信息": "productImproveStage1.asyncContextLoaded",
  "Generating a new title draft with natural keyword placement":
    "productImproveStage1.asyncGeneratingTitleDraft",
  "正在生成新的标题草稿，确保关键词自然出现":
    "productImproveStage1.asyncGeneratingTitleDraft",
  "Drafting the description and preparing the final summary":
    "productImproveStage1.asyncGeneratingDescriptionDraft",
  "正在补充描述内容并整理结果摘要": "productImproveStage1.asyncGeneratingDescriptionDraft",
  "The product copy task stopped unexpectedly": "productImproveStage1.asyncUnhandledTermination",
  "商品文案任务意外中止": "productImproveStage1.asyncUnhandledTermination",
  "AI generation failed": "productImproveStage1.asyncModelInvocationFailed",
  "AI 生成失败": "productImproveStage1.asyncModelInvocationFailed",
  "AI generation failed. Check the task details and try again.":
    "productImproveStage1.asyncModelInvocationFinalMessage",
  "AI 生成失败，请查看任务详情后重试。": "productImproveStage1.asyncModelInvocationFinalMessage",
  "AI output could not be parsed": "productImproveStage1.asyncOutputParseFailed",
  "AI 输出解析失败": "productImproveStage1.asyncOutputParseFailed",
  "The generated result could not be parsed. Try again.":
    "productImproveStage1.asyncOutputParseFinalMessage",
  "生成结果无法解析，请重试。": "productImproveStage1.asyncOutputParseFinalMessage",
  "Copy generated and ready for review": "productImproveStage1.asyncCompletedPendingReview",
  "文案已生成，等待审核": "productImproveStage1.asyncCompletedPendingReview",
  "Invalid request body": "productImproveStage1.serverInvalidRequestBody",
  "请求体无效": "productImproveStage1.serverInvalidRequestBody",
  "Task not found": "productImproveStage1.serverTaskNotFound",
  "未找到任务": "productImproveStage1.serverTaskNotFound",
  "This task is not ready for review": "productImproveStage1.serverTaskNotReviewable",
  "当前任务还不能进入审核状态": "productImproveStage1.serverTaskNotReviewable",
  "This task is not ready for scoring": "productImproveStage1.serverTaskNotScorable",
  "当前任务还不能进入评分状态": "productImproveStage1.serverTaskNotScorable",
  "This task is not ready for further AI refinement":
    "productImproveStage1.serverTaskNotRefinable",
  "当前任务还不能继续进行 AI 优化": "productImproveStage1.serverTaskNotRefinable",
  "Unknown action": "productImproveStage1.serverUnknownAction",
  "未知操作": "productImproveStage1.serverUnknownAction",
  "Insufficient credits. Please subscribe or purchase a credit pack first.":
    "productImproveStage1.billingAccessRequired",
  "积分不足，请先订阅或购买积分包。": "productImproveStage1.billingAccessRequired",
  "Provide the current draft together with refinement instructions before continuing.":
    "productImproveStage1.refineProvideDraftAndComment",
  "继续优化前，请先提供当前草稿和优化说明。":
    "productImproveStage1.refineProvideDraftAndComment",
  "Feedback received. AI is refining the title and description.":
    "productImproveStage1.refineReceivedFeedbackLog",
  "已收到人工反馈，AI 正在继续优化标题和描述。":
    "productImproveStage1.refineReceivedFeedbackLog",
  "AI created a new version from your feedback. Continue reviewing the result.":
    "productImproveStage1.refineCompletedPendingReview",
  "AI 已根据你的反馈生成新版本，请继续审核结果。":
    "productImproveStage1.refineCompletedPendingReview",
  "AI refinement failed": "productImproveStage1.refineAiGenerationFailed",
  "AI 优化失败": "productImproveStage1.refineAiGenerationFailed",
  "AI 输出无法解析": "productImproveStage1.refineAiOutputInvalid",
  "Title is required": "productImproveStage1.updateValidationTitleRequired",
  "标题不能为空": "productImproveStage1.updateValidationTitleRequired",
  "Description is required": "productImproveStage1.updateValidationDescriptionRequired",
  "描述不能为空": "productImproveStage1.updateValidationDescriptionRequired",
  "The shop in the request does not match the current session":
    "productImproveStage1.updateShopMismatch",
  "请求中的店铺与当前会话不一致": "productImproveStage1.updateShopMismatch",
  "Product not found or access denied": "productImproveStage1.serverProductNotFound",
  "未找到对应商品或无权访问": "productImproveStage1.serverProductNotFound",
  "Request processing failed": "productImproveStage1.serverRequestFailed",
  "请求处理失败": "productImproveStage1.serverRequestFailed",
};

const PRODUCT_IMPROVE_PREFIX_PATTERNS = [
  {
    prefixes: ["AI refinement failed: ", "AI 继续优化失败："],
    key: "productImproveStage1.refineFailedLog",
  },
  {
    prefixes: ["文案生成失败："],
    key: "productImproveStage1.asyncModelInvocationFinalMessage",
  },
  {
    prefixes: ["输出解析失败："],
    key: "productImproveStage1.asyncOutputParseFinalMessage",
  },
] as const;

// Legacy compatibility only: old tasks stored finalized text instead of i18n keys.
export function translateLegacyProductImproveTaskMessage(
  rawMessage: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const message = rawMessage.trim();
  if (!message) return rawMessage;

  for (const pattern of PRODUCT_IMPROVE_PREFIX_PATTERNS) {
    const prefix = pattern.prefixes.find((item) => message.startsWith(item));
    if (!prefix) continue;
    const reason = message.slice(prefix.length).trim();
    if (pattern.key === "productImproveStage1.refineFailedLog") {
      return t(pattern.key, {
        reason: reason ? translateLegacyProductImproveTaskMessage(reason, t) : reason,
      });
    }
    return t(pattern.key);
  }

  const key = PRODUCT_IMPROVE_MESSAGE_KEY_BY_RAW[message];
  return key ? t(key) : rawMessage;
}
