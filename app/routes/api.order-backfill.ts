import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import type { OrderBackfillApiResponse } from "../lib/orderBackfillTypes";
import { backfillOrders } from "../server/shopify/sync/backfill.server";
import { resolveOrderBackfillDays } from "../server/shopify/sync/orderBackfillConfig.server";

const LOG_PREFIX = "[OrderBackfill][Route]";

const bodySchema = z.object({
  intent: z.literal("backfill_orders"),
  daysBack: z.number().int().min(1).max(365).optional(),
});

function jsonResponse(body: OrderBackfillApiResponse, status: number): Response {
  return Response.json(body, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const requestId = crypto.randomUUID();
  console.info(`${LOG_PREFIX} start requestId=${requestId} method=${request.method}`);

  if (request.method !== "POST") {
    return jsonResponse(
      { success: false, errorCode: 405, errorMsg: "仅支持 POST", response: null },
      405,
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return jsonResponse(
      { success: false, errorCode: 400, errorMsg: "请求体不是合法 JSON", response: null },
      400,
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      {
        success: false,
        errorCode: 400,
        errorMsg: parsed.error.issues[0]?.message ?? "参数无效",
        response: null,
      },
      400,
    );
  }

  const daysBack = resolveOrderBackfillDays(
    parsed.data.daysBack != null ? String(parsed.data.daysBack) : null,
  );

  try {
    const { admin, session } = await authenticate.admin(request);
    const result = await backfillOrders(session.shop, admin, { daysBack });
    console.info(
      `${LOG_PREFIX} done requestId=${requestId} shop=${session.shop} synced=${result.synced} errors=${result.errors} days=${daysBack}`,
    );
    return jsonResponse(
      {
        success: true,
        response: {
          synced: result.synced,
          skipped: result.skipped,
          errors: result.errors,
          daysBack: daysBack,
        },
      },
      200,
    );
  } catch (e) {
    console.error(`${LOG_PREFIX} failed requestId=${requestId}`, e);
    return jsonResponse(
      {
        success: false,
        errorCode: 500,
        errorMsg: e instanceof Error ? e.message : String(e),
        response: null,
      },
      500,
    );
  }
};
