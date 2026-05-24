import prisma from "../../db.server";
import { getAppEntry } from "../../config/appEntry.server";

/**
 * 确保 Session 的 appName 字段与当前 APP_ENTRY 一致。
 * 用于在 app.tsx loader 中调用，防止 session 在不同 app 间污染。
 */
export async function ensureSessionAppName(
  sessionId: string,
  appName: string = getAppEntry(),
): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, appName: { not: appName } },
    data: { appName },
  });
}

/**
 * 删除指定店铺的 session（可选择特定 app）。
 */
export async function deleteSessionsForShop(
  shop: string,
  appName?: string,
): Promise<void> {
  const where = appName ? { shop, appName } : { shop };
  await prisma.session.deleteMany({ where });
}

/**
 * 更新 session 的 scope（可选择特定 app）。
 */
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
