import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  buildEmbeddedAppPath,
} from "../config/appEntry.server";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../server/billing/buildBillingReturnUrl.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { WorkspaceAppShellPage } from "./page/WorkspaceAppShellPage";
import { listConversations } from "../server/conversation/conversationStore.server";
import { useFeatureView } from "../lib/featureTrack";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  const conversations = await listConversations(session.shop);
  return { conversations };
};

/** 工作台页依赖浏览器环境，SSR 阶段仅输出占位，避免嵌入式 iframe 首屏 500。 */
function ClientMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div style={{ padding: "1.25rem", color: "#6d7175", fontSize: "0.9rem" }}>
        Loading…
      </div>
    );
  }
  return children;
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  useFeatureView("chat");
  return (
    <ClientMount>
      <WorkspaceAppShellPage initialConversationList={data?.conversations ?? []} />
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
