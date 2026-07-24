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

const ADS_MODULES: Array<{
  title: string;
  endpoint: string;
  primaryMaskKey: string;
  fields: CredentialField[];
}> = [
  {
    title: "Meta",
    endpoint: "/app/ads/meta/config",
    primaryMaskKey: "clientIdMasked",
    fields: [
      { name: "clientId", label: "Meta App ID" },
      { name: "clientSecret", label: "Meta App Secret", type: "password" },
    ],
  },
  {
    title: "Google Ads",
    endpoint: "/app/ads/google/config",
    primaryMaskKey: "clientIdMasked",
    fields: [
      { name: "clientId", label: "Client ID" },
      { name: "clientSecret", label: "Client Secret", type: "password" },
      { name: "developerToken", label: "Developer Token", type: "password" },
      { name: "customerId", label: "Customer ID" },
    ],
  },
  {
    title: "TikTok Ads",
    endpoint: "/app/ads/tiktok/config",
    primaryMaskKey: "appIdMasked",
    fields: [
      { name: "appId", label: "App ID" },
      { name: "appSecret", label: "App Secret", type: "password" },
      { name: "advertiserId", label: "Advertiser ID" },
    ],
  },
  {
    title: "Microsoft Ads",
    endpoint: "/app/ads/microsoft/config",
    primaryMaskKey: "clientIdMasked",
    fields: [
      { name: "clientId", label: "Client ID" },
      { name: "clientSecret", label: "Client Secret", type: "password" },
      { name: "developerToken", label: "Developer Token", type: "password" },
      { name: "customerId", label: "Customer ID" },
    ],
  },
];

export default function SettingsChannels() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.navChannels")}
        subtitle={t("settingsShell.channelsSubtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {ADS_MODULES.map((mod) => (
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
