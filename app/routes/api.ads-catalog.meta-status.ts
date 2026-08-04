import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkMetaCatalogStatusesForShop } from "../server/adsCatalog/metaCatalogStatusChecker.server";

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
  const rows = await prisma.metaProductStatus.findMany({
    where: { shop },
    orderBy: { checkedAt: "desc" },
    take: 250,
  });
  const products = rows.map((r) => ({
    offerId: r.retailerId,
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const cached = await readCachedStatuses(session.shop);
  return Response.json({ ok: true, ...cached });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const { session } = await authenticate.admin(request);
  try {
    const result = await checkMetaCatalogStatusesForShop(session.shop);
    if (!result) {
      return Response.json(
        { ok: false, error: "尚未连接 Meta Catalog" },
        { status: 409 },
      );
    }
    const cached = await readCachedStatuses(session.shop);
    return Response.json({
      ok: true,
      accountRestricted: result.accountRestricted,
      ...cached,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
};
