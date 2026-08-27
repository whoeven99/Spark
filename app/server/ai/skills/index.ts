import {
  createShopifyShopInfoTool,
  createShopifyShopMetricsTools,
} from "./shopifyInfo/shopifyInfo.tool";
import { globalToolRegistry } from "../core/toolRegistry.server";
import { sendTemplateEmailToolDefinition } from "./email/email.tool";
import { productOptimizationSkills } from "./productOptimization";
import { productCatalogSkills } from "./productCatalog";
import { listMyTasksToolDefinition } from "./taskHistory/taskHistory.tool";
import { dailyOperationsToolDefinition } from "./dailyOperations/dailyOperations.tool";
import { getBillingStatusToolDefinition } from "./billingStatus/billingStatus.tool";
import { batchTasksFormSkillDefinition } from "./batchTasks/batchTasks.form.skill";
import { timeTool } from "./system/timeTool";
import { weatherTool } from "./system/weatherTool";

// ==========================================
// 注册各类核心与扩展 Tools 到全局注册表
// visibility: public = 可对外介绍；internal = 仅内部调用
// ==========================================

globalToolRegistry.register({
  name: "shopifyShopMetrics",
  displayName: "经营数据查询",
  category: "店铺运营",
  stage: "monitor",
  visibility: "public",
  description:
    "查询销售额、订单数、转化率、客单价、弃购率、退款率、流量来源表现与库存健康",
  createTool: ({ admin }) => createShopifyShopMetricsTools(admin),
});

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

// 商品优化 Skill 组：文案生成、图片翻译、图片生成、质量评分（对外）
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
  ...dailyOperationsToolDefinition,
  visibility: "public",
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
