import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { parseFileBuffer, isSupportedFileExtension, SUPPORTED_EXTENSIONS_LABEL } from "../server/fileContext/fileParser.server";
import { uploadParsedFile } from "../server/fileContext/fileStore.server";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session?.shop;
  if (!shop) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "无效的请求体，请使用 multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少 file 字段" }, { status: 400 });
  }

  if (!isSupportedFileExtension(file.name)) {
    return Response.json(
      { error: `不支持的文件格式。支持：${SUPPORTED_EXTENSIONS_LABEL}` },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return Response.json(
      { error: `文件大小超过 10MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)} MB）` },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let parsed;
  try {
    parsed = await parseFileBuffer(buffer, file.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `文件解析失败：${msg}` }, { status: 422 });
  }

  const fileId = crypto.randomUUID().replace(/-/g, "");

  try {
    await uploadParsedFile({
      shop,
      fileId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      text: parsed.text,
      originalBytes: buffer,
      originalSize: file.size,
      charCount: parsed.charCount,
    });
  } catch (err) {
    console.error("[upload-file] store failed:", err);
    return Response.json({ error: "文件存储失败，请稍后重试" }, { status: 500 });
  }

  return Response.json({
    id: fileId,
    name: file.name,
    size: file.size,
    charCount: parsed.charCount,
  });
};
