import type { Account } from "../../../generated/prisma";
import prisma from "../../../db.server";

export async function ensureAccount(shop: string): Promise<Account> {
  const existing = await prisma.account.findUnique({ where: { shop } });
  if (existing) return existing;
  try {
    return await prisma.account.create({ data: { shop } });
  } catch (error) {
    // 并发首建：另一请求已抢先写入，直接读回
    if ((error as { code?: string }).code === "P2002") {
      const created = await prisma.account.findUnique({ where: { shop } });
      if (created) return created;
    }
    throw error;
  }
}
