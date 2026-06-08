import type { ToolDefinition } from "../../core/toolRegistry.server";
import { searchProductsToolDefinition } from "./searchProducts";
import { getProductDetailToolDefinition } from "./getProductDetail";
import { listShopifyArticlesToolDefinition } from "./listShopifyArticles";

export const productCatalogSkills: ToolDefinition[] = [
  searchProductsToolDefinition,
  listShopifyArticlesToolDefinition,
  getProductDetailToolDefinition,
];
