export {
  createShopifyShopInfoTools,
  createShopifyShopInfoTool,
  type ShopifyAdminGraphqlClient,
} from "./implementations/shopifyShopInfoTool";
export { timeTool } from "./implementations/timeTool";
export { weatherTool } from "./implementations/weatherTool";
import { timeTool } from "./implementations/timeTool";
import { weatherTool } from "./implementations/weatherTool";

/** 店铺 Agent 默认挂载的基础工具（时间与天气）。 */
export const baseAgentTools = [timeTool, weatherTool];
