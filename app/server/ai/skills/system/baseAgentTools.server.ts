export {
  createShopifyShopInfoTools,
  createShopifyShopInfoTool,
  createShopifyShopMetricsTools,
  type ShopifyAdminGraphqlClient,
} from "../shopifyInfo/shopifyInfo.tool";
export { timeTool } from "./timeTool";
export { weatherTool } from "./weatherTool";

/**
 * 店铺 Agent 额外挂载的基础工具。
 * 时间 / 天气已迁入 Tool Registry（visibility: internal），此处留空避免重复注入。
 */
export const baseAgentTools: [] = [];
