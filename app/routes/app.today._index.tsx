/**
 * 经营 › 概览（PR4）：复用工作台经营看板快照（指标卡 + 告警 + 建议 + 最近任务），
 * 与 app._index 同一套快照构建逻辑。深入查看跳转到 诊断 / 订单 子页。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureDailySnapshot } from "../server/operations/dailyInspection.server";
import {
  buildWorkspaceDashboardFromDailyOps,
  emptyWorkspaceDashboardSnapshot,
} from "../server/operations/workspaceDashboard.server";
import { buildWorkspaceTaskSummaries } from "../server/operations/workspaceTaskSummary.server";
import { listMergedUnifiedTaskEntries } from "../server/unifiedTask/unifiedTaskList.server";
import { useFeatureView } from "../lib/featureTrack";
import { DashboardPanel } from "./page/workspace/DashboardPanel";
import { RoutePageFallback } from "./component/RoutePageFallback";
import { mobilePageContentStyle, pageContentStyle } from "./page/pageUiStyles";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

const DASHBOARD_RECENT_TASK_LIMIT = 5;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  let dashboardSnapshot = emptyWorkspaceDashboardSnapshot();
  try {
    const [dailyOps, recentTaskEntries] = await Promise.all([
      ensureDailySnapshot(session.shop),
      listMergedUnifiedTaskEntries(session.shop, { limit: DASHBOARD_RECENT_TASK_LIMIT }),
    ]);
    dashboardSnapshot = {
      ...buildWorkspaceDashboardFromDailyOps(dailyOps),
      recentTaskSummaries: buildWorkspaceTaskSummaries(recentTaskEntries),
    };
  } catch (error) {
    console.error("[today._index] dashboard snapshot failed:", error);
  }
  return { dashboardSnapshot };
};

/** 看板面板依赖浏览器环境，SSR 阶段仅输出占位，避免嵌入式 iframe 首屏 500。 */
function ClientMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <RoutePageFallback />;
  return children;
}

export default function TodayOverview() {
  const { dashboardSnapshot } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { isMobile } = useResponsiveLayout();
  useFeatureView("today");

  return (
    <ClientMount>
      <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
        <DashboardPanel
          snapshot={dashboardSnapshot}
          onOpenDailyOps={() => navigate("/app/today/diagnosis")}
          onOpenTasks={() => navigate("/app/tasks")}
        />
      </div>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
