import { createShopifyShopInfoTools } from "./shopifyInfo/shopifyInfo.tool";
import { globalToolRegistry } from "../core/toolRegistry.server";
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
  description: "查询店铺基础信息、销售数据与库存状态",
  createTool: ({ admin }) => createShopifyShopInfoTools(admin),
});

// 整店翻译已迁移至 TSF，Spark 不再注册翻译任务工具。

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
