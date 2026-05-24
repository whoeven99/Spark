import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import prisma from "../../../../app/db.server";
import {
  ensureSessionAppName,
  deleteSessionsForShop,
  updateSessionScope,
} from "../../../../app/server/session/sessionManager.server";

vi.mock("../../../../app/db.server");
vi.mock("../../../../app/config/appEntry.server", () => ({
  getAppEntry: () => "chat",
}));

describe("sessionManager.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureSessionAppName", () => {
    it("should update session appName if it differs from current app", async () => {
      const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      (prisma.session as any).updateMany = mockUpdateMany;

      await ensureSessionAppName("session123", "chat");

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: "session123", appName: { not: "chat" } },
        data: { appName: "chat" },
      });
    });

    it("should use default appName when not provided", async () => {
      const mockUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
      (prisma.session as any).updateMany = mockUpdateMany;

      await ensureSessionAppName("session123");

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: "session123", appName: { not: "chat" } },
        data: { appName: "chat" },
      });
    });
  });

  describe("deleteSessionsForShop", () => {
    it("should delete all sessions for shop when appName is not provided", async () => {
      const mockDeleteMany = vi.fn().mockResolvedValue({ count: 5 });
      (prisma.session as any).deleteMany = mockDeleteMany;

      await deleteSessionsForShop("test.myshopify.com");

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { shop: "test.myshopify.com" },
      });
    });

    it("should delete only sessions for specific app when appName is provided", async () => {
      const mockDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
      (prisma.session as any).deleteMany = mockDeleteMany;

      await deleteSessionsForShop("test.myshopify.com", "product-improve");

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { shop: "test.myshopify.com", appName: "product-improve" },
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

    it("should update session scope with appName filter when provided", async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ id: "session123" });
      (prisma.session as any).update = mockUpdate;

      await updateSessionScope(
        "session123",
        "read_products",
        "product-improve"
      );

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "session123", appName: "product-improve" },
        data: { scope: "read_products" },
      });
    });
  });
});
