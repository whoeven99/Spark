import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listWorkspaceFiles } from "../server/fileContext/fileStore.server";

/**
 * GET /api/files
 * 返回当前店铺历史上传的 Workspace 文件列表。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop;
  if (!shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const files = await listWorkspaceFiles(shop);
  return Response.json({
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      originalSize: file.originalSize,
      charCount: file.charCount,
      createdAt: file.createdAt.toISOString(),
    })),
  });
};
