import type { ThemeConfig } from "antd";

export const sparkAntTheme: ThemeConfig = {
  token: {
    colorPrimary: "#008060",
    colorSuccess: "#00a67c",
    colorWarning: "#b45309",
    colorError: "#dc2626",
    colorInfo: "#4070f4",
    colorText: "#1a1d1f",
    colorTextSecondary: "#6b7280",
    colorTextPlaceholder: "#9ca3af",
    colorBgBase: "#ffffff",
    colorBgLayout: "#f6f6f7",
    colorFillAlter: "#fafafa",
    colorBorder: "#e2e5e9",
    colorBorderSecondary: "#dde1e6",
    borderRadius: 9,
    borderRadiusLG: 14,
    boxShadowSecondary:
      "0 2px 10px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.08)",
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Button: {
      borderRadius: 9,
      controlHeight: 38,
      primaryShadow: "none",
      defaultShadow: "none",
    },
    Card: {
      borderRadiusLG: 14,
      headerBg: "#ffffff",
      bodyPadding: 20,
    },
    Tabs: {
      itemSelectedColor: "#1a1d1f",
      itemColor: "#6b7280",
      itemHoverColor: "#1a1d1f",
      inkBarColor: "transparent",
      cardGutter: 8,
    },
    Modal: {
      borderRadiusLG: 14,
      contentBg: "#ffffff",
      headerBg: "#ffffff",
      titleColor: "#1a1d1f",
    },
    Tag: {
      borderRadiusSM: 999,
      defaultBg: "#f5f6f8",
      defaultColor: "#6b7280",
      fontSizeSM: 12,
    },
    Progress: {
      defaultColor: "#008060",
      remainingColor: "#f0f2f4",
    },
    Select: {
      borderRadius: 9,
      optionSelectedBg: "#edfaf5",
    },
    Empty: {
      colorTextDescription: "#6b7280",
    },
    Alert: {
      borderRadiusLG: 14,
    },
  },
};
