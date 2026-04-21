export {
  createShopifyShopInfoTool,
  type ShopifyAdminGraphqlClient,
} from "./tool/shopifyShopInfoTool";
export { timeTool } from "./tool/timeTool";
export { weatherTool } from "./tool/weatherTool";

import { timeTool } from "./tool/timeTool";
import { weatherTool } from "./tool/weatherTool";

export const baseAgentTools = [timeTool, weatherTool];
