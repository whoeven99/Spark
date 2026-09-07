import { normalizeReferralCode } from "./referralCodeFormat";

export const REFERRAL_INSTALL_COOKIE = "spark_referral_code";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function cookieSecuritySuffix(): string {
  const appUrl = process.env.SHOPIFY_APP_URL?.trim() ?? "";
  return appUrl.startsWith("https://") ? "; Secure" : "";
}

export function parseReferralCodeFromCookieHeader(
  cookieHeader: string | null | undefined,
): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== REFERRAL_INSTALL_COOKIE) continue;
    try {
      return normalizeReferralCode(decodeURIComponent(trimmed.slice(eq + 1)));
    } catch {
      return "";
    }
  }
  return "";
}

export function readReferralCodeFromRequest(request: Request): string {
  const fromQuery = normalizeReferralCode(
    new URL(request.url).searchParams.get("referralCode") ?? "",
  );
  if (fromQuery) return fromQuery;
  return parseReferralCodeFromCookieHeader(request.headers.get("cookie"));
}

export function buildReferralInstallCookie(code: string): string {
  const normalized = normalizeReferralCode(code);
  return `${REFERRAL_INSTALL_COOKIE}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${cookieSecuritySuffix()}`;
}
