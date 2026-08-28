import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../app/db.server", () => ({
  default: {
    appSubscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    accountPeriodUsage: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../../../app/server/billing/plans/planCatalog.server", () => ({
  getPlanByKey: vi.fn(),
}));

vi.mock(
  "../../../../../app/server/notifications/notifyMerchant.server",
  () => ({
    notifySubscriptionEmail: vi.fn(),
  }),
);

import prisma from "../../../../../app/db.server";
import { handleDeclinedSubscriptionCheckout } from "../../../../../app/server/billing/subscription/pendingPlanChange.server";
import { markSubscriptionNonActive } from "../../../../../app/server/billing/subscription/activateSubscription.server";
import { APP_SUBSCRIPTION_STATUS } from "../../../../../app/server/billing/types.server";

const shop = "decline-test.myshopify.com";

describe("handleDeclinedSubscriptionCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("换套餐 DECLINED → 清 pending，保留主 ACTIVE", async () => {
    vi.mocked(prisma.appSubscription.findUnique).mockResolvedValue({
      id: "sub-1",
      shop,
      status: APP_SUBSCRIPTION_STATUS.ACTIVE,
      shopifySubscriptionId: "gid://old",
      pendingShopifySubscriptionId: "gid://new",
      pendingPlanKey: "pro_monthly",
      pendingConfirmationUrl: "https://example.com/confirm",
      pendingCreatedAt: new Date(),
    } as never);
    vi.mocked(prisma.appSubscription.update).mockResolvedValue({} as never);

    const result = await handleDeclinedSubscriptionCheckout({
      shop,
      shopifySubscriptionId: "gid://new",
    });

    expect(result).toBe("cleared_pending");
    expect(prisma.appSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: {
        pendingShopifySubscriptionId: null,
        pendingPlanKey: null,
        pendingConfirmationUrl: null,
        pendingCreatedAt: null,
      },
    });
    expect(prisma.appSubscription.delete).not.toHaveBeenCalled();
  });

  it("首次 PENDING DECLINED → 删行且不走 transaction 扣额度", async () => {
    vi.mocked(prisma.appSubscription.findUnique).mockResolvedValue({
      id: "sub-2",
      shop,
      status: APP_SUBSCRIPTION_STATUS.PENDING,
      shopifySubscriptionId: "gid://first",
      pendingShopifySubscriptionId: null,
    } as never);
    vi.mocked(prisma.accountPeriodUsage.deleteMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.appSubscription.delete).mockResolvedValue({} as never);

    const result = await handleDeclinedSubscriptionCheckout({
      shop,
      shopifySubscriptionId: "gid://first",
    });

    expect(result).toBe("cleared_first");
    expect(prisma.appSubscription.delete).toHaveBeenCalledWith({
      where: { id: "sub-2" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("markSubscriptionNonActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("旧 GID 与主行不符 → no-op（换套餐 swap 后）", async () => {
    vi.mocked(prisma.appSubscription.findFirst).mockResolvedValue(null);

    await markSubscriptionNonActive({
      shop,
      shopifySubscriptionId: "gid://old-cancelled",
      status: APP_SUBSCRIPTION_STATUS.CANCELLED,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("主行 CANCELLED 但有 pending → 跳过删行", async () => {
    vi.mocked(prisma.appSubscription.findFirst).mockResolvedValue({
      id: "sub-3",
      shop,
      shopifySubscriptionId: "gid://main",
      pendingShopifySubscriptionId: "gid://pending",
      tokensPerPeriod: 100_000,
      planKey: "base_monthly",
    } as never);

    await markSubscriptionNonActive({
      shop,
      shopifySubscriptionId: "gid://main",
      status: APP_SUBSCRIPTION_STATUS.CANCELLED,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
