import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./page/pageUiStyles";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const MODULES = [
  { to: "/app/settings/billing", labelKey: "settingsShell.navBilling" },
  { to: "/app/settings/channels", labelKey: "settingsShell.navChannels" },
  { to: "/app/settings/logistics", labelKey: "settingsShell.navLogistics" },
  { to: "/app/settings/feedback", labelKey: "settingsShell.navFeedback" },
  { to: "/app/settings/data", labelKey: "settingsShell.navData" },
] as const;

export default function SettingsIndex() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  useFeatureView("settings");

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.title")}
        subtitle={t("settingsShell.subtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: "0.85rem",
        }}
      >
        {MODULES.map((mod) => (
          <Link
            key={mod.to}
            to={mod.to}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "1rem 1.1rem",
              borderRadius: pageColorTokens.radiusControl,
              border: `1px solid ${pageColorTokens.border}`,
              background: pageColorTokens.surface,
              color: pageColorTokens.textPrimary,
              fontSize: "0.95rem",
              textDecoration: "none",
            }}
          >
            <span style={{ flex: 1 }}>{t(mod.labelKey)}</span>
            <span aria-hidden="true" style={{ color: pageColorTokens.textSecondary }}>
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
