import type { ActionFunctionArgs } from "react-router";
import {
  handleGmcProductStatusNotification,
  parseGmcNotificationBody,
} from "../server/adsCatalog/gmcNotifications.server";

const LOG_PREFIX = "[Webhook][GmcProductStatus]";

function verifyToken(request: Request): boolean {
  const expected = (process.env.GMC_WEBHOOK_SECRET ?? "").trim();
  if (!expected) {
    console.warn(`${LOG_PREFIX} GMC_WEBHOOK_SECRET not configured, rejecting request`);
    return false;
  }
  const url = new URL(request.url);
  const provided = url.searchParams.get("token") ?? "";
  return provided === expected;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  if (!verifyToken(request)) {
    console.warn(`${LOG_PREFIX} token mismatch, rejecting`);
    return new Response(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(`${LOG_PREFIX} failed to parse JSON body`);
    // Return 200 so Google doesn't retry a malformed request indefinitely
    return new Response(null, { status: 200 });
  }

  const notification = parseGmcNotificationBody(body);
  if (!notification) {
    console.warn(`${LOG_PREFIX} unrecognized notification format`, JSON.stringify(body).slice(0, 300));
    return new Response(null, { status: 200 });
  }

  // Process asynchronously – return 200 immediately to satisfy Google's <5s requirement.
  void handleGmcProductStatusNotification(notification).catch((e) => {
    console.error(
      `${LOG_PREFIX} handler error account=${notification.account}: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  return new Response(null, { status: 200 });
};
