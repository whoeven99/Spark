import type { ThemeConfig } from "antd";
import { pageColorTokens } from "../routes/page/pageUiStyles";

/**
 * Ant Design 组件的全局主题，令牌来源与 `pageColorTokens` 一致，
 * 避免 antd 默认蓝（#1677ff）与 Shopify Admin 配色并存。
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: pageColorTokens.brandGreen,
    colorLink: pageColorTokens.brandBlue,
    colorInfo: pageColorTokens.brandBlue,
    colorSuccess: pageColorTokens.brandGreen,
    colorWarning: pageColorTokens.warning,
    colorError: pageColorTokens.critical,
    colorText: pageColorTokens.textPrimary,
    colorTextSecondary: pageColorTokens.textSecondary,
    colorTextTertiary: pageColorTokens.textFootnote,
    colorBorder: pageColorTokens.borderInput,
    colorBorderSecondary: pageColorTokens.border,
    colorBgLayout: pageColorTokens.surfaceMuted,
    colorBgContainer: pageColorTokens.surface,
    borderRadius: 10,
    borderRadiusLG: 14,
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    boxShadow: pageColorTokens.shadowCard,
  },
  components: {
    Button: { primaryShadow: "none", defaultShadow: "none" },
    Card: { boxShadowTertiary: pageColorTokens.shadowCard },
  },
};
