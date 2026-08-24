import type { CSSProperties } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import {
  PageHeaderNav,
  PageMetricCard,
  PageSurface,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";

type ToolTone = "ready" | "planned";

type ToolCard = {
  title: string;
  description: string;
  meta: string;
  tone: ToolTone;
  href?: string;
};

type ToolGroup = {
  title: string;
  subtitle: string;
  items: ToolCard[];
};

function appendSearchToPath(path: string, search: string): string {
  if (!search) return path;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return path;
  return path.includes("?") ? `${path}&${raw}` : `${path}?${raw}`;
}

function WorkbenchCard({
  card,
  actionLabel,
  plannedLabel,
  readyLabel,
}: {
  card: ToolCard;
  actionLabel: string;
  plannedLabel: string;
  readyLabel: string;
}) {
  const badgeStyle =
    card.tone === "ready"
      ? {
          background: pageColorTokens.brandGreenLight,
          color: pageColorTokens.brandGreenDeep,
        }
      : {
          background: pageColorTokens.warningBg,
          color: pageColorTokens.warning,
        };

  return (
    <article style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={{ ...badgeStyleBase, ...badgeStyle }}>
          {card.tone === "ready" ? readyLabel : plannedLabel}
        </span>
      </div>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <h3 style={cardTitleStyle}>{card.title}</h3>
        <p style={cardBodyStyle}>{card.description}</p>
      </div>
      <p style={cardMetaStyle}>{card.meta}</p>
      {card.href ? (
        <Link to={card.href} style={cardLinkStyle}>
          {actionLabel}
        </Link>
      ) : (
        <span style={plannedHintStyle}>{plannedLabel}</span>
      )}
    </article>
  );
}

export function StudioWorkbenchPage() {
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();

  const groups: ToolGroup[] = [
    {
      title: t("studioWorkbench.groups.delivery.title"),
      subtitle: t("studioWorkbench.groups.delivery.subtitle"),
      items: [
        {
          title: t("studioWorkbench.cards.adsCreate.title"),
          description: t("studioWorkbench.cards.adsCreate.description"),
          meta: t("studioWorkbench.cards.adsCreate.meta"),
          tone: "ready",
          href: appendSearchToPath("/app/studio/ads", locationSearch),
        },
        {
          title: t("studioWorkbench.cards.catalog.title"),
          description: t("studioWorkbench.cards.catalog.description"),
          meta: t("studioWorkbench.cards.catalog.meta"),
          tone: "ready",
          href: appendSearchToPath("/app/ads-catalog", locationSearch),
        },
        {
          title: t("studioWorkbench.cards.feed.title"),
          description: t("studioWorkbench.cards.feed.description"),
          meta: t("studioWorkbench.cards.feed.meta"),
          tone: "ready",
          href: appendSearchToPath("/app/ads-catalog?tab=sync", locationSearch),
        },
        {
          title: t("studioWorkbench.cards.adsEdit.title"),
          description: t("studioWorkbench.cards.adsEdit.description"),
          meta: t("studioWorkbench.cards.adsEdit.meta"),
          tone: "ready",
          href: appendSearchToPath("/app/studio/ads-edit", locationSearch),
        },
      ],
    },
    {
      title: t("studioWorkbench.groups.content.title"),
      subtitle: t("studioWorkbench.groups.content.subtitle"),
      items: [
        {
          title: t("studioWorkbench.cards.productCopy.title"),
          description: t("studioWorkbench.cards.productCopy.description"),
          meta: t("studioWorkbench.cards.productCopy.meta"),
          tone: "ready",
          href: appendSearchToPath("/app/studio/copy", locationSearch),
        },
        {
          title: t("studioWorkbench.cards.imageTools.title"),
          description: t("studioWorkbench.cards.imageTools.description"),
          meta: t("studioWorkbench.cards.imageTools.meta"),
          tone: "ready",
          href: appendSearchToPath("/app/studio/image", locationSearch),
        },
        {
          title: t("studioWorkbench.cards.landingPage.title"),
          description: t("studioWorkbench.cards.landingPage.description"),
          meta: t("studioWorkbench.cards.landingPage.meta"),
          tone: "planned",
        },
      ],
    },
    {
      title: t("studioWorkbench.groups.ai.title"),
      subtitle: t("studioWorkbench.groups.ai.subtitle"),
      items: [
        {
          title: t("studioWorkbench.cards.aiAssistant.title"),
          description: t("studioWorkbench.cards.aiAssistant.description"),
          meta: t("studioWorkbench.cards.aiAssistant.meta"),
          tone: "ready",
          href: appendSearchToPath("/app", locationSearch),
        },
        {
          title: t("studioWorkbench.cards.taskWorkbench.title"),
          description: t("studioWorkbench.cards.taskWorkbench.description"),
          meta: t("studioWorkbench.cards.taskWorkbench.meta"),
          tone: "ready",
          href: appendSearchToPath("/app/tasks", locationSearch),
        },
        {
          title: t("studioWorkbench.cards.automation.title"),
          description: t("studioWorkbench.cards.automation.description"),
          meta: t("studioWorkbench.cards.automation.meta"),
          tone: "planned",
        },
      ],
    },
  ];

  const readyCount = groups.flatMap((group) => group.items).filter((item) => item.tone === "ready").length;
  const plannedCount = groups.flatMap((group) => group.items).filter((item) => item.tone === "planned").length;

  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        titleBarTitle={t("nav.studio")}
        backLabel={t("common.backToPrevious")}
        fallbackPath="/app"
        title={t("studioWorkbench.pageTitle")}
        subtitle={t("studioWorkbench.pageSubtitle")}
        eyebrow={t("studioWorkbench.eyebrow")}
        rightAction={
          <Link to={appendSearchToPath("/app/settings", locationSearch)} style={headerActionStyle}>
            {t("studioWorkbench.openConnections")}
          </Link>
        }
      />

      <PageMetricCard
        accent={t("studioWorkbench.metricAccent")}
        metrics={[
          { label: t("studioWorkbench.metrics.groups"), value: String(groups.length) },
          { label: t("studioWorkbench.metrics.ready"), value: String(readyCount) },
          { label: t("studioWorkbench.metrics.planned"), value: String(plannedCount) },
        ]}
        footer={
          <span>
            {t("studioWorkbench.metricFooter")}{" "}
            <Link to={appendSearchToPath("/app/settings", locationSearch)} style={inlineLinkStyle}>
              {t("studioWorkbench.metricFooterLink")}
            </Link>
          </span>
        }
      />

      <div style={boundaryGridStyle}>
        <PageSurface
          title={t("studioWorkbench.boundary.connections.title")}
          subtitle={t("studioWorkbench.boundary.connections.subtitle")}
        >
          <ul style={listStyle}>
            <li>{t("studioWorkbench.boundary.connections.item1")}</li>
            <li>{t("studioWorkbench.boundary.connections.item2")}</li>
            <li>{t("studioWorkbench.boundary.connections.item3")}</li>
          </ul>
        </PageSurface>
        <PageSurface
          title={t("studioWorkbench.boundary.workbench.title")}
          subtitle={t("studioWorkbench.boundary.workbench.subtitle")}
        >
          <ul style={listStyle}>
            <li>{t("studioWorkbench.boundary.workbench.item1")}</li>
            <li>{t("studioWorkbench.boundary.workbench.item2")}</li>
            <li>{t("studioWorkbench.boundary.workbench.item3")}</li>
          </ul>
        </PageSurface>
      </div>

      {groups.map((group) => (
        <PageSurface key={group.title} title={group.title} subtitle={group.subtitle}>
          <div style={groupGridStyle}>
            {group.items.map((card) => (
              <WorkbenchCard
                key={card.title}
                card={card}
                actionLabel={t("studioWorkbench.openTool")}
                plannedLabel={t("studioWorkbench.statusPlanned")}
                readyLabel={t("studioWorkbench.statusReady")}
              />
            ))}
          </div>
        </PageSurface>
      ))}
    </div>
  );
}

const boundaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "1rem",
};

const groupGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "1rem",
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  color: pageColorTokens.textBody,
  display: "grid",
  gap: "0.55rem",
  lineHeight: 1.55,
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
  height: "100%",
  padding: "1rem",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceSubtle,
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
};

const badgeStyleBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.25rem 0.65rem",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 700,
  lineHeight: 1,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const cardBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  lineHeight: 1.55,
  color: pageColorTokens.textBody,
};

const cardMetaStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const cardLinkStyle: CSSProperties = {
  width: "fit-content",
  padding: "0.55rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderInput}`,
  color: pageColorTokens.textPrimary,
  fontSize: "0.8125rem",
  fontWeight: 700,
  textDecoration: "none",
};

const plannedHintStyle: CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const headerActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.65rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderInput}`,
  color: pageColorTokens.textPrimary,
  fontSize: "0.8125rem",
  fontWeight: 700,
  textDecoration: "none",
};

const inlineLinkStyle: CSSProperties = {
  color: pageColorTokens.brandBlueDark,
  fontWeight: 700,
  textDecoration: "none",
};
