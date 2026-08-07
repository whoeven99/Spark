import crypto from "node:crypto";
import { resolveMetaOAuthClient } from "./metaOAuth.server";

const LOG_PREFIX = "[MetaDataDeletion]";

export const META_DATA_DELETION_PATH = "/meta/data-deletion";

/**
 * Meta App Dashboard「User data deletion」回调 URL。
 * 依赖 SHOPIFY_APP_URL，例如 https://aiassistant-wi7b.onrender.com/meta/data-deletion
 */
export function getMetaDataDeletionCallbackUrl(): string | null {
  const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) return null;
  return `${appUrl}${META_DATA_DELETION_PATH}`;
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  return Buffer.from(padded, "base64");
}

/**
 * 解析并校验 Meta signed_request（Facebook Login / Data Deletion Callback）。
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
export function parseMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): Record<string, unknown> | null {
  const parts = signedRequest.split(".", 2);
  if (parts.length !== 2) return null;

  const [encodedSig, payload] = parts;
  const sig = base64UrlDecodeToBuffer(encodedSig);
  const expectedSig = crypto.createHmac("sha256", appSecret).update(payload).digest();

  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  try {
    const data = JSON.parse(base64UrlDecodeToBuffer(payload).toString("utf8")) as Record<
      string,
      unknown
    >;
    if (data.algorithm !== "HMAC-SHA256") return null;
    return data;
  } catch {
    return null;
  }
}

function generateConfirmationCode(): string {
  return crypto.randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
}

async function readSignedRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { signed_request?: string };
      return body.signed_request?.trim() ?? null;
    } catch {
      return null;
    }
  }

  const form = await request.formData();
  const value = form.get("signed_request");
  return typeof value === "string" ? value.trim() : null;
}

/**
 * POST：Meta 用户数据删除回调。当前仅记录请求并返回 status URL，实际删数逻辑后续扩展。
 */
export async function handleMetaDataDeletionRequest(request: Request): Promise<Response> {
  const client = resolveMetaOAuthClient();
  if (!client) {
    console.warn(`${LOG_PREFIX} META_APP_ID / META_APP_SECRET not configured`);
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signedRequest = await readSignedRequest(request);
  if (!signedRequest) {
    return new Response(JSON.stringify({ error: "Missing signed_request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = parseMetaSignedRequest(signedRequest, client.appSecret);
  if (!data?.user_id) {
    return new Response(JSON.stringify({ error: "Invalid signed_request" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = String(data.user_id);
  const confirmationCode = generateConfirmationCode();

  console.info(
    `${LOG_PREFIX} deletion request received user_id=${userId} confirmation_code=${confirmationCode}`,
  );

  const statusBase =
    getMetaDataDeletionCallbackUrl() ??
    `${new URL(request.url).origin}${META_DATA_DELETION_PATH}`;
  const statusUrl = `${statusBase}?code=${encodeURIComponent(confirmationCode)}`;

  return new Response(
    JSON.stringify({ url: statusUrl, confirmation_code: confirmationCode }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** GET：删除请求状态页（Meta 要求响应中包含可查询进度的 URL）。 */
export function handleMetaDataDeletionStatus(request: Request): Response {
  const code = new URL(request.url).searchParams.get("code")?.trim();

  if (!code) {
    return new Response(
      "Meta user data deletion status endpoint. Provide ?code= to check a deletion request.",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  return new Response(
    `Your data deletion request (${code}) has been received. Spark will process Meta-related data associated with your account. Contact support through the Shopify app if you need help.`,
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
