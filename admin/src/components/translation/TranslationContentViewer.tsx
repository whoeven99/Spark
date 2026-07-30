import { useEffect, useState } from "react";
import { Alert, Button, Space, Spin, Table, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import {
  fetchTranslationContent,
  fetchTranslationContentModules,
  type TranslationContentField,
  type TranslationContentFieldCost,
  type TranslationContentCallCost,
  type TranslationContentPage,
  type TranslationContentModule,
  type TranslationJob,
} from "../../api";

const CONTENT_PAGE_SIZE = 10;

const C = {
  border: "#e6e8ec",
  borderSoft: "#f2f3f5",
  ink: "#1a1d21",
  sub: "#6b7280",
  faint: "#9aa0a8",
  active: "#2f6df0",
  warn: "#e08a16",
  card: "#fff",
};

function ContentCell({ value, fallback }: { value: string; fallback?: boolean }) {
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 180,
        overflow: "auto",
        color: fallback ? C.warn : C.ink,
      }}
    >
      {value || <span style={{ color: C.faint }}>—</span>}
    </div>
  );
}

function formatTokenPair(call: TranslationContentCallCost): string | null {
  if (call.inputTokens != null || call.outputTokens != null) {
    return `in ${call.inputTokens ?? "—"} / out ${call.outputTokens ?? "—"}`;
  }
  if (call.totalTokens != null) return `total ${call.totalTokens}`;
  return null;
}

function CostCallLines({ call }: { call: TranslationContentCallCost }) {
  const tokenLine = formatTokenPair(call);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ color: C.sub }}>
        {call.provider === "llm" ? call.model || "llm" : call.provider === "google" ? "google" : call.provider}
        {call.batchSize != null && call.batchSize > 1 ? ` · batch ${call.batchSize}` : ""}
      </div>
      {call.requestId ? (
        <Typography.Text
          copyable={{ text: call.requestId }}
          style={{
            fontSize: 11,
            color: C.faint,
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            wordBreak: "break-all",
          }}
        >
          {call.requestId}
        </Typography.Text>
      ) : null}
      {tokenLine ? <div style={{ color: C.ink }}>{tokenLine}</div> : null}
      {call.provider === "google" && call.chars != null ? (
        <div style={{ color: C.ink }}>{call.chars.toLocaleString()} chars</div>
      ) : null}
    </div>
  );
}

function CostCell({ cost }: { cost?: TranslationContentFieldCost }) {
  if (!cost) {
    return <span style={{ color: C.faint, fontSize: 12 }}>—</span>;
  }
  if (cost.provider === "cache") {
    return <span style={{ fontSize: 12, color: C.sub }}>缓存</span>;
  }
  if (cost.provider === "skip") {
    return <span style={{ fontSize: 12, color: C.sub }}>跳过</span>;
  }

  const calls =
    cost.calls && cost.calls.length > 0
      ? cost.calls
      : cost.provider === "llm" || cost.provider === "google"
        ? [cost]
        : [];

  if (calls.length === 0 && (cost.inputTokens != null || cost.outputTokens != null || cost.chars != null)) {
    return (
      <div style={{ fontSize: 11.5, lineHeight: 1.45 }}>
        {cost.provider === "mixed" ? <div style={{ color: C.sub }}>mixed</div> : null}
        {formatTokenPair(cost) ? <div>{formatTokenPair(cost)}</div> : null}
        {cost.chars != null ? <div>{cost.chars.toLocaleString()} chars</div> : null}
      </div>
    );
  }

  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.45, maxHeight: 180, overflow: "auto" }}>
      {cost.provider === "mixed" ? <div style={{ color: C.sub, marginBottom: 4 }}>mixed</div> : null}
      {calls.map((call, i) => (
        <CostCallLines key={call.requestId || `${call.provider}-${i}`} call={call} />
      ))}
      {cost.provider !== "google" &&
      cost.chars != null &&
      !calls.some((c) => c.provider === "google" && c.chars != null) ? (
        <div style={{ color: C.ink }}>{cost.chars.toLocaleString()} chars</div>
      ) : null}
    </div>
  );
}

