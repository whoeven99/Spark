import prisma from "../../db.server";

/**
 * 删除指定店铺的所有 session。
 */
export async function deleteSessionsForShop(shop: string): Promise<void> {
  await prisma.session.deleteMany({ where: { shop } });
}

/**
 * 更新 session 的 scope。
 */
export async function updateSessionScope(
  sessionId: string,
  scope: string,
): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { scope },
  });
}
