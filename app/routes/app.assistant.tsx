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
import { ensureDailySnapshotOverview } from "../server/operations/dailyInspection.server";
import {
  buildWorkspaceDashboardFromDailyOps,
  emptyWorkspaceDashboardSnapshot,
} from "../server/operations/workspaceDashboard.server";
import { buildWorkspaceTaskSummaries } from "../server/operations/workspaceTaskSummary.server";
import { listMergedUnifiedTaskEntries } from "../server/unifiedTask/unifiedTaskList.server";
import { authenticate } from "../shopify.server";
import { RoutePageFallback } from "./component/RoutePageFallback";

const DASHBOARD_RECENT_TASK_LIMIT = 5;

const WorkspaceAppShellPage = lazy(() =>
  import("./page/workspace/WorkspaceAppShellPage").then((m) => ({
    default: m.WorkspaceAppShellPage,
  })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  const conversations = await listConversations(session.shop);
  let dashboardSnapshot = emptyWorkspaceDashboardSnapshot();
  try {
    const [dailyOps, recentTaskEntries] = await Promise.all([
      ensureDailySnapshotOverview(session.shop, { shopifyAdmin: admin }),
      listMergedUnifiedTaskEntries(session.shop, {
        limit: DASHBOARD_RECENT_TASK_LIMIT,
      }),
    ]);
    dashboardSnapshot = {
      ...buildWorkspaceDashboardFromDailyOps(dailyOps),
      recentTaskSummaries: buildWorkspaceTaskSummaries(recentTaskEntries),
    };
  } catch (error) {
    console.error("[app.assistant] dashboard snapshot failed:", error);
  }

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

  return { conversations, dashboardSnapshot, accountName };
};

function ClientMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <RoutePageFallback />;
  }
  return children;
}

export default function AssistantRoute() {
  const data = useLoaderData<typeof loader>();
  useFeatureView("chat");

  return (
    <ClientMount>
      <TitleBar title="Spark AI" />
      <Suspense fallback={<RoutePageFallback />}>
        <WorkspaceAppShellPage
          initialConversationList={data?.conversations ?? []}
          dashboardSnapshot={data?.dashboardSnapshot}
          accountName={data?.accountName}
          defaultPanel="chat"
          autoCreateConversation
        />
      </Suspense>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
