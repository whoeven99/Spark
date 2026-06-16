import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  DailyOperationsEnvironment,
  DailyOperationsInsight,
  DailyOperationsResult,
  OperationTaskAction,
  OperationTaskView,
} from "../../server/operations/dailyInspection.server";
import type { TaskQuadrant } from "../../server/operations/diagnosisRules.server";
import type { ShopCostConfigView } from "../../server/operations/roi/costConfig.server";
import type { CustomerValueAggregates } from "../../server/operations/customerValue.server";
import type { ChannelRoiResult } from "../../server/operations/channelRoi.server";
import {
  PageMetricCard,
  PageSurface,
  pageColorTokens,
  pageEmptyStateStyle,
  pageSectionMajorTitleStyle,
} from "../page/pageUiStyles";
import {
  quadrantAccentColors,
  quadrantCellStyle,
  quadrantCountBadgeStyle,
  taskTitleStyle,
  taskMetaTextStyle,
  taskSecondaryTextStyle,
  actionListStyle,
  insightCardStyle,
  listSectionStyle,
  listRowStyle,
  listRowMainStyle,
  listRowMetaStyle,
  listRowValueStackStyle,
  listRowActionsStyle,
  sectionDescriptionStyle,
  metricValueStyle,
  metricMetaRowStyle,
  subtleInlineStatStyle,
  quietPanelStyle,
  taskInfoGridStyle,
  taskInfoItemStyle,
  taskInfoLabelStyle,
  reviewDeltaCardStyle,
  valueCardSectionStyle,
  customerTagWrapStyle,
  channelTableWrapStyle,
  caveatPanelStyle,
  costFormWrapStyle,
  detailActionRowStyle,
  detailSectionStackStyle,
  detailFocusCardStyle,
  detailInfoGridStyle,
  detailInfoCardStyle,
  detailInfoLabelStyle,
  detailInfoValueStyle,
  detailTableStackStyle,
  relatedObjectWrapStyle,
  valueTableStyle,
  valueThStyle,
  valueGroupThStyle,
  groupHeadInnerStyle,
  valueTdStyle,
  costInputStyle,
  costLabelStyle,
} from "./styles";
import {
  priorityTone,
  priorityLabel,
  statusTone,
  diagnosisTone,
  insightConfidenceLabel,
  quadrantLabel,
  DetailSection,
  RiskEnvironmentCard,
  TaskPresentation,
  DetailTableSection,
  TaskRelatedSummaryItem,
  DetailNavTab,
  formatDeltaPrefix,
  inferTaskPresentation,
  buildTaskPrompt,
  buildRiskEnvironmentCards,
  environmentTaskSourceKeys,
  formatDateTimeLabel,
  buildTaskRelatedSummaryItems,
  DetailTableCard,
  DetailContextHeader,
  DetailStatStrip,
  DataSource,
  SourceTag,
} from "./shared";

export type ValueLayerData = {
  costConfig: ShopCostConfigView;
  customers: CustomerValueAggregates;
  channels: ChannelRoiResult;
};

