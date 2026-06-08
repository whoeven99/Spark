import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import prisma from "../../../../app/db.server";
import {
  deleteSessionsForShop,
  updateSessionScope,
} from "../../../../app/server/session/sessionManager.server";

vi.mock("../../../../app/db.server");

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
