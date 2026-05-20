import { useTranslation } from "react-i18next";
import type { ShopVisualJobHistoryItem } from "../../../lib/shopVisualJobTypes";
import { pageEmptyStateStyle, pageHintTextStyle } from "../../page/pageUiStyles";
import { ShopVisualJobHistoryRow } from "./ShopVisualJobHistoryRow";

type Props = {
  items: ShopVisualJobHistoryItem[];
  activeRequestId: string | null;
  onSelect: (item: ShopVisualJobHistoryItem) => void;
  onDelete: (item: ShopVisualJobHistoryItem) => void;
  deletingRequestId: string | null;
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
  onDelete,
  deletingRequestId,
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
        {items.map((item) => (
          <li key={item.requestId}>
            <ShopVisualJobHistoryRow
              item={item}
              active={item.requestId === activeRequestId}
              statusText={statusLabel(t, i18nPrefix, item.status)}
              deleting={deletingRequestId === item.requestId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
