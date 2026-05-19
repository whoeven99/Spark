import type { Account } from "../../../generated/prisma";
import prisma from "../../../db.server";

export async function ensureAccount(
  shop: string,
  appName: string,
): Promise<Account> {
  return prisma.account.upsert({
    where: { shop_appName: { shop, appName } },
    create: { shop, appName },
    update: {},
  });
}
