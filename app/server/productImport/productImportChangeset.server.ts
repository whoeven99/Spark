/**
 * 导入全量 changeset 存 Azure Blob，避免撑爆 Turso 任务 result。
 */
import {
  deleteBlobIfExists,
  downloadJsonBlob,
  uploadJsonBlob,
} from "../fileContext/fileStore.server";
import type { ProductImportPlan } from "../../lib/productImportPlanOps";

function changesetPath(shop: string, taskId: string): string {
  const safeShop = shop.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100);
  return `${safeShop}/ai-tasks/${taskId}/import-changeset.json`;
}

export async function saveProductImportChangeset(params: {
  shop: string;
  taskId: string;
  plan: ProductImportPlan;
}): Promise<string> {
  const blobPath = changesetPath(params.shop, params.taskId);
  await uploadJsonBlob(blobPath, params.plan);
  return blobPath;
}

export async function loadProductImportChangeset(
  shop: string,
  taskId: string,
  blobPath?: string | null,
): Promise<ProductImportPlan | null> {
  const path = blobPath?.trim() || changesetPath(shop, taskId);
  return downloadJsonBlob<ProductImportPlan>(path);
}

export async function deleteProductImportChangeset(blobPath: string | null | undefined): Promise<void> {
  if (!blobPath?.trim()) return;
  await deleteBlobIfExists(blobPath.trim());
}