/** 翻译任务 blob 内容查看器：模块切换 + 翻译前后对照 + 翻页。 */
export function TranslationContentViewer({ job }: { job: TranslationJob }) {
  const [modules, setModules] = useState<TranslationContentModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [module, setModule] = useState<string>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TranslationContentPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setModulesLoading(true);
    setModules([]);
    setModule("");
    setPage(1);
    setData(null);
    setErr("");
    fetchTranslationContentModules({ jobId: job.id, shop: job.shopName })
      .then((r) => {
        if (cancelled) return;
        setModules(r.modules);
        setModule(r.modules[0]?.module ?? "");
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setModulesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.shopName]);

  useEffect(() => {
    if (!module) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    fetchTranslationContent({
      jobId: job.id,
      shop: job.shopName,
      module,
      page,
      pageSize: CONTENT_PAGE_SIZE,
    })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.shopName, module, page, reloadTick]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / CONTENT_PAGE_SIZE)) : 1;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          翻译内容
        </Typography.Title>
        {data && (
          <span style={{ fontSize: 12, color: C.sub }}>
            共 {data.total} 个资源 · {module}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={loading || modulesLoading}
          onClick={() => setReloadTick((t) => t + 1)}
        />
      </div>

      {modules.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {modules.map(({ module: m, count }) => {
            const on = m === module;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (m === module) return;
                  setModule(m);
                  setPage(1);
                }}
                style={{
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: `1px solid ${on ? C.active : C.border}`,
                  background: on ? "#e8effe" : C.card,
                  color: on ? "#1f4fc4" : C.sub,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                }}
              >
                {m}
                {count > 0 && (
                  <span style={{ marginLeft: 5, color: on ? "#5a7fe0" : C.faint }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}
      {data?.note && <Alert type="info" message={data.note} showIcon style={{ marginBottom: 12 }} />}

      <Spin spinning={loading || modulesLoading}>
        {!modulesLoading && modules.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            该任务暂无可查看的翻译内容
          </Typography.Text>
        ) : !loading && data && data.items.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            当前模块暂无可查看的翻译内容
          </Typography.Text>
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {data?.items.map((res) => (
              <div
                key={res.resourceId}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}
              >
                <div
                  style={{
                    padding: "6px 12px",
                    background: C.borderSoft,
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <Typography.Text
                    copyable={{ text: res.resourceId }}
                    style={{ fontSize: 11.5, color: C.sub, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
                  >
                    {res.resourceId}
                  </Typography.Text>
                </div>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(_r, i) => String(i)}
                  dataSource={res.translations}
                  columns={[
                    {
                      title: "字段",
                      dataIndex: "key",
                      width: 110,
                      render: (v: string) => (
                        <span
                          style={{
                            fontSize: 11.5,
                            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                            color: C.sub,
                          }}
                        >
                          {v}
                        </span>
                      ),
                    },
                    {
                      title: "翻译前",
                      dataIndex: "originalValue",
                      render: (v: string) => <ContentCell value={v} />,
                    },
                    {
                      title: "翻译后",
                      dataIndex: "translatedValue",
                      render: (v: string, r: { status?: string }) => (
                        <ContentCell value={v} fallback={r.status === "fallback"} />
                      ),
                    },
                    {
                      title: "翻译成本",
                      dataIndex: "cost",
                      width: 200,
                      render: (_: unknown, r: TranslationContentField) => <CostCell cost={r.cost} />,
                    },
                  ]}
                />
              </div>
            ))}
          </Space>
        )}
      </Spin>

      {data && data.total > CONTENT_PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 12, color: C.sub }}>
            第 {page} / {totalPages} 页
          </span>
          <Button size="small" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </Button>
          <Button size="small" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
