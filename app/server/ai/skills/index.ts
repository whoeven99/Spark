import {
  createShopifyShopInfoTool,
  createShopifyShopMetricsTools,
} from "./shopifyInfo/shopifyInfo.tool";
import { globalToolRegistry } from "../core/toolRegistry.server";
import { sendTemplateEmailToolDefinition } from "./email/email.tool";
import { productOptimizationSkills } from "./productOptimization";
import { productCatalogSkills } from "./productCatalog";
import { listMyTasksToolDefinition } from "./taskHistory/taskHistory.tool";
import { createGetDailyOperationsTool } from "./dailyOperations/dailyOperations.tool";
import { healthDiagnosisFormSkillDefinition } from "./dailyOperations/healthDiagnosis.form.tool";
import { SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION } from "./dailyOperations/shopOperations.prompt";
import { getBillingStatusToolDefinition } from "./billingStatus/billingStatus.tool";
import { batchTasksFormSkillDefinition } from "./batchTasks/batchTasks.form.skill";
import { bulkPriceEditSkillDefinition } from "./bulkPriceEdit";
import { bulkTagEditSkillDefinition } from "./bulkTagEdit";
import { bulkStatusEditSkillDefinition } from "./bulkStatusEdit";
import { seoAuditSkillDefinition } from "./seoAudit";
import { timeTool } from "./system/timeTool";
import { weatherTool } from "./system/weatherTool";

// ==========================================
// 注册各类核心与扩展 Tools 到全局注册表
// visibility: public = 可对外介绍；internal = 仅内部调用
// ==========================================

// 店铺经营：指标查询 + 今日诊断待办（对外合并介绍，内部仍多工具路由）
globalToolRegistry.register({
  name: "shopOperations",
  displayName: "店铺经营",
  category: "店铺运营",
  stage: "monitor",
  visibility: "public",
  description:
    "查询经营指标（销售/订单/转化/客单价/弃购/退款/流量/库存），并查看今日健康诊断与待办任务",
  systemPromptExtension: SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION,
  createTool: (context) => [
    ...createShopifyShopMetricsTools(context.admin),
    createGetDailyOperationsTool(context),
  ],
});

globalToolRegistry.register(healthDiagnosisFormSkillDefinition);

globalToolRegistry.register({
  name: "shopifyShopBasicInfo",
  displayName: "店铺基础信息",
  category: "店铺运营",
  stage: "monitor",
  visibility: "internal",
  description: "查询店名、域名、币种、时区、套餐等店铺基础信息",
  createTool: ({ admin }) => createShopifyShopInfoTool(admin),
});

// 时间 / 天气：可调用，但不对商户介绍
globalToolRegistry.register({
  name: "currentTime",
  displayName: "查询当前时间",
  category: "系统",
  stage: "monitor",
  visibility: "internal",
  description: "查询当前日期与时间",
  createTool: () => timeTool,
});

globalToolRegistry.register({
  name: "weather",
  displayName: "查询天气",
  category: "系统",
  stage: "monitor",
  visibility: "internal",
  description: "按城市查询天气",
  createTool: () => weatherTool,
});

// 整店翻译已迁移至 TSF，Spark 不再注册翻译任务工具。

// 商品优化：一级对外「商品优化」+ 独立一级「图片生成」；文案/评分/图翻等为 internal 子能力
for (const skill of productOptimizationSkills) {
  globalToolRegistry.register({
    ...skill,
    visibility: skill.visibility ?? "public",
  });
}

// 商品目录：搜索/详情/文章 —— 内部 Skill
for (const skill of productCatalogSkills) {
  globalToolRegistry.register({
    ...skill,
    visibility: "internal",
  });
}

globalToolRegistry.register({
  ...listMyTasksToolDefinition,
  visibility: "internal",
});
globalToolRegistry.register({
  ...getBillingStatusToolDefinition,
  visibility: "internal",
});
globalToolRegistry.register({
  ...sendTemplateEmailToolDefinition,
  visibility: "internal",
});
globalToolRegistry.register({
  ...batchTasksFormSkillDefinition,
  visibility: "internal",
});

// 批量调价：读可用领域 GraphQL，写必须走确认卡 + 任务审核两次确认
globalToolRegistry.register(bulkPriceEditSkillDefinition);

// 批量打标：同上，写回走 tagsAdd / tagsRemove 增量操作
globalToolRegistry.register(bulkTagEditSkillDefinition);

// 批量上下架：同上，写回走 productUpdate 只改 status，不碰销售渠道发布
globalToolRegistry.register(bulkStatusEditSkillDefinition);

// SEO 体检：纯规则只读诊断，先告诉商户搜索标题/描述哪里有问题
globalToolRegistry.register(seoAuditSkillDefinition);
