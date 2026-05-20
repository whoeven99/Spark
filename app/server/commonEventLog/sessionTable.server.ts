import type { getSessionPrismaTableName } from "../../config/appEntry.server";
import prisma from "../../db.server";

type SessionTableName = ReturnType<typeof getSessionPrismaTableName>;

export async function deleteSessionsForShop(
  shop: string,
  tableName: SessionTableName,
): Promise<void> {
  if (tableName === "generateDescriptionSession") {
    await prisma.generateDescriptionSession.deleteMany({ where: { shop } });
    return;
  }
  await prisma.session.deleteMany({ where: { shop } });
}

export async function updateSessionScope(
  sessionId: string,
  scope: string,
  tableName: SessionTableName,
): Promise<void> {
  if (tableName === "generateDescriptionSession") {
    await prisma.generateDescriptionSession.update({
      where: { id: sessionId },
      data: { scope },
    });
    return;
  }
  await prisma.session.update({
    where: { id: sessionId },
    data: { scope },
  });
}
