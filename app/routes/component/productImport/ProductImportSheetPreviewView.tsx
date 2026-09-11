import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  catalogReviewCellStyle,
  catalogReviewHeadCellStyle,
} from "../catalogManage/catalogReviewUi";
import type { ProductImportSheetPreview } from "../../../lib/productImportSheetPreview";

const chipStyle = {
  fontSize: 12,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 999,
  padding: "3px 10px",
} as const;

export function ProductImportSheetPreviewView({
  preview,
  matchingHint,
}: {
  preview: ProductImportSheetPreview;
  matchingHint?: boolean;
}) {
  const { t } = useTranslation();
  const issueLabel = (code: string) =>
    t(`productImport.issue.${code}`, { defaultValue: code });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {matchingHint ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("productImport.sheetPreview.matchingHint")}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={chipStyle}>
          {t("productImport.sheetPreview.rows")}
          <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>{preview.rowCount}</strong>
        </span>
        <span style={chipStyle}>
          {t("productImport.sheetPreview.issues")}
          <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>{preview.issueCount}</strong>
        </span>
        {preview.matchedOperations.length > 0 ? (
          <span style={chipStyle}>
            {t("productImport.sheetPreview.matchedOps")}
            <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
              {preview.matchedOperations
                .map((operation) => t(`productImport.operation.${operation}`))
                .join("、")}
            </strong>
          </span>
        ) : null}
      </div>
      {preview.truncated ? (
        <div style={{ fontSize: 12, color: "#92400e" }}>{t("productImport.truncatedWarning")}</div>
      ) : null}
      {preview.unknownColumns.length > 0 ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("productImport.sheetPreview.unknownColumns", {
            columns: preview.unknownColumns.join("、"),
          })}
        </div>
      ) : null}
      {preview.unsupportedColumns.length > 0 ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("productImport.sheetPreview.unsupportedColumns", {
            columns: preview.unsupportedColumns.join("、"),
          })}
        </div>
      ) : null}
      {preview.issues.length > 0 ? (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12,
            color: pageColorTokens.textSecondary,
          }}
        >
          {preview.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.rowNumber}-${issue.column ?? ""}-${index}`}>
              {issue.rowNumber > 0
                ? t("productImport.sheetPreview.issueRow", {
                    row: issue.rowNumber,
                    problem: issueLabel(issue.code),
                  })
                : issueLabel(issue.code)}
              {issue.column ? ` · ${issue.column}` : ""}
            </li>
          ))}
          {preview.issueCount > preview.issues.length ? (
            <li>
              {t("productImport.sheetPreview.moreIssues", {
                count: preview.issueCount - preview.issues.length,
              })}
            </li>
          ) : null}
        </ul>
      ) : null}
      {preview.columns.length > 0 && preview.sampleRows.length > 0 ? (
        <div
          style={{
            maxHeight: 220,
            overflow: "auto",
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            borderRadius: 8,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={catalogReviewHeadCellStyle}>{t("productImport.colRow")}</th>
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
          {t("productImport.sheetPreview.moreRows", {
            shown: preview.sampleRows.length,
            total: preview.rowCount,
          })}
        </div>
      ) : null}
    </div>
  );
}
