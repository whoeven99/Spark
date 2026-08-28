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
import { getBillingStatusToolDefinition } from "./billingStatus/billingStatus.tool";
import { batchTasksFormSkillDefinition } from "./batchTasks/batchTasks.form.skill";
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
  systemPromptExtension: [
    "店铺经营相关需求按意图选工具，不要同时乱调：",
    "1) 用户问具体数字/区间表现（销售额、订单数、转化率、客单价、弃购率、退款率、流量来源、库存健康等）→ 调用对应 get_shopify_today_* / get_shopify_inventory_health 工具。",
    "2) 用户问「今天有什么要处理的」「店铺今天健康吗」「有哪些风险/待办」→ 调用 get_daily_operations；回复先讲紧急重要（q1/P0），再概述其他象限；诊断需引用 evidence 数字。任务状态：open=待处理，in_progress=处理中，done=已完成，ignored=已忽略，auto_closed=问题已自动消除。",
    "3) 用户同时要「今天概况 + 关键指标」时，可先 get_daily_operations，再按需补查单项指标。",
  ].join("\n"),
  createTool: (context) => [
    ...createShopifyShopMetricsTools(context.admin),
    createGetDailyOperationsTool(context),
  ],
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
