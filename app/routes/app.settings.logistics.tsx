import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  CredentialModuleCard,
  type CredentialField,
} from "./component/settings/CredentialModuleCard";
import {
  PageHeaderNav,
  PageSectionHeader,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./page/pageUiStyles";
import { getFedexCredential, getSfCredential } from "../server/logisticsCredentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [fedex, sf] = await Promise.all([
    getFedexCredential(session.shop),
    getSfCredential(session.shop),
  ]);

  return {
    providers: {
      fedex: {
        configured: Boolean(fedex),
        updatedAt: fedex?.updatedAt ?? null,
        hasOptionalMeter: Boolean(fedex?.meterNumber),
      },
      sf: {
        configured: Boolean(sf),
        updatedAt: sf?.updatedAt ?? null,
        hasMonthlyAccount: Boolean(sf?.monthlyAccount),
      },
    },
  };
};

const CARRIER_MODULES: Array<{
  key: "fedex" | "sf";
  title: string;
  descriptionKey: string;
  endpoint: string;
  primaryMaskKey: string;
  saveLabelKey: string;
  fields: CredentialField[];
}> = [
  {
    key: "fedex",
    title: "FedEx",
    descriptionKey: "settingsShell.logisticsFedexDesc",
    endpoint: "/app/logistics/fedex/config",
    primaryMaskKey: "accountNumberMasked",
    saveLabelKey: "settingsShell.logisticsSaveProvider",
    fields: [
      { name: "apiKey", label: "API Key" },
      { name: "secretKey", label: "Secret Key", type: "password" },
      { name: "accountNumber", label: "Account Number" },
      { name: "meterNumber", label: "Meter Number", optional: true },
    ],
  },
  {
    key: "sf",
    title: "SF Express",
    descriptionKey: "settingsShell.logisticsSfDesc",
    endpoint: "/app/logistics/sf/config",
    primaryMaskKey: "customerCodeMasked",
    saveLabelKey: "settingsShell.logisticsSaveProvider",
    fields: [
      { name: "customerCode", label: "settingsShell.logisticsSfFieldCustomerCode" },
      { name: "checkWord", label: "settingsShell.logisticsSfFieldCheckWord", type: "password" },
      { name: "monthlyAccount", label: "settingsShell.logisticsSfFieldMonthlyAccount", optional: true },
    ],
  },
];

export default function SettingsLogistics() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const { providers } = useLoaderData<typeof loader>();
  const configuredCount = [providers.fedex.configured, providers.sf.configured].filter(Boolean).length;

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.navLogistics")}
        subtitle={t("settingsShell.logisticsSubtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />
      <PageSurface>
        <PageSectionHeader
          title={t("settingsShell.logisticsOverviewTitle")}
          subtitle={t("settingsShell.logisticsOverviewSubtitle")}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceMuted,
              padding: "0.9rem 1rem",
              display: "grid",
              gap: "0.2rem",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              {t("settingsShell.logisticsMetricProviders")}
            </span>
            <strong style={{ fontSize: "1.2rem", color: pageColorTokens.textPrimary }}>
              {configuredCount} / 2
            </strong>
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              {t("settingsShell.logisticsMetricProvidersHint")}
            </span>
          </div>
          <div
            style={{
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceMuted,
              padding: "0.9rem 1rem",
              display: "grid",
              gap: "0.2rem",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              FedEx
            </span>
            <strong style={{ fontSize: "1.05rem", color: pageColorTokens.textPrimary }}>
              {providers.fedex.configured
                ? t("settingsShell.credConfigured")
                : t("settingsShell.credNotConfigured")}
            </strong>
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              {providers.fedex.updatedAt
                ? t("settingsShell.logisticsUpdatedAtShort", {
                    date: new Date(providers.fedex.updatedAt).toLocaleDateString(),
                  })
                : t("settingsShell.logisticsNeedsCredential")}
            </span>
          </div>
          <div
            style={{
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceMuted,
              padding: "0.9rem 1rem",
              display: "grid",
              gap: "0.2rem",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              SF Express
            </span>
            <strong style={{ fontSize: "1.05rem", color: pageColorTokens.textPrimary }}>
              {providers.sf.configured
                ? t("settingsShell.credConfigured")
                : t("settingsShell.credNotConfigured")}
            </strong>
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              {providers.sf.updatedAt
                ? t("settingsShell.logisticsUpdatedAtShort", {
                    date: new Date(providers.sf.updatedAt).toLocaleDateString(),
                  })
                : t("settingsShell.logisticsNeedsCredential")}
            </span>
          </div>
        </div>
      </PageSurface>
      <PageSurface>
        <PageSectionHeader
          title={t("settingsShell.logisticsProvidersTitle")}
          subtitle={t("settingsShell.logisticsProvidersSubtitle")}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: "0.85rem",
          }}
        >
        {CARRIER_MODULES.map((mod) => (
          <CredentialModuleCard
            key={mod.endpoint}
            title={mod.title}
            description={t(mod.descriptionKey)}
            endpoint={mod.endpoint}
            fields={mod.fields.map((field) => ({
              ...field,
              label: t(field.label),
            }))}
            primaryMaskKey={mod.primaryMaskKey}
            saveLabel={t(mod.saveLabelKey, { provider: mod.title })}
            statusSummary={(status) => {
              if (!status?.configured) return null;
              if (mod.key === "fedex" && providers.fedex.hasOptionalMeter) {
                return t("settingsShell.logisticsFedexMeterReady");
              }
              if (mod.key === "sf" && providers.sf.hasMonthlyAccount) {
                return t("settingsShell.logisticsSfMonthlyReady");
              }
              return t("settingsShell.logisticsBasicReady");
            }}
          />
        ))}
        </div>
      </PageSurface>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
