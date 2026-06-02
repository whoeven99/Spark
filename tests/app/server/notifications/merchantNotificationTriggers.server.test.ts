import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../app/db.server";
import { recordAppInstalled } from "../../../../app/server/commonEventLog/recordAppInstalled.server";
import { handleAppUninstalled } from "../../../../app/server/commonEventLog/handleAppUninstalled.server";
import { appendCommonEventLog } from "../../../../app/server/commonEventLog/appendCommonEventLog.server";
import { onAppUninstalled } from "../../../../app/server/appLifecycle/onAppUninstalled.server";
import { applyTokenPackPurchase } from "../../../../app/server/billing/purchase/applyTokenPack.server";
import {
  applyActiveSubscription,
  markSubscriptionNonActive,
} from "../../../../app/server/billing/subscription/activateSubscription.server";
import { archivePeriodAndRenew } from "../../../../app/server/billing/subscription/renewal.server";
import { appendBillingLog } from "../../../../app/server/billing/billingLog.server";
import { ensureAccount } from "../../../../app/server/billing/account/ensureAccount.server";
import { getPlanByKey } from "../../../../app/server/billing/plans/planCatalog.server";
import {
  notifyAppInstalledEmail,
  notifyAppUninstalledEmail,
  notifyPurchaseCreatedEmail,
  notifySubscriptionEmail,
} from "../../../../app/server/notifications/notifyMerchant.server";
import { APP_SUBSCRIPTION_STATUS, PLAN_CATALOG_KIND } from "../../../../app/server/billing/types.server";

