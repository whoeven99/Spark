/**
 * 思考面板里的步骤：每次工具调用一条，按发生顺序堆叠展示。
 * label 原样保存 `tool:xxx` / `phase:xxx`，渲染时再按当前语言查文案，这样历史消息切语言也对。
 */
export type ThinkingStepStatus = "running" | "completed" | "skipped" | "error";

export type ThinkingStep = {
  label: string;
  status: ThinkingStepStatus;
};

/** 落库的思考原文上限：原始 CoT 可能很长，超出部分对回看没价值。 */
export const MAX_PERSISTED_THINKING_CHARS = 2000;

/** 非工具的阶段步骤：理解问题 →（工具若干）→ 整理回答 */
export const THINKING_PHASE = {
  analyze: "phase:analyze",
  compose: "phase:compose",
} as const;

const STEP_STATUSES = new Set<string>([
  "running",
  "completed",
  "skipped",
  "error",
] satisfies ThinkingStepStatus[]);

/** 工具名 → `workspace.execution.tools.*` 文案键。缺项会退回「调用工具：xxx」。 */
export const TOOL_LABEL_KEYS: Record<string, string> = {
  chat_card_intent: "prepareTask",
  generate_product_description: "generateDescription",
  generate_product_image: "generateImage",
  get_billing_status: "billingStatus",
  get_current_time: "currentTime",
  get_daily_operations: "dailyOperations",
  get_product_detail: "productDetail",
  get_shopify_inventory_health: "inventoryHealth",
  get_shopify_shop_info: "shopInfo",
  get_shopify_shop_metrics: "shopMetrics",
  get_shopify_today_abandonment_rate: "abandonmentRate",
  get_shopify_today_aov: "averageOrderValue",
  get_shopify_today_conversion_rate: "conversionRate",
  get_shopify_today_order_count: "orderCount",
  get_shopify_today_refund_return_rate: "refundRate",
  get_shopify_today_sales: "sales",
  get_shopify_today_source_performance: "trafficSources",
  get_weather: "weather",
  list_my_tasks: "myTasks",
  list_product_status: "productStatusList",
  list_product_tags: "productTagList",
  list_shopify_articles: "articleList",
  list_variant_prices: "variantPriceList",
  open_batch_tasks_form: "batchTask",
  open_bulk_price_edit_form: "bulkPriceEdit",
  open_bulk_status_edit_form: "bulkStatusEdit",
  open_bulk_tag_edit_form: "bulkTagEdit",
  open_health_diagnosis_form: "healthDiagnosis",
  open_image_generation_form: "imageGeneration",
  open_picture_translate_form: "pictureTranslation",
  open_product_export_form: "productExport",
  open_product_improve_form: "productCopy",
  open_product_import_form: "productImport",
  open_product_quality_form: "productQuality",
  picture_translate: "pictureTranslateRun",
  run_seo_audit: "seoAudit",
  score_product_quality: "productQuality",
  search_products: "productSearch",
  send_template_email: "sendEmail",
  suggest_next_actions: "suggestNextActions",
};

/** 进度事件的 label 形如 `tool:get_shopify_shop_metrics`，取出工具名。 */
export function toolNameFromStepLabel(label: string): string | null {
  return label.startsWith("tool:") ? label.slice(5) : null;
}

function phaseKeyFromStepLabel(label: string): string | null {
  return label.startsWith("phase:") ? label.slice(6) : null;
}

/** 步骤文案：阶段 / 工具查表，查不到退回工具名；其它原样返回。 */
export function resolveThinkingStepLabel(
  label: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const phase = phaseKeyFromStepLabel(label);
  if (phase) {
    return t(`workspace.shell.chat.thinking.steps.${phase}`);
  }
  const toolName = toolNameFromStepLabel(label);
  if (!toolName) return label;
  const key = TOOL_LABEL_KEYS[toolName];
  if (key) return t(`workspace.execution.tools.${key}`);
  return t("workspace.execution.tools.fallback", { name: toolName.replaceAll("_", " ") });
}

/** 从落库 JSON 还原步骤列表；脏数据整体丢弃，不影响消息渲染。 */
export function coerceThinkingSteps(value: unknown): ThinkingStep[] {
  if (!Array.isArray(value)) return [];
  const steps: ThinkingStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { label, status } = item as { label?: unknown; status?: unknown };
    if (typeof label !== "string" || !label.trim()) continue;
    if (typeof status !== "string" || !STEP_STATUSES.has(status)) continue;
    steps.push({ label, status: status as ThinkingStepStatus });
  }
  return steps;
}
