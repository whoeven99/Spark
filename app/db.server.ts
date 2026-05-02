import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createRequire } from "node:module";
import path from "node:path";
import type { PrismaClient as PrismaClientType } from "./generated/prisma";

const require = createRequire(import.meta.url);
const prismaClientModulePath = path.resolve(process.cwd(), "app/generated/prisma");
const { PrismaClient } = (() => {
  try {
    return require(prismaClientModulePath) as {
      PrismaClient: typeof PrismaClientType;
    };
  } catch {
    // 本地开发兜底：从当前文件相对路径加载
    return require("./generated/prisma") as {
      PrismaClient: typeof PrismaClientType;
    };
  }
})();

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClientType | undefined;
}

function createTursoPrismaClient(): PrismaClientType {
  const target =
    process.env.TURSO_TARGET?.trim().toLowerCase() ||
    (process.env.NODE_ENV === "production" ? "prod" : "test");
  const isProd = target === "prod";

  const urlKey = isProd ? "TURSO_PROD_DATABASE_URL" : "TURSO_TEST_DATABASE_URL";
  const tokenKey = isProd ? "TURSO_PROD_AUTH_TOKEN" : "TURSO_TEST_AUTH_TOKEN";

  const url = process.env[urlKey]?.trim() || "";
  const authToken = process.env[tokenKey]?.trim() || "";

  if (!url.startsWith("libsql://")) {
    throw new Error(`请设置有效的 ${urlKey}，例如 "libsql://xxx.turso.io"`);
  }

  if (!authToken) {
    throw new Error(`请设置 ${tokenKey}`);
  }

  const adapter = new PrismaLibSQL({ url, authToken });
  return new PrismaClient({ adapter });
}

if (!global.prismaGlobal) {
  global.prismaGlobal = createTursoPrismaClient();
}

const prisma = global.prismaGlobal;

export default prisma;
