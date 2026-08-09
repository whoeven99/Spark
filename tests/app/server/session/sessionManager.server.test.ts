import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import prisma from "../../../../app/db.server";
import {
  deleteSessionsForShop,
  updateSessionScope,
} from "../../../../app/server/session/sessionManager.server";

// 显式 factory：automock 依赖枚举真实 PrismaClient 的 model 键，而测试环境下
// db.server 导出的是禁止真实查询的守卫对象，枚举不出 model。
vi.mock("../../../../app/db.server", () => ({ default: { session: {} } }));

describe("sessionManager.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteSessionsForShop", () => {
    it("should delete all sessions for shop", async () => {
      const mockDeleteMany = vi.fn().mockResolvedValue({ count: 5 });
      (prisma.session as any).deleteMany = mockDeleteMany;

      await deleteSessionsForShop("test.myshopify.com");

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { shop: "test.myshopify.com" },
      });
    });
  });

  describe("updateSessionScope", () => {
    it("should update session scope for specific session", async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ id: "session123" });
      (prisma.session as any).update = mockUpdate;

      await updateSessionScope("session123", "read_products,write_products");

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "session123" },
        data: { scope: "read_products,write_products" },
      });
    });
  });
});
