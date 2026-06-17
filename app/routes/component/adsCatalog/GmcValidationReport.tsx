import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { FeedValidationReportView } from "./types";

type Props = {
  report: FeedValidationReportView;
};

export function GmcValidationReport({ report }: Props) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);

  const problemProducts = useMemo(
    () => report.products.filter((p) => p.status !== "ok"),
    [report.products],
  );

  const visible = useMemo(() => {
    const filtered = errorsOnly
      ? problemProducts.filter((p) => p.status === "error")
      : problemProducts;
    return showAll ? filtered : filtered.slice(0, 10);
  }, [problemProducts, errorsOnly, showAll]);

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusControl,
        padding: 16,
        background: pageColorTokens.surfaceMuted,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>
        {t("adsCatalog.validationTotal", { count: report.totalProducts })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
        <span style={{ color: "#0f7a52" }}>
          ✅ {t("adsCatalog.validationReady", { count: report.readyToSync })}
        </span>
        <span style={{ color: "#a36a00" }}>
          ⚠️ {t("adsCatalog.validationWarnings", { count: report.hasWarnings })}
        </span>
        <span style={{ color: "#c0392b" }}>
          ❌ {t("adsCatalog.validationErrors", { count: report.hasErrors })}
        </span>
      </div>

      {problemProducts.length > 0 && (
        <>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {t("adsCatalog.validationProblemList")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map((p) => (
              <div
                key={p.productId}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                  padding: "6px 0",
                  borderTop: `1px solid ${pageColorTokens.border}`,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600, minWidth: 160 }}>{p.title || p.productId}</span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {p.issues.map((issue) => (
                    <span
                      key={issue.rule}
                      style={{ color: issue.level === "error" ? "#c0392b" : "#a36a00" }}
                    >
                      {issue.level === "error" ? "❌" : "⚠️"} {issue.message}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {problemProducts.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                style={linkButtonStyle}
              >
                {showAll ? t("adsCatalog.validationCollapse") : t("adsCatalog.validationExpandAll")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setErrorsOnly((v) => !v)}
              style={linkButtonStyle}
            >
              {errorsOnly
                ? t("adsCatalog.validationShowAllLevels")
                : t("adsCatalog.validationErrorsOnly")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const linkButtonStyle = {
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandGreen,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  padding: 0,
};
