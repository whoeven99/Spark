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
import { loadBillingContext } from "../server/billing/index.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { listConversations } from "../server/conversation/conversationStore.server";
import { ensureDailySnapshot } from "../server/operations/dailyInspection.server";
import {
  buildWorkspaceDashboardFromDailyOps,
  emptyWorkspaceDashboardSnapshot,
} from "../server/operations/workspaceDashboard.server";
import { buildWorkspaceTaskSummaries } from "../server/operations/workspaceTaskSummary.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
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
  const { session, admin } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  const [conversations, billingContext, shopBasicInfo] = await Promise.all([
    listConversations(session.shop),
    loadBillingContext(session.shop),
    fetchShopBasicInfo(admin).catch((error) => {
      console.error("[app._index] fetch shop basic info failed:", error);
      return null;
    }),
  ]);
  const currentPlanLabel = billingContext.subscription
    ? (
        billingContext.plans.find((plan) => plan.planKey === billingContext.subscription?.planKey)
          ?.displayName ?? billingContext.subscription.planKey
      )
    : "未订阅";
  const accountEmail =
    shopBasicInfo?.contactEmail?.trim() ||
    shopBasicInfo?.email?.trim() ||
    session.shop;

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

  return { conversations, dashboardSnapshot, currentPlanLabel, accountEmail };
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
          currentPlanLabel={data?.currentPlanLabel}
          accountEmail={data?.accountEmail}
        />
      </Suspense>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
