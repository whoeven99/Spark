import { logDetailedError } from "../generateDescription/generateDescriptionLog.server";
import { aidgeTranslateImageByUrl } from "./aidgePictureTranslate.server";
import {
  uploadPictureTranslateJpegAndGetUrl,
  uploadPictureTranslateSourceImageAndGetUrl,
} from "./pictureTranslateBlob.server";
import { getExtensionFromUrl } from "./pictureTranslatePictureUtils.server";
import {
  resolvePictureTranslateProvider,
  resolvePictureTranslateProviderForced,
  type PictureTranslateProvider,
  type PictureTranslateRouteOk,
} from "./pictureTranslateRouter.server";
import {
  fetchSourceImageBytes,
  volcengineTranslateImageToBytes,
} from "./volcenginePictureTranslate.server";

const LOG_ROUTE = "[PictureTranslate][Route]";

export type PictureTranslateExecutorSuccess = {
  ok: true;
  imageUrl: string;
  provider: PictureTranslateProvider;
};

export type PictureTranslateExecutorFailure = {
  ok: false;
  reason:
    | "language_pair_not_supported"
    | "auto_requires_explicit_source"
    | "image_fetch_failed"
    | "image_format_invalid"
    | "blob_upload_failed"
    | "volc_failed"
    | "aidge_failed";
  detail?: string;
  provider?: PictureTranslateProvider;
};

function detectFormatFromBytes(bytes: Buffer): "png" | "jpg" | null {
  if (bytes.length < 8) return null;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (isPng) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

function resolveExtension(params: {
  imageUrl?: string;
  imageBytes: Buffer;
}): string | null {
  const fromUrl = params.imageUrl ? getExtensionFromUrl(params.imageUrl) : null;
  if (fromUrl) return fromUrl.toLowerCase();
  const detected = detectFormatFromBytes(params.imageBytes);
  return detected;
}

async function ensureSourceImageUrl(params: {
  shop: string;
  imageUrl?: string;
  imageBytes: Buffer;
  extension: string;
}): Promise<{ ok: true; url: string } | { ok: false; reason: "blob_upload_failed" }> {
  if (params.imageUrl?.trim()) {
    return { ok: true, url: params.imageUrl.trim() };
  }
  try {
    const url = await uploadPictureTranslateSourceImageAndGetUrl({
      shop: params.shop,
      imageBytes: params.imageBytes,
      extension: params.extension,
    });
    return { ok: true, url };
  } catch (e) {
    logDetailedError(LOG_ROUTE, "uploadPictureTranslateSourceImageAndGetUrl", e);
    return { ok: false, reason: "blob_upload_failed" };
  }
}

async function translateWithVolc(params: {
  imageBytes: Buffer;
  route: PictureTranslateRouteOk;
}): Promise<
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: "volc_failed"; detail?: string }
> {
  const translated = await volcengineTranslateImageToBytes({
    imageBytes: params.imageBytes,
    targetLanguage: params.route.targetVolc,
  });
  if (!translated.ok) {
    return {
      ok: false,
      reason: "volc_failed",
      detail: `${translated.reasonCode}${translated.detail ? `: ${translated.detail}` : ""}`,
    };
  }
  return { ok: true, bytes: translated.bytes };
}

async function translateWithAidge(params: {
  shop: string;
  imageUrl?: string;
  imageBytes: Buffer;
  extension: string;
  route: PictureTranslateRouteOk;
}): Promise<
  | { ok: true; imageUrl: string }
  | { ok: false; reason: "aidge_failed" | "blob_upload_failed"; detail?: string }
> {
  const sourceUrl = await ensureSourceImageUrl({
    shop: params.shop,
    imageUrl: params.imageUrl,
    imageBytes: params.imageBytes,
    extension: params.extension,
  });
  if (!sourceUrl.ok) {
    return { ok: false, reason: "blob_upload_failed" };
  }

  const translated = await aidgeTranslateImageByUrl({
    imageUrl: sourceUrl.url,
    sourceLanguage: params.route.sourceAidge,
    targetLanguage: params.route.targetAidge,
    translatingTextInTheProduct: false,
  });

  if (!translated.ok) {
    return {
      ok: false,
      reason: "aidge_failed",
      detail: `${translated.reasonCode}${translated.detail ? `: ${translated.detail}` : ""}`,
    };
  }

  return { ok: true, imageUrl: translated.translatedImageUrl };
}

