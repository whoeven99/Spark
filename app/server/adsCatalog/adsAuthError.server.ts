/**
 * 广告平台「授权已失效」的统一信号。
 *
 * 凭证行存在不代表还能用：refresh token 被吊销、商户在平台侧移除了应用、
 * 账号权限被收回，这些都只有真的打一次平台 API 才会暴露。因此这里不落库，
 * 只负责把「需要重新授权」这件事从抛错点原样带到路由层。
 *
 * Google 侧由 `googleAdsToken.server.ts` 主动抛 `AdsReauthRequiredError`；
 * Meta / TikTok 的客户端只透传平台原始报错，只能按报文形态判定，因此判据
 * 保持窄口径——判不准时一律回落成普通失败，宁可让商户重试，也不要拿错误的
 * 「去重新授权」把还能用的连接推去重连。
 */

export type AdsAuthPlatform = "meta" | "google" | "tiktok";

/** 平台明确告知凭证已失效，必须重新走一次 OAuth。 */
export class AdsReauthRequiredError extends Error {
  readonly platform: AdsAuthPlatform;

  constructor(platform: AdsAuthPlatform, message: string) {
    super(message);
    this.name = "AdsReauthRequiredError";
    this.platform = platform;
  }
}

export function isAdsReauthRequiredError(error: unknown): error is AdsReauthRequiredError {
  return error instanceof AdsReauthRequiredError;
}

/** Meta Graph 在 token 失效时的固定话术，与限流、字段错误区分开。 */
const META_AUTH_PATTERNS: readonly RegExp[] = [
  /error validating access token/i,
  /session has expired/i,
  /session has been invalidated/i,
  /access token could not be decrypted/i,
  /oauthexception/i,
];

/** TikTok 把 token 问题放在 message 里返回，code 已被客户端转成 Error。 */
const TIKTOK_AUTH_PATTERNS: readonly RegExp[] = [
  /access[_\s-]?token.*(invalid|expired|revoked)/i,
  /(invalid|expired).*access[_\s-]?token/i,
  /authorization.*(invalid|expired|revoked)/i,
];

const GOOGLE_AUTH_PATTERNS: readonly RegExp[] = [
  /invalid_grant/i,
  /unauthorized_client/i,
  /\bAUTHENTICATION_ERROR\b/,
  /\binvalid authentication credentials\b/i,
];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matchesAny(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/** 平台报错是否可判定为凭证失效。判不准返回 false。 */
export function isAdsAuthFailure(platform: AdsAuthPlatform, error: unknown): boolean {
  if (isAdsReauthRequiredError(error)) return true;
  const message = messageOf(error);
  if (!message) return false;
  if (platform === "meta") return matchesAny(META_AUTH_PATTERNS, message);
  if (platform === "tiktok") return matchesAny(TIKTOK_AUTH_PATTERNS, message);
  return matchesAny(GOOGLE_AUTH_PATTERNS, message);
}

export type AdsFetchFailureReason = "reauth_required" | "fetch_failed";

/**
 * 回源失败的原因分类。
 *
 * 只有能确定是授权问题时才返回 `reauth_required`，其余（限流、网络、平台 5xx）
 * 一律是 `fetch_failed`，前端据此只提示重试。
 */
export function classifyAdsFetchFailure(
  platform: AdsAuthPlatform,
  error: unknown,
): AdsFetchFailureReason {
  return isAdsAuthFailure(platform, error) ? "reauth_required" : "fetch_failed";
}
