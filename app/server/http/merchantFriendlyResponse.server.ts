/**
 * 商户已鉴权业务路径：错误用 HTTP 200 + 自然语言，避免审核/嵌入式场景出现 4xx/5xx。
 * 未登录 / HMAC 失败等鉴权入口仍可返回非 2xx（见 Option A）。
 */

export const MERCHANT_FRIENDLY_HTTP_STATUS = 200 as const;

export function merchantFriendlyJson(
  body: Record<string, unknown>,
  init?: Omit<ResponseInit, "status">,
): Response {
  return Response.json(body, { ...init, status: MERCHANT_FRIENDLY_HTTP_STATUS });
}

export function merchantFriendlySseError(
  message: string,
  init?: Omit<ResponseInit, "status">,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "error", message })}\n\n`,
        ),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    ...init,
    status: MERCHANT_FRIENDLY_HTTP_STATUS,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...(init?.headers ?? {}),
    },
  });
}
