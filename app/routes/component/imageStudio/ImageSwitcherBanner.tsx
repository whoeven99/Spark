import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  shop: string;
  /** 由环境变量 IMAGE_SWITCHER_APP_EMBED_ID 注入，未配置时为 null。 */
  appEmbedId: string | null;
};

const bannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.875rem 1.125rem",
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.brandGreenLight,
  border: `1px solid rgba(0, 166, 124, 0.25)`,
  marginBottom: "1.25rem",
  flexWrap: "wrap",
};

const leftStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.625rem",
  flex: "1 1 0",
  minWidth: 0,
};

const iconStyle: CSSProperties = {
  flexShrink: 0,
  width: 20,
  height: 20,
  marginTop: 1,
  color: pageColorTokens.brandGreen,
};

const textWrapStyle: CSSProperties = {
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: "0.875rem",
  color: pageColorTokens.textPrimary,
  lineHeight: 1.4,
};

const descStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.5,
  marginTop: "0.125rem",
};

const buttonStyle: CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  padding: "0.4375rem 0.875rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  fontWeight: 600,
  fontSize: "0.8125rem",
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
  lineHeight: 1,
  transition: "background 0.15s",
  whiteSpace: "nowrap",
};

function buildThemeEditorUrl(shop: string, appEmbedId: string | null): string {
  const base = `https://${shop}/admin/themes/current/editor`;
  if (!appEmbedId) return base;
  return `${base}?context=apps&activateAppId=${appEmbedId}/image-switcher`;
}

/** 图片替换开关状态 Banner，放在 Image Studio 整图翻译 Tab 顶部。 */
export function ImageSwitcherBanner({ shop, appEmbedId }: Props) {
  const { t } = useTranslation();
  const themeEditorUrl = buildThemeEditorUrl(shop, appEmbedId);

  return (
    <div style={bannerStyle}>
      <div style={leftStyle}>
        <svg style={iconStyle} viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 6v4.5l2.5 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={textWrapStyle}>
          <div style={titleStyle}>{t("imageSwitcher.bannerTitle", "图片自动替换")}</div>
          <div style={descStyle}>
            {t(
              "imageSwitcher.bannerDesc",
              "翻译完成后，图片映射已自动保存。在主题编辑器中启用「Ciwi Image Switcher」App Embed，访客即可按语言看到对应译图。",
            )}
          </div>
        </div>
      </div>
      <a
        href={themeEditorUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={buttonStyle}
      >
        {t("imageSwitcher.manageButton", "前往主题编辑器")}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M2 10L10 2M10 2H5M10 2v5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </div>
  );
}
