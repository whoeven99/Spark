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
  var prismaGlobal: PrismaClientType;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
