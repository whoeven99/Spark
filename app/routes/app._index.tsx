import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildEmbeddedAppPath,
  getAppEntryConfig,
} from "../config/appEntry.server";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../server/billing/buildBillingReturnUrl.server";
import { debugAuthenticateAdmin } from "../server/debug/authenticateAdminDebug.server";
import { debugAuthLog } from "../server/debug/authDebug.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { ChatPage } from "./page/ChatPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await debugAuthenticateAdmin(request, "app.index");

  const { home } = getAppEntryConfig();
  const targetPath = isBillingReturnRequest(request) ? BILLING_PAGE_PATH : home;
  if (targetPath !== "/app") {
    // #region agent log
    debugAuthLog({
      hypothesisId: "E",
      location: "app._index.tsx:redirect",
      message: "APP_ENTRY redirect after auth",
      data: { home, targetPath, from: "/app" },
    });
    // #endregion
    throw redirect(buildEmbeddedAppPath(targetPath, request));
  }

  return null;
};

export default function Index() {
  return <ChatPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
