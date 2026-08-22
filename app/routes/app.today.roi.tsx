import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { ActionFunctionArgs } from "react-router";
import { useFetcher, useSearchParams } from "react-router";
import { getTodayMetricDetail, getTodayRoiMonitor, type TodayRoiFactor } from "../lib/todayMetricModules";
import { ensureCustomerValueLayer } from "../server/operations/customerValue.server";
import { upsertShopCostConfig } from "../server/operations/roi/costConfig.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import {
  TodayRoiValueLayerSection,
  TODAY_ROI_COST_CONFIG_FETCHER_KEY,
  type TodayRoiValueTab,
} from "./component/today/TodayRoiValueLayerSection";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import { TodayMetricDetailPage } from "./page/TodayMetricDetailPage";
import { PageSurface, pageColorTokens, pageHintTextStyle, pageMetricLabelStyle } from "./page/pageUiStyles";

type ActionData = { ok: true } | { ok: false; error: string };

function resolveValueTab(value: string | null): TodayRoiValueTab {
  if (value === "customers" || value === "channels" || value === "cost") return value;
  if (value === "framework" || value === "dimensions") return "dimensions";
  return "dimensions";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent !== "cost-config") {
    return Response.json({ ok: false, error: "unsupported intent" } satisfies ActionData, {
      status: 400,
    });
  }

  try {
    const num = (name: string) => Number(formData.get(name)?.toString() ?? "");
    const config = await upsertShopCostConfig(session.shop, {
      defaultGrossMarginPercent: num("defaultGrossMarginPercent"),
      paymentFeePercent: num("paymentFeePercent"),
      paymentFeeFixed: num("paymentFeeFixed"),
      monthlyFixedCost: num("monthlyFixedCost"),
    });
    await ensureCustomerValueLayer(session.shop, config.defaultGrossMarginPercent, {
      force: true,
    });
    return Response.json({ ok: true } satisfies ActionData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[today.roi] action failed:", error);
    return Response.json({ ok: false, error: message } satisfies ActionData, { status: 500 });
  }
};

export default function TodayRoiPage() {
  const detail = useMemo(() => getTodayMetricDetail("roi"), []);
  const roiMonitor = useMemo(() => getTodayRoiMonitor(), []);
  const { isMobile } = useResponsiveLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const activeValueTab = resolveValueTab(searchParams.get("valueTab"));
  const valueFetcher = useFetcher<ValueLayerResponse>();
  const costConfigFetcher = useFetcher<ActionData>({
    key: TODAY_ROI_COST_CONFIG_FETCHER_KEY,
  });
  const valueRequestedRef = useRef(false);
  const costMutatingRef = useRef(false);

  useEffect(() => {
    const wasMutating = costMutatingRef.current;
    const isMutating = costConfigFetcher.state !== "idle";
    costMutatingRef.current = isMutating;

    if (!valueRequestedRef.current) {
      valueRequestedRef.current = true;
      valueFetcher.load("/api/today-value-layer");
      return;
    }

    if (wasMutating && !isMutating && costConfigFetcher.data?.ok) {
      valueFetcher.load("/api/today-value-layer");
    }
  }, [costConfigFetcher.data, costConfigFetcher.state, valueFetcher]);

  const value = valueFetcher.data?.ok ? valueFetcher.data.value : null;
  const valueLoading = !valueFetcher.data || valueFetcher.state !== "idle";
  const valueFailed = valueFetcher.data?.ok === false;

  const handleValueTabChange = (tab: TodayRoiValueTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("valueTab", tab);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  return (
    <TodayMetricDetailPage
      data={detail}
      returnTo={returnTo}
      extraSections={
        <>
          <TodayRoiFactorsSection factors={roiMonitor.factors} isMobile={isMobile} />
          <TodayRoiValueLayerSection
            value={value}
            valueLoading={valueLoading}
            valueFailed={valueFailed}
            isMobile={isMobile}
            activeTab={activeValueTab}
            onTabChange={handleValueTabChange}
          />
        </>
      }
    />
  );
}

function TodayRoiFactorsSection({ factors, isMobile }: { factors: TodayRoiFactor[]; isMobile: boolean }) {
  return (
    <PageSurface
      title="影响 ROI 的 Top 3 因子"
      subtitle="首页只先告诉你 ROI 结果，真正拖累或支撑 ROI 的关键因子放到详情页里展开。"
    >
      <div style={factorListStyle}>
        {factors.map((factor) => (
          <div key={factor.title} style={factorItemStyle}>
            <span style={{ ...roiBadgeBaseStyle, ...roiBadgeStyle(factor.tone) }}>
              {factor.tone === "critical" ? "优先处理" : "继续跟进"}
            </span>
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <div style={factorHeaderStyle(isMobile)}>
                <div style={factorTitleStyle}>{factor.title}</div>
              </div>
              <div style={pageHintTextStyle}>{factor.detail}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={factorHintStyle}>
        <div style={pageMetricLabelStyle}>怎么用这 3 个因子</div>
        <div style={pageHintTextStyle}>先判断哪一项在直接拖累短期 ROI，再回到下面的价值层、对象和建议动作里继续排查。</div>
      </div>
    </PageSurface>
  );
}

function roiBadgeStyle(tone: TodayRoiFactor["tone"]): CSSProperties {
  if (tone === "critical") {
    return {
      color: pageColorTokens.criticalText,
      background: pageColorTokens.criticalBg,
      border: "1px solid #f2b8ae",
    };
  }
  return {
    color: "#9a5b00",
    background: pageColorTokens.warningBg,
    border: "1px solid #f1d58d",
  };
}

function factorHeaderStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: isMobile ? "flex-start" : "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexDirection: isMobile ? "column" : "row",
  };
}

const roiBadgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.22rem 0.6rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 700,
};

const factorListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const factorItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.85rem",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const factorTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const factorHintStyle: CSSProperties = {
  marginTop: "1rem",
  paddingTop: "1rem",
  borderTop: `1px solid ${pageColorTokens.divider}`,
};
