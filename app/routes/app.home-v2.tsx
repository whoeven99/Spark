import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";
import { useFeatureView } from "../lib/featureTrack";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../server/billing/buildBillingReturnUrl.server";
import { listConversations } from "../server/conversation/conversationStore.server";
import { emptyWorkspaceDashboardSnapshot } from "../server/operations/workspaceDashboard.server";
import { authenticate } from "../shopify.server";
import { RoutePageFallback } from "./component/RoutePageFallback";

const WorkspaceAppShellPage = lazy(() =>
  import("./page/workspace/WorkspaceAppShellPage").then((m) => ({
    default: m.WorkspaceAppShellPage,
  })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  const conversations = await listConversations(session.shop);
  const associatedUser = (
    session as {
      onlineAccessInfo?: {
        associated_user?: { first_name?: string | null; last_name?: string | null } | null;
      } | null;
    }
  ).onlineAccessInfo?.associated_user;
  const accountName =
    [associatedUser?.first_name, associatedUser?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || session.shop.replace(/\.myshopify\.com$/i, "");

  return {
    conversations,
    dashboardSnapshot: emptyWorkspaceDashboardSnapshot(),
    accountName,
    homeRenderTimeIso: new Date().toISOString(),
  };
};

function ClientMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <RoutePageFallback />;
  }
  return children;
}

export default function HomeV2Route() {
  const data = useLoaderData<typeof loader>();
  useFeatureView("home-v2");

  return (
    <ClientMount>
      <TitleBar title="Spark" />
      <Suspense fallback={<RoutePageFallback />}>
        <WorkspaceAppShellPage
          initialConversationList={data?.conversations ?? []}
          dashboardSnapshot={data?.dashboardSnapshot}
          accountName={data?.accountName}
          defaultPanel="home"
          homeVariant="v2"
          homeRenderTimeIso={data?.homeRenderTimeIso}
        />
      </Suspense>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
