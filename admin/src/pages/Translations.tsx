import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Table,
  Select,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Progress,
  Drawer,
  Descriptions,
  Badge,
  Space,
  Button,
  Collapse,
  Tooltip,
  message,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import {
  fetchTranslations,
  fetchTranslationJob,
  fetchLLMKeyStats,
  fetchLLMKeyHistory,
  type TranslationJob,
  type LLMKeyStats,
  type LLMKeyHistoryEntry,
} from "../api";

const ACTIVE_STATUSES = new Set([
  "INIT_QUEUED",
  "INITIALIZING",
  "INIT_DONE",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "TRANSLATE_DONE",
  "WRITEBACK_QUEUED",
  "WRITING_BACK",
  "VERIFY_QUEUED",
  "VERIFYING",
]);

function statusBadge(status: string) {
  if (status === "COMPLETED") return <Badge status="success" text={status} />;
  if (status === "FAILED") return <Badge status="error" text={status} />;
  if (status === "CANCELLED") return <Badge status="default" text={status} />;
  if (status === "PAUSED") return <Badge status="warning" text={status} />;
  if (ACTIVE_STATUSES.has(status))
    return <Badge status="processing" text={status} />;
  return <Badge status="default" text={status} />;
}

function calcProgress(job: TranslationJob): number {
  const m = job.metrics;
  const total = m.translateTotal || m.initTotal;
  if (total === 0) return 0;
  const done = m.translateDone + m.translateFailed;
  return Math.round((done / total) * 100);
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtRpm(remaining: number, limit: number): string {
  if (limit < 0) return "—";
  return `${fmtNum(remaining)} / ${fmtNum(limit)}`;
}

function fmtAgo(epochMs: number): string {
  if (!epochMs) return "—";
  const diff = Math.round((Date.now() - epochMs) / 1_000);
  if (diff < 60) return `${diff}s 前`;
  if (diff < 3600) return `${Math.round(diff / 60)}min 前`;
  return `${Math.round(diff / 3600)}h 前`;
}

// ── LLM Key Stats Panel ───────────────────────────────────────────────────────

// ── History chart for one expanded row ───────────────────────────────────────

function fmtTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type ChartPoint = {
  time: string;
  calls: number;
  tokens: number;
  latMs: number;
  conc: number;
  rpmPct: number | null;
  tpmPct: number | null;
};

function buildChartData(entries: LLMKeyHistoryEntry[]): ChartPoint[] {
  return entries.map((e) => ({
    time:   fmtTime(e.t),
    calls:  e.dC,
    tokens: e.dT,
    latMs:  e.lat,
    conc:   e.conc,
    rpmPct: e.lR > 0 ? Math.round((e.rR / e.lR) * 100) : null,
    tpmPct: e.lT > 0 ? Math.round((e.rT / e.lT) * 100) : null,
  }));
}

function KeyHistoryCharts({ label }: { label: string }) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLLMKeyHistory(label)
      .then((r) => {
        const entries = r.history[label] ?? [];
        setData(buildChartData(entries));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [label]);

  if (loading) return <Spin size="small" style={{ padding: 16 }} />;
  if (data.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ padding: "8px 16px", display: "block" }}>
        暂无历史数据（翻译任务运行时每 10s 记录一次，保留最近 30 分钟）
      </Typography.Text>
    );
  }

  const hasPct = data.some((d) => d.rpmPct !== null || d.tpmPct !== null);

  return (
    <div style={{ padding: "12px 0", display: "flex", gap: 24, flexWrap: "wrap" }}>

      {/* 吞吐量：每10s 调用次数 + Token */}
      <div style={{ flex: "1 1 340px", minWidth: 280 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          吞吐量（每 10s）
        </Typography.Text>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="calls" tick={{ fontSize: 10 }} width={28} />
            <YAxis yAxisId="tokens" orientation="right" tick={{ fontSize: 10 }} width={36}
              tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <RechartTooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(value: number, name: string) =>
                name === "tokens" ? [`${fmtNum(value)}`, "Token"] : [value, "调用"]}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="calls"  dataKey="calls"  name="调用" fill="#1890ff" opacity={0.7} maxBarSize={12} />
            <Line yAxisId="tokens" dataKey="tokens" name="tokens" stroke="#52c41a" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 延迟 + 并发 */}
      <div style={{ flex: "1 1 300px", minWidth: 260 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          延迟 & 并发上限
        </Typography.Text>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="lat"  tick={{ fontSize: 10 }} width={36}
              tickFormatter={(v: number) => `${v}ms`} />
            <YAxis yAxisId="conc" orientation="right" tick={{ fontSize: 10 }} width={24} />
            <RechartTooltip contentStyle={{ fontSize: 12 }}
              formatter={(value: number, name: string) =>
                name === "conc" ? [value, "并发上限"] : [`${value}ms`, "延迟"]} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="lat"  dataKey="latMs" name="延迟ms" stroke="#fa8c16" dot={false} strokeWidth={1.5} />
            <Line yAxisId="conc" dataKey="conc"  name="conc"   stroke="#722ed1" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 配额余量% — 仅当 provider 返回了限额信息时显示 */}
      {hasPct && (
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            配额余量 %（RPM / TPM）
          </Typography.Text>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28}
                tickFormatter={(v: number) => `${v}%`} />
              <RechartTooltip contentStyle={{ fontSize: 12 }}
                formatter={(value: string | number, name: string) =>
                  value == null ? ["—", name] : [`${value}%`, name]} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {data.some((d) => d.rpmPct !== null) && (
                <Area dataKey="rpmPct" name="RPM%" stroke="#1890ff" fill="#e6f7ff"
                  strokeWidth={1.5} dot={false} connectNulls />
              )}
              {data.some((d) => d.tpmPct !== null) && (
                <Area dataKey="tpmPct" name="TPM%" stroke="#52c41a" fill="#f6ffed"
                  strokeWidth={1.5} dot={false} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── LLM Key Stats Panel ───────────────────────────────────────────────────────

function LLMKeyStatsPanel() {
  const [stats, setStats] = useState<LLMKeyStats[]>([]);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    fetchLLMKeyStats()
      .then((r) => {
        setStats(r.stats);
        setNote(r.note ?? "");
        setLastFetch(Date.now());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      title: "Key",
      dataIndex: "label",
      key: "label",
      render: (v: string) => (
        <Typography.Text code style={{ fontSize: 12 }}>{v}</Typography.Text>
      ),
    },
    {
      title: "调用次数",
      dataIndex: "calls",
      key: "calls",
      render: (v: number) => fmtNum(v),
      sorter: (a: LLMKeyStats, b: LLMKeyStats) => a.calls - b.calls,
    },
    {
      title: "Token 消耗",
      dataIndex: "tokens",
      key: "tokens",
      render: (v: number) => fmtNum(v),
      sorter: (a: LLMKeyStats, b: LLMKeyStats) => a.tokens - b.tokens,
    },
    {
      title: "平均延迟",
      dataIndex: "avgLatencyMs",
      key: "avgLatencyMs",
      render: (v: number) => v > 0 ? `${v}ms` : "—",
    },
    {
      title: (
        <Tooltip title="并发上限由 AdaptiveSemaphore 根据 X-RateLimit 响应头实时计算，所有 key 共享">
          并发上限
        </Tooltip>
      ),
      dataIndex: "poolConcurrency",
      key: "poolConcurrency",
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: (
        <Tooltip title="RPM 剩余 / 上限（-1 表示 provider 未返回）">
          RPM 剩余/上限
        </Tooltip>
      ),
      key: "rpm",
      render: (_: unknown, r: LLMKeyStats) => (
        <Typography.Text
          type={r.remainingReq >= 0 && r.limitReq > 0 && r.remainingReq < r.limitReq * 0.2
            ? "danger" : undefined}
          style={{ fontSize: 12 }}
        >
          {fmtRpm(r.remainingReq, r.limitReq)}
        </Typography.Text>
      ),
    },
    {
      title: (
        <Tooltip title="TPM 剩余 / 上限（-1 表示 provider 未返回）">
          TPM 剩余/上限
        </Tooltip>
      ),
      key: "tpm",
      render: (_: unknown, r: LLMKeyStats) => (
        <Typography.Text
          type={r.remainingTok >= 0 && r.limitTok > 0 && r.remainingTok < r.limitTok * 0.2
            ? "danger" : undefined}
          style={{ fontSize: 12 }}
        >
          {fmtRpm(r.remainingTok, r.limitTok)}
        </Typography.Text>
      ),
    },
    {
      title: "限流次数",
      dataIndex: "throttleCount",
      key: "throttleCount",
      render: (v: number) => v > 0
        ? <Typography.Text type="warning">{v}</Typography.Text>
        : <Typography.Text type="secondary">0</Typography.Text>,
    },
    {
      title: "错误数",
      dataIndex: "errors",
      key: "errors",
      render: (v: number) => v > 0
        ? <Typography.Text type="danger">{v}</Typography.Text>
        : <Typography.Text type="secondary">0</Typography.Text>,
    },
    {
      title: "最后更新",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (v: number) => (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>{fmtAgo(v)}</Typography.Text>
      ),
    },
  ];

  const headerExtra = (
    <Space size={8}>
      {lastFetch > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Worker 每 10s 写入一次
        </Typography.Text>
      )}
      <Button
        size="small"
        icon={<ReloadOutlined />}
        loading={loading}
        onClick={(e) => { e.stopPropagation(); load(); }}
      >
        刷新
      </Button>
    </Space>
  );

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[
        {
          key: "llm-keys",
          label: (
            <Space>
              <ApiOutlined />
              <span>LLM Key 调用情况</span>
              {stats.length > 0 && (
                <Tag color="processing">{stats.length} 个 Key</Tag>
              )}
            </Space>
          ),
          extra: headerExtra,
          children: (
            <Spin spinning={loading}>
              {note && (
                <Alert type="warning" message={note} style={{ marginBottom: 8 }} showIcon />
              )}
              {stats.length === 0 && !loading ? (
                <Typography.Text type="secondary">
                  暂无数据（翻译任务运行时会自动上报）
                </Typography.Text>
              ) : (
                <Table
                  dataSource={stats}
                  columns={columns}
                  rowKey="label"
                  size="small"
                  pagination={false}
                  scroll={{ x: true }}
                  expandable={{
                    expandedRowRender: (row: LLMKeyStats) => (
                      <KeyHistoryCharts label={row.label} />
                    ),
                    rowExpandable: () => true,
                    expandRowByClick: false,
                  }}
                />
              )}
            </Spin>
          ),
        },
      ]}
    />
  );
}

export default function Translations() {
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorLevel, setErrorLevel] = useState<"error" | "warning">("error");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [shopFilter, setShopFilter] = useState("");
  const [selected, setSelected] = useState<TranslationJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchTranslations({
      status: statusFilter,
      shop: shopFilter || undefined,
      limit: 200,
    })
      .then((r) => {
        setJobs(r.jobs);
        if ((r as { note?: string }).note) {
          setError((r as { note?: string }).note!);
          setErrorLevel("warning");
        }
      })
      .catch((e) => { setError(String(e)); setErrorLevel("error"); })
      .finally(() => setLoading(false));
  }, [statusFilter, shopFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh active jobs every 15s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  function openDetail(job: TranslationJob) {
    setSelected(job);
    setDetailLoading(true);
    fetchTranslationJob(job.id, job.shopName)
      .then((r) => setSelected(r.job))
      .finally(() => setDetailLoading(false));
  }

  const columns = [
    {
      title: "商店",
      dataIndex: "shopName",
      key: "shopName",
      render: (v: string) => (
        <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>
      ),
    },
    {
      title: "语言对",
      key: "lang",
      render: (_: unknown, r: TranslationJob) => (
        <Tag>
          {r.source} → {r.target}
        </Tag>
      ),
    },
    {
      title: "模块",
      dataIndex: "modules",
      key: "modules",
      render: (v: string[]) => (
        <Space size={2} wrap>
          {v.map((m) => (
            <Tag key={m} style={{ fontSize: 10, margin: 0 }}>
              {m}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (v: string) => statusBadge(v),
    },
    {
      title: "进度",
      key: "progress",
      width: 120,
      render: (_: unknown, r: TranslationJob) => {
        const pct = calcProgress(r);
        const status = r.status === "FAILED" ? "exception" : r.status === "COMPLETED" ? "success" : "active";
        return <Progress percent={pct} size="small" status={status} />;
      },
    },
    {
      title: "失败数",
      key: "failed",
      render: (_: unknown, r: TranslationJob) => {
        const failed = r.metrics.translateFailed;
        return failed > 0 ? (
          <Typography.Text type="danger">{failed}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">0</Typography.Text>
        );
      },
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, r: TranslationJob) => (
        <Button type="link" size="small" onClick={() => openDetail(r)}>
          详情
        </Button>
      ),
    },
  ];

  const stuckJobs = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return jobs.filter(
      (j) => ACTIVE_STATUSES.has(j.status) && new Date(j.updatedAt).getTime() < cutoff,
    );
  }, [jobs]);

  if (error && errorLevel === "error") return <Alert type="error" message={error} />;

  return (
    <div>
      <LLMKeyStatsPanel />

      {error && errorLevel === "warning" && (
        <Alert type="warning" message={error} style={{ marginBottom: 16 }} showIcon />
      )}
      {stuckJobs.length > 0 && (        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`发现 ${stuckJobs.length} 个卡住的任务（超过 1 小时未更新）`}
          description={
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 16 }}>
              {stuckJobs.map((j) => (
                <li key={j.id} style={{ fontSize: 12 }}>
                  <strong>{j.shopName}</strong> — {j.source}→{j.target} — 状态: {j.status} — 最后更新:{" "}
                  {new Date(j.updatedAt).toLocaleString("zh-CN")}
                </li>
              ))}
            </ul>
          }
        />
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          翻译任务
        </Typography.Title>
        <Select
          allowClear
          placeholder="按状态筛选"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 180 }}
          options={[
            { value: "COMPLETED", label: "已完成" },
            { value: "FAILED", label: "已失败" },
            { value: "TRANSLATING", label: "翻译中" },
            { value: "INITIALIZING", label: "初始化中" },
            { value: "PAUSED", label: "已暂停" },
            { value: "CANCELLED", label: "已取消" },
          ]}
        />
        <Input
          prefix={<SearchOutlined />}
          placeholder="按商店过滤"
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
        <Button
          type={autoRefresh ? "primary" : "default"}
          onClick={() => setAutoRefresh((v) => !v)}
        >
          {autoRefresh ? "关闭自动刷新" : "开启自动刷新 (15s)"}
        </Button>
      </div>

      <Spin spinning={loading}>
        <Table
          dataSource={jobs}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Spin>

      <Drawer
        title="翻译任务详情"
        open={!!selected}
        onClose={() => setSelected(null)}
        width={600}
      >
        {detailLoading ? (
          <Spin />
        ) : selected ? (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务 ID">
                <Typography.Text copyable style={{ fontSize: 12 }}>
                  {selected.id}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="商店">
                {selected.shopName}
              </Descriptions.Item>
              <Descriptions.Item label="语言对">
                {selected.source} → {selected.target}
              </Descriptions.Item>
              <Descriptions.Item label="模块">
                {selected.modules.join(", ")}
              </Descriptions.Item>
              <Descriptions.Item label="AI 模型">
                <Tag>{selected.aiModel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {statusBadge(selected.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Worker">
                {selected.claimedBy ?? "-"}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              进度指标
            </Typography.Title>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="初始化">
                {selected.metrics.initDone} / {selected.metrics.initTotal}
              </Descriptions.Item>
              <Descriptions.Item label="翻译">
                {selected.metrics.translateDone} /{" "}
                {selected.metrics.translateTotal}
              </Descriptions.Item>
              <Descriptions.Item label="翻译失败">
                <Typography.Text
                  type={
                    selected.metrics.translateFailed > 0 ? "danger" : undefined
                  }
                >
                  {selected.metrics.translateFailed}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="写回">
                {selected.metrics.writebackDone} /{" "}
                {selected.metrics.writebackTotal}
              </Descriptions.Item>
              <Descriptions.Item label="写回失败">
                <Typography.Text
                  type={
                    selected.metrics.writebackFailed > 0 ? "danger" : undefined
                  }
                >
                  {selected.metrics.writebackFailed}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="消耗 Tokens">
                {selected.metrics.usedTokens.toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            {selected.errorMessage && (
              <Alert
                type="error"
                message={`失败阶段: ${selected.errorStage ?? "未知"}`}
                description={selected.errorMessage}
                style={{ marginTop: 16 }}
                showIcon
              />
            )}

            <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="创建时间">
                {new Date(selected.createdAt).toLocaleString("zh-CN")}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {new Date(selected.updatedAt).toLocaleString("zh-CN")}
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
