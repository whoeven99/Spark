import prisma from "../../db.server";

export async function deleteSessionsForShop(shop: string): Promise<void> {
  await prisma.session.deleteMany({ where: { shop } });
}

export async function updateSessionScope(
  sessionId: string,
  scope: string,
): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { scope },
  });
}
