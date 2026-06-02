import { getAppEntry } from "../../config/appEntry.server";
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
  shopOwnerName: string | null;
};

function mapRow(row: SessionRow): UninstallSessionSnapshot {
  let firstName = row.firstName?.trim() || undefined;
  let lastName = row.lastName?.trim() || undefined;

  // 当 Session.firstName 为空时，从 shopOwnerName 解析（如 "John Doe" → firstName="John"）
  if (!firstName && row.shopOwnerName?.trim()) {
    const parts = row.shopOwnerName.trim().split(/\s+/);
    firstName = parts[0];
    lastName = lastName ?? (parts.slice(1).join(" ") || undefined);
  }

  return {
    shop: row.shop,
    firstName,
    lastName,
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

  const appName = getAppEntry();
  const select = {
    shop: true,
    firstName: true,
    lastName: true,
    email: true,
    locale: true,
    shopOwnerName: true,
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
      where: { shop: normalizedShop, appName },
      orderBy: { isOnline: "asc" },
      select,
    });
  }

  if (!row) {
    console.warn(
      `${LOG} no session found shop=${normalizedShop} sessionId=${sessionId ?? "(none)"} appName=${appName}`,
    );
    return null;
  }

  return mapRow(row);
}
