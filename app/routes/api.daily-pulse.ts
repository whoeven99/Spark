import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadHomeDailyPulse } from "../server/operations/loadHomeDailyPulse.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pulse = await loadHomeDailyPulse(session.shop);
  return Response.json({ ok: true, pulse });
};
