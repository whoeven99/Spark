import { useCallback, useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { DialogShell } from "../shared/DialogShell";
import { pageColorTokens } from "../../page/pageUiStyles";

type FieldStatus = "ok" | "mismatch" | "missing" | "outdated";

type ReviewField = {
  key: string;
  originalValue: string;
  translatedValue: string;
  shopifyValue: string | null;
  outdated: boolean;
  status: FieldStatus;
};

type ReviewRow = {
  resourceId: string;
  module: string;
  writebackResult: "success" | "failed" | "unknown";
  shopifyError: string | null;
  fields: ReviewField[];
};

type ReviewPayload = {
  ok: boolean;
  error?: string;
  job?: {
    source: string;
    target: string;
    modules: string[];
    status: string;
    writebackDone: number;
    writebackFailed: number;
    verifyDone: number;
    verifyFailed: number;
  };
  summary?: {
    totalResources: number;
    successResources: number;
    failedResources: number;
    totalFields: number;
  };
  page?: number;
  totalPages?: number;
  moduleOptions?: string[];
  rows?: ReviewRow[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  shopName: string;
  /** 透传给 API 的查询串（含嵌入式应用所需的 shop/host 参数）。 */
  apiSearch: string;
  /** 任务方向标题，如「中文(zh-CN) 翻译为 英文(en)」。 */
  directionLabel: string;
};

function withParams(search: string, params: Record<string, string>): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const STATUS_META: Record<FieldStatus, { label: string; bg: string; color: string }> = {
  ok: { label: "已写入", bg: pageColorTokens.brandGreenLight, color: pageColorTokens.brandGreenDark },
  mismatch: { label: "不一致", bg: "#fdeceb", color: pageColorTokens.criticalText },
  missing: { label: "缺失", bg: "#fdeceb", color: pageColorTokens.criticalText },
  outdated: { label: "已过期", bg: "#fff4e5", color: "#8a5800" },
};

function StatusPill({ status }: { status: FieldStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 999,
        fontSize: "0.6875rem",
        fontWeight: 600,
        background: meta.bg,
        color: meta.color,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

const cellStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.5,
  padding: "8px 10px",
  verticalAlign: "top",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  wordBreak: "break-word",
};

const headCellStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  textAlign: "left",
  padding: "6px 10px",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
  position: "sticky",
  top: 0,
};

export function TranslationReviewDialog({
  open,
  onClose,
  taskId,
  shopName,
  apiSearch,
  directionLabel,
}: Props) {
  const shopify = useAppBridge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState("");
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const pageCacheRef = useRef<Map<string, ReviewPayload>>(new Map());
  const prefetchingKeysRef = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef(0);

  const fieldId = (resourceId: string, key: string) => `${resourceId}::${key}`;

  const cacheKeyForPage = useCallback(
    (targetPage: number) =>
      JSON.stringify({
        apiSearch,
        taskId,
        shopName,
        moduleFilter,
        page: targetPage,
      }),
    [apiSearch, moduleFilter, shopName, taskId],
  );

  const fetchReviewPayload = useCallback(
    async (targetPage: number): Promise<ReviewPayload> => {
      const params: Record<string, string> = { taskId, shopName, page: String(targetPage) };
      if (moduleFilter) params.module = moduleFilter;
      const res = await fetch(`/api/translate/v4/review${withParams(apiSearch, params)}`);
      const json = (await res.json()) as ReviewPayload;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "加载失败");
      }
      return json;
    },
    [apiSearch, moduleFilter, shopName, taskId],
  );

  const prefetchPage = useCallback(
    (targetPage: number, totalPages: number) => {
      if (!open || targetPage > totalPages) return;
      const key = cacheKeyForPage(targetPage);
      if (pageCacheRef.current.has(key) || prefetchingKeysRef.current.has(key)) return;
      prefetchingKeysRef.current.add(key);
      void fetchReviewPayload(targetPage)
        .then((json) => {
          pageCacheRef.current.set(key, json);
        })
        .catch(() => {
          // 预取失败不影响当前页，用户翻页时会走正常加载。
        })
        .finally(() => {
          prefetchingKeysRef.current.delete(key);
        });
    },
    [cacheKeyForPage, fetchReviewPayload, open],
  );

  const load = useCallback(async (force = false) => {
    const key = cacheKeyForPage(page);
    if (!force) {
      const cached = pageCacheRef.current.get(key);
      if (cached) {
        setError(null);
        setPayload(cached);
        setLoading(false);
        prefetchPage((cached.page ?? page) + 1, cached.totalPages ?? 1);
        return;
      }
    }

    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setLoading(true);
    setError(null);
    try {
      const json = await fetchReviewPayload(page);
      pageCacheRef.current.set(key, json);
      if (requestSeqRef.current !== seq) return;
      setPayload(json);
      prefetchPage((json.page ?? page) + 1, json.totalPages ?? 1);
    } catch (err) {
      if (requestSeqRef.current !== seq) return;
      setError(err instanceof Error ? err.message : "请求失败，请重试");
      setPayload(null);
    } finally {
      if (requestSeqRef.current === seq) {
        setLoading(false);
      }
    }
  }, [cacheKeyForPage, fetchReviewPayload, page, prefetchPage]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // 弹窗关闭时重置分页/筛选，避免下次打开残留旧状态。
  useEffect(() => {
    if (!open) {
      setPage(1);
      setModuleFilter("");
      setOnlyMismatch(false);
      setEditing({});
      setPayload(null);
      pageCacheRef.current.clear();
      prefetchingKeysRef.current.clear();
    }
  }, [open]);

  const handleRewrite = useCallback(
    async (resourceId: string, key: string, value: string) => {
      const id = fieldId(resourceId, key);
      setSavingKey(id);
      try {
        const res = await fetch(`/api/translate/v4/review/rewrite${apiSearch}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, shopName, resourceId, key, value }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          field?: { shopifyValue: string | null; outdated: boolean; status: FieldStatus; translatedValue: string };
        };
        if (!res.ok || !json.ok || !json.field) {
          shopify.toast.show(json.error || "写回失败");
          return;
        }
        // 局部更新该字段，避免整页重查。
        setPayload((prev) => {
          if (!prev?.rows) return prev;
          return {
            ...prev,
            rows: prev.rows.map((row) =>
              row.resourceId === resourceId
                ? {
                    ...row,
                    fields: row.fields.map((f) =>
                      f.key === key
                        ? {
                            ...f,
                            translatedValue: json.field!.translatedValue,
                            shopifyValue: json.field!.shopifyValue,
                            outdated: json.field!.outdated,
                            status: json.field!.status,
                          }
                        : f,
                    ),
                  }
                : row,
            ),
          };
        });
        pageCacheRef.current.clear();
        setEditing((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        shopify.toast.show(json.field.status === "ok" ? "写回成功" : "已写回，但仍有差异");
      } catch {
        shopify.toast.show("请求失败，请重试");
      } finally {
        setSavingKey(null);
      }
    },
    [apiSearch, shopName, shopify, taskId],
  );

  const job = payload?.job;
  const summary = payload?.summary;
  const totalPages = payload?.totalPages ?? 1;

  const visibleRows = (payload?.rows ?? [])
    .map((row) => ({
      ...row,
      fields: onlyMismatch ? row.fields.filter((f) => f.status !== "ok") : row.fields,
    }))
    .filter((row) => row.fields.length > 0);

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      width={1180}
      title="写回详情对账"
      description={
        <span>
          {directionLabel} · 实时读取 Shopify 线上译文逐字段对账
          {summary
            ? ` · 共 ${summary.totalResources} 个资源 / ${summary.totalFields} 个字段，写回成功 ${summary.successResources}、失败 ${summary.failedResources}`
            : ""}
        </span>
      }
      footer={
        <div style={dialogFooterStyle}>
          <div style={dialogFooterMetaStyle}>
            {job
              ? `验证阶段读回校验：成功 ${job.verifyDone} · 失败 ${job.verifyFailed}。本页对账为实时查询 Shopify 的最新结果。`
              : "对账结果为实时读取 Shopify 当前线上译文。"}
          </div>
          <s-button type="button" variant="secondary" onClick={onClose}>
            关闭
          </s-button>
        </div>
      }
    >
      <div style={reviewDialogBodyStyle}>
        <div style={reviewToolbarStyle}>
          <label style={toolbarControlLabelStyle}>
            模块
            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setPage(1);
              }}
              style={toolbarSelectStyle}
            >
              <option value="">全部</option>
              {(payload?.moduleOptions ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label style={toolbarCheckboxLabelStyle}>
            <input type="checkbox" checked={onlyMismatch} onChange={(e) => setOnlyMismatch(e.target.checked)} />
            只看异常字段
          </label>
          <div style={toolbarActionGroupStyle}>
            <button type="button" onClick={() => void load(true)} disabled={loading} style={toolbarGhostButtonStyle(loading)}>
              {loading ? "刷新中..." : "刷新"}
            </button>
          </div>
        </div>

        {error ? (
          <div style={errorBannerStyle}>{error}</div>
        ) : null}

        <div style={reviewTableShellStyle}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...headCellStyle, width: "13%" }}>字段 / 模块</th>
                <th style={{ ...headCellStyle, width: "24%" }}>源值</th>
                <th style={{ ...headCellStyle, width: "27%" }}>期望译文</th>
                <th style={{ ...headCellStyle, width: "27%" }}>Shopify 实际值</th>
                <th style={{ ...headCellStyle, width: "9%" }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {loading && !payload ? (
                <tr>
                  <td style={cellStyle} colSpan={5}>
                    加载中...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td style={{ ...cellStyle, color: pageColorTokens.textSecondary, textAlign: "center", padding: "32px 10px" }} colSpan={5}>
                    {onlyMismatch ? "本页没有异常字段 🎉" : "暂无可对账的字段"}
                  </td>
                </tr>
              ) : (
                visibleRows.flatMap((row) =>
                  row.fields.map((f, idx) => {
                    const id = fieldId(row.resourceId, f.key);
                    const isEditing = id in editing;
                    return (
                      <tr key={id}>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 600, color: pageColorTokens.textPrimary }}>{f.key}</div>
                          {idx === 0 ? (
                            <div style={{ fontSize: "0.6875rem", color: pageColorTokens.textFootnote, marginTop: 2 }}>
                              {row.module}
                              {row.writebackResult === "failed" ? " · 写回失败" : ""}
                            </div>
                          ) : null}
                          {idx === 0 && row.shopifyError ? (
                            <div style={{ fontSize: "0.6875rem", color: pageColorTokens.criticalText, marginTop: 2 }}>
                              读取异常
                            </div>
                          ) : null}
                        </td>
                        <td style={{ ...cellStyle, color: pageColorTokens.textSecondary }}>{f.originalValue}</td>
                        <td style={cellStyle}>
                          {isEditing ? (
                            <textarea
                              value={editing[id]}
                              onChange={(e) => setEditing((p) => ({ ...p, [id]: e.target.value }))}
                              rows={3}
                              style={reviewTextareaStyle}
                            />
                          ) : (
                            f.translatedValue
                          )}
                        </td>
                        <td style={{ ...cellStyle, color: f.shopifyValue ? pageColorTokens.textBody : pageColorTokens.textFootnote }}>
                          {f.shopifyValue ?? "（线上无此译文）"}
                        </td>
                        <td style={cellStyle}>
                          <div style={statusActionStackStyle}>
                            <StatusPill status={f.status} />
                            {isEditing ? (
                              <div style={inlineActionRowStyle}>
                                <button
                                  type="button"
                                  disabled={savingKey === id}
                                  onClick={() => void handleRewrite(row.resourceId, f.key, editing[id])}
                                  style={inlinePrimaryActionStyle(savingKey === id)}
                                >
                                  {savingKey === id ? "写回中..." : "重新写回"}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingKey === id}
                                  onClick={() =>
                                    setEditing((p) => {
                                      const n = { ...p };
                                      delete n[id];
                                      return n;
                                    })
                                  }
                                  style={inlineSecondaryActionStyle(savingKey === id)}
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditing((p) => ({ ...p, [id]: f.translatedValue }))}
                                style={inlineSecondaryActionStyle(false)}
                              >
                                编辑
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }),
                )
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div style={reviewPagerStyle}>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={pagerBtnStyle(page <= 1 || loading)}
            >
              上一页
            </button>
            <span style={reviewPagerMetaStyle}>
              第 {payload?.page ?? page} / {totalPages} 页
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={pagerBtnStyle(page >= totalPages || loading)}
            >
              下一页
            </button>
          </div>
        ) : null}
      </div>
    </DialogShell>
  );
}

const reviewDialogBodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minHeight: 280,
};

const reviewToolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: "0.75rem 0.85rem",
  borderRadius: 12,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceSubtle,
};

const toolbarControlLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "0.75rem",
  fontWeight: 600,
  color: pageColorTokens.textBody,
};

const toolbarCheckboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: "0.75rem",
  color: pageColorTokens.textBody,
  cursor: "pointer",
};

const toolbarSelectStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  minHeight: 32,
  padding: "6px 10px",
  borderRadius: 10,
  border: `1px solid ${pageColorTokens.borderInput}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textBody,
};

const toolbarActionGroupStyle: React.CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

function toolbarGhostButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: 32,
    padding: "6px 12px",
    borderRadius: 10,
    border: `1px solid ${pageColorTokens.borderInput}`,
    background: pageColorTokens.surface,
    color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textBody,
    cursor: disabled ? "default" : "pointer",
  };
}

const errorBannerStyle: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.criticalText,
  padding: "0.75rem 0.85rem",
  borderRadius: 12,
  border: `1px solid ${pageColorTokens.criticalText}22`,
  background: "#fff0ee",
};

const reviewTableShellStyle: React.CSSProperties = {
  maxHeight: "62vh",
  overflow: "auto",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: 12,
  background: pageColorTokens.surface,
};

const reviewTextareaStyle: React.CSSProperties = {
  width: "100%",
  fontSize: "0.75rem",
  minHeight: 72,
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${pageColorTokens.borderInput}`,
  resize: "vertical",
  color: pageColorTokens.textBody,
  background: pageColorTokens.surface,
  boxSizing: "border-box",
};

const statusActionStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  alignItems: "flex-start",
};

const inlineActionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

function inlinePrimaryActionStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: "0.6875rem",
    fontWeight: 600,
    minHeight: 28,
    padding: "4px 10px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#7dc9b3" : pageColorTokens.brandGreen,
    color: "#fff",
    cursor: disabled ? "default" : "pointer",
  };
}

function inlineSecondaryActionStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: "0.6875rem",
    fontWeight: 600,
    minHeight: 28,
    padding: "4px 10px",
    borderRadius: 8,
    border: `1px solid ${pageColorTokens.borderInput}`,
    background: pageColorTokens.surface,
    color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textBody,
    cursor: disabled ? "default" : "pointer",
  };
}

const reviewPagerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  fontSize: "0.75rem",
  paddingTop: 4,
};

const reviewPagerMetaStyle: React.CSSProperties = {
  color: pageColorTokens.textSecondary,
};

const dialogFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const dialogFooterMetaStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textFootnote,
  lineHeight: 1.5,
  minWidth: 0,
  flex: "1 1 16rem",
};

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: 32,
    padding: "6px 12px",
    borderRadius: 10,
    border: `1px solid ${pageColorTokens.borderInput}`,
    background: pageColorTokens.surface,
    color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textBody,
    cursor: disabled ? "default" : "pointer",
  };
}
