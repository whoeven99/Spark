import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getAppEntryConfig } from "../config/appEntry.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { ChatPage } from "./page/ChatPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const { home } = getAppEntryConfig();
  if (home !== "/app") {
    throw redirect(home);
  }

  return null;
};

export default function Index() {
  return <ChatPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
