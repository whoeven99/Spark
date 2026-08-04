import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getTiktokAdsInsightsCredential } from "../server/adsCatalog/credentialStore.server";
import {
  uploadAdImageByUrl,
  uploadAdVideoByUrl,
} from "../server/adsCreate/tiktokAdsApi.server";

type UploadBody = {
  kind?: "image" | "video";
  url?: string;
};

/**
 * POST /api/ads-create/tiktok-upload
 * body: { kind: "image"|"video", url: string }
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data({ ok: false as const, errorMsg: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let body: UploadBody;
  try {
    body = (await request.json()) as UploadBody;
  } catch {
    return data({ ok: false as const, errorMsg: "请求格式错误" }, { status: 400 });
  }

  const kind = body.kind;
  const url = String(body.url ?? "").trim();
  if (kind !== "image" && kind !== "video") {
    return data({ ok: false as const, errorMsg: "kind 必须为 image 或 video" }, { status: 400 });
  }
  if (!url) {
    return data({ ok: false as const, errorMsg: "url 不能为空" }, { status: 400 });
  }

  const cred = await getTiktokAdsInsightsCredential(shop);
  if (!cred) {
    return data(
      { ok: false as const, errorMsg: "TikTok 广告主账户未连接" },
      { status: 400 },
    );
  }

  try {
    if (kind === "image") {
      const imageId = await uploadAdImageByUrl({
        accessToken: cred.accessToken,
        advertiserId: cred.advertiserId,
        imageUrl: url,
      });
      return data({ ok: true as const, kind, assetId: imageId });
    }
    const videoId = await uploadAdVideoByUrl({
      accessToken: cred.accessToken,
      advertiserId: cred.advertiserId,
      videoUrl: url,
    });
    return data({ ok: true as const, kind, assetId: videoId });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "素材上传失败";
    return data({ ok: false as const, errorMsg }, { status: 500 });
  }
};
