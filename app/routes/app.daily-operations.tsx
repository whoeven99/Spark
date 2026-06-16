import { useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import {
  ensureDailySnapshot,
  updateOperationTaskStatus,
  type DailyOperationsResult,
  type OperationTaskAction,
  type OperationTaskView,
} from "../server/operations/dailyInspection.server";
import {
  getShopCostConfig,
  upsertShopCostConfig,
} from "../server/operations/roi/costConfig.server";
import { ensureSkuCostsFresh } from "../server/operations/roi/skuCostSync.server";
import { ensureCustomerValueLayer } from "../server/operations/customerValue.server";
import { computeChannelRoi } from "../server/operations/channelRoi.server";
import {
  PageHeaderNav,
  pageColorTokens,
  mobilePageContentStyle,
  pageContentStyle,
  pageEmptyStateStyle,
} from "./page/pageUiStyles";
import { DailyOperationsBody } from "./dailyOperations/DailyOperationsBody";
import {
  DailyOperationsDetail,
  type ValueLayerData,
} from "./dailyOperations/DailyOperationsDetail";
import {
  buildTaskPrompt,
  type DetailSection,
  type InsightsView,
  type TaskPresentation,
} from "./dailyOperations/shared";

type LoaderData =
  | { ok: true; result: DailyOperationsResult; value: ValueLayerData | null }
  | { ok: false; error: string };

async function loadDailySnapshotOptions(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"]) {
  const shopInfo = await fetchShopBasicInfo(admin);
  return {
    shopifyAdmin: admin,
    timeZone: shopInfo?.ianaTimezone ?? "UTC",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const result = await ensureDailySnapshot(
      session.shop,
      await loadDailySnapshotOptions(admin),
    );

    // 渠道与客户价值层（A 步）：失败不影响诊断与待办主流程
    let value: ValueLayerData | null = null;
    try {
      await ensureSkuCostsFresh(admin, session.shop);
      const costConfig = await getShopCostConfig(session.shop);
      const customers = await ensureCustomerValueLayer(
        session.shop,
        costConfig.defaultGrossMarginPercent,
      );
      const channels = await computeChannelRoi(session.shop, costConfig);
      value = { costConfig, customers, channels };
    } catch (error) {
      console.error("[daily-operations] value layer failed:", error);
    }

    return Response.json({ ok: true, result, value } satisfies LoaderData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-operations] loader failed:", error);
    return Response.json({ ok: false, error: message } satisfies LoaderData);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  try {
    if (intent === "refresh") {
      await ensureDailySnapshot(session.shop, {
        force: true,
        ...(await loadDailySnapshotOptions(admin)),
      });
      return Response.json({ ok: true });
    }
    if (intent === "cost-config") {
      const num = (name: string) => Number(formData.get(name)?.toString() ?? "");
      const config = await upsertShopCostConfig(session.shop, {
        defaultGrossMarginPercent: num("defaultGrossMarginPercent"),
        paymentFeePercent: num("paymentFeePercent"),
        paymentFeeFixed: num("paymentFeeFixed"),
        monthlyFixedCost: num("monthlyFixedCost"),
      });
      // 口径变更后按新毛利率重算客户价值层
      await ensureCustomerValueLayer(session.shop, config.defaultGrossMarginPercent, {
        force: true,
      });
      return Response.json({ ok: true });
    }
    if (intent === "task") {
      const taskId = formData.get("taskId")?.toString() ?? "";
      const taskAction = formData.get("taskAction")?.toString() as
        | OperationTaskAction
        | undefined;
      if (
        !taskId ||
        !taskAction ||
        !["start", "done", "ignore", "reopen"].includes(taskAction)
      ) {
        return Response.json({ ok: false, error: "invalid params" }, { status: 400 });
      }
      const updated = await updateOperationTaskStatus(
        session.shop,
        taskId,
        taskAction,
      );
      if (!updated) {
        return Response.json({ ok: false, error: "task not found" }, { status: 404 });
      }
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "unsupported intent" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-operations] action failed:", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};

/**
 * 概览 ⇄ 详情属于同一路由、仅查询参数变化，详情完全复用已加载的 loader 数据，
 * 因此这种导航跳过 loader 重新验证 → 返回秒开。
 * 表单提交（任务状态变更、重新巡检）仍照常重新验证，保证数据最新。
 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod.toUpperCase() !== "GET") {
    return true;
  }
  if (currentUrl.pathname === nextUrl.pathname) {
    return false;
  }
  return defaultShouldRevalidate;
}

export default function DailyOperationsPage() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const data = useLoaderData() as LoaderData;
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const busy = fetcher.state !== "idle" || revalidator.state !== "idle";
  const [insightsView, setInsightsView] = useState<InsightsView>("today");
  const detailSection = (searchParams.get("detail") as DetailSection | null) ?? null;
  const riskTabParam =
    (searchParams.get("riskTab") as "environment" | "insights" | "health" | null) ?? null;
  const selectedEnvironmentKey = searchParams.get("environmentKey");
  const selectedInsightKey = searchParams.get("insightKey");
  const selectedTaskId = searchParams.get("taskId");

  const statusText = (status: string) => {
    switch (status) {
      case "healthy":
        return t("dailyOps.statusHealthy");
      case "watch":
        return t("dailyOps.statusWatch");
      default:
        return t("dailyOps.statusRisk");
    }
  };

  const taskStatusText = (status: string) => {
    switch (status) {
      case "open":
        return t("dailyOps.taskStatusOpen");
      case "in_progress":
        return t("dailyOps.taskStatusInProgress");
      case "done":
        return t("dailyOps.taskStatusDone");
      case "ignored":
        return t("dailyOps.taskStatusIgnored");
      default:
        return t("dailyOps.taskStatusAutoClosed");
    }
  };

  const dueWindowText = (window: string) => {
    switch (window) {
      case "today":
        return t("dailyOps.dueWindowToday");
      case "48h":
        return t("dailyOps.dueWindow48h");
      case "this_week":
        return t("dailyOps.dueWindowThisWeek");
      default:
        return t("dailyOps.dueWindowBacklog");
    }
  };

  const submitTaskAction = (taskId: string, taskAction: OperationTaskAction) => {
    fetcher.submit({ intent: "task", taskId, taskAction }, { method: "post" });
  };

  const submitRefresh = () => {
    fetcher.submit({ intent: "refresh" }, { method: "post" });
  };

  const openDetail = (
    section: DetailSection,
    extra?: Partial<{
      riskTab: "environment" | "insights" | "health";
      environmentKey: string;
      insightKey: string;
      taskId: string;
    }>,
  ) => {
    const next = new URLSearchParams(searchParams);
    next.set("detail", section);
    next.delete("riskTab");
    next.delete("environmentKey");
    next.delete("insightKey");
    next.delete("taskId");
    if (extra?.riskTab) next.set("riskTab", extra.riskTab);
    if (extra?.environmentKey) next.set("environmentKey", extra.environmentKey);
    if (extra?.insightKey) next.set("insightKey", extra.insightKey);
    if (extra?.taskId) next.set("taskId", extra.taskId);
    setSearchParams(next);
  };

  const detailReturnTo = useMemo(() => {
    if (!detailSection) return undefined;
    const next = new URLSearchParams(searchParams);
    next.delete("detail");
    next.delete("riskTab");
    next.delete("environmentKey");
    next.delete("insightKey");
    next.delete("taskId");
    const query = next.toString();
    return `/app/daily-operations${query ? `?${query}` : ""}`;
  }, [detailSection, searchParams]);

  const generatedAtLabel =
    data.ok && data.result.hasData
      ? t("dailyOps.dataUpdatedAtLabel", {
          value: new Date(data.result.generatedAt).toLocaleString(i18n.language),
        })
      : null;

  return (
    <s-page
      heading={
        detailSection
          ? t(`dailyOps.detailTitle.${detailSection}` as const)
          : t("dailyOps.pageTitle")
      }
    >
      <div
        style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}
      >
        <PageHeaderNav
          title={
            detailSection
              ? t(`dailyOps.detailTitle.${detailSection}` as const)
              : t("dailyOps.pageTitle")
          }
          backLabel={
            detailSection
              ? t("dailyOps.backToOverview")
              : t("common.backToPrevious", { defaultValue: "返回工作台" })
          }
          {...(detailSection
            ? { fallbackPath: "/app/daily-operations", returnTo: detailReturnTo }
            : { workspaceOnly: true })}
          rightAction={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              {generatedAtLabel ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.8125rem",
                    color: pageColorTokens.textSecondary,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "0.5rem",
                      height: "0.5rem",
                      borderRadius: "50%",
                      background: busy
                        ? pageColorTokens.textFootnote
                        : pageColorTokens.brandGreen,
                    }}
                  />
                  {generatedAtLabel}
                </span>
              ) : null}
              <s-button
                type="button"
                variant="tertiary"
                onClick={submitRefresh}
                {...(busy ? { disabled: true } : {})}
              >
                {busy ? t("dailyOps.refreshing") : `↻ ${t("dailyOps.refresh")}`}
              </s-button>
            </div>
          }
        />

        {!data.ok ? (
          <div style={pageEmptyStateStyle}>
            <span>{data.error}</span>
          </div>
        ) : !data.result.hasData ? (
          <div style={pageEmptyStateStyle}>
            <span>{t("dailyOps.emptyState")}</span>
          </div>
        ) : (
          <>
            {detailSection ? (
              <DailyOperationsDetail
                key={detailSection}
                detailSection={detailSection}
                result={data.result}
                value={data.value}
                isMobile={isMobile}
                locale={i18n.language}
                statusText={statusText}
                taskStatusText={taskStatusText}
                dueWindowText={dueWindowText}
                selectedTaskId={selectedTaskId}
                selectedEnvironmentKey={selectedEnvironmentKey}
                selectedInsightKey={selectedInsightKey}
                initialRiskTab={riskTabParam}
                onOpenDetail={openDetail}
                onSubmitTaskAction={submitTaskAction}
                busy={busy}
              />
            ) : (
              <DailyOperationsBody
                result={data.result}
                insightsView={insightsView}
                onChangeInsightsView={setInsightsView}
                isMobile={isMobile}
                statusText={statusText}
                taskStatusText={taskStatusText}
                onSendTaskToAi={(task, presentation) => {
                  const params = new URLSearchParams(
                    typeof window !== "undefined"
                      ? window.location.search.startsWith("?")
                        ? window.location.search.slice(1)
                        : window.location.search
                      : "",
                  );
                  params.set("panel", "chat");
                  params.set(
                    "prefillTaskPrompt",
                    buildTaskPrompt(
                      task,
                      presentation,
                      taskStatusText(task.status),
                      dueWindowText(task.dueWindow),
                      t,
                    ),
                  );
                  navigate(`/app?${params.toString()}`);
                }}
                onOpenDetail={openDetail}
                onSubmitTaskAction={submitTaskAction}
                busy={busy}
              />
            )}
          </>
        )}
      </div>
    </s-page>
  );
}
