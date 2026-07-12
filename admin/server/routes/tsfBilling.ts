import { Router } from "express";
import type { SqlParameter } from "@azure/cosmos";
import { getTsfDb } from "../lib/tsfDb.js";
import { getTranslationJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";

export const tsfBillingRouter = Router();

const MAX_PAGE_SIZE = 100;

function clampDays(value: unknown): number {
  const days = Number(value ?? 30);
  if (!Number.isFinite(days)) return 30;
  return Math.min(365, Math.max(1, Math.floor(days)));
}

function startIsoForDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function str(rowValue: unknown): string | null {
  if (rowValue == null) return null;
  const value = String(rowValue);
  return value.length > 0 ? value : null;
}

type TranslationUsageRow = {
  id: string;
  shopName: string;
  source: string;
  target: string;
  modules?: string[];
  status: string;
  taskSource?: string | null;
  isCover?: boolean | null;
  aiModel?: string | null;
  metrics?: {
    usedTokens?: number;
    translateDone?: number;
    translateTotal?: number;
    translateFailed?: number;
    writebackDone?: number;
    writebackTotal?: number;
    writebackFailed?: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

async function loadTranslationUsage(params: {
  shop: string;
  startIso: string;
  source: string;
  status: string;
  page: number;
  pageSize: number;
}) {
  if (!isCosmosConfigured()) {
    return {
      total: 0,
      usedTokens: 0,
      rows: [] as Array<Record<string, unknown>>,
      note: "Cosmos not configured",
    };
  }

  const conditions = ["c.shopName = @shop", "c.createdAt >= @start"];
  const queryParams: SqlParameter[] = [
    { name: "@shop", value: params.shop },
    { name: "@start", value: params.startIso },
  ];

  if (params.source) {
    conditions.push("c.taskSource = @source");
    queryParams.push({ name: "@source", value: params.source });
  }
  if (params.status) {
    conditions.push("c.status = @status");
    queryParams.push({ name: "@status", value: params.status });
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const offset = (params.page - 1) * params.pageSize;
  const container = getTranslationJobsContainer();

  const [countResult, usageResult, listResult] = await Promise.all([
    container.items
      .query<number>({
        query: `SELECT VALUE COUNT(1) FROM c ${where}`,
        parameters: queryParams,
      })
      .fetchAll(),
    container.items
      .query<number>({
        query: `
          SELECT VALUE SUM(IIF(IS_DEFINED(c.metrics.usedTokens), c.metrics.usedTokens, 0))
          FROM c ${where}
        `,
        parameters: queryParams,
      })
      .fetchAll(),
    container.items
      .query<TranslationUsageRow>(
        {
          query: `
            SELECT c.id, c.shopName, c.source, c.target, c.modules, c.status,
                   c.taskSource, c.isCover, c.aiModel, c.metrics, c.createdAt, c.updatedAt
            FROM c ${where}
            ORDER BY c.createdAt DESC
            OFFSET @offset LIMIT @limit
          `,
          parameters: [
            ...queryParams,
            { name: "@offset", value: offset },
            { name: "@limit", value: params.pageSize },
          ],
        },
        { maxItemCount: params.pageSize },
      )
      .fetchAll(),
  ]);

  return {
    total: Number(countResult.resources[0] ?? 0),
    usedTokens: Number(usageResult.resources[0] ?? 0),
    rows: listResult.resources.map((job) => {
      const metrics = job.metrics ?? {};
      return {
        id: job.id,
        shopName: job.shopName,
        source: job.source,
        target: job.target,
        modules: Array.isArray(job.modules) ? job.modules : [],
        status: job.status,
        taskSource: job.taskSource ?? null,
        isCover: Boolean(job.isCover),
        aiModel: job.aiModel ?? null,
        usedTokens: Number(metrics.usedTokens ?? 0),
        translateDone: Number(metrics.translateDone ?? 0),
        translateTotal: Number(metrics.translateTotal ?? 0),
        translateFailed: Number(metrics.translateFailed ?? 0),
        writebackDone: Number(metrics.writebackDone ?? 0),
        writebackTotal: Number(metrics.writebackTotal ?? 0),
        writebackFailed: Number(metrics.writebackFailed ?? 0),
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    }),
    note: null,
  };
}

tsfBillingRouter.get("/", async (req, res) => {
  try {
    const shop = (req.query.shop as string | undefined)?.trim() ?? "";
    if (!shop) {
      res.json({
        account: null,
        subscription: null,
        summary: null,
        billingEvents: [],
        periodUsages: [],
        translationUsage: { rows: [], total: 0, usedTokens: 0, note: null },
        warnings: ["shop is required"],
      });
      return;
    }

    const days = clampDays(req.query.days);
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(10, Number(req.query.pageSize ?? 50) || 50),
    );
    const source = (req.query.source as string | undefined)?.trim() ?? "";
    const status = (req.query.status as string | undefined)?.trim() ?? "";
    const startIso = startIsoForDays(days);

    const db = getTsfDb();
    const [
      accountResult,
      subscriptionResult,
      billingEventsResult,
      periodUsagesResult,
      translationUsage,
    ] = await Promise.all([
      db.execute({
        sql: `
          SELECT shop, subscriptionCredits, purchasedCredits, trialCredits,
                 usedCredits, createdAt, updatedAt
          FROM Account
          WHERE shop = ?
          LIMIT 1
        `,
        args: [shop],
      }),
      db.execute({
        sql: `
          SELECT shop, planKey, shopifySubscriptionId, billingInterval, status,
                 creditsPerPeriod, trialEndsAt, currentPeriodStart,
                 currentPeriodEnd, cancelledAt, createdAt, updatedAt
          FROM AppSubscription
          WHERE shop = ?
          LIMIT 1
        `,
        args: [shop],
      }),
      db.execute({
        sql: `
          SELECT shop, eventType, planKey, referenceId, creditsDelta,
                 usedCredits, metadata, createdAt
          FROM BillingLog
          WHERE shop = ? AND createdAt >= ?
          ORDER BY createdAt DESC
          LIMIT 100
        `,
        args: [shop, startIso],
      }),
      db.execute({
        sql: `
          SELECT periodStart, periodEnd, usedCredits, subscriptionCreditsAllocated,
                 purchasedCreditsRemaining, trialCreditsRemaining, planKey, archivedAt
          FROM AccountPeriodUsage
          WHERE shop = ?
          ORDER BY periodEnd DESC
          LIMIT 12
        `,
        args: [shop],
      }),
      loadTranslationUsage({ shop, startIso, source, status, page, pageSize }),
    ]);

    const accountRow = accountResult.rows[0];
    const subscriptionRow = subscriptionResult.rows[0];
    const account = accountRow
      ? {
          shop: accountRow.shop as string,
          subscriptionCredits: Number(accountRow.subscriptionCredits ?? 0),
          purchasedCredits: Number(accountRow.purchasedCredits ?? 0),
          trialCredits: Number(accountRow.trialCredits ?? 0),
          usedCredits: Number(accountRow.usedCredits ?? 0),
          createdAt: accountRow.createdAt as string,
          updatedAt: accountRow.updatedAt as string,
        }
      : null;
    const totalCredits = account
      ? account.subscriptionCredits + account.purchasedCredits + account.trialCredits
      : 0;
    const remainingCredits = account ? totalCredits - account.usedCredits : 0;

    const subscription = subscriptionRow
      ? {
          shop: subscriptionRow.shop as string,
          planKey: str(subscriptionRow.planKey),
          shopifySubscriptionId: str(subscriptionRow.shopifySubscriptionId),
          billingInterval: str(subscriptionRow.billingInterval),
          status: str(subscriptionRow.status),
          creditsPerPeriod: Number(subscriptionRow.creditsPerPeriod ?? 0),
          trialEndsAt: str(subscriptionRow.trialEndsAt),
          currentPeriodStart: str(subscriptionRow.currentPeriodStart),
          currentPeriodEnd: str(subscriptionRow.currentPeriodEnd),
          cancelledAt: str(subscriptionRow.cancelledAt),
          createdAt: subscriptionRow.createdAt as string,
          updatedAt: subscriptionRow.updatedAt as string,
        }
      : null;

    const billingEvents = billingEventsResult.rows.map((r) => ({
      shop: r.shop as string,
      eventType: r.eventType as string,
      planKey: str(r.planKey),
      referenceId: str(r.referenceId),
      creditsDelta: Number(r.creditsDelta ?? 0),
      usedCredits: Number(r.usedCredits ?? 0),
      metadata: str(r.metadata),
      createdAt: r.createdAt as string,
    }));

    const periodUsages = periodUsagesResult.rows.map((r) => ({
      periodStart: r.periodStart as string,
      periodEnd: r.periodEnd as string,
      usedCredits: Number(r.usedCredits ?? 0),
      subscriptionCreditsAllocated: Number(r.subscriptionCreditsAllocated ?? 0),
      purchasedCreditsRemaining: Number(r.purchasedCreditsRemaining ?? 0),
      trialCreditsRemaining: Number(r.trialCreditsRemaining ?? 0),
      planKey: r.planKey as string,
      archivedAt: r.archivedAt as string,
    }));

    const warnings: string[] = [];
    if (!account) warnings.push("No Account row found for this shop.");
    if (!subscription) warnings.push("No AppSubscription row found for this shop.");
    if (account && remainingCredits <= 0) warnings.push("Credits are exhausted or negative.");
    if (subscription && subscription.status !== "ACTIVE") {
      warnings.push(`Subscription is ${subscription.status ?? "UNKNOWN"}.`);
    }

    res.json({
      account,
      subscription,
      summary: {
        totalCredits,
        usedCredits: account?.usedCredits ?? 0,
        remainingCredits,
        usagePercent:
          totalCredits > 0
            ? Math.round(((account?.usedCredits ?? 0) / totalCredits) * 100)
            : 0,
        billingEventsCount: billingEvents.length,
        translationJobsCount: translationUsage.total,
        translationUsedTokens: translationUsage.usedTokens,
        lastBillingAt: billingEvents[0]?.createdAt ?? null,
        lastTranslationAt: translationUsage.rows[0]?.createdAt ?? null,
      },
      billingEvents,
      periodUsages,
      translationUsage,
      warnings,
    });
  } catch (err) {
    console.error("[tsf/billing]", err);
    res.status(500).json({ error: String(err) });
  }
});
