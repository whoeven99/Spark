// 远程 Turso 走 HTTP 客户端，避免 Windows 上 libsql 原生 .node 依赖 VC++ 运行库
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import path from "node:path";
import type { PrismaClient as PrismaClientType } from "./generated/prisma";
import { ensureRuntimeEnv, describeTursoEnvKeys } from "./config/runtimeEnv.server";
import {
  readTursoCredentials,
  resolveTursoTarget,
} from "./config/tursoTarget.server";

// 最早执行：支持本地 .env 与 Render Secret File（/etc/secrets/.env 等）
ensureRuntimeEnv();

const require = createRequire(import.meta.url);
const prismaClientModulePath = path.resolve(process.cwd(), "app/generated/prisma");
const { PrismaClient } = (() => {
  try {
    return require(prismaClientModulePath) as {
      PrismaClient: typeof PrismaClientType;
    };
  } catch {
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
        describeTursoEnvKeys(),
        "Render：在 Web Service → Environment 添加变量，或使用 Secret File 挂载到 /etc/secrets/.env。",
      ].join(" "),
    );
  }

  if (!authToken) {
    throw new Error(
      `请设置 ${tokenKey}（当前库=${target}）。${describeTursoEnvKeys()}`,
    );
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
