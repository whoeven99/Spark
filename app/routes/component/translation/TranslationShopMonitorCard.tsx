import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatRedisTranslatePhaseLabel } from "../../../lib/redisTranslatePhaseLabel";
import { formatTranslateTaskV3CosmosStatusText } from "../../../lib/translateTaskV3CosmosStatusLabel";
import { PagePanel, pageColorTokens } from "../../page/pageUiStyles";

const POLL_SEC = 8;

type ShopMonitorTask = {
  cosmos: Record<string, unknown>;
  resolvedRedisPrefix: string;
  redisRuntime: {
    meta?: Record<string, string>;
    doneSize?: number;
    chunkDoneSize?: number;
    resultSize?: number;
    failMap?: Record<string, string>;
  } | null;
  translateMonitor: Record<string, string> | null;
  redisError: string | null;
};

type ShopMonitorEnvelope = {
  success: boolean;
  errorMsg?: string;
  response?: {
    shopName?: string;
    total?: number;
    tasks?: ShopMonitorTask[];
  } | null;
};

function readMetricNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function listBadgeTone(statusText?: string): "success" | "warning" | "critical" | "info" {
  const s = (statusText ?? "").toUpperCase();
  if (s.includes("DONE") || s.includes("COMPLETE") || s.includes("SAVE_DONE")) return "success";
  if (s.includes("FAIL") || s.includes("STOPPED") || s.includes("ERROR")) return "critical";
  if (s.includes("RUNNING") || s.includes("PENDING") || s.includes("FETCH") || s.includes("TRANSLATE"))
    return "warning";
  return "info";
}

function MiniProgress(props: { label: string; sub?: ReactNode; percent: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(props.percent)));
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: 4 }}>
        <span style={{ color: pageColorTokens.textSecondary }}>{props.label}</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      {props.sub ? (
        <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{props.sub}</div>
      ) : null}
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: pageColorTokens.progressTrackGradient,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #006fbb, #008060)",
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function TaskMonitorRow({
  task,
  t,
  i18n,
}: {
  task: ShopMonitorTask;
  t: ReturnType<typeof useTranslation>["t"];
  i18n: ReturnType<typeof useTranslation>["i18n"];
}) {
  const cosmos = task.cosmos;
  const statusText = typeof cosmos.statusText === "string" ? cosmos.statusText : "";
  const statusCode = cosmos.status;
  const rt = task.redisRuntime;
  const meta = rt?.meta;
  const tm = task.translateMonitor;

  const entryTotal = readMetricNumber(meta?.totalCountThisBlob);
  const entryDone =
    readMetricNumber(meta?.currentDoneThisBlob) ??
    (typeof rt?.doneSize === "number" ? rt.doneSize : null);
  const entryPct =
    entryTotal !== null && entryTotal > 0 && entryDone !== null
      ? Math.min(100, Math.round((Math.min(entryDone, entryTotal) / entryTotal) * 100))
      : null;

  const chunkTotal = readMetricNumber(meta?.runtimeChunksTotal);
  const chunkDone = typeof rt?.chunkDoneSize === "number" ? rt.chunkDoneSize : null;
  const chunkPct =
    chunkTotal !== null && chunkTotal > 0 && chunkDone !== null
      ? Math.min(100, Math.round((Math.min(chunkDone, chunkTotal) / chunkTotal) * 100))
      : null;

  const failCount = rt?.failMap ? Object.keys(rt.failMap).length : 0;
  const monitorPhase = tm?.phase?.trim();
  const cosmosPhase =
    typeof cosmos.checkpointPhase === "string" ? cosmos.checkpointPhase : "";

  return (
    <PagePanel>
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" gap="small" alignItems="center" wrap>
          <span style={{ fontWeight: 700, fontSize: "14px", color: pageColorTokens.textPrimary }}>
            {String(cosmos.source ?? "—")} → {String(cosmos.target ?? "—")}
          </span>
          <s-badge tone={listBadgeTone(statusText)}>
            {typeof statusCode === "number" && Number.isFinite(statusCode)
              ? `${statusCode} · ${formatTranslateTaskV3CosmosStatusText(statusText, t, i18n)}`
              : formatTranslateTaskV3CosmosStatusText(statusText, t, i18n)}
          </s-badge>
        </s-stack>
        <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, wordBreak: "break-all" }}>
          {String(cosmos.id ?? "")}
        </div>

        {task.redisError ? (
          <span style={{ fontSize: "12px", color: pageColorTokens.critical }}>Redis: {task.redisError}</span>
        ) : null}

        <div style={{ fontSize: "12px", color: pageColorTokens.textMuted }}>
          <span style={{ color: pageColorTokens.textFootnote }}>{t("translationRuntime.redisPrefixLabel")} </span>
          {task.resolvedRedisPrefix}
          {rt ? (
            <>
              {" · "}
              done={rt.doneSize ?? 0} chunk={rt.chunkDoneSize ?? 0} result={rt.resultSize ?? 0}
              {failCount > 0 ? ` · fail=${failCount}` : ""}
            </>
          ) : (
            <span> · {t("translationRuntime.redisEmpty")}</span>
          )}
        </div>

        {monitorPhase ? (
          <s-stack direction="inline" gap="small" alignItems="center">
            <span style={{ fontSize: "12px", color: pageColorTokens.textFootnote }}>
              {t("translationRuntime.monitorV3Label")}
            </span>
            <s-badge tone="info">{formatRedisTranslatePhaseLabel(monitorPhase)}</s-badge>
            {readMetricNumber(tm.initAccumulatedCount) !== null ? (
              <span style={{ fontSize: "12px", color: pageColorTokens.brandGreen, fontWeight: 600 }}>
                {t("translationRuntime.fetched")} {readMetricNumber(tm.initAccumulatedCount)}{" "}
                {t("translationRuntime.itemsUnit")}
              </span>
            ) : null}
          </s-stack>
        ) : null}

        {!monitorPhase && cosmosPhase ? (
          <span style={{ fontSize: "12px", color: pageColorTokens.textFootnote }}>
            Cosmos phase: {cosmosPhase}
          </span>
        ) : null}

        {entryPct !== null ? (
          <MiniProgress
            label={t("translationRuntime.entryProgressLabel")}
            sub={t("translationRuntime.completedTextNodes", {
              done: entryDone ?? 0,
              total: entryTotal ?? 0,
            })}
            percent={entryPct}
          />
        ) : null}
        {chunkPct !== null ? (
          <MiniProgress
            label={t("translationRuntime.chunkProgressLabel")}
            sub={t("translationRuntime.completedChunkFiles", {
              done: chunkDone ?? 0,
              total: chunkTotal ?? 0,
            })}
            percent={chunkPct}
          />
        ) : null}

        {meta && Object.keys(meta).length > 0 ? (
          <details>
            <summary style={{ cursor: "pointer", fontSize: "12px", color: pageColorTokens.brandBlue }}>
              {t("translationRuntime.redisMetaFields", { count: Object.keys(meta).length })}
            </summary>
            <div
              style={{
                marginTop: 8,
                fontSize: "11px",
                fontFamily: "ui-monospace, monospace",
                maxHeight: 120,
                overflow: "auto",
                border: `1px solid ${pageColorTokens.border}`,
                borderRadius: 6,
                padding: 8,
              }}
            >
              {Object.entries(meta)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 4 }}>
                    <span style={{ color: pageColorTokens.textFootnote }}>{k}: </span>
                    <span style={{ wordBreak: "break-all" }}>{v}</span>
                  </div>
                ))}
            </div>
          </details>
        ) : null}
      </s-stack>
    </PagePanel>
  );
}

