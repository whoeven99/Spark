export const DEFAULT_REFERRAL_TOKEN_AMOUNT = 1_000_000;
/** 新建默认上限，对齐渠道粉丝量封顶 100 万。不用 0 / -1：比较时容易被当成已满。 */
export const DEFAULT_REFERRAL_MAX_USES = 1_000_000;
export const REFERRAL_CODE_MIN_LEN = 6;
export const REFERRAL_CODE_MAX_LEN = 20;
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9-]{6,20}$/;

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidReferralCodeFormat(code: string): boolean {
  return REFERRAL_CODE_PATTERN.test(code);
}

export function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }
  return `SPARK-${suffix}`;
}
