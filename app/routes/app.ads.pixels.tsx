/**
 * Pixel 能力入口（审核期左栏默认隐藏；URL 仍可直达）。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useEmbeddedLocationSearch } from "../hooks/useEmbeddedLocationSearch";
import { pageColorTokens } from "./page/pageUiStyles";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

function withSearch(path: string, search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return q ? `${path}?${q}` : path;
}

export default function AppAdsPixels() {
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();

  const cards = [
    {
      key: "google",
      title: t("adsHub.pixels.google"),
      href: withSearch("/app/ads/google-pixel", locationSearch),
    },
    {
      key: "meta",
      title: t("adsHub.pixels.meta"),
      href: withSearch("/app/ads/meta-pixel", locationSearch),
    },
    {
      key: "tiktok",
      title: t("adsHub.pixels.tiktok"),
      href: withSearch("/app/ads/catalog?tab=credentials&platform=tiktok", locationSearch),
      note: t("adsHub.pixels.tiktokNote"),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          {t("adsHub.pixels.title")}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: pageColorTokens.textSecondary }}>
          {t("adsHub.pixels.subtitle")}
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map((card) => (
          <Link
            key={card.key}
            to={card.href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 16,
              border: `1px solid ${pageColorTokens.border}`,
              borderRadius: pageColorTokens.radiusCard,
              background: pageColorTokens.surface,
              textDecoration: "none",
              color: pageColorTokens.textPrimary,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14 }}>{card.title}</span>
            {card.note ? (
              <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                {card.note}
              </span>
            ) : null}
            <span style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.brandBlue }}>
              {t("adsHub.pixels.open")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
