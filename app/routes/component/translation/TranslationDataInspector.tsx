import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatTranslateTaskCosmosStatusText } from "../../../lib/translateTaskCosmosStatusLabel";
import { PagePanel, pageColorTokens } from "../../page/pageUiStyles";

export type TranslationDataInspectEnvelope = {
  success: boolean;
  errorCode?: number;
  errorMsg?: string;
  response?: TranslationDataInspectPayload | null;
};

type BlobFileRow = {
  path: string;
  sizeBytes: number | null;
};

export type TranslationDataInspectPayload = {
  cosmos?: Record<string, unknown>;
  storage?: {
    cosmos?: { endpointHost?: string; databaseId?: string; containerId?: string };
    blob?: { accountName?: string; container?: string };
    blobPrefix?: string;
  };
  blobs?: {
    total?: number;
    files?: BlobFileRow[];
    chunkFiles?: BlobFileRow[];
    manifest?: {
      path?: string;
      exists?: boolean;
      sizeBytes?: number | null;
      preview?: string | null;
      parsed?: Record<string, unknown> | null;
    };
  };
};

type Props = {
  shopName: string;
  /** 创建任务成功后填入，便于立刻查询 */
  suggestedTaskId?: string;
};

function formatBytes(n: number | null | undefined) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const v = record?.[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

export function TranslationDataInspector({ shopName, suggestedTaskId }: Props) {
  const { t, i18n } = useTranslation();
  const [taskId, setTaskId] = useState(suggestedTaskId?.trim() ?? "");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [payload, setPayload] = useState<TranslationDataInspectPayload | null>(null);

  useEffect(() => {
    if (suggestedTaskId?.trim()) {
      setTaskId(suggestedTaskId.trim());
    }
  }, [suggestedTaskId]);

  const fetchInspect = useCallback(async () => {
    const tid = taskId.trim();
    if (!tid) {
      setErrorText(t("translation.dataInspect.validationTaskId"));
      setPayload(null);
      return;
    }
    setLoading(true);
    setErrorText("");
    try {
      const params = new URLSearchParams();
      params.set("taskId", tid);
      if (shopName.trim()) params.set("shopName", shopName.trim());
      params.set("includeManifestPreview", "true");
      params.set("maxPreviewBytes", "16384");
      const response = await fetch(`/api/translate/v4/data-inspect?${params.toString()}`);
      const envelope = (await response.json().catch(() => ({}))) as TranslationDataInspectEnvelope;
      if (!response.ok || envelope.success === false) {
        setPayload(null);
        setErrorText(
          envelope.errorMsg ||
            t("translation.dataInspect.loadFailed", { status: response.status }),
        );
        return;
      }
      setPayload(envelope.response ?? null);
    } catch {
      setPayload(null);
      setErrorText(t("translation.dataInspect.loadFailedRetry"));
    } finally {
      setLoading(false);
    }
  }, [taskId, shopName, t]);

  const cosmos = payload?.cosmos;
  const storage = payload?.storage;
  const blobFiles = payload?.blobs?.files ?? [];
  const chunkFiles = payload?.blobs?.chunkFiles ?? blobFiles.filter((f) =>
    f.path.includes("/chunks/"),
  );
  const manifest = payload?.blobs?.manifest;

  return (
    <s-stack direction="block" gap="base">
      <s-paragraph>
        <span style={{ color: pageColorTokens.textSecondary, fontSize: "13px", lineHeight: 1.5 }}>
          {t("translation.dataInspect.intro")}
        </span>
      </s-paragraph>

      <s-stack direction="inline" gap="small" alignItems="end">
        <div style={{ flex: "1 1 280px", minWidth: 200 }}>
          <s-text-field
            label={t("translation.dataInspect.taskIdLabel")}
            value={taskId}
            onChange={(e) => setTaskId(e.currentTarget.value)}
            autocomplete="off"
          />
        </div>
        <s-button
          type="button"
          variant="primary"
          onClick={() => void fetchInspect()}
          {...(loading ? { disabled: true } : {})}
        >
          {loading ? t("translation.dataInspect.querying") : t("translation.dataInspect.queryAction")}
        </s-button>
      </s-stack>

      {errorText ? (
        <PagePanel>
          <s-paragraph>
            <span style={{ color: pageColorTokens.critical }}>{errorText}</span>
          </s-paragraph>
        </PagePanel>
      ) : null}

      {payload ? (
        <s-stack direction="block" gap="base">
          <PagePanel>
            <s-stack direction="block" gap="small">
              <div style={{ fontWeight: 600, fontSize: "14px", color: pageColorTokens.textPrimary }}>
                {t("translation.dataInspect.storageHeading")}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: pageColorTokens.textSecondary,
                  lineHeight: 1.55,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                <div>
                  Cosmos: {storage?.cosmos?.endpointHost ?? "—"} / {storage?.cosmos?.databaseId ?? "—"} /{" "}
                  {storage?.cosmos?.containerId ?? "—"}
                </div>
                <div>
                  Blob: {storage?.blob?.accountName || "—"} / {storage?.blob?.container ?? "—"}
                </div>
                <div>
                  {t("translation.dataInspect.prefixLabel")}: {storage?.blobPrefix ?? "—"}
                </div>
              </div>
            </s-stack>
          </PagePanel>

          <s-section heading={t("translation.dataInspect.cosmosHeading")}>
            <PagePanel>
              <s-stack direction="block" gap="small">
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-badge tone="info">{readString(cosmos, "taskType") || "—"}</s-badge>
                  <s-badge tone="success">
                    {formatTranslateTaskCosmosStatusText(readString(cosmos, "statusText"), t, i18n)}
                  </s-badge>
                  <span style={{ fontSize: "12px", color: pageColorTokens.textSecondary }}>
                    status={String(cosmos?.status ?? "—")}
                  </span>
                </s-stack>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "10px 16px",
                    fontSize: "13px",
                  }}
                >
                  <div>
                    <span style={{ color: pageColorTokens.textFootnote }}>{t("translation.dataInspect.lang")}</span>
                    <div>
                      {readString(cosmos, "source")} → {readString(cosmos, "target")}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: pageColorTokens.textFootnote }}>{t("translation.dataInspect.updatedAt")}</span>
                    <div>{readString(cosmos, "updatedAt") || "—"}</div>
                  </div>
                  <div>
                    <span style={{ color: pageColorTokens.textFootnote }}>{t("translation.dataInspect.metricsTotal")}</span>
                    <div>
                      {String((cosmos?.metrics as Record<string, unknown> | undefined)?.totalCount ?? "—")}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: pageColorTokens.textFootnote }}>{t("translation.dataInspect.checkpointPhase")}</span>
                    <div>
                      {String((cosmos?.checkpoint as Record<string, unknown> | undefined)?.phase ?? "—")}
                    </div>
                  </div>
                </div>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: "13px", color: pageColorTokens.brandBlue }}>
                    {t("translation.dataInspect.cosmosJson")}
                  </summary>
                  <pre
                    style={{
                      marginTop: 10,
                      maxHeight: 240,
                      overflow: "auto",
                      fontSize: 11,
                      background: pageColorTokens.surface,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${pageColorTokens.border}`,
                    }}
                  >
                    {JSON.stringify(
                      { cosmos: payload.cosmos, storage: payload.storage },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </s-stack>
            </PagePanel>
          </s-section>

          <s-section heading={t("translation.dataInspect.blobHeading", { count: blobFiles.length })}>
            {blobFiles.length === 0 ? (
              <PagePanel>
                <s-paragraph>
                  <span style={{ color: pageColorTokens.textSecondary }}>
                    {t("translation.dataInspect.noBlobs")}
                  </span>
                </s-paragraph>
              </PagePanel>
            ) : (
              <s-stack direction="block" gap="small">
                {chunkFiles.length > 0 ? (
                  <PagePanel>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: 8 }}>
                      {t("translation.dataInspect.chunkFiles", { count: chunkFiles.length })}
                    </div>
                    <div
                      style={{
                        border: `1px solid ${pageColorTokens.border}`,
                        borderRadius: 8,
                        overflow: "hidden",
                        fontSize: 12,
                      }}
                    >
                      {chunkFiles.map((row, i) => (
                        <div
                          key={row.path}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 12,
                            padding: "8px 12px",
                            borderTop: i === 0 ? "none" : `1px solid ${pageColorTokens.divider}`,
                            background: i % 2 === 0 ? pageColorTokens.surface : pageColorTokens.surfaceMuted,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "ui-monospace, monospace",
                              wordBreak: "break-all",
                              color: pageColorTokens.textPrimary,
                            }}
                          >
                            {row.path}
                          </span>
                          <span style={{ color: pageColorTokens.textSecondary, whiteSpace: "nowrap" }}>
                            {formatBytes(row.sizeBytes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </PagePanel>
                ) : null}
                {manifest ? (
                  <PagePanel>
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>manifest.json</span>
                        <s-badge tone={manifest.exists ? "success" : "critical"}>
                          {manifest.exists
                            ? t("translation.dataInspect.exists")
                            : t("translation.dataInspect.missing")}
                        </s-badge>
                        <span style={{ fontSize: "12px", color: pageColorTokens.textSecondary }}>
                          {formatBytes(manifest.sizeBytes ?? null)}
                        </span>
                      </s-stack>
                      {manifest.parsed ? (
                        <pre
                          style={{
                            maxHeight: 160,
                            overflow: "auto",
                            fontSize: 11,
                            margin: 0,
                            padding: 10,
                            borderRadius: 8,
                            border: `1px solid ${pageColorTokens.border}`,
                            background: pageColorTokens.surface,
                          }}
                        >
                          {JSON.stringify(manifest.parsed, null, 2)}
                        </pre>
                      ) : manifest.preview ? (
                        <pre
                          style={{
                            maxHeight: 120,
                            overflow: "auto",
                            fontSize: 11,
                            margin: 0,
                          }}
                        >
                          {manifest.preview}
                        </pre>
                      ) : null}
                    </s-stack>
                  </PagePanel>
                ) : null}
              </s-stack>
            )}
          </s-section>
        </s-stack>
      ) : null}
    </s-stack>
  );
}
