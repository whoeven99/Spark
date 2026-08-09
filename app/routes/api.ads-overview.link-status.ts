/**
 * GMC ↔ Google Ads 关联探测。
 *
 * 关联状态只存在于 Google Ads 侧，库里没有镜像，所以洞察总览不能在 loader 里同步拿。
 * 这里单独暴露一个轻量入口，由页面挂载后异步调用，失败只降级为「未知」，不影响总览渲染。
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGoogleAdsCredential,
  getGoogleMerchantCredential,
} from "../server/adsCatalog/credentialStore.server";
import { getGoogleProductLinkStatus } from "../server/adsCatalog/googleProductLink.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [merchant, ads] = await Promise.all([
    getGoogleMerchantCredential(session.shop),
    getGoogleAdsCredential(session.shop),
  ]);
  if (!merchant || !ads) {
    return Response.json({ ok: true, state: null, reason: "requiresBoth" });
  }

  try {
    const status = await getGoogleProductLinkStatus(session.shop);
    return Response.json({
      ok: true,
      state: status.state,
      merchantId: status.merchantId,
      customerId: status.customerId,
      invitationStatus: status.invitationStatus ?? null,
      error: status.error ?? null,
    });
  } catch (error) {
    console.error("[AdsOverview] product link probe failed:", error);
    return Response.json({
      ok: false,
      state: null,
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
};
