import prisma from "../../db.server";
import { deleteTranslateV3BlobIfExists } from "../translation/translateBlobStore.server";
import type { ShopVisualJobKind } from "./types.server";

const LOG_PREFIX = "[ShopVisualJob][Delete]";

export function collectBlobPathsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const paths: string[] = [];
  const obj = metadata as Record<string, unknown>;
  for (const key of ["sourceBlobPath", "blobPath"] as const) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      paths.push(value.trim());
    }
  }
  const extra = obj.extraBlobPaths;
  if (Array.isArray(extra)) {
    for (const entry of extra) {
      if (typeof entry === "string" && entry.trim()) {
        paths.push(entry.trim());
      }
    }
  }
  return paths;
}

export async function deleteShopVisualJobForShop(params: {
  requestId: string;
  shop: string;
}): Promise<
  | { ok: true; kind: ShopVisualJobKind }
  | { ok: false; status: number; errorMsg: string }
> {
  const requestId = params.requestId.trim();
  if (!requestId) {
    return { ok: false, status: 400, errorMsg: "缺少 requestId" };
  }

  const row = await prisma.shopVisualJob.findFirst({
    where: { requestId, shop: params.shop },
  });

  if (!row) {
    return { ok: false, status: 404, errorMsg: "记录不存在或无权删除" };
  }

  const kind: ShopVisualJobKind =
    row.kind === "picture_translate" ? "picture_translate" : "image_generation";

  const blobPaths = new Set<string>();
  if (row.blobPath?.trim()) {
    blobPaths.add(row.blobPath.trim());
  }
  for (const path of collectBlobPathsFromMetadata(row.metadata)) {
    blobPaths.add(path);
  }

  for (const blobPath of blobPaths) {
    await deleteTranslateV3BlobIfExists(blobPath);
  }

  await prisma.shopVisualJob.delete({ where: { requestId } });

  console.info(
    `${LOG_PREFIX} ok requestId=${requestId} shop=${params.shop} kind=${kind} blobs=${blobPaths.size}`,
  );

  return { ok: true, kind };
}
