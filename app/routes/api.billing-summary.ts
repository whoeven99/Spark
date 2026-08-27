import type { LoaderFunctionArgs } from "react-router";
import { loadBillingUsageSummary } from "../server/billing/billingContext.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const usage = await loadBillingUsageSummary(session.shop);

  return Response.json(usage, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
};
