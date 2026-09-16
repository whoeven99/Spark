import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  catalogReviewCellStyle,
  catalogReviewHeadCellStyle,
} from "../catalogManage/catalogReviewUi";
import {
  type InventoryImportSheetPreview,
} from "../../../lib/inventoryImportSheetPreview";

const chipStyle = {
  fontSize: 12,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 999,
  padding: "3px 10px",
} as const;

export function InventoryImportSheetPreviewView({
  preview,
}: {
  preview: InventoryImportSheetPreview;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={chipStyle}>
          {t("inventoryImport.sheetPreview.rows")}
          <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>{preview.rowCount}</strong>
        </span>
        <span style={chipStyle}>
          {t("inventoryImport.sheetPreview.filledNew")}
          <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
            {preview.filledNewCount}
          </strong>
        </span>
        {preview.locationNames.length > 0 ? (
          <span style={chipStyle}>
            {t("inventoryImport.sheetPreview.locations")}
            <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
              {preview.locationNames.join("、")}
            </strong>
          </span>
        ) : null}
      </div>
      {preview.blockedReason ? (
        <div style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
          {t(`inventoryImport.sheetPreview.block.${preview.blockedReason}`)}
        </div>
      ) : null}
      {preview.issues.slice(0, 4).map((issue) => (
        <div key={`${issue.code}-${issue.rowNumber}-${issue.value ?? ""}`} style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
          {issue.rowNumber > 0
            ? t("inventoryImport.sheetPreview.issueRow", {
                row: issue.rowNumber,
                problem: t(`inventoryImport.issue.${issue.code}`, { defaultValue: issue.code }),
              })
            : t(`inventoryImport.issue.${issue.code}`, { defaultValue: issue.code })}
        </div>
      ))}
      {preview.issueCount > 4 ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("inventoryImport.sheetPreview.moreIssues", { count: preview.issueCount - 4 })}
        </div>
      ) : null}
      {preview.columns.length > 0 && preview.sampleRows.length > 0 ? (
        <div
          style={{
            maxHeight: 200,
            overflow: "auto",
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            borderRadius: 8,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={catalogReviewHeadCellStyle}>{t("inventoryImport.colRow")}</th>
                {preview.columns.map((column) => (
                  <th key={column.key} style={catalogReviewHeadCellStyle}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row) => (
                <tr key={row.rowNumber}>
                  <td style={catalogReviewCellStyle}>{row.rowNumber}</td>
                  {preview.columns.map((column, index) => (
                    <td key={column.key} style={catalogReviewCellStyle}>
                      {row.cells[index] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {preview.rowCount > preview.sampleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("inventoryImport.sheetPreview.moreRows", {
            shown: preview.sampleRows.length,
            total: preview.rowCount,
          })}
        </div>
      ) : null}
    </div>
  );
}