export function DailyOperationsDetail({
  detailSection,
  result,
  value,
  isMobile,
  locale,
  statusText,
  taskStatusText,
  dueWindowText,
  selectedTaskId,
  selectedEnvironmentKey,
  selectedInsightKey,
  initialRiskTab,
  onOpenDetail,
  onSubmitTaskAction,
  busy,
}: {
  detailSection: DetailSection;
  result: DailyOperationsResult;
  value: ValueLayerData | null;
  isMobile: boolean;
  locale: string;
  statusText: (status: string) => string;
  taskStatusText: (status: string) => string;
  dueWindowText: (window: string) => string;
  selectedTaskId: string | null;
  selectedEnvironmentKey: string | null;
  selectedInsightKey: string | null;
  initialRiskTab: "environment" | "insights" | "health" | null;
  onOpenDetail: (
    section: DetailSection,
    extra?: Partial<{
      riskTab: "environment" | "insights" | "health";
      environmentKey: string;
      insightKey: string;
      taskId: string;
    }>,
  ) => void;
  onSubmitTaskAction: (taskId: string, action: OperationTaskAction) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const m = result.metrics;
  const hasPixelData = m.hasPixelData;
  const sessionsValue = hasPixelData ? String(m.sessions7d) : t("dailyOps.metricNotConnected");
  const conversionValue =
    hasPixelData && m.conversionRate7d !== null
      ? `${m.conversionRate7d}%`
      : t("dailyOps.metricNotConnected");
  const growthLabel =
    m.salesGrowthRate === null
      ? t("dailyOps.metricNoBaseline")
      : `${m.salesGrowthRate >= 0 ? "+" : ""}${m.salesGrowthRate}%`;
  const riskCards = buildRiskEnvironmentCards(result.environments, t);
  const diagnosisInsights = result.insights;
  const [riskTab, setRiskTab] = useState<"environment" | "insights" | "health">(
    initialRiskTab ?? "environment",
  );
  const [valueTab, setValueTab] = useState<"framework" | "customers" | "channels" | "cost">(
    "framework",
  );
  const selectedTask = selectedTaskId
    ? result.tasks.find((task) => task.id === selectedTaskId) ?? null
    : null;
  const selectedEnvironment = selectedEnvironmentKey
    ? result.environments.find((environment) => environment.key === selectedEnvironmentKey) ?? null
    : null;
  const selectedEnvironmentCard = selectedEnvironment
    ? riskCards.find((card) => card.key === selectedEnvironment.key) ?? null
    : null;
  const orderedRiskCards = useMemo(() => {
    if (!selectedEnvironmentKey) return riskCards;
    return [...riskCards].sort((left, right) => {
      if (left.key === selectedEnvironmentKey) return -1;
      if (right.key === selectedEnvironmentKey) return 1;
      return 0;
    });
  }, [riskCards, selectedEnvironmentKey]);
  const orderedInsights = useMemo(() => {
    if (!selectedInsightKey) return diagnosisInsights;
    return [...diagnosisInsights].sort((left, right) => {
      if (left.key === selectedInsightKey) return -1;
      if (right.key === selectedInsightKey) return 1;
      return 0;
    });
  }, [diagnosisInsights, selectedInsightKey]);
  const selectedEnvironmentInsights = selectedEnvironment
    ? diagnosisInsights.filter((item) => item.environmentKeys.includes(selectedEnvironment.key))
    : [];
  const selectedEnvironmentTasks = selectedEnvironment
    ? result.tasks.filter((task) =>
        (environmentTaskSourceKeys[selectedEnvironment.key] ?? []).includes(task.sourceKey),
      )
    : [];
  const selectedEnvironmentSections = useMemo<DetailTableSection<any>[]>(() => {
    if (!selectedEnvironment) return [];
    switch (selectedEnvironment.key) {
      case "after-sales":
        return [
          {
            key: "refund-orders",
            title: t("orderMonitor.abnormalRefundOrdersTitle"),
            subtitle: t("dailyOps.detailRelatedObjectsSubtitle"),
            emptyText: t("orderMonitor.emptyAbnormalRefund"),
            rows: result.detail.abnormalRefundOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "rate",
                header: t("orderMonitor.colRefundRatio"),
                render: (row) => (row.rate === null ? "—" : `${row.rate}%`),
              },
              {
                key: "reason",
                header: t("orderMonitor.colReason"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.reason}</span>,
              },
              {
                key: "processedAt",
                header: t("orderMonitor.colProcessedAt"),
                render: (row) => formatDateTimeLabel(row.processedAt),
              },
            ],
          },
          {
            key: "refund-skus",
            title: t("orderMonitor.topRefundSkuTitle"),
            emptyText: t("orderMonitor.emptyRefundSku"),
            rows: result.detail.topRefundSkus,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "qty",
                header: t("orderMonitor.colQty"),
                render: (row) => row.quantity,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "reason",
                header: t("orderMonitor.colReason"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.reason}</span>,
              },
            ],
          },
        ];
      case "fulfillment":
        return [
          {
            key: "overdue-orders",
            title: t("orderMonitor.overdueOrdersTitle"),
            emptyText: t("orderMonitor.emptyOverdue"),
            rows: result.detail.overdueOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "ageHours",
                header: t("orderMonitor.colAgeHours"),
                render: (row) => row.ageHours,
              },
              {
                key: "status",
                header: t("orderMonitor.colStatus"),
                render: (row) => row.fulfillmentStatus,
              },
              {
                key: "customer",
                header: t("orderMonitor.colCustomer"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.customer}</span>,
              },
            ],
          },
          {
            key: "carrier-issues",
            title: t("orderMonitor.carrierIssuesTitle"),
            emptyText: t("orderMonitor.emptyCarrierIssues"),
            rows: result.detail.carrierIssues,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "carrier",
                header: t("orderMonitor.colCarrier"),
                render: (row) => row.carrier,
              },
              {
                key: "tracking",
                header: t("orderMonitor.colTracking"),
                render: (row) => row.trackingNumber,
              },
              {
                key: "shipmentStatus",
                header: t("orderMonitor.colShipmentStatus"),
                render: (row) => row.shipmentStatus,
              },
              {
                key: "ageDays",
                header: t("orderMonitor.colAgeDays"),
                render: (row) => row.ageDays,
              },
            ],
          },
          {
            key: "routine-orders",
            title: t("orderMonitor.unfulfilledOrdersTitle"),
            emptyText: t("orderMonitor.emptyUnfulfilled"),
            rows: result.detail.routineUnfulfilledOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "ageHours",
                header: t("orderMonitor.colAgeHours"),
                render: (row) => row.ageHours,
              },
              {
                key: "status",
                header: t("orderMonitor.colStatus"),
                render: (row) => row.fulfillmentStatus,
              },
              {
                key: "customer",
                header: t("orderMonitor.colCustomer"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.customer}</span>,
              },
            ],
          },
        ];
      case "inventory":
        return [
          {
            key: "inventory-risks",
            title: t("orderMonitor.inventoryRiskTitle"),
            subtitle: t("orderMonitor.inventoryRiskSubtitle", {
              count: result.detail.inventoryRisks.filter((item) => item.risk === "risk").length,
              loss: result.metrics.estimatedInventoryLoss,
              currency: result.metrics.currency,
            }),
            emptyText: t("orderMonitor.emptyInventoryRisk"),
            rows: result.detail.inventoryRisks,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "variant",
                header: t("orderMonitor.colVariantTitle"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.variantTitle}</span>,
              },
              {
                key: "available",
                header: t("orderMonitor.colAvailable"),
                render: (row) => row.available,
              },
              {
                key: "velocity",
                header: t("orderMonitor.colVelocity"),
                render: (row) => row.dailySalesVelocity,
              },
              {
                key: "sellableDays",
                header: t("orderMonitor.colSellableDays"),
                render: (row) => (row.sellableDays === null ? "—" : row.sellableDays),
              },
              {
                key: "risk",
                header: t("orderMonitor.colPriority"),
                render: (row) => (
                  <s-badge tone={diagnosisTone(row.risk)}>{statusText(row.risk)}</s-badge>
                ),
              },
              {
                key: "loss",
                header: t("orderMonitor.colLoss"),
                render: (row) => row.estimatedLoss,
              },
            ],
          },
        ];
      default:
        return [];
    }
  }, [result.detail, result.metrics.currency, result.metrics.estimatedInventoryLoss, selectedEnvironment, statusText, t]);
  const selectedInsight = selectedInsightKey
    ? diagnosisInsights.find((item) => item.key === selectedInsightKey) ?? null
    : null;
  const selectedInsightTasks = selectedInsight
    ? result.tasks.filter((task) => selectedInsight.relatedTaskSourceKeys.includes(task.sourceKey))
    : [];
  const selectedInsightEnvironmentCards = selectedInsight
    ? riskCards.filter((card) => selectedInsight.environmentKeys.includes(card.key))
    : [];
  const selectedInsightSections = useMemo<DetailTableSection<any>[]>(() => {
    if (!selectedInsight) return [];
    switch (selectedInsight.diagnosisKey) {
      case "refund_health":
        return [
          {
            key: "insight-refund-orders",
            title: t("orderMonitor.abnormalRefundOrdersTitle"),
            emptyText: t("orderMonitor.emptyAbnormalRefund"),
            rows: result.detail.abnormalRefundOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "reason",
                header: t("orderMonitor.colReason"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.reason}</span>,
              },
              {
                key: "skus",
                header: t("dailyOps.relatedObjectsLabel"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.skus}</span>,
              },
            ],
          },
          {
            key: "insight-refund-skus",
            title: t("orderMonitor.topRefundSkuTitle"),
            emptyText: t("orderMonitor.emptyRefundSku"),
            rows: result.detail.topRefundSkus,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "qty",
                header: t("orderMonitor.colQty"),
                render: (row) => row.quantity,
              },
            ],
          },
        ];
      case "inventory_health":
        return [
          {
            key: "insight-inventory-risks",
            title: t("orderMonitor.inventoryRiskTitle"),
            emptyText: t("orderMonitor.emptyInventoryRisk"),
            rows: result.detail.inventoryRisks,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "sellableDays",
                header: t("orderMonitor.colSellableDays"),
                render: (row) => (row.sellableDays === null ? "—" : row.sellableDays),
              },
              {
                key: "priority",
                header: t("orderMonitor.colPriority"),
                render: (row) => (
                  <s-badge tone={diagnosisTone(row.risk)}>{statusText(row.risk)}</s-badge>
                ),
              },
              {
                key: "loss",
                header: t("orderMonitor.colLoss"),
                render: (row) => row.estimatedLoss,
              },
            ],
          },
        ];
      case "fulfillment_health":
      case "logistics_anomaly":
        return [
          {
            key: "insight-overdue-orders",
            title: t("orderMonitor.overdueOrdersTitle"),
            emptyText: t("orderMonitor.emptyOverdue"),
            rows: result.detail.overdueOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "ageHours",
                header: t("orderMonitor.colAgeHours"),
                render: (row) => row.ageHours,
              },
              {
                key: "status",
                header: t("orderMonitor.colStatus"),
                render: (row) => row.fulfillmentStatus,
              },
              {
                key: "customer",
                header: t("orderMonitor.colCustomer"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.customer}</span>,
              },
            ],
          },
          {
            key: "insight-carrier-issues",
            title: t("orderMonitor.carrierIssuesTitle"),
            emptyText: t("orderMonitor.emptyCarrierIssues"),
            rows: result.detail.carrierIssues,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "carrier",
                header: t("orderMonitor.colCarrier"),
                render: (row) => row.carrier,
              },
              {
                key: "shipmentStatus",
                header: t("orderMonitor.colShipmentStatus"),
                render: (row) => row.shipmentStatus,
              },
              {
                key: "ageDays",
                header: t("orderMonitor.colAgeDays"),
                render: (row) => row.ageDays,
              },
            ],
          },
        ];
      default:
        return [];
    }
  }, [result.detail, selectedInsight, statusText, t]);
  const selectedTaskRelatedSummary = selectedTask
    ? buildTaskRelatedSummaryItems(selectedTask.relatedObjects, t)
    : [];
  const reviewImprovedCount =
    result.review?.deltas.filter((delta) => delta.improved === true).length ?? 0;
  const reviewWorsenedCount =
    result.review?.deltas.filter((delta) => delta.improved === false).length ?? 0;
  const riskTabs: DetailNavTab[] = [
    {
      key: "environment",
      label: t("dailyOps.detailTabEnvironment"),
      active: riskTab === "environment",
      onClick: () => {
        setRiskTab("environment");
        onOpenDetail("risk", { riskTab: "environment" });
      },
    },
    {
      key: "insights",
      label: t("dailyOps.detailTabInsights"),
      active: riskTab === "insights",
      onClick: () => {
        setRiskTab("insights");
        onOpenDetail("risk", { riskTab: "insights" });
      },
    },
    {
      key: "health",
      label: t("dailyOps.detailTabHealth"),
      active: riskTab === "health",
      onClick: () => {
        setRiskTab("health");
        onOpenDetail("risk", { riskTab: "health" });
      },
    },
  ];
  const riskContextTitle =
    riskTab === "environment"
      ? selectedEnvironmentCard?.title ?? t("dailyOps.riskEnvironmentTitle")
      : riskTab === "insights"
        ? selectedInsight?.title ?? t("dailyOps.dataInsightsTitle")
        : t("dailyOps.healthTitle");
  const riskContextSubtitle =
    riskTab === "environment"
      ? selectedEnvironment?.summary ??
        (selectedEnvironmentCard ? selectedEnvironmentCard.summary : t("dailyOps.detailRiskSelectEnvironment"))
      : riskTab === "insights"
        ? selectedInsight?.summary ?? t("dailyOps.detailRiskSelectInsight")
        : t("dailyOps.healthSubtitle");
  const valueTabs: DetailNavTab[] = [
    {
      key: "framework",
      label: t("dailyOps.detailTabFramework"),
      active: valueTab === "framework",
      onClick: () => setValueTab("framework"),
    },
    {
      key: "customers",
      label: t("dailyOps.detailTabCustomers"),
      active: valueTab === "customers",
      onClick: () => setValueTab("customers"),
    },
    {
      key: "channels",
      label: t("dailyOps.detailTabChannels"),
      active: valueTab === "channels",
      onClick: () => setValueTab("channels"),
    },
    {
      key: "cost",
      label: t("dailyOps.detailTabCost"),
      active: valueTab === "cost",
      onClick: () => setValueTab("cost"),
    },
  ];

  if (detailSection === "performance") {
    return (
      <div style={detailSectionStackStyle}>
        <DetailContextHeader
          sectionLabel={t("dailyOps.detailTitle.performance")}
          title={t("dailyOps.keyMetricsTitle")}
          subtitle={t("dailyOps.keyMetricsSubtitle", { shop: result.shop })}
          badges={
            <s-badge tone="info">
              {t("dailyOps.dataUpdatedAtLabel", {
                value: new Date(result.generatedAt).toLocaleString(locale),
              })}
            </s-badge>
          }
        />
        <DetailStatStrip
          isMobile={isMobile}
          items={[
            {
              key: "sales",
              label: t("dailyOps.metricSales7d"),
              value: `${m.salesAmount7d} ${m.currency}`,
              hint: `${t("dailyOps.metricGrowth")}: ${growthLabel}`,
            },
            {
              key: "conversion",
              label: t("dailyOps.metricGroupConversion"),
              value: conversionValue,
              hint: `${t("dailyOps.metricGroupTraffic")}: ${sessionsValue}`,
            },
            {
              key: "review",
              label: t("dailyOps.detailHeroReview"),
              value: result.review?.resolvedTaskCount ?? 0,
              hint: result.review
                ? t("dailyOps.summaryReviewInline", {
                    date: result.review.previousDate,
                    improved: reviewImprovedCount,
                    worsened: reviewWorsenedCount,
                  })
                : t("dailyOps.reviewResolved", { count: result.review?.resolvedTaskCount ?? 0 }),
            },
          ]}
        />
        <PageSurface
          title={t("dailyOps.keyMetricsTitle")}
          subtitle={t("dailyOps.keyMetricsSubtitle", { shop: result.shop })}
        >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                gap: "0.9rem",
              }}
            >
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupTraffic")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricTrafficChange", {
                      value:
                        m.trafficChangeRate === null
                          ? t("dailyOps.metricNoBaseline")
                          : `${formatDeltaPrefix(m.trafficChangeRate)}%`,
                    })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>{sessionsValue}</h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricTrafficHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupAov")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricAovPrev", { value: m.aovPrev7d })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>
                  {m.aov7d} {m.currency}
                </h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricAovHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupConversion")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricConversionPrev", {
                      value:
                        m.conversionRatePrev7d === null
                          ? t("dailyOps.metricNoBaseline")
                          : `${m.conversionRatePrev7d}%`,
                    })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>{conversionValue}</h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricConversionHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupCost")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricRefundDeltaShort", {
                      value: `${formatDeltaPrefix(m.refundRateDelta)}pp`,
                    })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>{`${m.refundRate30d}%`}</h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricCostHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupShortRoi")}</span>
                  <span style={taskSecondaryTextStyle}>{t("dailyOps.metricSales7d")}</span>
                </div>
                <h3 style={metricValueStyle}>{growthLabel}</h3>
                <p style={taskSecondaryTextStyle}>{t("dailyOps.metricShortRoiHintLine1")}</p>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricShortRoiHintLine2")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupLongRoi")}</span>
                  <span style={taskSecondaryTextStyle}>{t("dailyOps.customerTitle")}</span>
                </div>
                <h3 style={metricValueStyle}>
                  {value
                    ? `${value.customers.averageDynamicLtv} ${m.currency}`
                    : t("dailyOps.metricNotConnected")}
                </h3>
                <p style={taskSecondaryTextStyle}>{t("dailyOps.metricLongRoiHintLine1")}</p>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricLongRoiHintLine2")}</p>
              </div>
            </div>
            <div style={{ ...detailActionRowStyle, marginTop: "0.75rem" }}>
              <span style={taskSecondaryTextStyle}>
                {t("dailyOps.dataUpdatedAtLabel", {
                  value: new Date(result.generatedAt).toLocaleString(locale),
                })}
              </span>
              {result.review ? (
                <span style={taskSecondaryTextStyle}>
                  {t("dailyOps.reviewResolved", { count: result.review.resolvedTaskCount })}
                </span>
              ) : null}
            </div>
            {result.review ? (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.8rem 0.9rem",
                  borderRadius: pageColorTokens.radiusControl,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  background: pageColorTokens.surfaceMuted,
                }}
              >
                <p style={{ ...taskMetaTextStyle, marginBottom: "0.6rem" }}>
                  {t("dailyOps.summaryReviewInline", {
                    date: result.review.previousDate,
                    improved: reviewImprovedCount,
                    worsened: reviewWorsenedCount,
                  })}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                  {result.review.deltas.map((delta) => (
                    <div key={delta.key} style={reviewDeltaCardStyle}>
                      <strong>{delta.label}</strong>: {delta.previous} → {delta.current}{" "}
                      <s-badge
                        tone={
                          delta.improved === null
                            ? "info"
                            : delta.improved
                              ? "success"
                              : "critical"
                        }
                      >
                        {delta.improved === null
                          ? t("dailyOps.reviewFlat")
                          : delta.improved
                            ? t("dailyOps.reviewImproved")
                            : t("dailyOps.reviewWorsened")}
                      </s-badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
        </PageSurface>
      </div>
    );
  }

  if (detailSection === "risk") {
    return (
      <div style={detailSectionStackStyle}>
        <DetailContextHeader
          sectionLabel={t("dailyOps.detailTitle.risk")}
          title={riskContextTitle}
          subtitle={riskContextSubtitle}
          badges={
            riskTab === "environment" && selectedEnvironmentCard ? (
              <>
                <SourceTag source={selectedEnvironmentCard.source} />
                <s-badge tone={diagnosisTone(selectedEnvironmentCard.status)}>
                  {statusText(selectedEnvironmentCard.status)}
                </s-badge>
              </>
            ) : riskTab === "insights" && selectedInsight ? (
              <>
                <s-badge tone={diagnosisTone(selectedInsight.status)}>
                  {statusText(selectedInsight.status)}
                </s-badge>
                <s-badge>{insightConfidenceLabel(selectedInsight.confidence, t)}</s-badge>
              </>
            ) : (
              <s-badge tone="info">{result.items.length}</s-badge>
            )
          }
          tabs={riskTabs}
        />
        <DetailStatStrip
          isMobile={isMobile}
          items={[
            {
              key: "risk",
              label: t("dailyOps.riskEnvironmentTitle"),
              value: riskCards.filter((card) => card.status === "risk").length,
              hint: t("dailyOps.detailRiskCritical"),
            },
            {
              key: "insights",
              label: t("dailyOps.dataInsightsTitle"),
              value: diagnosisInsights.length,
              hint: t("dailyOps.detailRiskInsights"),
            },
            {
              key: "health",
              label: t("dailyOps.healthTitle"),
              value: result.items.length,
              hint: t("dailyOps.detailRiskHealth"),
            },
          ]}
        />
        {riskTab === "environment" ? (
          <div style={detailSectionStackStyle}>
            <PageSurface
              title={t("dailyOps.riskEnvironmentTitle")}
              subtitle={t("dailyOps.riskEnvironmentSubtitle")}
            >
              <div style={listSectionStyle}>
                {orderedRiskCards.map((card) => (
                  <div
                    key={card.key}
                    style={{
                      ...listRowStyle,
                      ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                      ...(card.key === selectedEnvironmentKey
                        ? {
                            borderColor: pageColorTokens.borderStrong,
                            boxShadow: "0 0 0 1px rgba(44, 110, 203, 0.08)",
                          }
                        : null),
                    }}
                  >
                    <div style={listRowMainStyle}>
                      <div style={listRowMetaStyle}>
                        <SourceTag source={card.source} />
                        <s-badge tone={diagnosisTone(card.status)}>{statusText(card.status)}</s-badge>
                      </div>
                      <h3 style={taskTitleStyle}>{card.title}</h3>
                      <p style={taskSecondaryTextStyle}>{card.summary}</p>
                    </div>
                    <div style={listRowValueStackStyle}>
                      <span style={taskMetaTextStyle}>{card.primaryMetric}</span>
                      <span style={taskSecondaryTextStyle}>{card.secondaryMetric}</span>
                    </div>
                    <div
                      style={{
                        ...listRowActionsStyle,
                        ...(isMobile ? { justifyContent: "flex-start" } : null),
                      }}
                    >
                      <s-button
                        type="button"
                        variant="tertiary"
                        onClick={() =>
                          onOpenDetail("risk", {
                            riskTab: "environment",
                            environmentKey: card.key,
                          })
                        }
                      >
                        {t("dailyOps.viewDetail")}
                      </s-button>
                    </div>
                  </div>
                ))}
              </div>
            </PageSurface>
            {selectedEnvironmentCard ? (
              <PageSurface
                title={selectedEnvironmentCard.title}
                subtitle={selectedEnvironment?.summary ?? selectedEnvironmentCard.summary}
              >
                <div style={detailFocusCardStyle}>
                  <div style={listRowMetaStyle}>
                    <SourceTag source={selectedEnvironmentCard.source} />
                    <s-badge tone={diagnosisTone(selectedEnvironmentCard.status)}>
                      {statusText(selectedEnvironmentCard.status)}
                    </s-badge>
                  </div>
                  <div
                    style={{
                      ...detailInfoGridStyle,
                      ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                    }}
                  >
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.metricPrimary")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentCard.primaryMetric}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.metricSecondary")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentCard.secondaryMetric}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.dataInsightsTitle")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentInsights.length}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.taskWorkbenchTitle")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentTasks.length}</span>
                    </div>
                  </div>
                </div>
                {selectedEnvironmentSections.length > 0 ? (
                  <div style={{ ...detailTableStackStyle, marginTop: "0.9rem" }}>
                    {selectedEnvironmentSections.map((section) => (
                      <DetailTableCard key={section.key} section={section} />
                    ))}
                  </div>
                ) : (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailRelatedObjectsEmpty")}</strong>
                  </div>
                )}
                {selectedEnvironmentTasks.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.relatedTasksLabel")}</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {selectedEnvironmentTasks.slice(0, 4).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.65rem 0.75rem",
                            borderRadius: pageColorTokens.radiusControl,
                            border: `1px solid ${pageColorTokens.borderSubtle}`,
                            background: pageColorTokens.surface,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() => onOpenDetail("task", { taskId: task.id })}
                        >
                          <span style={taskMetaTextStyle}>{task.title}</span>
                          <s-badge tone={statusTone(task.status)}>
                            {taskStatusText(task.status)}
                          </s-badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </PageSurface>
            ) : (
              <PageSurface
                title={t("dailyOps.detailRelatedObjectsTitle")}
                subtitle={t("dailyOps.detailRiskSelectEnvironment")}
              >
                <div style={pageEmptyStateStyle}>{t("dailyOps.detailRiskSelectEnvironment")}</div>
              </PageSurface>
            )}
          </div>
        ) : riskTab === "insights" ? (
          <div style={detailSectionStackStyle}>
            <PageSurface
              title={t("dailyOps.dataInsightsTitle")}
              subtitle={t("dailyOps.dataInsightsSubtitle")}
            >
              {orderedInsights.length === 0 ? (
                <p style={taskSecondaryTextStyle}>{t("dailyOps.dataInsightsEmpty")}</p>
              ) : (
                <div style={listSectionStyle}>
                  {orderedInsights.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        ...insightCardStyle,
                        ...(item.key === selectedInsightKey
                          ? {
                              borderColor: pageColorTokens.borderStrong,
                              boxShadow: "0 0 0 1px rgba(44, 110, 203, 0.08)",
                            }
                          : null),
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <h3 style={taskTitleStyle}>{item.title}</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                          <s-badge tone={diagnosisTone(item.status)}>{statusText(item.status)}</s-badge>
                          <s-badge>{insightConfidenceLabel(item.confidence, t)}</s-badge>
                        </div>
                      </div>
                      <p style={taskMetaTextStyle}>{item.summary}</p>
                      <div style={quietPanelStyle}>
                        {item.evidence.map((line, index) => (
                          <p key={`e-${item.key}-${index}`} style={taskSecondaryTextStyle}>
                            {line}
                          </p>
                        ))}
                      </div>
                      {item.reasoning.length > 0 ? (
                        <div style={quietPanelStyle}>
                          {item.reasoning.map((line, index) => (
                            <p key={`r-${item.key}-${index}`} style={taskMetaTextStyle}>
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div style={detailActionRowStyle}>
                        <span style={taskSecondaryTextStyle}>
                          {t("dailyOps.insightTaskCount", { count: item.taskCount })}
                        </span>
                        <s-button
                          type="button"
                          variant="tertiary"
                          onClick={() =>
                            onOpenDetail("risk", {
                              riskTab: "insights",
                              insightKey: item.key,
                            })
                          }
                        >
                          {t("dailyOps.viewDetail")}
                        </s-button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PageSurface>
            {selectedInsight ? (
              <PageSurface title={selectedInsight.title} subtitle={selectedInsight.summary}>
                <div style={detailFocusCardStyle}>
                  <div style={listRowMetaStyle}>
                    <s-badge tone={diagnosisTone(selectedInsight.status)}>
                      {statusText(selectedInsight.status)}
                    </s-badge>
                    <s-badge>{insightConfidenceLabel(selectedInsight.confidence, t)}</s-badge>
                  </div>
                  <div
                    style={{
                      ...detailInfoGridStyle,
                      ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                    }}
                  >
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.relatedObjectsLabel")}</span>
                      <span style={detailInfoValueStyle}>
                        {selectedInsightSections.length > 0
                          ? selectedInsightSections.reduce((sum, section) => sum + section.rows.length, 0)
                          : "—"}
                      </span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.relatedTasksLabel")}</span>
                      <span style={detailInfoValueStyle}>{selectedInsightTasks.length}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.riskEnvironmentTitle")}</span>
                      <span style={detailInfoValueStyle}>{selectedInsightEnvironmentCards.length}</span>
                    </div>
                  </div>
                </div>
                <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                  <strong>{t("dailyOps.detailInsightEvidenceTitle")}</strong>
                  {selectedInsight.evidence.map((line, index) => (
                    <p key={`selected-e-${index}`} style={taskSecondaryTextStyle}>
                      {line}
                    </p>
                  ))}
                </div>
                {selectedInsight.reasoning.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailInsightReasoningTitle")}</strong>
                    {selectedInsight.reasoning.map((line, index) => (
                      <p key={`selected-r-${index}`} style={taskMetaTextStyle}>
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
                {selectedInsightSections.length > 0 ? (
                  <div style={{ ...detailTableStackStyle, marginTop: "0.9rem" }}>
                    {selectedInsightSections.map((section) => (
                      <DetailTableCard key={section.key} section={section} />
                    ))}
                  </div>
                ) : (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailRelatedObjectsEmpty")}</strong>
                  </div>
                )}
                {selectedInsightEnvironmentCards.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailInsightEnvironmentsTitle")}</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {selectedInsightEnvironmentCards.map((card) => (
                        <button
                          key={card.key}
                          type="button"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.65rem 0.75rem",
                            borderRadius: pageColorTokens.radiusControl,
                            border: `1px solid ${pageColorTokens.borderSubtle}`,
                            background: pageColorTokens.surface,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() =>
                            onOpenDetail("risk", {
                              riskTab: "environment",
                              environmentKey: card.key,
                            })
                          }
                        >
                          <span style={taskMetaTextStyle}>{card.title}</span>
                          <s-badge tone={diagnosisTone(card.status)}>{statusText(card.status)}</s-badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedInsightTasks.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.relatedTasksLabel")}</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {selectedInsightTasks.slice(0, 4).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.65rem 0.75rem",
                            borderRadius: pageColorTokens.radiusControl,
                            border: `1px solid ${pageColorTokens.borderSubtle}`,
                            background: pageColorTokens.surface,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() => onOpenDetail("task", { taskId: task.id })}
                        >
                          <span style={taskMetaTextStyle}>{task.title}</span>
                          <s-badge tone={statusTone(task.status)}>
                            {taskStatusText(task.status)}
                          </s-badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </PageSurface>
            ) : (
              <PageSurface
                title={t("dailyOps.detailRelatedObjectsTitle")}
                subtitle={t("dailyOps.detailRiskSelectInsight")}
              >
                <div style={pageEmptyStateStyle}>{t("dailyOps.detailRiskSelectInsight")}</div>
              </PageSurface>
            )}
          </div>
        ) : (
          <PageSurface
            title={t("dailyOps.healthTitle")}
            subtitle={t("dailyOps.healthSubtitle")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {result.items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                    padding: "0.75rem 0.9rem",
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    borderRadius: pageColorTokens.radiusControl,
                  }}
                >
                  <s-stack direction={isMobile ? "block" : "inline"} gap="small" alignItems="center">
                    <s-badge tone={diagnosisTone(item.status)}>
                      {item.name}: {statusText(item.status)}
                    </s-badge>
                  </s-stack>
                  {item.evidence.map((line, index) => (
                    <p key={`e-all-${item.key}-${index}`} style={taskSecondaryTextStyle}>
                      {line}
                    </p>
                  ))}
                  {item.reasoning.map((line, index) => (
                    <p key={`r-all-${item.key}-${index}`} style={taskMetaTextStyle}>
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </PageSurface>
        )}
      </div>
    );
  }

  if (detailSection === "task") {
    if (!selectedTask) {
      return <div style={pageEmptyStateStyle}>{t("dailyOps.taskDetailEmpty")}</div>;
    }
    const presentation = inferTaskPresentation(selectedTask, t);
    const closed = ["done", "ignored", "auto_closed"].includes(selectedTask.status);
    return (
      <div style={detailSectionStackStyle}>
        <DetailContextHeader
          sectionLabel={t("dailyOps.detailTitle.task")}
          title={selectedTask.title}
          subtitle={selectedTask.triggerReason}
          badges={
            <>
              <s-badge tone={priorityTone(selectedTask.priority)}>
                {priorityLabel(selectedTask.priority, t)}
              </s-badge>
              <s-badge tone={statusTone(selectedTask.status)}>
                {taskStatusText(selectedTask.status)}
              </s-badge>
              <s-badge>{dueWindowText(selectedTask.dueWindow)}</s-badge>
            </>
          }
        />
        <DetailStatStrip
          isMobile={isMobile}
          items={[
            {
              key: "objective",
              label: t("dailyOps.taskObjectiveLabel"),
              value: presentation.impactMetric,
              hint: presentation.estimatedLift,
            },
            {
              key: "roi",
              label: t("dailyOps.taskRoiImpactLabel"),
              value: taskStatusText(selectedTask.status),
              hint: presentation.roiImpact,
            },
            {
              key: "due",
              label: t("dailyOps.taskPromptDue"),
              value: dueWindowText(selectedTask.dueWindow),
              hint: quadrantLabel(selectedTask.quadrant, t),
            },
          ]}
        />
        <PageSurface title={selectedTask.title} subtitle={selectedTask.triggerReason}>
          <div style={{ ...listRowMetaStyle, marginBottom: "0.8rem" }}>
            <s-badge tone={priorityTone(selectedTask.priority)}>
              {priorityLabel(selectedTask.priority, t)}
            </s-badge>
            <s-badge tone={statusTone(selectedTask.status)}>
              {taskStatusText(selectedTask.status)}
            </s-badge>
            <s-badge>{dueWindowText(selectedTask.dueWindow)}</s-badge>
            {selectedTask.ownerRole ? (
              <span style={taskSecondaryTextStyle}>
                {t("dailyOps.ownerLabel", { value: selectedTask.ownerRole })}
              </span>
            ) : null}
          </div>
          <div style={{ ...taskInfoGridStyle, ...(isMobile ? { gridTemplateColumns: "1fr" } : null) }}>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskObjectiveLabel")}</span>
              <span style={taskMetaTextStyle}>{presentation.objective}</span>
            </div>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskImpactMetricLabel")}</span>
              <span style={taskMetaTextStyle}>{presentation.impactMetric}</span>
            </div>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskEstimatedLiftLabel")}</span>
              <span style={taskMetaTextStyle}>{presentation.estimatedLift}</span>
            </div>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskRoiImpactLabel")}</span>
              <span style={taskSecondaryTextStyle}>{presentation.roiImpact}</span>
            </div>
          </div>
          {selectedTask.suggestedActions.length > 0 ? (
            <div style={{ ...quietPanelStyle, marginTop: "0.85rem" }}>
              <p style={{ ...taskSecondaryTextStyle, marginBottom: "0.25rem" }}>
                {t("dailyOps.suggestedActionsLabel")}
              </p>
              <ul style={actionListStyle}>
                {selectedTask.suggestedActions.map((action, index) => (
                  <li key={index}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {selectedTaskRelatedSummary.length > 0 ? (
            <div style={{ ...relatedObjectWrapStyle, marginTop: "0.85rem" }}>
              <strong>{t("dailyOps.relatedObjectsLabel")}</strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                  gap: "0.65rem",
                }}
              >
                {selectedTaskRelatedSummary.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      padding: "0.7rem 0.8rem",
                      borderRadius: pageColorTokens.radiusControl,
                      border: `1px solid ${pageColorTokens.borderSubtle}`,
                      background: pageColorTokens.surface,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.2rem",
                    }}
                  >
                    <span style={detailInfoLabelStyle}>{item.label}</span>
                    <span style={{ ...taskMetaTextStyle, whiteSpace: "normal" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ ...detailActionRowStyle, marginTop: "0.9rem" }}>
            <div style={{ ...listRowMetaStyle, gap: "0.35rem" }}>
              <span style={taskSecondaryTextStyle}>{selectedTask.triggerReason}</span>
            </div>
            <div style={listRowActionsStyle}>
              <s-button
                type="button"
                variant="secondary"
                onClick={() => {
                  const prompt = buildTaskPrompt(
                    selectedTask,
                    presentation,
                    taskStatusText(selectedTask.status),
                    dueWindowText(selectedTask.dueWindow),
                    t,
                  );
                  const params = new URLSearchParams();
                  params.set("panel", "chat");
                  params.set("prefillTaskPrompt", prompt);
                  window.location.href = `/app?${params.toString()}`;
                }}
              >
                {t("dailyOps.actionSendToAi")}
              </s-button>
              {selectedTask.status === "open" ? (
                <s-button
                  type="button"
                  variant="primary"
                  onClick={() => onSubmitTaskAction(selectedTask.id, "start")}
                  {...(busy ? { disabled: true } : {})}
                >
                  {t("dailyOps.actionStart")}
                </s-button>
              ) : null}
              {selectedTask.status === "in_progress" ? (
                <s-button
                  type="button"
                  variant="primary"
                  onClick={() => onSubmitTaskAction(selectedTask.id, "done")}
                  {...(busy ? { disabled: true } : {})}
                >
                  {t("dailyOps.actionDone")}
                </s-button>
              ) : null}
              {closed ? (
                <s-button
                  type="button"
                  variant="tertiary"
                  onClick={() => onSubmitTaskAction(selectedTask.id, "reopen")}
                  {...(busy ? { disabled: true } : {})}
                >
                  {t("dailyOps.actionReopen")}
                </s-button>
              ) : null}
            </div>
          </div>
        </PageSurface>
      </div>
    );
  }

  return value ? (
    <div style={detailSectionStackStyle}>
      <DetailContextHeader
        sectionLabel={t("dailyOps.detailTitle.value")}
        title={t(`dailyOps.detailTab${valueTab.charAt(0).toUpperCase()}${valueTab.slice(1)}` as const)}
        subtitle={t("dailyOps.valueSubtitle")}
        tabs={valueTabs}
      />
      <DetailStatStrip
        isMobile={isMobile}
        items={[
          {
            key: "customers",
            label: t("dailyOps.customerTitle"),
            value: `${value.customers.averageDynamicLtv} ${value.channels.currency}`,
            hint: t("dailyOps.metricAvgLtv"),
          },
          {
            key: "channels",
            label: t("dailyOps.channelTitle", { days: value.channels.windowDays }),
            value: value.channels.channels.length,
            hint: t("dailyOps.detailValueChannels"),
          },
          {
            key: "cost",
            label: t("dailyOps.costTitle"),
            value: `${value.costConfig.defaultGrossMarginPercent}%`,
            hint: t("dailyOps.detailValueCost"),
          },
        ]}
      />
      <ValueLayerSections value={value} isMobile={isMobile} activeTab={valueTab} />
    </div>
  ) : (
    <div style={pageEmptyStateStyle}>
      <span>{t("dailyOps.valueUnavailable")}</span>
    </div>
  );
}

function QuadrantCell({
  quadrant,
  title,
  desc,
  tasks,
  emptyLabel,
  renderTaskCard,
}: {
  quadrant: TaskQuadrant;
  title: string;
  desc: string;
  tasks: OperationTaskView[];
  emptyLabel: string;
  renderTaskCard: (task: OperationTaskView) => ReactNode;
}) {
  const activeCount = tasks.filter((task) =>
    ["open", "in_progress"].includes(task.status),
  ).length;
  return (
    <div style={quadrantCellStyle(quadrant)}>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "0.9375rem",
              fontWeight: 800,
              color: quadrantAccentColors[quadrant],
            }}
          >
            {title}
          </h3>
          <span style={quadrantCountBadgeStyle(quadrant)}>{activeCount}</span>
        </div>
        <p style={{ ...taskSecondaryTextStyle, marginTop: "0.25rem" }}>{desc}</p>
      </div>
      {tasks.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: pageColorTokens.textSecondary,
            fontSize: "0.8125rem",
          }}
        >
          {emptyLabel}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {tasks.map(renderTaskCard)}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// 渠道与客户价值层（ROI 归一体系 · A 步）
// ──────────────────────────────────────────────

const layerCardStyle = (accent: string): CSSProperties => ({
  flex: "1 1 200px",
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `3px solid ${accent}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: "0.85rem 0.95rem",
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
});

const layerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 800,
  color: pageColorTokens.textBody,
};

function LayerLegend() {
  const { t } = useTranslation();
  const layers: Array<{ accent: string; title: string; desc: string; source: DataSource }> = [
    {
      accent: "#007a5a",
      title: t("dailyOps.layerRevenue"),
      desc: t("dailyOps.layerRevenueDesc"),
      source: "real",
    },
    {
      accent: "#ea580c",
      title: t("dailyOps.layerProfit"),
      desc: t("dailyOps.layerProfitDesc"),
      source: "estimated",
    },
    {
      accent: "#6b7280",
      title: t("dailyOps.layerInvestment"),
      desc: t("dailyOps.layerInvestmentDesc"),
      source: "pending",
    },
  ];
  return (
    <PageSurface title={t("dailyOps.layerLegendTitle")}>
      <p style={{ ...taskSecondaryTextStyle, marginTop: 0, marginBottom: "0.75rem" }}>
        {t("dailyOps.layerLegendIntro")}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
        {layers.map((layer) => (
          <div key={layer.title} style={layerCardStyle(layer.accent)}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <h4 style={layerTitleStyle}>{layer.title}</h4>
              <SourceTag source={layer.source} />
            </div>
            <p style={{ ...taskSecondaryTextStyle, margin: 0 }}>{layer.desc}</p>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function InvestmentLayerCard() {
  const { t } = useTranslation();
  const items = [
    t("dailyOps.investmentAdSpend"),
    t("dailyOps.investmentSeoCost"),
    t("dailyOps.investmentToolCost"),
  ];
  return (
    <PageSurface
      title={t("dailyOps.investmentTitle")}
      subtitle={t("dailyOps.investmentSubtitle")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <SourceTag source="pending" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.75rem",
              border: `1px dashed ${pageColorTokens.border}`,
              borderRadius: pageColorTokens.radiusControl,
              fontSize: "0.8125rem",
              color: pageColorTokens.textSecondary,
              background: pageColorTokens.surfaceMuted,
            }}
          >
            <span>{item}</span>
            <s-badge tone="neutral">{t("dailyOps.investmentNotConnected")}</s-badge>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function ValueLayerSections({
  value,
  isMobile,
  activeTab = "framework",
}: {
  value: ValueLayerData;
  isMobile: boolean;
  activeTab?: "framework" | "customers" | "channels" | "cost";
}) {
  const { t } = useTranslation();
  const { customers, channels } = value;
  const seg = customers.segmentCounts;

  return (
    <>
      <section>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <h2 style={pageSectionMajorTitleStyle}>{t("dailyOps.valueTitle")}</h2>
          <p style={sectionDescriptionStyle}>{t("dailyOps.valueSubtitle")}</p>
        </div>
      </section>

      {activeTab === "framework" ? <LayerLegend /> : null}

      {(activeTab === "framework" || activeTab === "customers") ? (
        <PageSurface
          title={t("dailyOps.customerTitle")}
          subtitle={t("dailyOps.customerSubtitle", {
            total: customers.payingCustomers,
          })}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <SourceTag source="estimated" />
          </div>
          <div style={valueCardSectionStyle}>
            <PageMetricCard
              metrics={[
                {
                  label: t("dailyOps.metricRepeatRate"),
                  value: `${customers.repeatPurchaseRate}%`,
                },
                {
                  label: t("dailyOps.metricAvgScore"),
                  value: String(customers.averageScore),
                },
                {
                  label: t("dailyOps.metricHighValueShare"),
                  value: `${customers.highValueShare}%`,
                },
                {
                  label: t("dailyOps.metricAvgLtv"),
                  value: String(customers.averageDynamicLtv),
                  unit: channels.currency,
                },
              ]}
            />
            <div style={customerTagWrapStyle}>
              <s-badge tone="info">{t("dailyOps.segmentNew")}: {seg.new}</s-badge>
              <s-badge tone="success">{t("dailyOps.segmentActive")}: {seg.active}</s-badge>
              <s-badge tone="success">{t("dailyOps.segmentVip")}: {seg.vip}</s-badge>
              <s-badge tone="warning">{t("dailyOps.segmentAtRisk")}: {seg.at_risk}</s-badge>
              <s-badge>{t("dailyOps.segmentChurned")}: {seg.churned}</s-badge>
              <s-badge tone="critical">
                {t("dailyOps.tagRefundRisk")}: {customers.tagCounts.refund_risk}
              </s-badge>
              <s-badge tone="warning">
                {t("dailyOps.tagDiscountSensitive")}: {customers.tagCounts.discount_sensitive}
              </s-badge>
            </div>
          </div>
        </PageSurface>
      ) : null}

      {(activeTab === "framework" || activeTab === "channels") ? (
        <PageSurface
          title={t("dailyOps.channelTitle", { days: channels.windowDays })}
          subtitle={t("dailyOps.channelSubtitle", {
            share: channels.attributedRevenueShare,
          })}
        >
          {channels.channels.length === 0 ? (
            <p style={taskSecondaryTextStyle}>{t("dailyOps.noChannelData")}</p>
          ) : (
            <div style={channelTableWrapStyle}>
              <table style={valueTableStyle}>
                <thead>
                  <tr>
                    <th style={valueGroupThStyle} colSpan={2}>
                      {t("dailyOps.groupBasic")}
                    </th>
                    <th style={valueGroupThStyle} colSpan={1}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.layerRevenue")} <SourceTag source="real" />
                      </span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={2}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.layerProfit")} <SourceTag source="estimated" />
                      </span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={3}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.groupCustomerQuality")} <SourceTag source="estimated" />
                      </span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={1}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.layerInvestment")} <SourceTag source="pending" />
                      </span>
                    </th>
                  </tr>
                  <tr>
                    <th style={valueThStyle}>{t("dailyOps.colChannel")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colOrders")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colRevenue")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colProfit")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colMargin")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colNewShare")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colRepeatShare")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colScore")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colRoi")}</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.channels.map((channel) => (
                    <tr key={channel.channelKey}>
                      <td style={{ ...valueTdStyle, fontWeight: 700 }}>{channel.label}</td>
                      <td style={valueTdStyle}>{channel.orderCount}</td>
                      <td style={valueTdStyle}>
                        {channel.revenue} {channels.currency}
                      </td>
                      <td
                        style={{
                          ...valueTdStyle,
                          color:
                            channel.contributionProfit >= 0 ? "#007a5a" : "#dc2626",
                          fontWeight: 700,
                        }}
                      >
                        {channel.contributionProfit}
                      </td>
                      <td style={valueTdStyle}>
                        {channel.contributionMarginPercent === null
                          ? "—"
                          : `${channel.contributionMarginPercent}%`}
                      </td>
                      <td style={valueTdStyle}>{channel.customers.newOrderShare}%</td>
                      <td style={valueTdStyle}>{channel.customers.repeatCustomerShare}%</td>
                      <td style={valueTdStyle}>
                        {channel.customers.averageCustomerValueScore ?? "—"}
                      </td>
                      <td style={valueTdStyle}>
                        <s-badge tone="neutral">{t("dailyOps.roiPendingAds")}</s-badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={caveatPanelStyle}>
            {channels.caveats.map((line, index) => (
              <p key={index} style={{ ...taskSecondaryTextStyle, fontSize: "0.75rem" }}>
                * {line}
              </p>
            ))}
          </div>
        </PageSurface>
      ) : null}

      {activeTab === "framework" ? <InvestmentLayerCard /> : null}
      {(activeTab === "framework" || activeTab === "cost") ? (
        <CostConfigCard costConfig={value.costConfig} isMobile={isMobile} />
      ) : null}
    </>
  );
}

function CostConfigCard({
  costConfig,
  isMobile,
}: {
  costConfig: ShopCostConfigView;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";

  return (
    <PageSurface
      title={t("dailyOps.costTitle")}
      subtitle={t("dailyOps.costSubtitle")}
    >
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="cost-config" />
        <div
          style={{
            ...costFormWrapStyle,
            display: "flex",
            flexWrap: "wrap",
            gap: "0.9rem",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
          }}
        >
          <label style={costLabelStyle}>
            {t("dailyOps.costMargin")}
            <input
              style={costInputStyle}
              type="number"
              name="defaultGrossMarginPercent"
              step="0.1"
              min="0"
              max="100"
              defaultValue={costConfig.defaultGrossMarginPercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costFeePercent")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeePercent"
              step="0.1"
              min="0"
              max="20"
              defaultValue={costConfig.paymentFeePercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costFeeFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeeFixed"
              step="0.01"
              min="0"
              defaultValue={costConfig.paymentFeeFixed}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costMonthlyFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="monthlyFixedCost"
              step="1"
              min="0"
              defaultValue={costConfig.monthlyFixedCost}
            />
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <s-button
              type="submit"
              variant="primary"
              {...(saving ? { disabled: true } : {})}
            >
              {saving ? t("dailyOps.costSaving") : t("dailyOps.costSave")}
            </s-button>
          </div>
        </div>
      </fetcher.Form>
      {!costConfig.isConfigured ? (
        <p style={{ ...taskSecondaryTextStyle, marginTop: "0.6rem" }}>
          {t("dailyOps.costDefaultHint")}
        </p>
      ) : null}
    </PageSurface>
  );
}
