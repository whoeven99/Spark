import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import {
  GOOGLE_PIXEL_ACTIVITY_EVENTS,
  type GooglePixelActivityEvent,
  type GooglePixelActivityRange,
} from "../../lib/googlePixelActivity";
import { DialogShell } from "../component/shared/DialogShell";
import {
  DailyActivityChart,
  FunnelChart,
  MetricCards,
  type ActivityCounts,
  type ActivityDailyPoint,
  type ActivityFunnelStep,
} from "../component/googlePixel/GooglePixelActivityCharts";
import {
  PageHeaderNav,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
} from "./pageUiStyles";

function withEmbeddedSearch(path: string, locationSearch: string, extra?: URLSearchParams): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  if (extra) {
    for (const [key, value] of extra.entries()) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

type SummaryResponse = {
  ok?: boolean;
  configured?: boolean;
  range?: GooglePixelActivityRange;
  counts?: ActivityCounts;
  daily?: ActivityDailyPoint[];
  funnel?: ActivityFunnelStep[];
};

type EventRow = {
  id: string;
  time: number;
  event: string;
  googleEvent: string;
  value: string;
  currency: string;
  pagePath: string;
  pageUrl: string;
  consent: string;
  sentToGoogle: boolean | null;
  source: string;
  clientId: string;
  productId: string;
  schemaVersion: string;
  referrer: string;
  trafficSource: string;
  gclid: string;
  utmSource: string;
  utmMedium: string;
  pixelId: string;
  conversionLabel: string;
  transactionId: string;
  enhancedConversions: string;
  itemsSummary: string;
  deviceBrowser: string;
  deviceOs: string;
  deviceScreen: string;
  payload: Record<string, unknown> | null;
};

type EventsResponse = {
  ok?: boolean;
  configured?: boolean;
  logs?: EventRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

const cardStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 16,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
};

const secondaryBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none" as const,
  display: "inline-block",
};

const rangeBtn = (active: boolean) => ({
  ...secondaryBtn,
  background: active ? pageColorTokens.brandGreenLight : "#fff",
  borderColor: active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle,
  color: active ? pageColorTokens.brandGreenDeep : pageColorTokens.textPrimary,
});

function formatTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function cellText(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "—";
}

function SentToGooglePill({ sent }: { sent: boolean | null }) {
  const { t } = useTranslation();
  if (sent === null) return <span>—</span>;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: sent ? pageColorTokens.brandGreenLight : "#fff7e0",
        color: sent ? pageColorTokens.brandGreenDeep : "#8a6d00",
      }}
    >
      {sent ? t("googlePixelActivity.yes") : t("googlePixelActivity.no")}
    </span>
  );
}

const thStyle = {
  padding: "8px 6px",
  whiteSpace: "nowrap" as const,
  fontSize: 12,
};

const tdStyle = {
  padding: "10px 6px",
  maxWidth: 180,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  verticalAlign: "top" as const,
};

