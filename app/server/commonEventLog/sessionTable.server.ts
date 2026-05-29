import prisma from "../../db.server";

export async function deleteSessionsForShop(
  shop: string,
  appName?: string,
): Promise<void> {
  const where = appName ? { shop, appName } : { shop };
  await prisma.session.deleteMany({ where });
}

export async function updateSessionScope(
  sessionId: string,
  scope: string,
  appName?: string,
): Promise<void> {
  const where: any = { id: sessionId };
  if (appName) {
    where.appName = appName;
  }
  await prisma.session.update({
    where,
    data: { scope },
  });
}
