import type { CSSProperties } from "react";

type SegmentedPageTabItem<T extends string> = {
  key: T;
  label: string;
  badgeCount?: number;
};

type Props<T extends string> = {
  activeTab: T;
  items: readonly SegmentedPageTabItem<T>[];
  onTabChange: (tab: T) => void;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
};

export function SegmentedPageTabs<T extends string>({
  activeTab,
  items,
  onTabChange,
  ariaLabel,
  className,
  style,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={className ? `spark-segmented-tabs ${className}` : "spark-segmented-tabs"}
      style={style}
    >
      {items.map((item) => {
        const active = item.key === activeTab;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`spark-segmented-tabs__item${active ? " is-active" : ""}`}
            onClick={() => onTabChange(item.key)}
          >
            <span>{item.label}</span>
            {item.badgeCount && item.badgeCount > 0 ? (
              <span className="spark-segmented-tabs__badge">{item.badgeCount}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
