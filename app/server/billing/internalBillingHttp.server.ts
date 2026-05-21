import { z } from "zod";
import { isBillingEnabledForApp } from "./constants.server";
import { loadBillingContext } from "./billingContext.server";
import { getAvailableTokens } from "../tokenUsage/accountBalance.server";
import { recordBilledTokenUsages } from "../tokenUsage/recordBilledTokenUsage.server";
import {
  isTokenBillingFeature,
  type TokenBillingFeature,
} from "../tokenUsage/tokenBillingTypes.server";

const quotaBodySchema = z.object({
  shop: z.string().min(1),
  appName: z.string().min(1),
});

const usageItemSchema = z.object({
  feature: z.string().min(1),
  modelKey: z.string().min(1),
  usage: z.unknown(),
});

const usageBodySchema = z.object({
  shop: z.string().min(1),
  appName: z.string().min(1),
  idempotencyKey: z.string().optional(),
  items: z.array(usageItemSchema).min(1),
});

export type InternalBillingQuotaResponse = {
  allowed: boolean;
  available: number;
  used: number;
  reason: string | null;
};

export async function executeInternalBillingQuota(
  body: unknown,
): Promise<{ status: number; body: InternalBillingQuotaResponse }> {
  const parsed = quotaBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      body: { allowed: false, available: 0, used: 0, reason: "invalid_request" },
    };
  }

  const { shop, appName } = parsed.data;
  if (!isBillingEnabledForApp(appName)) {
    return {
      status: 200,
      body: { allowed: true, available: Number.MAX_SAFE_INTEGER, used: 0, reason: null },
    };
  }

  const ctx = await loadBillingContext(shop, appName);
  const available = getAvailableTokens(ctx.account);
  const used = ctx.account.usedTokens;
  const allowed = ctx.hasAccess;

  return {
    status: 200,
    body: {
      allowed,
      available,
      used,
      reason: allowed ? null : "Token 余额不足或尚未订阅",
    },
  };
}

export async function executeInternalBillingUsage(
  body: unknown,
): Promise<{ status: number; body: { ok: boolean; error?: string } }> {
  const parsed = usageBodySchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }

  const { shop, appName, items } = parsed.data;
  const billingItems = items.filter((item) => isTokenBillingFeature(item.feature));
  if (billingItems.length === 0) {
    return { status: 400, body: { ok: false, error: "unknown_feature" } };
  }

  if (!isBillingEnabledForApp(appName)) {
    return { status: 200, body: { ok: true } };
  }

  await recordBilledTokenUsages({
    shop,
    appName,
    items: billingItems.map((item) => ({
      feature: item.feature as TokenBillingFeature,
      modelKey: item.modelKey,
      usage: item.usage,
    })),
  });

  return { status: 200, body: { ok: true } };
}
