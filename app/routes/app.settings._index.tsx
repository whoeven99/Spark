import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { mobilePageContentStyle, pageContentStyle } from "./page/pageUiStyles";
import { DestinationPage } from "./component/shared/DestinationPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type SettingsModule = {
  to: string;
  labelKey: string;
  descKey: string;
  badgeKey: string;
};

const SETTINGS_MODULES: SettingsModule[] = [
  {
    to: "/app/settings/billing",
    labelKey: "settingsShell.navBilling",
    descKey: "settingsShell.descBilling",
    badgeKey: "settingsShell.groupAccount",
  },
  {
    to: "/app/settings/channels",
    labelKey: "settingsShell.navChannels",
    descKey: "settingsShell.descChannels",
    badgeKey: "settingsShell.groupIntegrations",
  },
  {
    to: "/app/ads-catalog",
    labelKey: "settingsShell.navAdsCatalog",
    descKey: "settingsShell.descAdsCatalog",
    badgeKey: "settingsShell.groupIntegrations",
  },
  {
    to: "/app/settings/logistics",
    labelKey: "settingsShell.navLogistics",
    descKey: "settingsShell.descLogistics",
    badgeKey: "settingsShell.groupIntegrations",
  },
  {
    to: "/app/settings/data",
    labelKey: "settingsShell.navData",
    descKey: "settingsShell.descData",
    badgeKey: "settingsShell.groupOther",
  },
  {
    to: "/app/settings/feedback",
    labelKey: "settingsShell.navFeedback",
    descKey: "settingsShell.descFeedback",
    badgeKey: "settingsShell.groupOther",
  },
];

export default function SettingsIndex() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useNavigate();
  useFeatureView("settings");

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={t("settingsShell.title")}
        subtitle={t("settingsShell.subtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app"
        isMobile={isMobile}
        actions={SETTINGS_MODULES.map((mod) => ({
          key: mod.to,
          title: t(mod.labelKey),
          detail: t(mod.descKey),
          badge: t(mod.badgeKey),
          onClick: () => navigate(mod.to),
        }))}
      />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
