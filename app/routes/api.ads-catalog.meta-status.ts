import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkMetaCatalogStatusesForShop } from "../server/adsCatalog/metaCatalogStatusChecker.server";
import { summarizeProductStatusGroups } from "../server/adsCatalog/productStatusSummary.server";

/** 明细列表的分页上限；summary 不受它影响。 */
const DETAIL_LIMIT = 250;

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
  // 明细分页取样，计数走全量 groupBy：商品多于分页上限时不能用样本行数当总数。
  const [rows, groups] = await Promise.all([
    prisma.metaProductStatus.findMany({
      where: { shop },
      orderBy: { checkedAt: "desc" },
      take: DETAIL_LIMIT,
    }),
    prisma.metaProductStatus.groupBy({
      by: ["status"],
      where: { shop },
      _count: { _all: true },
    }),
  ]);
  const products = rows.map((r) => ({
    offerId: r.retailerId,
    title: r.title,
    status: r.status,
    issues: r.issues,
    checkedAt: r.checkedAt.toISOString(),
  }));
  const { total, approved, disapproved, pending } = summarizeProductStatusGroups(groups);
  return {
    summary: { total, approved, disapproved, pending },
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
