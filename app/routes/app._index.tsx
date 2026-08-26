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
import { authenticate } from "../shopify.server";
import { HomePanel } from "./page/workspace/HomePanel";
import { contentStyle, mobileContentStyle } from "./page/workspace/styles";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  let dashboardSnapshot = emptyWorkspaceDashboardSnapshot();
  try {
    const dailyOps = await ensureDailySnapshotOverview(session.shop, {
      shopifyAdmin: admin,
    });
    dashboardSnapshot = buildWorkspaceDashboardFromDailyOps(dailyOps);
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
          initialRenderTimeIso={data.homeRenderTimeIso}
          onSubmitPrompt={(prompt) => navigate(buildWorkspaceAssistantPath({ prompt }))}
          onOpenContextTool={(tool) =>
            navigate(buildWorkspaceAssistantPath({ openContextTool: tool }))
          }
          onMoreContext={() =>
            navigate(buildWorkspaceAssistantPath({ openContextTool: "article" }))
          }
          onOpenDashboard={() => navigate("/app/today")}
          onOpenDailyOps={() => navigate("/app/health-monitor")}
        />
      </main>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
