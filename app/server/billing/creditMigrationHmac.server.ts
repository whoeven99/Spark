import { createHmac, timingSafeEqual } from "node:crypto";

export const CREDIT_MIGRATION_TIMESTAMP_HEADER = "x-credit-migration-timestamp";
export const CREDIT_MIGRATION_SIGNATURE_HEADER = "x-credit-migration-signature";

const MAX_SKEW_MS = 5 * 60 * 1000;

export function signCreditMigrationBody(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
}

export function verifyCreditMigrationHmac(params: {
  secret: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  nowMs?: number;
}): boolean {
  const { secret, timestamp, signature, rawBody } = params;
  if (!secret || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowMs = params.nowMs ?? Date.now();
  if (Math.abs(nowMs - ts) > MAX_SKEW_MS) return false;

  const expected = signCreditMigrationBody(secret, timestamp, rawBody);
  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length === 0 || sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function resolveCreditMigrationSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const secret = env.CREDIT_MIGRATION_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}
