import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { buildWorkspaceAssistantPath } from "../lib/workspaceChatPrefill";
import { normalizeWorkspaceDashboardSnapshot } from "../lib/workspaceDashboardTypes";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../server/billing/buildBillingReturnUrl.server";
import { ensureDailySnapshotOverview } from "../server/operations/dailyInspection.server";
import {
  buildWorkspaceDashboardFromDailyOps,
  emptyWorkspaceDashboardSnapshot,
} from "../server/operations/workspaceDashboard.server";
import { buildWorkspaceTaskSummaries } from "../server/operations/workspaceTaskSummary.server";
import { listMergedUnifiedTaskEntries } from "../server/unifiedTask/unifiedTaskList.server";
import { authenticate } from "../shopify.server";
import { HomePanel } from "./page/workspace/HomePanel";
import { contentStyle, mobileContentStyle } from "./page/workspace/styles";

const DASHBOARD_RECENT_TASK_LIMIT = 5;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  let dashboardSnapshot = emptyWorkspaceDashboardSnapshot();
  let runningTaskCount = 0;
  try {
    const [dailyOps, recentTaskEntries] = await Promise.all([
      ensureDailySnapshotOverview(session.shop),
      listMergedUnifiedTaskEntries(session.shop, {
        limit: DASHBOARD_RECENT_TASK_LIMIT,
      }),
    ]);
    dashboardSnapshot = {
      ...buildWorkspaceDashboardFromDailyOps(dailyOps),
      recentTaskSummaries: buildWorkspaceTaskSummaries(recentTaskEntries),
    };
    runningTaskCount = recentTaskEntries.filter((entry) => {
      if (entry.entryType === "ai_task") {
        return entry.task.status === "running";
      }
      if (entry.entryType === "operation_task") {
        return entry.task.status === "in_progress";
      }
      return false;
    }).length;
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

  return {
    dashboardSnapshot: normalizeWorkspaceDashboardSnapshot(
      dashboardSnapshot,
      emptyWorkspaceDashboardSnapshot(),
    ),
    accountName,
    runningTaskCount,
    homeRenderTimeIso: new Date().toISOString(),
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const navigate = useEmbeddedNavigate();
  const { isMobile } = useResponsiveLayout();

  return (
    <>
      <TitleBar title="Spark" />
      <main style={isMobile ? mobileContentStyle : contentStyle}>
        <HomePanel
          displayName={data.accountName}
          snapshot={data.dashboardSnapshot}
          runningTaskCount={data.runningTaskCount}
          initialRenderTimeIso={data.homeRenderTimeIso}
          onSubmitPrompt={(prompt) => navigate(buildWorkspaceAssistantPath({ prompt }))}
          onOpenContextTool={(tool) =>
            navigate(buildWorkspaceAssistantPath({ openContextTool: tool }))
          }
          onMoreContext={() =>
            navigate(buildWorkspaceAssistantPath({ openContextTool: "media" }))
          }
          onOpenDashboard={() => navigate("/app/today")}
          onOpenDailyOps={() => navigate("/app/health-monitor")}
          onOpenTasks={() => navigate("/app/tasks")}
        />
      </main>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
