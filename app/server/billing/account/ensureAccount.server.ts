import type { Account } from "../../../generated/prisma";
import prisma from "../../../db.server";

export async function ensureAccount(shop: string): Promise<Account> {
  return prisma.account.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}