function ConsentPill({ consent }: { consent: string }) {
  const { t } = useTranslation();
  const denied = consent === "denied";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: denied ? "#fff7e0" : pageColorTokens.brandGreenLight,
        color: denied ? "#8a6d00" : pageColorTokens.brandGreenDeep,
      }}
    >
      {denied
        ? t("googlePixelActivity.consentDenied")
        : consent === "granted"
          ? t("googlePixelActivity.consentGranted")
          : consent || t("googlePixelActivity.none")}
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${pageColorTokens.divider}`,
        fontSize: 13,
      }}
    >
      <div style={{ color: pageColorTokens.textSecondary }}>{label}</div>
      <div style={{ wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

export function GooglePixelActivityPage() {
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();
  const [range, setRange] = useState<GooglePixelActivityRange>("7");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [counts, setCounts] = useState<ActivityCounts>({
    page_view: 0,
    add_to_cart: 0,
    begin_checkout: 0,
    add_payment_info: 0,
    purchase: 0,
  });
  const [daily, setDaily] = useState<ActivityDailyPoint[]>([]);
  const [funnel, setFunnel] = useState<ActivityFunnelStep[]>([]);
  const [logs, setLogs] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("");
  const [appliedEvent, setAppliedEvent] = useState<string>("");
  const [selected, setSelected] = useState<EventRow | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setError("");
    try {
      const extra = new URLSearchParams({ range });
      const resp = await fetch(
        withEmbeddedSearch("/api/ads-catalog/google-pixel-activity", locationSearch, extra),
      );
      const json = (await resp.json()) as SummaryResponse;
      if (!resp.ok || !json.ok) throw new Error(t("googlePixelActivity.loadFailed"));
      setConfigured(json.configured !== false);
      if (json.counts) setCounts(json.counts);
      setDaily(json.daily ?? []);
      setFunnel(json.funnel ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelActivity.loadFailed"));
    } finally {
      setSummaryLoading(false);
    }
  }, [range, locationSearch, t]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const extra = new URLSearchParams({
        range,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (appliedEvent) extra.set("event", appliedEvent);
      if (appliedKeyword) extra.set("keyword", appliedKeyword);
      const resp = await fetch(
        withEmbeddedSearch("/api/ads-catalog/google-pixel-events", locationSearch, extra),
      );
      const json = (await resp.json()) as EventsResponse;
      if (!resp.ok || !json.ok) throw new Error(t("googlePixelActivity.loadFailed"));
      setConfigured(json.configured !== false);
      setLogs(json.logs ?? []);
      setTotal(json.total ?? 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelActivity.loadFailed"));
    } finally {
      setEventsLoading(false);
    }
  }, [range, page, pageSize, appliedEvent, appliedKeyword, locationSearch, t]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const payload = selected?.payload;
  const consentObj =
    payload && typeof payload.consent === "object" && payload.consent
      ? (payload.consent as Record<string, unknown>)
      : null;
  const deviceObj =
    payload && typeof payload.device === "object" && payload.device
      ? (payload.device as Record<string, unknown>)
      : null;

  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        title={t("googlePixelActivity.pageTitle")}
        subtitle={t("googlePixelActivity.pageSubtitle")}
        backLabel={t("googlePixelActivity.back")}
        fallbackPath="/app/ads/google-pixel/data"
        preserveSearch
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {(["1", "7", "30"] as const).map((value) => (
          <button
            key={value}
            type="button"
            style={rangeBtn(range === value)}
            onClick={() => {
              setRange(value);
              setPage(1);
            }}
          >
            {t(`googlePixelActivity.range.${value}`)}
          </button>
        ))}
        <button
          type="button"
          style={secondaryBtn}
          onClick={() => {
            void loadSummary();
            void loadEvents();
          }}
        >
          {t("googlePixelActivity.refresh")}
        </button>
        <Link to={`/app/ads/google-pixel/data${locationSearch}`} style={secondaryBtn}>
          {t("googlePixelActivity.openData")}
        </Link>
      </div>

      {!configured ? (
        <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("googlePixelActivity.notConfigured")}</p>
      ) : null}
      {error ? (
        <p style={{ margin: 0, color: pageColorTokens.criticalText, fontSize: 13 }}>{error}</p>
      ) : null}
      {summaryLoading ? (
        <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("googlePixelActivity.loading")}</p>
      ) : (
        <>
          <MetricCards counts={counts} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            <DailyActivityChart daily={daily} />
            <FunnelChart funnel={funnel} />
          </div>
        </>
      )}

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelActivity.eventsTitle")}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t("googlePixelActivity.searchPlaceholder")}
              style={{
                minWidth: 220,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${pageColorTokens.borderInput}`,
                fontSize: 13,
              }}
            />
            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${pageColorTokens.borderInput}`,
                fontSize: 13,
              }}
            >
              <option value="">{t("googlePixelActivity.allTypes")}</option>
              {GOOGLE_PIXEL_ACTIVITY_EVENTS.map((event) => (
                <option key={event} value={event}>
                  {t(`googlePixelActivity.events.${event}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={secondaryBtn}
              onClick={() => {
                setAppliedKeyword(keyword.trim());
                setAppliedEvent(eventFilter);
                setPage(1);
              }}
            >
              {t("googlePixelActivity.applyFilters")}
            </button>
          </div>
        </div>

        {eventsLoading ? (
          <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("googlePixelActivity.loading")}</p>
        ) : logs.length === 0 ? (
          <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("googlePixelActivity.eventsEmpty")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1400 }}>
              <thead>
                <tr style={{ textAlign: "left", color: pageColorTokens.textSecondary }}>
                  <th style={thStyle}>{t("googlePixelActivity.colTime")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colType")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colValue")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colCurrency")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colItems")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colTransactionId")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colPage")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colPageUrl")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colSource")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colClientId")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colProductId")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colConsent")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.sentToGoogle")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.trafficSource")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.referrer")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colGclid")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colUtmSource")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colUtmMedium")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.pixelId")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.conversionLabel")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.enhancedConversions")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.browser")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.os")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.screen")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colSchemaVersion")}</th>
                  <th style={thStyle}>{t("googlePixelActivity.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${pageColorTokens.divider}` }}>
                    <td style={{ ...tdStyle, maxWidth: 160 }} title={formatTime(row.time)}>
                      {formatTime(row.time)}
                    </td>
                    <td style={tdStyle}>
                      {t(`googlePixelActivity.events.${row.googleEvent as GooglePixelActivityEvent}`, {
                        defaultValue: row.googleEvent,
                      })}
                    </td>
                    <td style={tdStyle}>{cellText(row.value)}</td>
                    <td style={tdStyle}>{cellText(row.currency)}</td>
                    <td style={tdStyle} title={row.itemsSummary}>{cellText(row.itemsSummary)}</td>
                    <td style={tdStyle} title={row.transactionId}>{cellText(row.transactionId)}</td>
                    <td style={tdStyle} title={row.pagePath}>{cellText(row.pagePath)}</td>
                    <td style={tdStyle} title={row.pageUrl}>
                      {row.pageUrl ? (
                        <a href={row.pageUrl} target="_blank" rel="noreferrer" style={{ color: pageColorTokens.brandGreenDeep }}>
                          {row.pageUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={tdStyle} title={row.source}>{cellText(row.source)}</td>
                    <td style={tdStyle} title={row.clientId}>{cellText(row.clientId)}</td>
                    <td style={tdStyle} title={row.productId}>{cellText(row.productId)}</td>
                    <td style={tdStyle}>
                      <ConsentPill consent={row.consent} />
                    </td>
                    <td style={tdStyle}>
                      <SentToGooglePill sent={row.sentToGoogle} />
                    </td>
                    <td style={tdStyle}>{cellText(row.trafficSource)}</td>
                    <td style={tdStyle} title={row.referrer}>{cellText(row.referrer)}</td>
                    <td style={tdStyle} title={row.gclid}>{cellText(row.gclid)}</td>
                    <td style={tdStyle}>{cellText(row.utmSource)}</td>
                    <td style={tdStyle}>{cellText(row.utmMedium)}</td>
                    <td style={tdStyle} title={row.pixelId}>{cellText(row.pixelId)}</td>
                    <td style={tdStyle} title={row.conversionLabel}>{cellText(row.conversionLabel)}</td>
                    <td style={tdStyle}>{cellText(row.enhancedConversions)}</td>
                    <td style={tdStyle}>{cellText(row.deviceBrowser)}</td>
                    <td style={tdStyle}>{cellText(row.deviceOs)}</td>
                    <td style={tdStyle}>{cellText(row.deviceScreen)}</td>
                    <td style={tdStyle}>{cellText(row.schemaVersion)}</td>
                    <td style={{ ...tdStyle, maxWidth: 96 }}>
                      <button type="button" style={secondaryBtn} onClick={() => setSelected(row)}>
                        {t("googlePixelActivity.view")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <button
            type="button"
            style={secondaryBtn}
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            ‹
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            style={secondaryBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            ›
          </button>
        </div>
      </div>

      <DialogShell
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width={640}
        title={t("googlePixelActivity.detailTitle")}
        footer={
          <button type="button" style={secondaryBtn} onClick={() => setSelected(null)}>
            {t("googlePixelActivity.close")}
          </button>
        }
      >
        {selected ? (
          <div>
            <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>
              {t("googlePixelActivity.sectionEvent")}
            </h4>
            <DetailRow label={t("googlePixelActivity.colType")}>
              {t(`googlePixelActivity.events.${selected.googleEvent as GooglePixelActivityEvent}`, {
                defaultValue: selected.googleEvent,
              })}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colTime")}>
              {new Date(selected.time).toLocaleString()}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colValue")}>
              {cellText(selected.value)}
              {selected.currency ? ` ${selected.currency}` : ""}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colItems")}>
              {cellText(selected.itemsSummary)}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colTransactionId")}>
              {cellText(selected.transactionId)}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colPage")}>
              {selected.pagePath || "—"}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colPageUrl")}>
              {selected.pageUrl ? (
                <a href={selected.pageUrl} target="_blank" rel="noreferrer">
                  {selected.pageUrl}
                </a>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colSource")}>
              {cellText(selected.source)}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colClientId")}>
              {cellText(selected.clientId)}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colProductId")}>
              {cellText(selected.productId)}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colSchemaVersion")}>
              {cellText(selected.schemaVersion)}
            </DetailRow>

            <h4 style={{ margin: "16px 0 8px", fontSize: 13 }}>
              {t("googlePixelActivity.sectionTracking")}
            </h4>
            <DetailRow label={t("googlePixelActivity.pixelId")}>
              {cellText(selected.pixelId || String(payload?.pixelId ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.conversionLabel")}>
              {cellText(selected.conversionLabel || String(payload?.conversionLabel ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.account")}>
              {String(payload?.account ?? payload?.pixelId ?? "—")}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.trafficSource")}>
              {cellText(selected.trafficSource || String(payload?.trafficSource ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.referrer")}>
              {cellText(selected.referrer || String(payload?.referrer ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colGclid")}>
              {cellText(selected.gclid || String(payload?.gclid ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colUtmSource")}>
              {cellText(selected.utmSource || String(payload?.utmSource ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.colUtmMedium")}>
              {cellText(selected.utmMedium || String(payload?.utmMedium ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.enhancedConversions")}>
              {cellText(
                selected.enhancedConversions || String(payload?.enhancedConversions ?? "n/a"),
              )}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.sentToGoogle")}>
              <SentToGooglePill sent={selected.sentToGoogle} />
            </DetailRow>

            <h4 style={{ margin: "16px 0 8px", fontSize: 13 }}>
              {t("googlePixelActivity.sectionPrivacy")}
            </h4>
            <DetailRow label={t("googlePixelActivity.colConsent")}>
              <ConsentPill consent={selected.consent} />
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.signals")}>
              {consentObj
                ? Object.entries(consentObj)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(", ")
                : "—"}
            </DetailRow>

            <h4 style={{ margin: "16px 0 8px", fontSize: 13 }}>
              {t("googlePixelActivity.sectionDevice")}
            </h4>
            <DetailRow label={t("googlePixelActivity.browser")}>
              {cellText(selected.deviceBrowser || String(deviceObj?.browser ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.os")}>
              {cellText(selected.deviceOs || String(deviceObj?.os ?? ""))}
            </DetailRow>
            <DetailRow label={t("googlePixelActivity.screen")}>
              {cellText(selected.deviceScreen || String(deviceObj?.screen ?? ""))}
            </DetailRow>

            {payload?.items && Array.isArray(payload.items) && payload.items.length > 0 ? (
              <>
                <h4 style={{ margin: "16px 0 8px", fontSize: 13 }}>
                  {t("googlePixelActivity.sectionItems")}
                </h4>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 8,
                    background: pageColorTokens.surfaceMuted,
                    fontSize: 12,
                    overflow: "auto",
                    maxHeight: 200,
                  }}
                >
                  {JSON.stringify(payload.items, null, 2)}
                </pre>
              </>
            ) : null}
          </div>
        ) : null}
      </DialogShell>
    </div>
  );
}
