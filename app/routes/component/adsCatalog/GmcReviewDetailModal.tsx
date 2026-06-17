import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { GmcReviewProductView } from "./types";

type Props = {
  products: GmcReviewProductView[];
  lastCheckedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
};

function statusBadge(status: string): { label: string; bg: string; color: string } {
  switch (status) {
    case "approved":
      return { label: "✅ 已通过", bg: "#e7f6ef", color: "#0f7a52" };
    case "disapproved":
      return { label: "❌ 已拒绝", bg: "#fdecec", color: "#c0392b" };
    case "pending":
      return { label: "⏳ 审核中", bg: "#fff6e6", color: "#a36a00" };
    case "expiring":
      return { label: "⌛ 即将过期", bg: "#fff6e6", color: "#a36a00" };
    default:
      return { label: status, bg: "#eef0f3", color: "#475569" };
  }
}

export function GmcReviewDetailModal({
  products,
  lastCheckedAt,
  refreshing,
  onRefresh,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "min(760px, 100%)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${pageColorTokens.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {t("adsCatalog.reviewModalTitle")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>

        <div style={{ overflow: "auto", padding: "8px 20px" }}>
          {products.length === 0 ? (
            <p style={{ color: pageColorTokens.textSecondary, padding: "16px 0" }}>
              {t("adsCatalog.reviewEmpty")}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: pageColorTokens.textSecondary }}>
                  <th style={{ padding: "8px 6px" }}>{t("adsCatalog.reviewColTitle")}</th>
                  <th style={{ padding: "8px 6px" }}>{t("adsCatalog.reviewColStatus")}</th>
                  <th style={{ padding: "8px 6px" }}>{t("adsCatalog.reviewColReason")}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const badge = statusBadge(p.status);
                  return (
                    <tr key={p.offerId} style={{ borderTop: `1px solid ${pageColorTokens.border}` }}>
                      <td style={{ padding: "8px 6px" }}>
                        <div style={{ fontWeight: 600 }}>{p.title || p.offerId}</div>
                        <div style={{ color: pageColorTokens.textSecondary, fontSize: 11 }}>
                          {p.offerId}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <span
                          style={{
                            background: badge.bg,
                            color: badge.color,
                            borderRadius: 6,
                            padding: "2px 8px",
                            fontSize: 12,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "8px 6px", color: pageColorTokens.textSecondary }}>
                        {p.issues.length > 0
                          ? p.issues.map((i) => i.description).join("；")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${pageColorTokens.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {lastCheckedAt
              ? t("adsCatalog.reviewLastChecked", {
                  time: new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(lastCheckedAt)),
                })
              : t("adsCatalog.reviewNeverChecked")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                background: "#fff",
                cursor: refreshing ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {refreshing ? t("adsCatalog.reviewRefreshing") : t("adsCatalog.reviewRefresh")}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: pageColorTokens.brandGreen,
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
