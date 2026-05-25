import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Select,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Drawer,
  Descriptions,
  Badge,
  Space,
  Button,
  Statistic,
  Progress,
  Tooltip,
} from "antd";
import { ReloadOutlined, SearchOutlined, LinkOutlined } from "@ant-design/icons";
import {
  fetchAgentRunStats,
  fetchAgentRuns,
  type AgentRunRow,
  type AgentRunStats,
} from "../api";

const PERIOD_OPTIONS = [
  { value: "1h", label: "近 1 小时" },
  { value: "6h", label: "近 6 小时" },
  { value: "24h", label: "近 24 小时" },
  { value: "7d", label: "近 7 天" },
];

const FEATURE_LABEL: Record<string, string> = {
  chat: "对话",
  chat_stream: "对话(流式)",
  generate_description: "描述生成",
  picture_translate: "图片翻译",
};

const STATUS_COLOR: Record<string, string> = {
  success: "success",
  error: "error",
  timeout: "warning",
  partial: "processing",
};

function fmtDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

export default function AgentRuns() {
  const [period, setPeriod] = useState("24h");
  const [stats, setStats] = useState<AgentRunStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  const [runs, setRuns] = useState<AgentRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");
  const [featureFilter, setFeatureFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [shopFilter, setShopFilter] = useState("");

  const [selected, setSelected] = useState<AgentRunRow | null>(null);

  const loadStats = useCallback((p: string) => {
    setStatsLoading(true);
    setStatsError("");
    fetchAgentRunStats(p)
      .then((r) => setStats(r))
      .catch((e) => setStatsError(String(e)))
      .finally(() => setStatsLoading(false));
  }, []);

  const loadRuns = useCallback(
    (p: string, feature?: string, status?: string, shop?: string) => {
      setRunsLoading(true);
      setRunsError("");
      fetchAgentRuns({ period: p, feature, status, shop: shop || undefined, limit: 100 })
        .then((r) => setRuns(r.runs))
        .catch((e) => setRunsError(String(e)))
        .finally(() => setRunsLoading(false));
    },
    [],
  );

  useEffect(() => {
    loadStats(period);
    loadRuns(period, featureFilter, statusFilter, shopFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function reload() {
    loadStats(period);
    loadRuns(period, featureFilter, statusFilter, shopFilter);
  }

  function applyRunFilters(overrides: {
    feature?: string | undefined;
    status?: string | undefined;
    shop?: string;
  }) {
    const f = overrides.feature !== undefined ? overrides.feature : featureFilter;
    const s = overrides.status !== undefined ? overrides.status : statusFilter;
    const sh = overrides.shop !== undefined ? overrides.shop : shopFilter;
    loadRuns(period, f, s, sh);
  }

  const summary = stats?.summary;

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      width: 200,
      render: (v: string) => (
        <Typography.Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "功能",
      dataIndex: "feature",
      key: "feature",
      render: (v: string) => <Tag>{FEATURE_LABEL[v] ?? v}</Tag>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (v: string) => (
        <Badge status={STATUS_COLOR[v] as "success" | "error" | "warning" | "processing"} text={v} />
      ),
    },
    {
      title: "耗时",
      dataIndex: "durationMs",
      key: "durationMs",
      render: (v: number) => <Typography.Text type="secondary">{fmtDuration(v)}</Typography.Text>,
    },
    {
      title: "Token",
      key: "tokenUsage",
      render: (_: unknown, r: AgentRunRow) =>
        r.tokenUsage ? (
          <Tooltip title={`prompt: ${r.tokenUsage.prompt} / completion: ${r.tokenUsage.completion}`}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.tokenUsage.total.toLocaleString()}
            </Typography.Text>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: "开始时间",
      dataIndex: "startedAt",
      key: "startedAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, r: AgentRunRow) => (
        <Button type="link" size="small" onClick={() => setSelected(r)}>
          详情
        </Button>
      ),
    },
  ];

  const featureColumns = [
    { title: "功能", dataIndex: "feature", key: "feature", render: (v: string) => FEATURE_LABEL[v] ?? v },
    { title: "总计", dataIndex: "total", key: "total" },
    {
      title: "成功",
      dataIndex: "success",
      key: "success",
      render: (v: number) => <Typography.Text style={{ color: "#52c41a" }}>{v}</Typography.Text>,
    },
    {
      title: "失败",
      dataIndex: "error",
      key: "error",
      render: (v: number) => <Typography.Text type={v > 0 ? "danger" : "secondary"}>{v}</Typography.Text>,
    },
    {
      title: "超时",
      dataIndex: "timeout",
      key: "timeout",
      render: (v: number) => <Typography.Text type={v > 0 ? "warning" : "secondary"}>{v}</Typography.Text>,
    },
    {
      title: "成功率",
      dataIndex: "successRate",
      key: "successRate",
      render: (v: number) => (
        <Progress
          percent={v}
          size="small"
          status={v >= 90 ? "success" : v >= 70 ? "active" : "exception"}
          style={{ minWidth: 100 }}
        />
      ),
    },
    {
      title: "平均耗时",
      dataIndex: "avgDurationMs",
      key: "avgDurationMs",
      render: (v: number) => fmtDuration(v),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          AI 执行监控
        </Typography.Title>
        <Select
          value={period}
          onChange={(v) => { setPeriod(v); }}
          options={PERIOD_OPTIONS}
          style={{ width: 140 }}
        />
        <Button icon={<ReloadOutlined />} onClick={reload}>
          刷新
        </Button>
      </div>

      {statsError && <Alert type="error" message={statsError} style={{ marginBottom: 16 }} />}

      <Spin spinning={statsLoading}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "#fff", padding: 20, borderRadius: 8, border: "1px solid #f0f0f0" }}>
            <Statistic title="总执行次数" value={summary?.total ?? 0} />
          </div>
          <div style={{ background: "#fff", padding: 20, borderRadius: 8, border: "1px solid #f0f0f0" }}>
            <Statistic
              title="成功率"
              value={summary?.successRate ?? 0}
              suffix="%"
              valueStyle={{ color: (summary?.successRate ?? 0) >= 90 ? "#52c41a" : (summary?.successRate ?? 0) >= 70 ? "#fa8c16" : "#ff4d4f" }}
            />
          </div>
          <div style={{ background: "#fff", padding: 20, borderRadius: 8, border: "1px solid #f0f0f0" }}>
            <Statistic title="平均耗时" value={fmtDuration(summary?.avgDurationMs ?? 0)} />
          </div>
          <div style={{ background: "#fff", padding: 20, borderRadius: 8, border: "1px solid #f0f0f0" }}>
            <Statistic
              title="失败次数"
              value={summary?.errorCount ?? 0}
              valueStyle={{ color: (summary?.errorCount ?? 0) > 0 ? "#ff4d4f" : undefined }}
            />
          </div>
        </div>
      </Spin>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #f0f0f0" }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            功能维度
          </Typography.Title>
          <Spin spinning={statsLoading}>
            <Table
              dataSource={stats?.byFeature ?? []}
              columns={featureColumns}
              rowKey="feature"
              size="small"
              pagination={false}
            />
          </Spin>
        </div>
        <div style={{ background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #f0f0f0" }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            高频错误 Top 10
          </Typography.Title>
          <Spin spinning={statsLoading}>
            {stats?.topErrors && stats.topErrors.length > 0 ? (
              <Table
                dataSource={stats.topErrors}
                rowKey="message"
                size="small"
                pagination={false}
                columns={[
                  {
                    title: "错误信息",
                    dataIndex: "message",
                    key: "message",
                    render: (v: string) => (
                      <Typography.Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>
                        {v}
                      </Typography.Text>
                    ),
                  },
                  {
                    title: "次数",
                    dataIndex: "count",
                    key: "count",
                    width: 60,
                    render: (v: number) => <Tag color="red">{v}</Tag>,
                  },
                ]}
              />
            ) : (
              <Typography.Text type="secondary">暂无错误</Typography.Text>
            )}
          </Spin>
        </div>
      </div>

      <div style={{ background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #f0f0f0" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            执行记录（最近 100 条）
          </Typography.Title>
          <Select
            allowClear
            placeholder="功能"
            value={featureFilter}
            onChange={(v) => {
              setFeatureFilter(v);
              applyRunFilters({ feature: v });
            }}
            style={{ width: 140 }}
            options={Object.entries(FEATURE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Select
            allowClear
            placeholder="状态"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              applyRunFilters({ status: v });
            }}
            style={{ width: 120 }}
            options={[
              { value: "success", label: "成功" },
              { value: "error", label: "失败" },
              { value: "timeout", label: "超时" },
              { value: "partial", label: "部分成功" },
            ]}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="商店过滤"
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            onPressEnter={() => applyRunFilters({ shop: shopFilter })}
            style={{ width: 200 }}
            allowClear
            onClear={() => { setShopFilter(""); applyRunFilters({ shop: "" }); }}
          />
        </div>
        {runsError && <Alert type="error" message={runsError} style={{ marginBottom: 8 }} />}
        <Spin spinning={runsLoading}>
          <Table
            dataSource={runs}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20 }}
          />
        </Spin>
      </div>

      <Drawer
        title="执行详情"
        open={!!selected}
        onClose={() => setSelected(null)}
        width={600}
      >
        {selected && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Run ID">
                <Typography.Text copyable style={{ fontSize: 12 }}>
                  {selected.id}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="商店">{selected.shop}</Descriptions.Item>
              <Descriptions.Item label="功能">
                <Tag>{FEATURE_LABEL[selected.feature] ?? selected.feature}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge
                  status={STATUS_COLOR[selected.status] as "success" | "error" | "warning" | "processing"}
                  text={selected.status}
                />
              </Descriptions.Item>
              <Descriptions.Item label="耗时">{fmtDuration(selected.durationMs)}</Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {new Date(selected.startedAt).toLocaleString("zh-CN")}
              </Descriptions.Item>
              {selected.langsmithRunId && (
                <Descriptions.Item label="LangSmith">
                  <Space>
                    <Typography.Text style={{ fontSize: 12 }} copyable>
                      {selected.langsmithRunId}
                    </Typography.Text>
                    {selected.langsmithProject && (
                      <a
                        href={`https://smith.langchain.com/projects/p/${selected.langsmithProject}/r/${selected.langsmithRunId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <LinkOutlined /> 跳转
                      </a>
                    )}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>

            {selected.tokenUsage && (
              <>
                <Typography.Title level={5} style={{ marginTop: 20 }}>
                  Token 用量
                </Typography.Title>
                <Descriptions column={3} bordered size="small">
                  <Descriptions.Item label="Prompt">{selected.tokenUsage.prompt.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="Completion">{selected.tokenUsage.completion.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="Total">{selected.tokenUsage.total.toLocaleString()}</Descriptions.Item>
                </Descriptions>
              </>
            )}

            {selected.tools && selected.tools.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 20 }}>
                  工具调用
                </Typography.Title>
                <Space wrap>
                  {selected.tools.map((t, i) => (
                    <Tag key={i} color={t.ok ? "green" : "red"}>
                      {t.ok ? "✓" : "✗"} {t.name}
                    </Tag>
                  ))}
                </Space>
              </>
            )}

            {selected.error && (
              <Alert
                type="error"
                message={selected.error.code ? `错误码: ${selected.error.code}` : "执行错误"}
                description={selected.error.message}
                style={{ marginTop: 16 }}
                showIcon
              />
            )}

            {selected.reflection && (
              <>
                <Typography.Title level={5} style={{ marginTop: 20 }}>
                  AI 故障分析
                </Typography.Title>
                <div style={{ background: "#fafafa", padding: 12, borderRadius: 6, fontSize: 13 }}>
                  <p>
                    <strong>摘要：</strong>
                    {selected.reflection.summary}
                  </p>
                  {selected.reflection.rootCause && (
                    <p>
                      <strong>根因：</strong>
                      {selected.reflection.rootCause}
                    </p>
                  )}
                  {selected.reflection.nextTimeStrategy && selected.reflection.nextTimeStrategy.length > 0 && (
                    <div>
                      <strong>建议：</strong>
                      <ul style={{ margin: "4px 0 0 0", paddingLeft: 16 }}>
                        {selected.reflection.nextTimeStrategy.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selected.reflection.confidence != null && (
                    <p style={{ marginTop: 8, color: "#8c8c8c", fontSize: 12 }}>
                      置信度: {Math.round(selected.reflection.confidence * 100)}%
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
