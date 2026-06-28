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

type ModuleIcon = "billing" | "channels" | "logistics" | "feedback" | "data";

type SettingsModule = {
  to: string;
  labelKey: string;
  descKey: string;
  icon: ModuleIcon;
};

const GROUPS: Array<{ labelKey: string; items: SettingsModule[] }> = [
  {
    labelKey: "settingsShell.groupAccount",
    items: [
      {
        to: "/app/settings/billing",
        labelKey: "settingsShell.navBilling",
        descKey: "settingsShell.descBilling",
        icon: "billing",
      },
    ],
  },
  {
    labelKey: "settingsShell.groupIntegrations",
    items: [
      {
        to: "/app/settings/channels",
        labelKey: "settingsShell.navChannels",
        descKey: "settingsShell.descChannels",
        icon: "channels",
      },
      {
        to: "/app/settings/logistics",
        labelKey: "settingsShell.navLogistics",
        descKey: "settingsShell.descLogistics",
        icon: "logistics",
      },
    ],
  },
  {
    labelKey: "settingsShell.groupOther",
    items: [
      {
        to: "/app/settings/feedback",
        labelKey: "settingsShell.navFeedback",
        descKey: "settingsShell.descFeedback",
        icon: "feedback",
      },
      {
        to: "/app/settings/data",
        labelKey: "settingsShell.navData",
        descKey: "settingsShell.descData",
        icon: "data",
      },
    ],
  },
];

function ModuleGlyph({ icon }: { icon: ModuleIcon }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (icon === "billing") {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="2.2" y="4" width="13.6" height="10" rx="2" />
        <path d="M2.2 7.4 H15.8" />
        <path d="M5 11 H8" />
      </svg>
    );
  }
  if (icon === "channels") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 7 L11 4 V14 L3 11 Z" />
        <path d="M11 6.5 A2.4 2.4 0 0 1 11 11.5" />
        <path d="M4.5 11 V13.6" />
      </svg>
    );
  }
  if (icon === "logistics") {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="2" y="5" width="8" height="6.4" rx="1" />
        <path d="M10 7 H13 L15.6 9.4 V11.4 H10 Z" />
        <circle cx="5" cy="13" r="1.4" />
        <circle cx="12.6" cy="13" r="1.4" />
      </svg>
    );
  }
  if (icon === "feedback") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 4.5 H15 V12 H7.5 L4.5 14.4 V12 H3 Z" />
        <path d="M6 7.6 H12" />
        <path d="M6 9.8 H10" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <ellipse cx="9" cy="4.6" rx="5.4" ry="2.2" />
      <path d="M3.6 4.6 V13.4 A5.4 2.2 0 0 0 14.4 13.4 V4.6" />
      <path d="M3.6 9 A5.4 2.2 0 0 0 14.4 9" />
    </svg>
  );
}

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
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {GROUPS.map((group) => (
          <div key={group.labelKey}>
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: pageColorTokens.textSecondary,
                margin: "0 0 0.6rem 0.15rem",
              }}
            >
              {t(group.labelKey)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {group.items.map((mod) => (
                <Link
                  key={mod.to}
                  to={mod.to}
                  className="settings-module-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.85rem",
                    padding: "0.9rem 1rem",
                    borderRadius: pageColorTokens.radiusControl,
                    border: `1px solid ${pageColorTokens.border}`,
                    background: pageColorTokens.surface,
                    color: pageColorTokens.textPrimary,
                    textDecoration: "none",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 36,
                      height: 36,
                      flexShrink: 0,
                      borderRadius: 9,
                      background: "rgba(0,128,96,0.08)",
                      color: "#008060",
                    }}
                  >
                    <ModuleGlyph icon={mod.icon} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.92rem",
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      {t(mod.labelKey)}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.78rem",
                        color: pageColorTokens.textSecondary,
                        lineHeight: 1.4,
                      }}
                    >
                      {t(mod.descKey)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    style={{ color: pageColorTokens.textSecondary, fontSize: "1.1rem", flexShrink: 0 }}
                  >
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
