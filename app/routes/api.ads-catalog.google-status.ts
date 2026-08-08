import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkGmcProductStatusesForShop } from "../server/adsCatalog/gmcStatusChecker.server";
import {
  getGoogleAdsCredential,
} from "../server/adsCatalog/credentialStore.server";
import {
  ensureGoogleProductLink,
  getGoogleProductLinkStatus,
} from "../server/adsCatalog/googleProductLink.server";

interface StatusRow {
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
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
    contentLanguage: r.contentLanguage,
    feedLabel: r.feedLabel,
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
  state: "not_linked" | "pending" | "linked" | "failed" | null;
  merchantId?: string;
  error?: string;
}> {
  const ads = await getGoogleAdsCredential(shop);
  if (!ads) return { bound: false, customerId: null, state: null };
  const status = await getGoogleProductLinkStatus(shop).catch(() => null);
  return {
    bound: true,
    customerId: ads.customerId,
    state: status?.state ?? null,
    merchantId: status?.merchantId,
    error: status?.error,
  };
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
    const body = (await request.json().catch(() => ({}))) as { operation?: string };
    if (body.operation === "ensure_link") {
      return Response.json({
        ok: true,
        adsLink: await ensureGoogleProductLink(session.shop),
      });
    }
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
