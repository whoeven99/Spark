import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { buildAdsOverview } from "../server/adsInsights/overview.server";
import { useEmbeddedLocationSearch } from "../hooks/useEmbeddedLocationSearch";
import { pageColorTokens } from "./page/pageUiStyles";

function appendSearch(path: string, search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return path;
  const [base, existing] = path.split("?");
  if (!existing) return `${base}?${q}`;
  return `${base}?${existing}&${q}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const overview = await buildAdsOverview({ shop: session.shop, rangeDays: 30 });
    return { overview, error: null as string | null };
  } catch (error) {
    console.error("[AdsHub] overview failed:", error);
    return {
      overview: null,
      error: error instanceof Error ? error.message : "overview_failed",
    };
  }
};

export default function AppAdsIndex() {
  const { t } = useTranslation();
  const { overview, error } = useLoaderData<typeof loader>();
  const locationSearch = useEmbeddedLocationSearch();

  const connectedCount =
    overview?.platforms.filter((p) => p.connected).length ?? 0;
  const spend = overview?.totals.spend;
  const roas = overview?.totals.roas;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 960 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: pageColorTokens.textPrimary,
          }}
        >
          {t("adsHub.overview.title")}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: pageColorTokens.textSecondary }}>
          {t("adsHub.overview.subtitle")}
        </p>
      </div>

      {error ? (
        <div
          style={{
            padding: 14,
            borderRadius: pageColorTokens.radiusCard,
            border: `1px solid ${pageColorTokens.border}`,
            background: pageColorTokens.criticalBg,
            color: pageColorTokens.criticalText,
            fontSize: 13,
          }}
        >
          {t("adsHub.overview.loadError")}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Metric
          label={t("adsHub.overview.spend")}
          value={spend != null ? formatMoney(spend, overview?.currencyCode) : "—"}
        />
        <Metric
          label={t("adsHub.overview.roas")}
          value={roas != null ? `${roas.toFixed(1)}x` : "—"}
        />
        <Metric
          label={t("adsHub.overview.platformsConnected")}
          value={`${connectedCount}/3`}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {(overview?.platforms ?? [
          { platform: "meta" as const, connected: false },
          { platform: "google" as const, connected: false },
          { platform: "tiktok" as const, connected: false },
        ]).map((p) => (
          <div
            key={p.platform}
            style={{
              border: `1px solid ${pageColorTokens.border}`,
              borderRadius: pageColorTokens.radiusCard,
              padding: 16,
              background: pageColorTokens.surface,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {p.platform === "meta"
                ? "Meta"
                : p.platform === "google"
                  ? "Google"
                  : "TikTok"}
            </div>
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
              {p.connected
                ? t("adsHub.overview.statusReady")
                : t("adsHub.overview.statusNeedsSetup")}
            </div>
            <Link
              to={appendSearch("/app/ads/catalog?tab=credentials", locationSearch)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: pageColorTokens.brandBlue,
                textDecoration: "none",
              }}
            >
              {p.connected
                ? t("adsHub.overview.manageConnection")
                : t("adsHub.overview.connectNow")}
            </Link>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <HubButton
          to={appendSearch("/app/ads/performance", locationSearch)}
          label={t("adsHub.overview.ctaPerformance")}
          primary
        />
        <HubButton
          to={appendSearch("/app/ads/catalog?tab=sync", locationSearch)}
          label={t("adsHub.overview.ctaSync")}
        />
        <HubButton
          to={appendSearch("/app/ads/create", locationSearch)}
          label={t("adsHub.overview.ctaCreate")}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 140,
        padding: "12px 16px",
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        background: pageColorTokens.surface,
      }}
    >
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 20,
          fontWeight: 700,
          color: pageColorTokens.textPrimary,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function HubButton({
  to,
  label,
  primary,
}: {
  to: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-block",
        padding: "10px 16px",
        borderRadius: pageColorTokens.radiusControl,
        background: primary ? pageColorTokens.brandGreen : pageColorTokens.surface,
        color: primary ? "#fff" : pageColorTokens.textPrimary,
        border: primary ? "none" : `1px solid ${pageColorTokens.borderSubtle}`,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency && currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
