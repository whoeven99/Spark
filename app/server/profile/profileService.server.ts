import { getSessionPrismaTableName } from "../../config/appEntry.server";
import prisma from "../../db.server";
import type {
  ProfileFieldPatch,
  SessionFieldsRow,
  TokenFieldPatch,
} from "./profileTypes.server";

const LOG = "[ProfileService]";

const sessionSelect = {
  firstName: true,
  lastName: true,
  email: true,
  accessToken: true,
  refreshToken: true,
  refreshTokenExpires: true,
} as const;

export async function readSessionFields(
  shop: string,
  sessionId: string,
): Promise<SessionFieldsRow | null> {
  const normalizedShop = shop.trim();
  const normalizedId = sessionId.trim();
  if (!normalizedShop || !normalizedId) return null;

  const tableName = getSessionPrismaTableName();

  const byId =
    tableName === "generateDescriptionSession"
      ? await prisma.generateDescriptionSession.findUnique({
          where: { id: normalizedId },
          select: sessionSelect,
        })
      : await prisma.session.findUnique({
          where: { id: normalizedId },
          select: sessionSelect,
        });

  if (byId) return byId;

  const fallback =
    tableName === "generateDescriptionSession"
      ? await prisma.generateDescriptionSession.findFirst({
          where: { shop: normalizedShop },
          orderBy: { isOnline: "desc" },
          select: sessionSelect,
        })
      : await prisma.session.findFirst({
          where: { shop: normalizedShop },
          orderBy: { isOnline: "desc" },
          select: sessionSelect,
        });

  return fallback;
}

/** 同 shop 下所有 Session 行仅更新变化的名/邮箱字段。 */
export async function patchProfileByShop(
  shop: string,
  patch: ProfileFieldPatch,
): Promise<number> {
  const normalizedShop = shop.trim();
  if (!normalizedShop || Object.keys(patch).length === 0) return 0;

  const tableName = getSessionPrismaTableName();

  if (tableName === "generateDescriptionSession") {
    const result = await prisma.generateDescriptionSession.updateMany({
      where: { shop: normalizedShop },
      data: patch,
    });
    console.info(
      `${LOG} [DB] patch profile generateDescriptionSession shop=${normalizedShop} keys=${Object.keys(patch).join(",")} count=${result.count}`,
    );
    return result.count;
  }

  const result = await prisma.session.updateMany({
    where: { shop: normalizedShop },
    data: patch,
  });
  console.info(
    `${LOG} [DB] patch profile Session shop=${normalizedShop} keys=${Object.keys(patch).join(",")} count=${result.count}`,
  );
  return result.count;
}

/** 仅更新当前 session 行的 token 相关字段。 */
export async function patchBySessionId(
  sessionId: string,
  patch: TokenFieldPatch,
): Promise<void> {
  const normalizedId = sessionId.trim();
  if (!normalizedId || Object.keys(patch).length === 0) return;

  const tableName = getSessionPrismaTableName();

  if (tableName === "generateDescriptionSession") {
    await prisma.generateDescriptionSession.update({
      where: { id: normalizedId },
      data: patch,
    });
  } else {
    await prisma.session.update({
      where: { id: normalizedId },
      data: patch,
    });
  }

  console.info(
    `${LOG} [DB] patch token sessionId=${normalizedId} keys=${Object.keys(patch).join(",")}`,
  );
}
