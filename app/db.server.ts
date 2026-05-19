import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createRequire } from "node:module";
import path from "node:path";
import type { PrismaClient as PrismaClientType } from "./generated/prisma";
import {
  readTursoCredentials,
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

function tursoUrlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid-url)";
  }
}

function createTursoPrismaClient(): PrismaClientType {
  const target = resolveTursoTarget();
  const { url, authToken, urlKey, tokenKey } = readTursoCredentials(target);

  if (!url.startsWith("libsql://")) {
    const explicitTarget = process.env.TURSO_TARGET?.trim();
    throw new Error(
      [
        `请设置有效的 ${urlKey}，例如 "libsql://xxx.turso.io"。`,
        `当前解析: TURSO_TARGET=${explicitTarget || "(未设置)"} → 库=${target}。`,
        "Render Test 请配置 TURSO_TEST_DATABASE_URL / TURSO_TEST_AUTH_TOKEN，并设置 TURSO_TARGET=test；",
        "勿在 Test 服务保留占位符 TURSO_PROD_*（如 your-prod-db）。",
      ].join(" "),
    );
  }

  if (!authToken) {
    throw new Error(`请设置 ${tokenKey}（当前库=${target}）。`);
  }

  console.info(
    `[Turso] Prisma 使用 ${target} 库 host=${tursoUrlHost(url)} (TURSO_TARGET=${process.env.TURSO_TARGET?.trim() || "未设置"})`,
  );

  const adapter = new PrismaLibSQL({ url, authToken });
  return new PrismaClient({ adapter });
}

if (!global.prismaGlobal) {
  global.prismaGlobal = createTursoPrismaClient();
}

const prisma = global.prismaGlobal;

export default prisma;
