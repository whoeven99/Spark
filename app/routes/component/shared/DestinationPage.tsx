import type { CSSProperties, ReactNode } from "react";
import {
  PageHeaderNav,
  pageColorTokens,
} from "../../page/pageUiStyles";

export type DestinationActionCard = {
  key: string;
  title: string;
  detail: string;
  meta?: string;
  badge?: string;
  active?: boolean;
  onClick: () => void;
};

export function DestinationPage({
  title,
  subtitle,
  eyebrow,
  titleBarTitle,
  backLabel = "返回首页",
  fallbackPath = "/app",
  returnTo,
  actions,
  children,
  isMobile,
  chromeless = false,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  titleBarTitle?: string;
  backLabel?: string;
  fallbackPath?: string;
  returnTo?: string;
  actions?: DestinationActionCard[];
  children?: ReactNode;
  isMobile: boolean;
  chromeless?: boolean;
}) {
  return (
    <>
      <PageHeaderNav
        title={title}
        subtitle={subtitle}
        eyebrow={eyebrow}
        titleBarTitle={titleBarTitle}
        backLabel={backLabel}
        fallbackPath={fallbackPath}
        returnTo={returnTo}
        chromeless={chromeless}
      />
      {actions && actions.length > 0 ? (
        <DestinationActionGrid actions={actions} isMobile={isMobile} />
      ) : null}
      {children ?? null}
    </>
  );
}

export function DestinationActionGrid({
  actions,
  isMobile,
}: {
  actions: DestinationActionCard[];
  isMobile: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(actions.length, 4)}, minmax(0, 1fr))`,
        gap: "0.75rem",
      }}
    >
      {actions.map((action) => (
        <DestinationActionButton key={action.key} action={action} />
      ))}
    </div>
  );
}

function DestinationActionButton({ action }: { action: DestinationActionCard }) {
  const active = Boolean(action.active);
  return (
    <button
      type="button"
      onClick={action.onClick}
      style={{
        ...destinationCardStyle,
        borderColor: active ? pageColorTokens.brandGreen : pageColorTokens.border,
        background: active ? pageColorTokens.brandGreenLight : pageColorTokens.surface,
      }}
    >
      <span style={destinationCardTopStyle}>
        <span style={destinationCardTitleStyle}>{action.title}</span>
        {action.badge ? (
          <span style={destinationBadgeStyle(active)}>{action.badge}</span>
        ) : null}
      </span>
      <span style={destinationCardDetailStyle}>{action.detail}</span>
      {action.meta ? <span style={destinationCardMetaStyle}>{action.meta}</span> : null}
    </button>
  );
}

export function DestinationFilterBar<T extends string>({
  label,
  items,
  active,
  onChange,
}: {
  label: string;
  items: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div style={filterGroupStyle}>
      <span style={filterLabelStyle}>{label}</span>
      <div style={filterPillsStyle}>
        {items.map((item) => {
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              style={filterPillStyle(selected)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const destinationSurfaceStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
};

const destinationCardStyle: CSSProperties = {
  ...destinationSurfaceStyle,
  textAlign: "left",
  padding: "1rem",
  cursor: "pointer",
  display: "grid",
  gap: "0.4rem",
  fontFamily: "inherit",
  transition: "border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
};

const destinationCardTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.65rem",
};

const destinationCardTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 750,
  color: pageColorTokens.textPrimary,
};

const destinationCardDetailStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: pageColorTokens.textBody,
};

const destinationCardMetaStyle: CSSProperties = {
  fontSize: 11,
  color: pageColorTokens.textSecondary,
};

const destinationBadgeStyle = (active: boolean): CSSProperties => ({
  flexShrink: 0,
  borderRadius: 999,
  padding: "0.15rem 0.45rem",
  fontSize: 11,
  fontWeight: 750,
  color: active ? pageColorTokens.brandGreenDark : pageColorTokens.textSecondary,
  background: active ? "#ffffff" : pageColorTokens.surfaceMuted,
  border: `1px solid ${active ? "rgba(0, 166, 124, 0.28)" : pageColorTokens.borderSubtle}`,
});

const filterGroupStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
};

const filterLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 750,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: pageColorTokens.textSecondary,
};

const filterPillsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
};

const filterPillStyle = (active: boolean): CSSProperties => ({
  padding: "0.45rem 0.75rem",
  borderRadius: 999,
  border: `1px solid ${active ? pageColorTokens.brandBlue : pageColorTokens.borderSubtle}`,
  background: active ? pageColorTokens.brandBlueLight : pageColorTokens.surfaceMuted,
  color: active ? pageColorTokens.brandBlueDark : pageColorTokens.textSecondary,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
});
