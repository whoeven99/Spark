import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteWorkspaceFile } from "../server/fileContext/fileStore.server";

/**
 * DELETE /api/files/:fileId/delete
 * 删除原始文件和解析文本（Blob + DB 记录）。
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "DELETE" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session?.shop;
  if (!shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileId = params.fileId;
  if (!fileId) {
    return Response.json({ error: "Missing fileId" }, { status: 400 });
  }

  try {
    await deleteWorkspaceFile(shop, fileId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[delete-file] failed:", err);
    return Response.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
};
