import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  buildEmbeddedAppPath,
} from "../config/appEntry.server";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../server/billing/buildBillingReturnUrl.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { listConversations } from "../server/conversation/conversationStore.server";
import { ensureDailySnapshot } from "../server/operations/dailyInspection.server";
import {
  buildWorkspaceDashboardFromDailyOps,
  emptyWorkspaceDashboardSnapshot,
} from "../server/operations/workspaceDashboard.server";
import { buildWorkspaceTaskSummaries } from "../server/operations/workspaceTaskSummary.server";
import { listMergedUnifiedTaskEntries } from "../server/unifiedTask/unifiedTaskList.server";
import { useFeatureView } from "../lib/featureTrack";
import { RoutePageFallback } from "./component/RoutePageFallback";

const DASHBOARD_RECENT_TASK_LIMIT = 5;

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
  let dashboardSnapshot = emptyWorkspaceDashboardSnapshot();
  try {
    const [dailyOps, recentTaskEntries] = await Promise.all([
      ensureDailySnapshot(session.shop),
      listMergedUnifiedTaskEntries(session.shop, {
        limit: DASHBOARD_RECENT_TASK_LIMIT,
      }),
    ]);
    dashboardSnapshot = {
      ...buildWorkspaceDashboardFromDailyOps(dailyOps),
      recentTaskSummaries: buildWorkspaceTaskSummaries(recentTaskEntries),
    };
  } catch (error) {
    console.error("[app._index] dashboard snapshot failed:", error);
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

/** 工作台页依赖浏览器环境，SSR 阶段仅输出占位，避免嵌入式 iframe 首屏 500。 */
function ClientMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <RoutePageFallback />;
  }
  return children;
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  useFeatureView("chat");
  return (
    <ClientMount>
      <Suspense fallback={<RoutePageFallback />}>
        <WorkspaceAppShellPage
          initialConversationList={data?.conversations ?? []}
          dashboardSnapshot={data?.dashboardSnapshot}
          accountName={data?.accountName}
        />
      </Suspense>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
