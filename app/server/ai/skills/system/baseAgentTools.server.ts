export {
  createShopifyShopInfoTools,
  createShopifyShopInfoTool,
  type ShopifyAdminGraphqlClient,
} from "../shopifyInfo/shopifyInfo.tool";
export { timeTool } from "./timeTool";
export { weatherTool } from "./weatherTool";
import { timeTool } from "./timeTool";
import { weatherTool } from "./weatherTool";

/** 店铺 Agent 默认挂载的基础工具（时间与天气）。 */
export const baseAgentTools = [timeTool, weatherTool];
