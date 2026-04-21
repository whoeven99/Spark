export {
  createShopifyShopInfoTool,
  type ShopifyAdminGraphqlClient,
} from "./shopifyShopInfoTool";
export { timeTool } from "./timeTool";
export { weatherTool } from "./weatherTool";

import { timeTool } from "./timeTool";
import { weatherTool } from "./weatherTool";

export const baseAgentTools = [timeTool, weatherTool];
