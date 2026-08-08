import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  CredentialModuleCard,
  type CredentialField,
} from "./component/settings/CredentialModuleCard";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageContentStyle,
} from "./page/pageUiStyles";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const CARRIER_MODULES: Array<{
  title: string;
  endpoint: string;
  primaryMaskKey: string;
  fields: CredentialField[];
}> = [
  {
    title: "FedEx",
    endpoint: "/app/logistics/fedex/config",
    primaryMaskKey: "accountNumberMasked",
    fields: [
      { name: "apiKey", label: "API Key" },
      { name: "secretKey", label: "Secret Key", type: "password" },
      { name: "accountNumber", label: "Account Number" },
      { name: "meterNumber", label: "Meter Number", optional: true },
    ],
  },
  {
    title: "SF Express",
    endpoint: "/app/logistics/sf/config",
    primaryMaskKey: "customerCodeMasked",
    fields: [
      { name: "customerCode", label: "顾客编码 Customer Code" },
      { name: "checkWord", label: "校验码 Check Word", type: "password" },
      { name: "monthlyAccount", label: "月结卡号 Monthly Account", optional: true },
    ],
  },
];

export default function SettingsLogistics() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.navLogistics")}
        subtitle={t("settingsShell.logisticsSubtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {CARRIER_MODULES.map((mod) => (
          <CredentialModuleCard
            key={mod.endpoint}
            title={mod.title}
            endpoint={mod.endpoint}
            fields={mod.fields}
            primaryMaskKey={mod.primaryMaskKey}
          />
        ))}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
