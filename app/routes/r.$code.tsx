import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { buildReferralInstallCookie } from "../server/billing/promo/referralCookie.server";
import { isActiveReferralCode } from "../server/billing/promo/referralInstall.server";
import {
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "../server/billing/promo/referralCodeFormat";

function shopifyInstallUrl(): string | null {
  const clientId = process.env.SHOPIFY_API_KEY?.trim();
  if (!clientId) return null;
  return `https://admin.shopify.com/oauth/install?client_id=${encodeURIComponent(clientId)}`;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const code = normalizeReferralCode(params.code ?? "");
  if (!isValidReferralCodeFormat(code) || !(await isActiveReferralCode(code))) {
    throw new Response("推荐码无效或已停用", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const installUrl = shopifyInstallUrl();
  if (!installUrl) {
    throw new Response("应用未配置安装入口", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return redirect(installUrl, {
    headers: {
      "Set-Cookie": buildReferralInstallCookie(code),
    },
  });
};

export default function ReferralInstallRedirect() {
  return null;
}
