import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkGmcProductStatusesForShop } from "../server/adsCatalog/gmcStatusChecker.server";
import {
  getGoogleAdsCredential,
  getGoogleMerchantCredential,
} from "../server/adsCatalog/credentialStore.server";
import {
  getGoogleAdsDeveloperToken,
  getMerchantCenterLinkStatus,
} from "../server/adsCatalog/googleOAuth.server";

interface StatusRow {
  offerId: string;
  title: string | null;
  status: string;
  issues: unknown;
  checkedAt: string;
}

async function readCachedStatuses(shop: string): Promise<{
  summary: { approved: number; disapproved: number; pending: number; total: number };
  products: StatusRow[];
  lastCheckedAt: string | null;
}> {
  const rows = await prisma.gmcProductStatus.findMany({
    where: { shop },
    orderBy: { checkedAt: "desc" },
    take: 250,
  });
  const products = rows.map((r) => ({
    offerId: r.offerId,
    title: r.title,
    status: r.status,
    issues: r.issues,
    checkedAt: r.checkedAt.toISOString(),
  }));
  return {
    summary: {
      total: products.length,
      approved: products.filter((p) => p.status === "approved").length,
      disapproved: products.filter((p) => p.status === "disapproved").length,
      pending: products.filter((p) => p.status === "pending").length,
    },
    products,
    lastCheckedAt: rows[0]?.checkedAt.toISOString() ?? null,
  };
}

async function readAdsLink(shop: string): Promise<{
  bound: boolean;
  customerId: string | null;
  linked: boolean | null;
}> {
  const [gmc, ads] = await Promise.all([
    getGoogleMerchantCredential(shop),
    getGoogleAdsCredential(shop),
  ]);
  if (!ads) return { bound: false, customerId: null, linked: null };
  let linked: boolean | null = null;
  const developerToken = getGoogleAdsDeveloperToken();
  if (developerToken && gmc) {
    try {
      const status = await getMerchantCenterLinkStatus({
        accessToken: ads.accessToken,
        developerToken,
        customerId: ads.customerId,
        loginCustomerId: ads.loginCustomerId ?? ads.customerId,
        merchantId: gmc.merchantId,
      });
      linked = status.linked;
    } catch {
      linked = null;
    }
  }
  return { bound: true, customerId: ads.customerId, linked };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [cached, adsLink] = await Promise.all([
    readCachedStatuses(session.shop),
    readAdsLink(session.shop),
  ]);
  return Response.json({ ok: true, ...cached, adsLink });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  try {
    const result = await checkGmcProductStatusesForShop(session.shop);
    if (!result) {
      return Response.json(
        { ok: false, error: "尚未连接 Google Merchant Center" },
        { status: 409 },
      );
    }
    const cached = await readCachedStatuses(session.shop);
    return Response.json({
      ok: true,
      accountSuspended: result.accountSuspended,
      ...cached,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
};
