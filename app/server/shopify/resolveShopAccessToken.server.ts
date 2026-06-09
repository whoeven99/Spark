import prisma from "../../db.server";

/**
 * Worker 后台任务应使用 offline session token（长期有效）。
 * 在线 token 会过期，不适合写入 Cosmos 供 init/writeback/verify 长时间使用。
 */
export async function resolveShopAccessTokenForWorker(
  shop: string,
  onlineFallback?: string | null,
): Promise<string | null> {
  const normalizedShop = shop.trim();
  if (!normalizedShop) return null;

  const row = await prisma.session.findFirst({
    where: { shop: normalizedShop },
    orderBy: [{ isOnline: "asc" }, { updatedAt: "desc" }],
    select: { accessToken: true, expires: true },
  });

  const token = row?.accessToken?.trim();
  if (token && row) {
    if (!row.expires || row.expires > new Date()) {
      return token;
    }
  }

  const fallback = onlineFallback?.trim();
  return fallback || null;
}
