import type { ToolDefinition } from "../../core/toolRegistry.server";
import { searchProductsToolDefinition } from "./searchProducts";
import { getProductDetailToolDefinition } from "./getProductDetail";

export const productCatalogSkills: ToolDefinition[] = [
  searchProductsToolDefinition,
  getProductDetailToolDefinition,
];
