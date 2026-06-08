import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getOriginalFileDownloadUrl, getWorkspaceFileMeta } from "../server/fileContext/fileStore.server";

/**
 * GET /api/files/:fileId
 * 返回原始文件的临时 SAS 下载直链（重定向），有效期 1 小时。
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop;
  if (!shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileId = params.fileId;
  if (!fileId) {
    return Response.json({ error: "Missing fileId" }, { status: 400 });
  }

  const meta = await getWorkspaceFileMeta(shop, fileId);
  if (!meta) {
    return Response.json({ error: "文件不存在或无权访问" }, { status: 404 });
  }

  const downloadUrl = await getOriginalFileDownloadUrl(shop, fileId);
  if (!downloadUrl) {
    return Response.json({ error: "原始文件不可用" }, { status: 404 });
  }

  // 302 redirect to the SAS URL — browser will follow and download the file
  return Response.redirect(downloadUrl, 302);
};
