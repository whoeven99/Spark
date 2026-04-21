import { createRequire } from "node:module";
import type { PrismaClient as PrismaClientType } from "./generated/prisma";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("./generated/prisma") as {
  PrismaClient: typeof PrismaClientType;
};

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
