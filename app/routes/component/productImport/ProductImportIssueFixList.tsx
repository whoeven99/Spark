import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  PRODUCT_IMPORT_REVIEW_SAMPLE_LIMIT,
  type ProductImportIssue,
} from "../../../lib/productImport";

export function ProductImportIssueFixList({
  issues,
  issueCount,
  limit = PRODUCT_IMPORT_REVIEW_SAMPLE_LIMIT,
}: {
  issues: ProductImportIssue[];
  issueCount: number;
  limit?: number;
}) {
  const { t } = useTranslation();
  const visible = issues.slice(0, limit);
  if (visible.length === 0) return null;
  const hidden = Math.max(0, issueCount - visible.length);
  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: 18,
        fontSize: 12,
        color: pageColorTokens.textSecondary,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {visible.map((issue, index) => {
        const problem = t(`productImport.issue.${issue.code}`, { defaultValue: issue.code });
        const fix = t(`productImport.fix.${issue.code}`, { defaultValue: "" });
        return (
          <li key={`${issue.code}-${issue.rowNumber}-${issue.column ?? ""}-${index}`}>
            <div>
              {issue.rowNumber > 0
                ? t("productImport.sheetPreview.issueRow", {
                    row: issue.rowLabel || issue.rowNumber,
                    problem,
                  })
                : problem}
              {issue.column ? ` · ${issue.column}` : ""}
              {issue.value ? ` · ${issue.value}` : ""}
            </div>
            {fix ? (
              <div style={{ marginTop: 2, color: pageColorTokens.textPrimary }}>
                {t("productImport.sheetPreview.issueFix", { fix })}
              </div>
            ) : null}
          </li>
        );
      })}
      {hidden > 0 ? (
        <li>{t("productImport.sheetPreview.moreIssues", { count: hidden })}</li>
      ) : null}
    </ul>
  );
}