vi.mock("../../../../app/db.server", () => ({
  default: {
    commonEventLog: { findFirst: vi.fn() },
    billingLog: { findFirst: vi.fn(), create: vi.fn() },
    account: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    appSubscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    accountPeriodUsage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../../app/config/appEntry.server", () => ({
  getAppEntry: () => "generate-description",
}));

vi.mock("../../../../app/server/commonEventLog/appendCommonEventLog.server", () => ({
  appendCommonEventLog: vi.fn().mockResolvedValue({ created: true }),
}));

vi.mock("../../../../app/server/commonEventLog/handleAppUninstalled.server", () => ({
  handleAppUninstalled: vi.fn().mockResolvedValue(undefined),
  buildUninstallEventReferenceId: vi.fn().mockReturnValue("uninstall:webhook:test"),
}));

vi.mock("../../../../app/server/commonEventLog/loadSessionSnapshotForUninstall.server", () => ({
  loadSessionSnapshotForUninstall: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../../app/server/billing/account/ensureAccount.server", () => ({
  ensureAccount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../app/server/billing/billingLog.server", () => ({
  appendBillingLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../app/server/billing/plans/planCatalog.server", () => ({
  getPlanByKey: vi.fn(),
}));

vi.mock("../../../../app/server/billing/subscription/renewal.server", () => ({
  archivePeriodAndRenew: vi.fn().mockResolvedValue(undefined),
  isSubscriptionRenewal: vi.fn((previous, nextPeriodEnd) => {
    if (!previous?.currentPeriodEnd || !nextPeriodEnd) return false;
    if (previous.status !== "ACTIVE") return false;
    return nextPeriodEnd.getTime() > previous.currentPeriodEnd.getTime();
  }),
}));

vi.mock("../../../../app/server/feishu/scenarios/sendUninstallFeishuNotify.server", () => ({
  sendUninstallFeishuNotify: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../../../app/server/feishu/scenarios/sendTokenPackFeishuNotify.server", () => ({
  sendTokenPackFeishuNotify: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../../../app/server/feishu/scenarios/sendSubscriptionFeishuNotify.server", () => ({
  sendSubscriptionFeishuNotify: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../../../app/server/partner/fetchUninstallFeedbackFromPartner.server", () => ({
  fetchUninstallFeedbackFromPartner: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../../app/server/notifications/notifyMerchant.server", () => ({
  notifyAppInstalledEmail: vi.fn().mockResolvedValue(undefined),
  notifyAppUninstalledEmail: vi.fn().mockResolvedValue(undefined),
  notifyPurchaseCreatedEmail: vi.fn().mockResolvedValue(undefined),
  notifySubscriptionEmail: vi.fn().mockResolvedValue(undefined),
}));

const SHOP = "demo.myshopify.com";
const APP_NAME = "generate-description";

const samplePlan = {
  planKey: "token-pack-10k",
  appName: APP_NAME,
  kind: PLAN_CATALOG_KIND.ONE_TIME_PACK,
  billingInterval: null,
  displayName: "10K Tokens",
  priceAmount: "9.99",
  currencyCode: "USD",
  tokens: 10_000,
  trialDays: null,
  shopifyPlanName: null,
};

describe("merchant notification triggers", () => {
  const mockAccount = {
    id: "acct-1",
    shop: SHOP,
    appName: APP_NAME,
    subscriptionTokens: 500_000,
    purchasedTokens: 0,
    trialTokens: 0,
    usedTokens: 0,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPlanByKey).mockImplementation(async (key: string) => ({
      ...samplePlan,
      planKey: key,
      displayName: `Plan ${key}`,
      kind: PLAN_CATALOG_KIND.SUBSCRIPTION,
      billingInterval: "EVERY_30_DAYS",
    }));
    vi.mocked(prisma.account.findUniqueOrThrow).mockResolvedValue(mockAccount as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue(mockAccount as never);
  });

  describe("recordAppInstalled", () => {
    it("skips email when log shows app still installed", async () => {
      vi.mocked(prisma.commonEventLog.findFirst)
        .mockResolvedValueOnce({
          createdAt: new Date("2026-05-20T10:00:00.000Z"),
        } as never)
        .mockResolvedValueOnce(null);

      const recorded = await recordAppInstalled({
        shop: SHOP,
        sessionId: "offline_demo",
        source: "test",
      });

      expect(recorded).toBe(false);
      expect(appendCommonEventLog).not.toHaveBeenCalled();
      expect(notifyAppInstalledEmail).not.toHaveBeenCalled();
    });

    it("sends appInstalled email once on first install", async () => {
      vi.mocked(prisma.commonEventLog.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const recorded = await recordAppInstalled({
        shop: SHOP,
        sessionId: "offline_demo",
        source: "test",
      });

      expect(recorded).toBe(true);
      expect(appendCommonEventLog).toHaveBeenCalledOnce();
      expect(notifyAppInstalledEmail).toHaveBeenCalledOnce();
      expect(notifyAppInstalledEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          shop: SHOP,
          appName: APP_NAME,
          sessionId: "offline_demo",
        }),
      );
    });
  });

  describe("onAppUninstalled", () => {
    const uninstallParams = {
      shop: SHOP,
      topic: "app/uninstalled",
      payload: {},
      sessionId: "offline_demo",
      appName: APP_NAME,
      uninstalledAt: new Date("2026-05-21T10:00:00.000Z"),
    };

    it("skips email on dedup but still persists", async () => {
      vi.mocked(appendCommonEventLog).mockResolvedValueOnce({ created: false });

      await onAppUninstalled(uninstallParams);

      expect(notifyAppUninstalledEmail).not.toHaveBeenCalled();
      expect(handleAppUninstalled).toHaveBeenCalledOnce();
    });

    it("sends uninstall email before session persistence", async () => {
      vi.mocked(appendCommonEventLog).mockResolvedValueOnce({ created: true });
      const callOrder: string[] = [];
      vi.mocked(notifyAppUninstalledEmail).mockImplementation(async () => {
        callOrder.push("email");
      });
      vi.mocked(handleAppUninstalled).mockImplementation(async () => {
        callOrder.push("persist");
      });

      await onAppUninstalled(uninstallParams);

      expect(notifyAppUninstalledEmail).toHaveBeenCalledOnce();
      expect(handleAppUninstalled).toHaveBeenCalledOnce();
      expect(callOrder).toEqual(["email", "persist"]);
    });
  });

  describe("applyTokenPackPurchase", () => {
    it("skips email when billing log prior exists", async () => {
      vi.mocked(prisma.billingLog.findFirst).mockResolvedValue({
        id: "log-1",
      } as never);

      await applyTokenPackPurchase({
        shop: SHOP,
        appName: APP_NAME,
        plan: samplePlan,
        shopifyPurchaseId: "gid://shopify/AppPurchaseOneTime/123",
      });

      expect(notifyPurchaseCreatedEmail).not.toHaveBeenCalled();
      expect(appendBillingLog).not.toHaveBeenCalled();
    });

    it("sends purchaseCreated email on first token pack purchase", async () => {
      vi.mocked(prisma.billingLog.findFirst).mockResolvedValue(null);

      await applyTokenPackPurchase({
        shop: SHOP,
        appName: APP_NAME,
        plan: samplePlan,
        shopifyPurchaseId: "gid://shopify/AppPurchaseOneTime/123",
      });

      expect(ensureAccount).toHaveBeenCalledOnce();
      expect(appendBillingLog).toHaveBeenCalledOnce();
      expect(notifyPurchaseCreatedEmail).toHaveBeenCalledOnce();
      expect(notifyPurchaseCreatedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          shop: SHOP,
          appName: APP_NAME,
          shopifyPurchaseId: "gid://shopify/AppPurchaseOneTime/123",
          creditAccountChange: expect.objectContaining({
            creditsBefore: 500_000,
            creditsAfter: 510_000,
            creditsChanged: 10_000,
            creditReasonKey: "credit_pack_purchased",
          }),
        }),
      );
    });
  });

  describe("applyActiveSubscription", () => {
    const period = {
      currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
      tokensPerPeriod: 500_000,
      planKey: "sub-monthly",
    };

    const baseParams = {
      shop: SHOP,
      appName: APP_NAME,
      shopifySubscriptionId: "gid://shopify/AppSubscription/1",
      planKey: "sub-monthly",
      billingInterval: "EVERY_30_DAYS",
      tokensPerPeriod: 500_000,
      period,
    };

    it("skips subscription email on period renewal", async () => {
      vi.mocked(prisma.appSubscription.findUnique).mockResolvedValue({
        id: "sub-1",
        shop: SHOP,
        appName: APP_NAME,
        shopifySubscriptionId: baseParams.shopifySubscriptionId,
        planKey: "sub-monthly",
        status: APP_SUBSCRIPTION_STATUS.ACTIVE,
        tokensPerPeriod: 500_000,
        currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      } as never);

      await applyActiveSubscription({
        ...baseParams,
        period: {
          currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
          tokensPerPeriod: 500_000,
          planKey: "sub-monthly",
        },
      });

      expect(archivePeriodAndRenew).toHaveBeenCalledOnce();
      expect(notifySubscriptionEmail).not.toHaveBeenCalled();
    });

    it("sends subscriptionStarted when subscription was pending", async () => {
      vi.mocked(prisma.appSubscription.findUnique).mockResolvedValue(null);

      await applyActiveSubscription(baseParams);

      expect(notifySubscriptionEmail).toHaveBeenCalledOnce();
      expect(notifySubscriptionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "subscriptionStarted",
          shop: SHOP,
          appName: APP_NAME,
          creditAccountChange: expect.objectContaining({
            creditReasonKey: "subscription_started",
          }),
        }),
      );
    });

    it("sends subscriptionChanged when planKey changes", async () => {
      vi.mocked(prisma.appSubscription.findUnique).mockResolvedValue({
        id: "sub-1",
        shop: SHOP,
        appName: APP_NAME,
        shopifySubscriptionId: baseParams.shopifySubscriptionId,
        planKey: "sub-monthly",
        status: APP_SUBSCRIPTION_STATUS.ACTIVE,
        tokensPerPeriod: 500_000,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
      } as never);

      await applyActiveSubscription({
        ...baseParams,
        planKey: "sub-yearly",
      });

      expect(notifySubscriptionEmail).toHaveBeenCalledOnce();
      expect(notifySubscriptionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "subscriptionChanged",
          currentPlanName: "Plan sub-yearly",
          previousPlanName: "Plan sub-monthly",
          creditAccountChange: expect.objectContaining({
            creditReasonKey: "subscription_changed",
          }),
        }),
      );
    });
  });

  describe("markSubscriptionNonActive", () => {
    it("skips email when subscription row is missing", async () => {
      vi.mocked(prisma.appSubscription.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.appSubscription.findUnique).mockResolvedValue(null);

      await markSubscriptionNonActive({
        shop: SHOP,
        appName: APP_NAME,
        shopifySubscriptionId: "gid://shopify/AppSubscription/1",
        status: APP_SUBSCRIPTION_STATUS.CANCELLED,
      });

      expect(notifySubscriptionEmail).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("sends subscriptionCanceled after terminal cancel transaction", async () => {
      const sub = {
        id: "sub-1",
        shop: SHOP,
        appName: APP_NAME,
        shopifySubscriptionId: "gid://shopify/AppSubscription/1",
        planKey: "sub-monthly",
        tokensPerPeriod: 500_000,
      };
      vi.mocked(prisma.appSubscription.findFirst).mockResolvedValue(sub as never);
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          account: {
            findUnique: vi.fn().mockResolvedValue({
              subscriptionTokens: 500_000,
              purchasedTokens: 0,
              trialTokens: 0,
              usedTokens: 0,
            }),
            update: vi.fn().mockResolvedValue({}),
          },
          billingLog: { create: vi.fn().mockResolvedValue({}) },
          accountPeriodUsage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          appSubscription: { delete: vi.fn().mockResolvedValue({}) },
        };
        await callback(tx as never);
      });

      await markSubscriptionNonActive({
        shop: SHOP,
        appName: APP_NAME,
        shopifySubscriptionId: sub.shopifySubscriptionId,
        status: APP_SUBSCRIPTION_STATUS.CANCELLED,
      });

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(notifySubscriptionEmail).toHaveBeenCalledOnce();
      expect(notifySubscriptionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "subscriptionCanceled",
          currentPlanName: "Plan sub-monthly",
          creditAccountChange: expect.objectContaining({
            creditReasonKey: "subscription_canceled",
            creditsBefore: 500_000,
            creditsAfter: 0,
          }),
        }),
      );
    });
  });
});
