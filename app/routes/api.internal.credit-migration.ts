import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  grantMigratedCredits,
  rollbackMigratedCredits,
} from "../server/billing/creditMigration.server";
import {
  CREDIT_MIGRATION_SIGNATURE_HEADER,
  CREDIT_MIGRATION_TIMESTAMP_HEADER,
  resolveCreditMigrationSecret,
  verifyCreditMigrationHmac,
} from "../server/billing/creditMigrationHmac.server";

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const loader = async (_args: LoaderFunctionArgs) => {
  return jsonResponse({ error: "Method not allowed" }, 405);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const secret = resolveCreditMigrationSecret();
  if (!secret) {
    return jsonResponse({ ok: false, error: "CREDIT_MIGRATION_SECRET missing", errorCode: "NOT_CONFIGURED" }, 503);
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get(CREDIT_MIGRATION_TIMESTAMP_HEADER) ?? "";
  const signature = request.headers.get(CREDIT_MIGRATION_SIGNATURE_HEADER) ?? "";
  if (
    !verifyCreditMigrationHmac({
      secret,
      timestamp,
      signature,
      rawBody,
    })
  ) {
    return jsonResponse({ ok: false, error: "invalid signature", errorCode: "UNAUTHORIZED" }, 401);
  }

  let payload: {
    action?: unknown;
    shop?: unknown;
    amount?: unknown;
    transferId?: unknown;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return jsonResponse({ ok: false, error: "invalid json", errorCode: "INVALID_AMOUNT" }, 400);
  }

  const action = String(payload.action ?? "").trim().toLowerCase();
  if (action === "grant") {
    const result = await grantMigratedCredits({
      shop: payload.shop,
      amount: payload.amount,
      transferId: payload.transferId,
    });
    if (!result.ok) {
      const status = result.errorCode === "SPARK_NOT_INSTALLED" ? 409 : 400;
      return jsonResponse(result, status);
    }
    return jsonResponse(result, 200);
  }

  if (action === "rollback") {
    const result = await rollbackMigratedCredits({
      shop: payload.shop,
      transferId: payload.transferId,
    });
    if (!result.ok) {
      return jsonResponse(result, 400);
    }
    return jsonResponse(result, 200);
  }

  return jsonResponse({ ok: false, error: "action must be grant or rollback", errorCode: "INVALID_AMOUNT" }, 400);
};
