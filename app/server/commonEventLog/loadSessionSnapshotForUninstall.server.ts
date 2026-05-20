import { getSessionPrismaTableName } from "../../config/appEntry.server";
import prisma from "../../db.server";

const LOG = "[SessionSnapshot]";

export type UninstallSessionSnapshot = {
  shop: string;
  firstName?: string;
  /** 对应 second_name / 姓 */
  lastName?: string;
  email?: string;
};

type SessionRow = {
  shop: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

function mapRow(row: SessionRow): UninstallSessionSnapshot {
  return {
    shop: row.shop,
    firstName: row.firstName?.trim() || undefined,
    lastName: row.lastName?.trim() || undefined,
    email: row.email?.trim() || undefined,
  };
}

/**
 * 卸载前从 Session 表读取运营邮件 enrichment（卸载后 Shopify token 已失效，不可调 GraphQL）。
 */
export async function loadSessionSnapshotForUninstall(
  shop: string,
  sessionId?: string,
): Promise<UninstallSessionSnapshot | null> {
  const normalizedShop = shop.trim();
  if (!normalizedShop) return null;

  const tableName = getSessionPrismaTableName();
  const select = { shop: true, firstName: true, lastName: true, email: true } as const;

  let row: SessionRow | null = null;

  if (sessionId?.trim()) {
    const byId =
      tableName === "generateDescriptionSession"
        ? await prisma.generateDescriptionSession.findUnique({
            where: { id: sessionId.trim() },
            select,
          })
        : await prisma.session.findUnique({
            where: { id: sessionId.trim() },
            select,
          });
    if (byId && byId.shop === normalizedShop) {
      row = byId;
    }
  }

  if (!row) {
    row =
      tableName === "generateDescriptionSession"
        ? await prisma.generateDescriptionSession.findFirst({
            where: { shop: normalizedShop },
            orderBy: { isOnline: "asc" },
            select,
          })
        : await prisma.session.findFirst({
            where: { shop: normalizedShop },
            orderBy: { isOnline: "asc" },
            select,
          });
  }

  if (!row) {
    console.warn(
      `${LOG} no session found shop=${normalizedShop} sessionId=${sessionId ?? "(none)"} table=${tableName}`,
    );
    return null;
  }

  return mapRow(row);
}
