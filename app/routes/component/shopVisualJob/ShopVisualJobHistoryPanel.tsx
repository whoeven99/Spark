import { useTranslation } from "react-i18next";
import type { ShopVisualJobHistoryItem } from "../../../lib/shopVisualJobTypes";
import { pageEmptyStateStyle, pageHintTextStyle } from "../../page/pageUiStyles";

type Props = {
  items: ShopVisualJobHistoryItem[];
  activeRequestId: string | null;
  onSelect: (item: ShopVisualJobHistoryItem) => void;
  i18nPrefix: "imageGeneration" | "pictureTranslate";
};

function statusLabel(
  t: (key: string) => string,
  prefix: Props["i18nPrefix"],
  status: ShopVisualJobHistoryItem["status"],
): string {
  if (status === "pending") return t(`${prefix}.historyStatusPending`);
  if (status === "failed") return t(`${prefix}.historyStatusFailed`);
  return t(`${prefix}.historyStatusDone`);
}

export function ShopVisualJobHistoryPanel({
  items,
  activeRequestId,
  onSelect,
  i18nPrefix,
}: Props) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <p style={pageEmptyStateStyle}>{t(`${i18nPrefix}.historyEmpty`)}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={pageHintTextStyle}>{t(`${i18nPrefix}.historyHint`)}</p>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {items.map((item) => {
          const active = item.requestId === activeRequestId;
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
                  background: "var(--p-color-bg-surface-secondary, #f1f1f1)",
                  flexShrink: 0,
                }}
              />
            );

          return (
            <li key={item.requestId}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: active
                    ? "1px solid var(--p-color-border-emphasis, #8c9196)"
                    : "1px solid #e1e3e5",
                  background: "var(--p-color-bg-surface, #fff)",
                  cursor: "pointer",
                }}
              >
                {preview}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--p-color-text-secondary, #616161)",
                    }}
                  >
                    {statusLabel(t, i18nPrefix, item.status)}
                  </span>
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 13,
                    }}
                  >
                    {item.summary}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
