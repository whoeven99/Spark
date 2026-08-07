import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  handleMetaCatalogWebhookEvent,
  verifyMetaCatalogWebhookSubscription,
} from "../server/adsCatalog/metaCatalogWebhook.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }
  return verifyMetaCatalogWebhookSubscription(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  return handleMetaCatalogWebhookEvent(request);
};
