import { useTranslation } from "react-i18next";
import type { ShopVisualJobHistoryItem } from "../../../lib/shopVisualJobTypes";
import { pageEmptyStateStyle, pageHintTextStyle, pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  items: ShopVisualJobHistoryItem[];
  activeRequestId: string | null;
  activeTab: "generate" | "translate";
  onSelect: (item: ShopVisualJobHistoryItem) => void;
};

function kindLabel(t: (key: string) => string, kind: ShopVisualJobHistoryItem["kind"]): string {
  return kind === "picture_translate"
    ? t("imageStudio.historyKindTranslate")
    : t("imageStudio.historyKindGenerate");
}

function statusLabel(
  t: (key: string) => string,
  kind: ShopVisualJobHistoryItem["kind"],
  status: ShopVisualJobHistoryItem["status"],
): string {
  const prefix = kind === "picture_translate" ? "pictureTranslate" : "imageGeneration";
  if (status === "pending") return t(`${prefix}.historyStatusPending`);
  if (status === "failed") return t(`${prefix}.historyStatusFailed`);
  return t(`${prefix}.historyStatusDone`);
}

export function UnifiedVisualHistoryPanel({
  items,
  activeRequestId,
  activeTab,
  onSelect,
}: Props) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <p style={pageEmptyStateStyle}>{t("imageStudio.historyEmpty")}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={pageHintTextStyle}>{t("imageStudio.historyHint")}</p>
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
          const active =
            item.requestId === activeRequestId &&
            ((item.kind === "image_generation" && activeTab === "generate") ||
              (item.kind === "picture_translate" && activeTab === "translate"));
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
            <li key={`${item.kind}-${item.requestId}`}>
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
                    ? `1px solid ${pageColorTokens.brandGreen}`
                    : `1px solid ${pageColorTokens.border}`,
                  background: active ? pageColorTokens.brandGreenLight : pageColorTokens.surface,
                  cursor: "pointer",
                }}
              >
                {preview}
                <span style={{ flex: 1, minWidth: 0 }}>
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
                        background:
                          item.kind === "picture_translate"
                            ? "rgba(44, 110, 203, 0.12)"
                            : "rgba(0, 128, 96, 0.12)",
                        color:
                          item.kind === "picture_translate"
                            ? pageColorTokens.brandBlue
                            : pageColorTokens.brandGreenDeep,
                      }}
                    >
                      {kindLabel(t, item.kind)}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: pageColorTokens.textSecondary,
                      }}
                    >
                      {statusLabel(t, item.kind, item.status)}
                    </span>
                  </span>
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
