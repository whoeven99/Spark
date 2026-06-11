import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isSupportedFileExtension,
  parseFileBuffer,
  SUPPORTED_EXTENSIONS_LABEL,
} from "../server/fileContext/fileParser.server";
import { parseGlossaryWithLLM } from "../server/translation/glossaryLlmParse.server";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const LLM_TEXT_LIMIT = 14_000;

/** POST /api/translate/v4/glossary/parse — multipart file → LLM terms preview (not saved) */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return data({ ok: false, error: "请使用 multipart/form-data 上传文件" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return data({ ok: false, error: "缺少 file 字段" }, { status: 400 });
  }

  if (!isSupportedFileExtension(file.name)) {
    return data(
      { ok: false, error: `不支持的文件格式。支持：${SUPPORTED_EXTENSIONS_LABEL}` },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return data({ ok: false, error: "文件大小超过 10MB 限制" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    const parsed = await parseFileBuffer(buffer, file.name);
    text = parsed.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return data({ ok: false, error: msg }, { status: 400 });
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return data({ ok: false, error: "文件内容为空或无法提取文字" }, { status: 400 });
  }

  const truncated = trimmed.length > LLM_TEXT_LIMIT;
  const llmInput = truncated ? trimmed.slice(0, LLM_TEXT_LIMIT) : trimmed;

  try {
    const terms = await parseGlossaryWithLLM(llmInput);
    return data({
      ok: true,
      terms,
      count: terms.length,
      source: file.name,
      truncated,
      note: truncated ? "文件超过 14000 字符，已截断，建议分批处理" : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("不支持") || msg.includes("为空") ? 400 : 500;
    console.error("[glossary/parse]", err);
    return data({ ok: false, error: msg }, { status });
  }
};
