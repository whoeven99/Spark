import type { ActionFunctionArgs } from "react-router";
import { verifyInternalBillingSecret } from "../server/billing/internalBillingAuth.server";
import { executeInternalBillingUsage } from "../server/billing/internalBillingHttp.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  if (!verifyInternalBillingSecret(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const result = await executeInternalBillingUsage(body);
  return Response.json(result.body, { status: result.status });
};
