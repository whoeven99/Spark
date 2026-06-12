import { createShopifyShopInfoTools } from "./shopifyInfo/shopifyInfo.tool";
import { translationTaskFormTool } from "./translation/translation.tool";
import { createTranslationQueryTool } from "./translation/translation.query.tool";
import { globalToolRegistry } from "../core/toolRegistry.server";
import { extractTranslationTaskFormFromMessages } from "./translation/translation.extract";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { sendTemplateEmailToolDefinition } from "./email/email.tool";
import { productOptimizationSkills } from "./productOptimization";
import { productCatalogSkills } from "./productCatalog";
import { listMyTasksToolDefinition } from "./taskHistory/taskHistory.tool";
import { dailyOperationsToolDefinition } from "./dailyOperations/dailyOperations.tool";
import { getBillingStatusToolDefinition } from "./billingStatus/billingStatus.tool";
import { batchTasksFormSkillDefinition } from "./batchTasks/batchTasks.form.skill";

// ==========================================
// 注册各类核心与扩展 Tools 到全局注册表
// ==========================================

globalToolRegistry.register({
  name: "shopifyShopInfo",
  displayName: "Shopify 店铺数据",
  category: "店铺运营",
  stage: "monitor",
  description: "查询店铺基础信息、销售数据、库存状态及 OAuth 授权范围",
  createTool: ({ admin }) => createShopifyShopInfoTools(admin),
});

globalToolRegistry.register({
  name: "translationTaskForm",
  displayName: "翻译任务",
  category: "本地化",
  stage: "execute",
  description: "创建翻译任务表单卡片，并查询 V4 批量翻译任务进度",
  uiPayloadKey: "translationTaskForm",
  systemPromptExtension:
    "当用户想要创建「翻译任务」「批量翻译商品/页面」或填写目标语言做本地化时，必须调用工具 open_translation_task_form，并从对话中提取尽量准确的 sourceLocale、targetLocale、limitPerType、resourceTypes；不确定的字段可留空让用户在卡片里补全。调用该工具后仍需用一两句话说明接下来可在卡片中确认并提交。禁止在未成功调用 open_translation_task_form 时声称「已为你打开卡片」或「卡片已打开」；若尚未调用该工具，必须先发起工具调用，不要仅用文字描述表单内容来代替卡片。" +
    "当用户询问翻译任务进度、某次翻译是否完成、最近有哪些翻译任务、某语言翻译跑到哪一步时，调用 query_translation_tasks：有 taskId/jobId 则传 taskId 查详情，否则返回近期列表，可用 targetLocale 或 activeOnly 过滤。回复时用 statusLabel、stageSummary、progressPercent 向用户说明当前阶段，进行中任务可提示前往「翻译」页面查看详情。",
  createTool: (context) => [translationTaskFormTool, createTranslationQueryTool(context)],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (ev.event === "on_tool_start" && ev.name === "open_translation_task_form") {
      streamContext.emittedFlags.add("translationTaskForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coerceTranslationTaskFormPayload(ev.input),
      });
    }
  },
  extractUIPayload: (messages) => extractTranslationTaskFormFromMessages(messages),
});

// 商品优化 Skill 组：文案生成、图片翻译、图片生成、质量评分
for (const skill of productOptimizationSkills) {
  globalToolRegistry.register(skill);
}

// 商品目录 Skill 组：商品搜索、商品详情
for (const skill of productCatalogSkills) {
  globalToolRegistry.register(skill);
}

globalToolRegistry.register(listMyTasksToolDefinition);
globalToolRegistry.register(dailyOperationsToolDefinition);
globalToolRegistry.register(getBillingStatusToolDefinition);
globalToolRegistry.register(sendTemplateEmailToolDefinition);
globalToolRegistry.register(batchTasksFormSkillDefinition);
