import { useTranslation } from "react-i18next";
import type { PageSpeedAuditItem, PageSpeedCategoryReport } from "../../../lib/pageSpeedTypes";
import { pageColorTokens } from "../../page/pageUiStyles";
import { bandColor, pageSpeedCardStyle, pageSpeedMutedTextStyle } from "./pageSpeedUi";

function savingsLabel(item: PageSpeedAuditItem): string | null {
  if (item.displayValue) return item.displayValue;
  if (item.savingsMs && item.savingsMs > 0) return `${Math.round(item.savingsMs)} ms`;
  if (item.savingsBytes && item.savingsBytes > 0) {
    const kib = item.savingsBytes / 1024;
    return kib >= 10 ? `${Math.round(kib)} KiB` : `${kib.toFixed(1)} KiB`;
  }
  return null;
}

function AuditSection({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: PageSpeedAuditItem[];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3
        style={{
          margin: "0 0 0.65rem",
          fontSize: "0.95rem",
          fontWeight: 700,
          color: pageColorTokens.textPrimary,
        }}
      >
        {title}
      </h3>
      {items.length === 0 ? (
        <p style={{ ...pageSpeedMutedTextStyle, margin: 0 }}>{emptyLabel}</p>
      ) : (
        <AuditItemList items={items} />
      )}
    </div>
  );
}

function CollapsibleAuditSection({
  title,
  items,
}: {
  title: string;
  items: PageSpeedAuditItem[];
}) {
  if (items.length === 0) return null;

  return (
    <details style={{ margin: 0 }}>
      <summary
        style={{
          cursor: "pointer",
          fontSize: "0.95rem",
          fontWeight: 700,
          color: pageColorTokens.textPrimary,
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
        }}
      >
        <span aria-hidden style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary }}>
          ▸
        </span>
        {title}
      </summary>
      <div style={{ marginTop: "0.65rem" }}>
        <AuditItemList items={items} tone="muted" />
      </div>
    </details>
  );
}

function AuditItemList({
  items,
  tone = "default",
}: {
  items: PageSpeedAuditItem[];
  tone?: "default" | "muted";
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
      {items.map((item) => (
        <AuditRow key={item.id} item={item} tone={tone} />
      ))}
    </div>
  );
}

function AuditRow({
  item,
  tone = "default",
}: {
  item: PageSpeedAuditItem;
  tone?: "default" | "muted";
}) {
  const savings = savingsLabel(item);
  const savingsTone = item.score != null && item.score < 50 ? "poor" : "needs-improvement";
  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: pageColorTokens.radiusControl,
        padding: "0.75rem 0.85rem",
        background: tone === "muted" ? pageColorTokens.surface : pageColorTokens.surfaceSubtle,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.875rem", color: pageColorTokens.textPrimary }}>
          {item.title}
        </div>
        {savings ? (
          <div
            style={{ fontSize: "0.8rem", fontWeight: 600, color: bandColor(savingsTone), flexShrink: 0 }}
          >
            {savings}
          </div>
        ) : null}
      </div>
      {item.description ? (
        <p style={{ ...pageSpeedMutedTextStyle, margin: "0.35rem 0 0" }}>{item.description}</p>
      ) : null}
    </div>
  );
}

export function PageSpeedAuditPanel({ report }: { report: PageSpeedCategoryReport }) {
  const { t } = useTranslation();
  const isPerformance = report.id === "performance";

  return (
    <div style={{ ...pageSpeedCardStyle, display: "flex", flexDirection: "column", gap: "1.15rem" }}>
      {isPerformance ? (
        <>
          <AuditSection
            title={t("pageSpeed.opportunities")}
            items={report.opportunities}
            emptyLabel={t("pageSpeed.noOpportunities")}
          />
          <AuditSection
            title={t("pageSpeed.diagnostics")}
            items={report.diagnostics}
            emptyLabel={t("pageSpeed.noDiagnostics")}
          />
        </>
      ) : (
        <AuditSection
          title={t("pageSpeed.failedAudits")}
          items={report.failed}
          emptyLabel={t("pageSpeed.noFailedAudits")}
        />
      )}
      <CollapsibleAuditSection
        title={t("pageSpeed.manualAudits", { count: report.manualCount })}
        items={report.manual}
      />
      <CollapsibleAuditSection
        title={t("pageSpeed.passedAudits", { count: report.passedCount })}
        items={report.passed}
      />
    </div>
  );
}
