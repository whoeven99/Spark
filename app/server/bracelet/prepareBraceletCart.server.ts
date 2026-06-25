import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { getBraceletStyle, isBraceletStyleId } from "./braceletStyles.server";
import { resolveBraceletVariantId } from "./resolveBraceletVariant.server";
import type { PrepareBraceletInput, PrepareBraceletResponse } from "./types";
import {
  parsePreviewDataUrl,
  uploadBraceletPreviewPng,
} from "./uploadBraceletPreview.server";

const MAX_ENGRAVING_LENGTH = 20;
const MAX_PREVIEW_BYTES = 512 * 1024;

export function validatePrepareBraceletInput(
  body: unknown,
): { ok: true; input: PrepareBraceletInput } | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }

  const record = body as Record<string, unknown>;
  if (!isBraceletStyleId(record.style)) {
    return { ok: false, error: "style 必须为 classic 或 beaded", status: 400 };
  }

  const engraving =
    typeof record.engraving === "string" ? record.engraving.trim() : "";
  if (engraving.length > MAX_ENGRAVING_LENGTH) {
    return {
      ok: false,
      error: `刻字最多 ${MAX_ENGRAVING_LENGTH} 个字符`,
      status: 400,
    };
  }

  if (typeof record.previewDataUrl !== "string" || !record.previewDataUrl.trim()) {
    return { ok: false, error: "缺少 previewDataUrl", status: 400 };
  }

  const pngBytes = parsePreviewDataUrl(record.previewDataUrl);
  if (!pngBytes || pngBytes.length === 0) {
    return { ok: false, error: "previewDataUrl 必须为 PNG base64", status: 400 };
  }
  if (pngBytes.length > MAX_PREVIEW_BYTES) {
    return { ok: false, error: "预览图过大（最大 512KB）", status: 413 };
  }

  return {
    ok: true,
    input: {
      style: record.style,
      engraving,
      previewDataUrl: record.previewDataUrl.trim(),
    },
  };
}

export async function prepareBraceletCart(params: {
  admin: AdminApiContext;
  shop: string;
  input: PrepareBraceletInput;
}): Promise<PrepareBraceletResponse> {
  const styleDef = getBraceletStyle(params.input.style);
  const pngBytes = parsePreviewDataUrl(params.input.previewDataUrl);
  if (!pngBytes) {
    return { ok: false, error: "预览图格式无效", status: 400 };
  }

  const variantResult = await resolveBraceletVariantId({
    admin: params.admin,
    style: params.input.style,
  });
  if ("error" in variantResult) {
    return { ok: false, error: variantResult.error, status: 422 };
  }

  let previewUrl: string;
  try {
    previewUrl = await uploadBraceletPreviewPng({
      shop: params.shop,
      pngBytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "预览图上传失败";
    return { ok: false, error: message, status: 503 };
  }

  const engravingDisplay = params.input.engraving || "（无）";

  return {
    ok: true,
    variantId: variantResult.variantId,
    properties: {
      Style: styleDef.label,
      Engraving: engravingDisplay,
      "Preview Image": previewUrl,
      _preview_url: previewUrl,
      _config_json: JSON.stringify({
        style: params.input.style,
        engraving: params.input.engraving,
        previewUrl,
      }),
    },
  };
}
