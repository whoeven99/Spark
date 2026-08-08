/**
 * 迁移占位页（PR1）：新信息架构的一级目的地（经营 / 创作）尚未落地内容时，
 * 用统一的占位说明 + 现有功能入口承接，避免导航死链。后续 PR 会用真实内容替换。
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "../page/pageUiStyles";

export type MigrationLink = {
  label: string;
  /** 现有路由（PR2~5 会逐步合并/删除） */
  href: string;
};

function LegacyLinkRow({ links }: { links: MigrationLink[] }) {
  if (links.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
      {links.map((link) => (
        <Link
          key={link.href}
          to={link.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.55rem 0.9rem",
            borderRadius: pageColorTokens.radiusControl,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            background: pageColorTokens.surface,
            color: pageColorTokens.textPrimary,
            fontSize: "0.85rem",
            textDecoration: "none",
          }}
        >
          {link.label}
          <span aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

export function MigrationNoticePage({
  title,
  subtitle,
  links,
}: {
  title: string;
  subtitle: string;
  links: MigrationLink[];
}) {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={title}
        subtitle={subtitle}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app"
      />
      <PageSurface subtitle={t("settingsShell.migrating")}>
        <LegacyLinkRow links={links} />
      </PageSurface>
    </div>
  );
}
