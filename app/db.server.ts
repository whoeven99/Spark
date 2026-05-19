import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createRequire } from "node:module";
import path from "node:path";
import type { PrismaClient as PrismaClientType } from "./generated/prisma";
import {
  getTursoEnvKeys,
  resolveTursoTarget,
} from "./config/tursoTarget.server";

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
  const target = resolveTursoTarget();
  const { urlKey, tokenKey } = getTursoEnvKeys(target);

  const url = process.env[urlKey]?.trim() || "";
  const authToken = process.env[tokenKey]?.trim() || "";

  if (!url.startsWith("libsql://")) {
    const hint =
      target === "prod" && !process.env.TURSO_TARGET?.trim()
        ? " 若仅为测试环境，请配置 TURSO_TEST_DATABASE_URL / TURSO_TEST_AUTH_TOKEN，或设置 TURSO_TARGET=test。"
        : "";
    throw new Error(`请设置有效的 ${urlKey}，例如 "libsql://xxx.turso.io"。${hint}`);
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
