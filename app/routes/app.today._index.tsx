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
import type { WorkspaceDashboardSnapshot } from "../lib/workspaceDashboardTypes";
import { DestinationPage } from "./component/shared/DestinationPage";

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
        <DestinationPage
          title="经营"
          subtitle="先看今日结果，再进入诊断、订单风险或任务中心处理具体对象。"
          backLabel="返回首页"
          fallbackPath="/app"
          isMobile={isMobile}
          actions={buildTodayActions({
            snapshot: dashboardSnapshot,
            onOpenDailyOps: () => navigate("/app/today/diagnosis"),
            onOpenOrders: () => navigate("/app/today/orders"),
            onOpenTasks: () => navigate("/app/tasks"),
          })}
        >
        <DashboardPanel
          snapshot={dashboardSnapshot}
          onOpenDailyOps={() => navigate("/app/today/diagnosis")}
          onOpenTasks={() => navigate("/app/tasks")}
        />
        </DestinationPage>
      </div>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function buildTodayActions({
  snapshot,
  onOpenDailyOps,
  onOpenOrders,
  onOpenTasks,
}: {
  snapshot: WorkspaceDashboardSnapshot;
  onOpenDailyOps: () => void;
  onOpenOrders: () => void;
  onOpenTasks: () => void;
}) {
  const riskCount = snapshot.alerts.filter((item) => item.tone === "critical").length;
  const watchCount = snapshot.alerts.filter((item) => item.tone === "warning").length;
  const orderRiskCount = snapshot.alerts.filter((item) =>
    /退款|履约|物流|库存|订单/.test(`${item.title}${item.detail}`),
  ).length;
  const taskCount = snapshot.recentTaskSummaries.length;
  return [
    {
      key: "diagnosis",
      title: "每日诊断",
      detail: snapshot.hasData ? "查看诊断证据与四象限待办" : "暂无完整诊断数据",
      badge: `${riskCount} 风险 / ${watchCount} 关注`,
      onClick: onOpenDailyOps,
    },
    {
      key: "orders",
      title: "订单风险",
      detail: "退款、履约、物流和库存对象明细",
      badge: `${orderRiskCount} 项`,
      onClick: onOpenOrders,
    },
    {
      key: "tasks",
      title: "任务处理",
      detail: "查看运行进度、审核结果与失败任务",
      badge: `${taskCount} 个近期任务`,
      onClick: onOpenTasks,
    },
  ];
}
