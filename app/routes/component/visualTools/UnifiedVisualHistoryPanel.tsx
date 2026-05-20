import { useTranslation } from "react-i18next";
import type { ShopVisualJobHistoryItem } from "../../../lib/shopVisualJobTypes";
import { pageEmptyStateStyle, pageHintTextStyle, pageColorTokens } from "../../page/pageUiStyles";
import { ShopVisualJobHistoryRow } from "../shopVisualJob/ShopVisualJobHistoryRow";

type Props = {
  items: ShopVisualJobHistoryItem[];
  activeRequestId: string | null;
  activeTab: "generate" | "translate";
  onSelect: (item: ShopVisualJobHistoryItem) => void;
  onDelete: (item: ShopVisualJobHistoryItem) => void;
  deletingRequestId: string | null;
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

function kindBadgeStyle(kind: ShopVisualJobHistoryItem["kind"]) {
  if (kind === "picture_translate") {
    return {
      label: "",
      color: pageColorTokens.brandBlue,
      background: "rgba(44, 110, 203, 0.12)",
    };
  }
  return {
    label: "",
    color: pageColorTokens.brandGreenDeep,
    background: "rgba(0, 128, 96, 0.12)",
  };
}

export function UnifiedVisualHistoryPanel({
  items,
  activeRequestId,
  activeTab,
  onSelect,
  onDelete,
  deletingRequestId,
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
          const badgeBase = kindBadgeStyle(item.kind);
          return (
            <li key={`${item.kind}-${item.requestId}`}>
              <ShopVisualJobHistoryRow
                item={item}
                active={active}
                statusText={statusLabel(t, item.kind, item.status)}
                kindBadge={{
                  ...badgeBase,
                  label: kindLabel(t, item.kind),
                }}
                deleting={deletingRequestId === item.requestId}
                onSelect={onSelect}
                onDelete={onDelete}
                activeBorderColor={pageColorTokens.brandGreen}
                activeBackground={pageColorTokens.brandGreenLight}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
