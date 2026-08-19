// 远程 Turso 走 HTTP 客户端，避免 Windows 上 libsql 原生 .node 依赖 VC++ 运行库
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import path from "node:path";
import type { PrismaClient as PrismaClientType } from "./generated/prisma";
import { ensureRuntimeEnv, describeTursoEnvKeys } from "./config/runtimeEnv.server";
import { readTursoCredentials } from "./config/tursoTarget.server";

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
  const { url, authToken, urlKey, tokenKey } = readTursoCredentials();

  if (!url.startsWith("libsql://")) {
    throw new Error(
      [
        `请设置有效的 ${urlKey}，例如 "libsql://xxx.turso.io"。`,
        describeTursoEnvKeys(),
        "Render：在 Web Service → Environment 添加变量，或使用 Secret File 挂载到 /etc/secrets/.env。",
      ].join(" "),
    );
  }

  if (!authToken) {
    throw new Error(`请设置 ${tokenKey}。${describeTursoEnvKeys()}`);
  }

  console.info(`[Turso] Prisma host=${tursoUrlHost(url)}`);

  const adapter = new PrismaLibSQL({ url, authToken });
  return new PrismaClient({ adapter });
}

/**
 * Vitest 下不连真库：任何未被 mock 的查询立刻抛出可操作的错误，
 * 而不是打到真实 Turso 后表现为并行跑时的间歇超时。
 */
function createTestGuardPrismaClient(): PrismaClientType {
  const guard = (model: string, action: string) => () => {
    throw new Error(
      `[db.server] 测试中触达了真实数据库（prisma.${model}.${action}）。` +
        `请在该测试文件顶部 vi.mock("~/db.server", ...) 或 mock 调用它的模块。`,
    );
  };
  return new Proxy(
    {},
    {
      get(_target, model: string) {
        if (model === "then" || model === "$connect" || model === "$disconnect") {
          return undefined;
        }
        return new Proxy({}, { get: (_t, action: string) => guard(model, action) });
      },
    },
  ) as PrismaClientType;
}

if (!global.prismaGlobal) {
  global.prismaGlobal = process.env.VITEST
    ? createTestGuardPrismaClient()
    : createTursoPrismaClient();
}

const prisma = global.prismaGlobal;

export default prisma;
