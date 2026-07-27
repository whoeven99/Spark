import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getGscCredential,
  getGscPending,
} from "../server/googleSearchConsole/gscCredentials.server";
import { GoogleSearchConsolePage } from "./page/GoogleSearchConsolePage";

export type GscSettingsLoaderData = {
  connected: boolean;
  siteUrl: string | null;
  hasPending: boolean;
  pendingSites: Array<{ siteUrl: string; permissionLevel: string }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [credential, pending] = await Promise.all([
    getGscCredential(session.shop),
    getGscPending(session.shop),
  ]);

  return {
    connected: Boolean(credential),
    siteUrl: credential?.siteUrl ?? null,
    hasPending: Boolean(pending),
    pendingSites: pending?.sites ?? [],
  } satisfies GscSettingsLoaderData;
};

export default function AppSettingsGoogleSearchConsole() {
  return <GoogleSearchConsolePage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
