import prisma from "../../db.server";

const LOG = "[SessionSnapshot]";

export type UninstallSessionSnapshot = {
  shop: string;
  firstName?: string;
  /** 对应 second_name / 姓 */
  lastName?: string;
  email?: string;
  locale?: string;
};

type SessionRow = {
  shop: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  locale: string | null;
};

function mapRow(row: SessionRow): UninstallSessionSnapshot {
  return {
    shop: row.shop,
    firstName: row.firstName?.trim() || undefined,
    lastName: row.lastName?.trim() || undefined,
    email: row.email?.trim() || undefined,
    locale: row.locale?.trim() || undefined,
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

  const select = {
    shop: true,
    firstName: true,
    lastName: true,
    email: true,
    locale: true,
  } as const;

  let row: SessionRow | null = null;

  if (sessionId?.trim()) {
    const byId = await prisma.session.findUnique({
      where: { id: sessionId.trim() },
      select,
    });
    if (byId && byId.shop === normalizedShop) {
      row = byId;
    }
  }

  if (!row) {
    row = await prisma.session.findFirst({
      where: { shop: normalizedShop },
      orderBy: { isOnline: "asc" },
      select,
    });
  }

  if (!row) {
    console.warn(
      `${LOG} no session found shop=${normalizedShop} sessionId=${sessionId ?? "(none)"}`,
    );
    return null;
  }

  return mapRow(row);
}
