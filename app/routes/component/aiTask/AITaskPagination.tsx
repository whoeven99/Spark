import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  page: number;
  totalPages: number;
  totalCount: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

function paginationButtonStyle(disabled: boolean) {
  return {
    padding: "0.45rem 0.8rem",
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    background: disabled ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
    color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textPrimary,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    minWidth: 72,
  } as const;
}

export function AITaskPagination({
  page,
  totalPages,
  totalCount,
  loading = false,
  onPageChange,
}: Props) {
  const { t } = useTranslation();

  if (totalCount <= 0 || totalPages <= 1) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "0.75rem 0.9rem",
        borderRadius: pageColorTokens.radiusCard,
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
      }}
    >
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
        {t("common.paginationSummary", {
          page,
          totalPages,
          count: totalCount,
          defaultValue: "{{count}} tasks total, page {{page}} of {{totalPages}}",
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={loading || page <= 1}
          style={paginationButtonStyle(loading || page <= 1)}
        >
          {t("common.paginationPrev", { defaultValue: "Previous" })}
        </button>
        <span
          style={{
            minWidth: 96,
            textAlign: "center",
            fontSize: 12,
            fontWeight: 600,
            color: pageColorTokens.textPrimary,
          }}
        >
          {loading
            ? t("common.loading")
            : t("common.paginationPage", {
                page,
                totalPages,
                defaultValue: "Page {{page}} of {{totalPages}}",
              })}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={loading || page >= totalPages}
          style={paginationButtonStyle(loading || page >= totalPages)}
        >
          {t("common.paginationNext", { defaultValue: "Next" })}
        </button>
      </div>
    </div>
  );
}