export async function executePictureTranslatePipeline(params: {
  requestId: string;
  shop: string;
  imageUrl?: string;
  imageBytes?: Buffer;
  sourceLanguage: string;
  targetLanguage: string;
  /** HTTP modelType：1 仅 Aidge，2 仅火山；不传则自动路由 */
  forceModelType?: 1 | 2;
}): Promise<PictureTranslateExecutorSuccess | PictureTranslateExecutorFailure> {
  const shop = params.shop.trim() || "unknown-shop";
  let imageBytes = params.imageBytes;

  if (!imageBytes) {
    if (!params.imageUrl?.trim()) {
      return { ok: false, reason: "image_fetch_failed" };
    }
    const fetched = await fetchSourceImageBytes(params.imageUrl.trim());
    if (!fetched.ok) {
      return { ok: false, reason: "image_fetch_failed", detail: fetched.detail };
    }
    imageBytes = fetched.bytes;
  }

  const extension = resolveExtension({
    imageUrl: params.imageUrl,
    imageBytes,
  });
  if (!extension) {
    return { ok: false, reason: "image_format_invalid" };
  }

  const routeResult = params.forceModelType
    ? resolvePictureTranslateProviderForced({
        modelType: params.forceModelType,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        imageExtensionLower: extension,
      })
    : resolvePictureTranslateProvider({
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        imageExtensionLower: extension,
      });

  if (!routeResult.ok) {
    console.info(
      `${LOG_ROUTE} requestId=${params.requestId} provider=none reason=${routeResult.reason} source=${params.sourceLanguage} target=${params.targetLanguage} ext=${extension}`,
    );
    return { ok: false, reason: routeResult.reason };
  }

  const route = routeResult;
  console.info(
    `${LOG_ROUTE} requestId=${params.requestId} provider=${route.provider} sourceVolc=${route.sourceVolc} targetVolc=${route.targetVolc} sourceAidge=${route.sourceAidge} targetAidge=${route.targetAidge} ext=${extension}`,
  );

  if (route.provider === "volc") {
    const volc = await translateWithVolc({ imageBytes, route });
    if (!volc.ok) {
      return {
        ok: false,
        reason: "volc_failed",
        detail: volc.detail,
        provider: "volc",
      };
    }
    try {
      const imageUrl = await uploadPictureTranslateJpegAndGetUrl({
        shop,
        jpegBytes: volc.bytes,
      });
      return { ok: true, imageUrl, provider: "volc" };
    } catch (e) {
      logDetailedError(
        `${LOG_ROUTE} requestId=${params.requestId}`,
        "uploadPictureTranslateJpegAndGetUrl",
        e,
      );
      return { ok: false, reason: "blob_upload_failed", provider: "volc" };
    }
  }

  const aidge = await translateWithAidge({
    shop,
    imageUrl: params.imageUrl,
    imageBytes,
    extension,
    route,
  });
  if (!aidge.ok) {
    return {
      ok: false,
      reason: aidge.reason === "blob_upload_failed" ? "blob_upload_failed" : "aidge_failed",
      detail: aidge.detail,
      provider: "aidge",
    };
  }

  const fetched = await fetchSourceImageBytes(aidge.imageUrl);
  if (fetched.ok) {
    try {
      const imageUrl = await uploadPictureTranslateJpegAndGetUrl({
        shop,
        jpegBytes: fetched.bytes,
      });
      return { ok: true, imageUrl, provider: "aidge" };
    } catch (e) {
      logDetailedError(
        `${LOG_ROUTE} requestId=${params.requestId}`,
        "aidge result blob upload",
        e,
      );
    }
  }

  if (/^https:\/\//i.test(aidge.imageUrl)) {
    return { ok: true, imageUrl: aidge.imageUrl, provider: "aidge" };
  }

  return {
    ok: false,
    reason: "aidge_failed",
    detail: "aidge_empty_image",
    provider: "aidge",
  };
}
