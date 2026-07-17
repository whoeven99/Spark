import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getTiktokAdsInsightsCredential } from "../server/adsCatalog/credentialStore.server";
import {
  listTiktokIdentities,
  listTiktokIdentityVideos,
} from "../server/adsCreate/tiktokAdsApi.server";

/**
 * GET /api/ads-create/tiktok-identities
 * 可选 query: identityId + identityType → 同时返回该身份下的 Spark 帖子列表。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const identityId = (url.searchParams.get("identityId") || "").trim();
  const identityType = (url.searchParams.get("identityType") || "").trim();

  const cred = await getTiktokAdsInsightsCredential(shop);
  if (!cred) {
    return data(
      { ok: false as const, errorMsg: "TikTok 广告主账户未连接", identities: [], videos: [] },
      { status: 400 },
    );
  }

  try {
    const identities = await listTiktokIdentities({
      accessToken: cred.accessToken,
      advertiserId: cred.advertiserId,
    });

    let videos: Array<{ itemId: string; title?: string }> = [];
    if (identityId && identityType) {
      videos = await listTiktokIdentityVideos({
        accessToken: cred.accessToken,
        advertiserId: cred.advertiserId,
        identityId,
        identityType,
      });
    }

    return data({ ok: true as const, identities, videos });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "加载 Identity 失败";
    return data(
      { ok: false as const, errorMsg, identities: [], videos: [] },
      { status: 500 },
    );
  }
};
