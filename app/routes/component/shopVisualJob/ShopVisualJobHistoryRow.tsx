import { useTranslation } from "react-i18next";
import type { ShopVisualJobHistoryItem } from "../../../lib/shopVisualJobTypes";
import { pageColorTokens } from "../../page/pageUiStyles";

export type ShopVisualJobHistoryRowProps = {
  item: ShopVisualJobHistoryItem;
  active: boolean;
  statusText: string;
  kindBadge?: { label: string; color: string; background: string };
  deleting: boolean;
  onSelect: (item: ShopVisualJobHistoryItem) => void;
  onDelete: (item: ShopVisualJobHistoryItem) => void;
  activeBorderColor?: string;
  activeBackground?: string;
};

export function ShopVisualJobHistoryRow({
  item,
  active,
  statusText,
  kindBadge,
  deleting,
  onSelect,
  onDelete,
  activeBorderColor = pageColorTokens.textFootnote,
  activeBackground = pageColorTokens.surface,
}: ShopVisualJobHistoryRowProps) {
  const { t } = useTranslation();

  const preview =
    item.status === "succeeded" && item.imageUrl ? (
      <img
        src={item.imageUrl}
        alt=""
        style={{
          width: 48,
          height: 48,
          objectFit: "cover",
          borderRadius: 6,
          flexShrink: 0,
        }}
      />
    ) : (
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 6,
          background: pageColorTokens.surfaceMuted,
          flexShrink: 0,
        }}
      />
    );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 8,
          border: active ? `1px solid ${activeBorderColor}` : `1px solid ${pageColorTokens.border}`,
          background: active ? activeBackground : pageColorTokens.surface,
          cursor: "pointer",
        }}
      >
        {preview}
        <span style={{ flex: 1, minWidth: 0 }}>
          {kindBadge ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: kindBadge.background,
                  color: kindBadge.color,
                }}
              >
                {kindBadge.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: pageColorTokens.textSecondary,
                }}
              >
                {statusText}
              </span>
            </span>
          ) : (
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: pageColorTokens.textSecondary,
                marginBottom: 4,
              }}
            >
              {statusText}
            </span>
          )}
          <span
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 13,
              color: pageColorTokens.textPrimary,
            }}
          >
            {item.description?.trim() || item.summary}
          </span>
        </span>
      </button>
      <s-button
        variant="tertiary"
        tone="critical"
        disabled={deleting}
        onClick={() => onDelete(item)}
        accessibilityLabel={t("visualHistory.delete")}
      >
        {deleting ? t("visualHistory.deleting") : t("visualHistory.delete")}
      </s-button>
    </div>
  );
}
