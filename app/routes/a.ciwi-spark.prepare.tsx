import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { braceletProxyPrepareAction } from "../server/bracelet/braceletProxyHandlers.server";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** App Proxy: POST /a/ciwi-spark/prepare */
export const action = async ({ request }: ActionFunctionArgs) =>
  braceletProxyPrepareAction(request);

export const loader = async () => json({ ok: false, error: "Use POST" }, 405);