type Props = { defaultShopName: string };

export function TranslationShopMonitorCard({ defaultShopName }: Props) {
  const { t, i18n } = useTranslation();
  const shopName = defaultShopName.trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<ShopMonitorTask[]>([]);

  const fetchMonitor = useCallback(
    async (silent?: boolean) => {
      if (!shopName) {
        setTasks([]);
        return;
      }
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const params = new URLSearchParams();
        params.set("shopName", shopName);
        const res = await fetch(`/api/translate/v3/json-runtime-shop-monitor?${params.toString()}`);
        const env = (await res.json().catch(() => ({}))) as ShopMonitorEnvelope;
        if (!res.ok || env.success === false) {
          if (!silent) setTasks([]);
          setError(env.errorMsg || t("translationRuntime.shopMonitorLoadFailed", { status: res.status }));
          return;
        }
        setTasks(env.response?.tasks ?? []);
        setError("");
      } catch {
        if (!silent) setTasks([]);
        setError(t("translationRuntime.serviceErrorRetry"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shopName, t],
  );

  useEffect(() => {
    void fetchMonitor();
  }, [fetchMonitor]);

  useEffect(() => {
    if (!shopName) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchMonitor(true);
      }
    }, POLL_SEC * 1000);
    return () => window.clearInterval(timer);
  }, [shopName, fetchMonitor]);

  return (
    <s-stack direction="block" gap="small">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <s-badge tone="info">{t("translationRuntime.fromDatabaseBadge")}</s-badge>
        <span style={{ fontSize: "12px", color: pageColorTokens.textFootnote, flex: 1 }}>
          {t("translationRuntime.shopMonitorFlowHint")}
        </span>
        <s-button
          type="button"
          variant="secondary"
          onClick={() => void fetchMonitor()}
          {...(loading ? { disabled: true } : {})}
        >
          {loading ? t("translationRuntime.refreshing") : t("translationRuntime.refresh")}
        </s-button>
      </div>
      <span style={{ fontSize: "11px", color: pageColorTokens.textFootnote }}>
        {t("translationRuntime.shopMonitorPollHint", { sec: POLL_SEC })}
      </span>

      {error ? <span style={{ fontSize: "13px", color: pageColorTokens.critical }}>{error}</span> : null}

      {loading && tasks.length === 0 ? (
        <span style={{ fontSize: "13px", color: pageColorTokens.textSecondary }}>
          {t("translationRuntime.shopMonitorLoading")}
        </span>
      ) : null}

      {!loading && !error && tasks.length === 0 ? (
        <PagePanel padding="large">
          <span style={{ fontSize: "13px", color: pageColorTokens.textSecondary }}>
            {t("translationRuntime.shopMonitorNoTasks")}
          </span>
        </PagePanel>
      ) : null}

      {tasks.map((task) => (
        <TaskMonitorRow
          key={String(task.cosmos.id ?? task.resolvedRedisPrefix)}
          task={task}
          t={t}
          i18n={i18n}
        />
      ))}
    </s-stack>
  );
}
