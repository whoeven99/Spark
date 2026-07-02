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
import {
  PageHeaderNav,
  pageColorTokens,
  mobilePageContentStyle,
  pageContentStyle,
} from "./page/pageUiStyles";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import type { WorkspaceDashboardSnapshot } from "../lib/workspaceDashboardTypes";

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
        <PageHeaderNav
          title="经营"
          subtitle="先看今日结果，再进入诊断、订单风险或任务中心处理具体对象。"
          backLabel="返回首页"
          fallbackPath="/app"
        />
        <TodayDrilldown
          snapshot={dashboardSnapshot}
          isMobile={isMobile}
          onOpenDailyOps={() => navigate("/app/today/diagnosis")}
          onOpenOrders={() => navigate("/app/today/orders")}
          onOpenTasks={() => navigate("/app/tasks")}
        />
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

function TodayDrilldown({
  snapshot,
  isMobile,
  onOpenDailyOps,
  onOpenOrders,
  onOpenTasks,
}: {
  snapshot: WorkspaceDashboardSnapshot;
  isMobile: boolean;
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
  const cards = [
    {
      title: "每日诊断",
      value: `${riskCount} 风险 / ${watchCount} 关注`,
      detail: snapshot.hasData ? "查看诊断证据与四象限待办" : "暂无完整诊断数据",
      onClick: onOpenDailyOps,
    },
    {
      title: "订单风险",
      value: `${orderRiskCount} 项`,
      detail: "退款、履约、物流和库存对象明细",
      onClick: onOpenOrders,
    },
    {
      title: "任务处理",
      value: `${taskCount} 个近期任务`,
      detail: "查看运行进度、审核结果与失败任务",
      onClick: onOpenTasks,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
        gap: "0.75rem",
      }}
    >
      {cards.map((card) => (
        <button
          key={card.title}
          type="button"
          onClick={card.onClick}
          style={{
            textAlign: "left",
            border: `1px solid ${pageColorTokens.border}`,
            borderRadius: pageColorTokens.radiusCard,
            background: pageColorTokens.surface,
            padding: "1rem",
            boxShadow: pageColorTokens.shadowCard,
            cursor: "pointer",
            display: "grid",
            gap: "0.35rem",
            fontFamily: "inherit",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>
            {card.title}
          </span>
          <span style={{ fontSize: 20, fontWeight: 750, color: pageColorTokens.textPrimary }}>
            {card.value}
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.45, color: pageColorTokens.textSecondary }}>
            {card.detail}
          </span>
        </button>
      ))}
    </div>
  );
}
