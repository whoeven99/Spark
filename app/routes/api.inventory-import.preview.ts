import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { previewInventoryImportSpreadsheet } from "../server/inventoryImport/inventoryImportSheetPreview.server";

/**
 * GET /api/inventory-import/preview?fileId=
 * 确认卡表格预览：只解析上传文件，不建任务、不打 Shopify。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop;
  if (!shop) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId")?.trim() ?? "";
  if (!fileId) {
    return Response.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  const outcome = await previewInventoryImportSpreadsheet({ shop, fileId });
  if (!outcome.ok) {
    const status = outcome.code === "file_not_found" ? 404 : 422;
    return Response.json({ ok: false, error: outcome.code }, { status });
  }
  return Response.json({ ok: true, preview: outcome.preview });
};
