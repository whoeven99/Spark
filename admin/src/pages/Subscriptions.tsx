import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Typography,
  Spin,
  Alert,
  Tag,
  Drawer,
  Timeline,
  Row,
  Col,
  Statistic,
  Select,
  Space,
  Divider,
  Progress,
  Badge,
  Tabs,
  Radio,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  fetchSubscriptions,
  fetchBillingLogs,
  fetchBillingTrend,
  fetchBillingEvents,
  type SubscriptionRow,
  type SubscriptionsData,
  type BillingLogRow,
  type BillingTrendPoint,
  type BillingEvent,
} from "../api";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "green",
  PENDING: "orange",
  CANCELLED: "red",
  EXPIRED: "default",
  FROZEN: "blue",
};

const STATUS_BADGE: Record<
  string,
  "success" | "processing" | "error" | "default" | "warning"
> = {
  ACTIVE: "success",
  PENDING: "processing",
  CANCELLED: "error",
  EXPIRED: "default",
  FROZEN: "warning",
};

function daysBetween(dateStr: string): number {
  return Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

function getEventTypeColor(eventType: string): string {
  const colors = [
    "blue",
    "green",
    "orange",
    "purple",
    "cyan",
    "red",
    "magenta",
    "gold",
    "volcano",
    "geekblue",
  ];
  let hash = 0;
  for (const c of eventType) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[hash];
}

const TIME_PRESETS = [
  { label: "最近7天", value: "7d", period: "daily" as const, days: 7 },
  { label: "最近30天", value: "30d", period: "daily" as const, days: 30 },
  { label: "最近3个月", value: "3m", period: "monthly" as const, days: 90 },
  { label: "最近6个月", value: "6m", period: "monthly" as const, days: 180 },
  { label: "最近12个月", value: "12m", period: "monthly" as const, days: 365 },
];

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Subscription Overview ──────────────────────────────────────────────────

function SubscriptionOverview() {
  const [data, setData] = useState<SubscriptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [planFilter, setPlanFilter] = useState<string | undefined>(undefined);
  const [intervalFilter, setIntervalFilter] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<SubscriptionRow | null>(null);
  const [billingLogs, setBillingLogs] = useState<BillingLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(
    (params: {
      search?: string;
      status?: string;
      plan?: string;
      interval?: string;
    }) => {
      setLoading(true);
      fetchSubscriptions(params)
        .then((r) => setData(r))
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load({});
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setLogsLoading(true);
    fetchBillingLogs(selected.shop)
      .then((r) => setBillingLogs(r.billingLogs))
      .finally(() => setLogsLoading(false));
  }, [selected]);

  const applyFilters = useCallback(
    (overrides: {
      search?: string;
      status?: string;
      plan?: string;
      interval?: string;
    }) => {
      load({
        search: overrides.search ?? (search || undefined),
        status: overrides.status !== undefined ? overrides.status : statusFilter,
        plan: overrides.plan !== undefined ? overrides.plan : planFilter,
        interval:
          overrides.interval !== undefined ? overrides.interval : intervalFilter,
      });
    },
    [load, search, statusFilter, planFilter, intervalFilter],
  );

  const stats = data?.stats;
  const subs = data?.subscriptions ?? [];

  const cancelledExpired =
    (stats?.byStatus["CANCELLED"] ?? 0) + (stats?.byStatus["EXPIRED"] ?? 0);
  const frozenPending =
    (stats?.byStatus["FROZEN"] ?? 0) + (stats?.byStatus["PENDING"] ?? 0);
  const recentNewSubs = subs.filter((s) => {
    if (!s.accountCreatedAt) return false;
    return daysBetween(s.accountCreatedAt) > -30;
  }).length;

  const planOptions = (stats?.byPlan ?? [])
    .filter((p) => p.planKey)
    .map((p) => ({ value: p.planKey!, label: p.planKey! }));

  const intervalOptions = Object.keys(stats?.byInterval ?? {}).map((k) => ({
    value: k,
    label: k,
  }));

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string, r: SubscriptionRow) => (
        <Typography.Link style={{ fontSize: 13 }} onClick={() => setSelected(r)}>
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "App",
      dataIndex: "appName",
      key: "appName",
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) =>
        v ? (
          <Tag color="purple">{v}</Tag>
        ) : (
          <span style={{ color: "#ccc" }}>—</span>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (v: string) => (
        <Badge
          status={STATUS_BADGE[v] ?? "default"}
          text={
            <Tag color={STATUS_COLOR[v] ?? "default"} style={{ marginLeft: 0 }}>
              {v}
            </Tag>
          }
        />
      ),
    },
    {
      title: "计费周期",
      dataIndex: "billingInterval",
      key: "billingInterval",
      render: (v: string | null) =>
        v ? <Tag color="cyan">{v}</Tag> : <span style={{ color: "#ccc" }}>—</span>,
    },
    {
      title: "周期到期",
      dataIndex: "currentPeriodEnd",
      key: "currentPeriodEnd",
      sorter: (a: SubscriptionRow, b: SubscriptionRow) => {
        if (!a.currentPeriodEnd) return 1;
        if (!b.currentPeriodEnd) return -1;
        return (
          new Date(a.currentPeriodEnd).getTime() -
          new Date(b.currentPeriodEnd).getTime()
        );
      },
      render: (v: string | null) => {
        if (!v) return <span style={{ color: "#ccc" }}>—</span>;
        const days = daysBetween(v);
        const color =
          days <= 0
            ? "#ff4d4f"
            : days <= 7
              ? "#ff7a45"
              : days <= 30
                ? "#fa8c16"
                : undefined;
        return (
          <span style={{ color, fontSize: 12 }}>
            {new Date(v).toLocaleDateString("zh-CN")}
            {days <= 30 && (
              <span style={{ marginLeft: 4 }}>
                ({days <= 0 ? "已到期" : `${days}天`})
              </span>
            )}
          </span>
        );
      },
    },
    {
      title: "订阅 Tokens",
      dataIndex: "subscriptionTokens",
      key: "subscriptionTokens",
      sorter: (a: SubscriptionRow, b: SubscriptionRow) =>
        a.subscriptionTokens - b.subscriptionTokens,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "Token 使用率",
      key: "usagePercent",
      sorter: (a: SubscriptionRow, b: SubscriptionRow) => {
        const tA = a.subscriptionTokens + a.purchasedTokens + a.trialTokens;
        const tB = b.subscriptionTokens + b.purchasedTokens + b.trialTokens;
        return (tA > 0 ? a.usedTokens / tA : 0) - (tB > 0 ? b.usedTokens / tB : 0);
      },
      render: (_: unknown, r: SubscriptionRow) => {
        const total = r.subscriptionTokens + r.purchasedTokens + r.trialTokens;
        const pct = total > 0 ? Math.round((r.usedTokens / total) * 100) : 0;
        return (
          <Progress
            percent={pct}
            size="small"
            status={pct >= 90 ? "exception" : pct >= 70 ? "active" : "success"}
            style={{ minWidth: 80 }}
          />
        );
      },
    },
    {
      title: "入驻时间",
      dataIndex: "accountCreatedAt",
      key: "accountCreatedAt",
      sorter: (a: SubscriptionRow, b: SubscriptionRow) => {
        if (!a.accountCreatedAt) return 1;
        if (!b.accountCreatedAt) return -1;
        return (
          new Date(a.accountCreatedAt).getTime() -
          new Date(b.accountCreatedAt).getTime()
        );
      },
      render: (v: string | null) =>
        v ? (
          <Typography.Text style={{ fontSize: 12 }} type="secondary">
            {new Date(v).toLocaleDateString("zh-CN")}
          </Typography.Text>
        ) : (
          <span style={{ color: "#ccc" }}>—</span>
        ),
    },
  ];

  if (error) return <Alert type="error" message={error} />;

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: "总订阅数", value: stats?.total ?? 0, color: "#1677ff" },
          { title: "活跃订阅", value: stats?.byStatus["ACTIVE"] ?? 0, color: "#52c41a" },
          {
            title: "即将到期（30天内）",
            value: stats?.expiringSoon ?? 0,
            color: "#fa8c16",
          },
          { title: "已取消 / 过期", value: cancelledExpired, color: "#ff4d4f" },
          { title: "冻结 / 待处理", value: frozenPending, color: "#722ed1" },
          { title: "近30天新增", value: recentNewSubs, color: "#13c2c2" },
        ].map((card, i) => (
          <Col xs={12} sm={8} md={4} key={i}>
            <div
              style={{
                background: "#fff",
                padding: 16,
                borderRadius: 8,
                border: "1px solid #f0f0f0",
              }}
            >
              <Statistic
                title={card.title}
                value={card.value}
                valueStyle={{ color: card.color, fontSize: 22 }}
              />
            </div>
          </Col>
        ))}
      </Row>

      {/* Plan Breakdown + Status/Interval Breakdown */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <div
            style={{
              background: "#fff",
              padding: 16,
              borderRadius: 8,
              border: "1px solid #f0f0f0",
            }}
          >
            <Typography.Text strong style={{ fontSize: 14 }}>
              套餐分布
            </Typography.Text>
            <Table
              dataSource={stats?.byPlan ?? []}
              rowKey={(r) => r.planKey ?? "(none)"}
              size="small"
              pagination={false}
              style={{ marginTop: 8 }}
              columns={[
                {
                  title: "套餐",
                  dataIndex: "planKey",
                  render: (v: string | null) =>
                    v ? (
                      <Tag color="purple">{v}</Tag>
                    ) : (
                      <span style={{ color: "#bbb" }}>无套餐</span>
                    ),
                },
                {
                  title: "活跃",
                  dataIndex: "activeCount",
                  render: (v: number) => <Tag color="green">{v}</Tag>,
                },
                { title: "总计", dataIndex: "total" },
                {
                  title: "活跃率",
                  render: (
                    _: unknown,
                    r: {
                      planKey: string | null;
                      activeCount: number;
                      total: number;
                    },
                  ) => (
                    <Progress
                      percent={
                        r.total > 0
                          ? Math.round((r.activeCount / r.total) * 100)
                          : 0
                      }
                      size="small"
                      style={{ minWidth: 80 }}
                    />
                  ),
                },
              ]}
            />
          </div>
        </Col>
        <Col xs={24} lg={10}>
          <div
            style={{
              background: "#fff",
              padding: 16,
              borderRadius: 8,
              border: "1px solid #f0f0f0",
              height: "100%",
            }}
          >
            <Typography.Text strong style={{ fontSize: 14 }}>
              状态分布
            </Typography.Text>
            <div style={{ marginTop: 8 }}>
              {Object.entries(stats?.byStatus ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <div
                    key={status}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Tag color={STATUS_COLOR[status] ?? "default"}>{status}</Tag>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Progress
                        percent={
                          stats?.total
                            ? Math.round((count / stats.total) * 100)
                            : 0
                        }
                        size="small"
                        style={{ width: 80 }}
                        showInfo={false}
                      />
                      <Typography.Text strong style={{ width: 30, textAlign: "right" }}>
                        {count}
                      </Typography.Text>
                    </div>
                  </div>
                ))}
            </div>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Text strong style={{ fontSize: 14 }}>
              计费周期分布（活跃）
            </Typography.Text>
            <div style={{ marginTop: 8 }}>
              {Object.entries(stats?.byInterval ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([interval, count]) => (
                  <div
                    key={interval}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Tag color="cyan">{interval}</Tag>
                    <Typography.Text strong>{count}</Typography.Text>
                  </div>
                ))}
              {Object.keys(stats?.byInterval ?? {}).length === 0 && (
                <Typography.Text type="secondary">暂无数据</Typography.Text>
              )}
            </div>
          </div>
        </Col>
      </Row>

      {/* Filters + Table */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 8,
          border: "1px solid #f0f0f0",
        }}
      >
        <Typography.Text strong style={{ fontSize: 14 }}>
          订阅列表
        </Typography.Text>
        <Space wrap style={{ marginTop: 12, marginBottom: 16 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索商店域名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => applyFilters({ search: search || undefined })}
            allowClear
            onClear={() => {
              setSearch("");
              load({
                status: statusFilter,
                plan: planFilter,
                interval: intervalFilter,
              });
            }}
            style={{ width: 240 }}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              applyFilters({ status: v });
            }}
            options={["ACTIVE", "PENDING", "CANCELLED", "EXPIRED", "FROZEN"].map(
              (s) => ({ value: s, label: s }),
            )}
          />
          <Select
            placeholder="套餐筛选"
            allowClear
            style={{ width: 180 }}
            value={planFilter}
            onChange={(v) => {
              setPlanFilter(v);
              applyFilters({ plan: v });
            }}
            options={planOptions}
          />
          <Select
            placeholder="计费周期"
            allowClear
            style={{ width: 160 }}
            value={intervalFilter}
            onChange={(v) => {
              setIntervalFilter(v);
              applyFilters({ interval: v });
            }}
            options={intervalOptions}
          />
        </Space>
        <Spin spinning={loading}>
          <Table
            dataSource={subs}
            columns={columns}
            rowKey={(r) => `${r.shop}-${r.appName}`}
            size="small"
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            scroll={{ x: 900 }}
          />
        </Spin>
      </div>

      {/* Billing Log Drawer */}
      <Drawer
        title={
          <span>
            {selected?.shop ?? ""} &mdash; 账单记录
            {selected?.planKey && (
              <Tag color="purple" style={{ marginLeft: 8 }}>
                {selected.planKey}
              </Tag>
            )}
            {selected?.status && (
              <Tag
                color={STATUS_COLOR[selected.status] ?? "default"}
                style={{ marginLeft: 4 }}
              >
                {selected.status}
              </Tag>
            )}
          </span>
        }
        open={!!selected}
        onClose={() => setSelected(null)}
        width={500}
      >
        {selected && (
          <div style={{ marginBottom: 16 }}>
            <Row gutter={8}>
              <Col span={12}>
                <Statistic
                  title="订阅 Tokens"
                  value={selected.subscriptionTokens.toLocaleString()}
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="已用 Tokens"
                  value={selected.usedTokens.toLocaleString()}
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
            </Row>
            {selected.currentPeriodEnd && (
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: "block", marginTop: 8 }}
              >
                周期到期：{new Date(selected.currentPeriodEnd).toLocaleDateString("zh-CN")}
                {" "}
                (
                {daysBetween(selected.currentPeriodEnd) <= 0
                  ? "已到期"
                  : `还剩 ${daysBetween(selected.currentPeriodEnd)} 天`}
                )
              </Typography.Text>
            )}
            <Divider />
          </div>
        )}
        {logsLoading ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin />
          </div>
        ) : billingLogs.length === 0 ? (
          <Typography.Text type="secondary">暂无账单记录</Typography.Text>
        ) : (
          <Timeline
            items={billingLogs.map((log, i) => ({
              key: i,
              color:
                log.tokensDelta > 0 ? "green" : log.tokensDelta < 0 ? "red" : "blue",
              children: (
                <div>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {log.eventType}
                  </Typography.Text>
                  {log.planKey && <Tag style={{ marginLeft: 8 }}>{log.planKey}</Tag>}
                  <br />
                  <Typography.Text
                    style={{
                      color:
                        log.tokensDelta > 0
                          ? "#52c41a"
                          : log.tokensDelta < 0
                            ? "#ff4d4f"
                            : "#1677ff",
                      fontSize: 13,
                    }}
                  >
                    Token 变化：{log.tokensDelta > 0 ? "+" : ""}
                    {log.tokensDelta.toLocaleString()}
                  </Typography.Text>
                  <span style={{ margin: "0 8px", color: "#d9d9d9" }}>|</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    累计已用 {log.usedTokens.toLocaleString()}
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(log.createdAt).toLocaleString("zh-CN")}
                  </Typography.Text>
                </div>
              ),
            }))}
          />
        )}
      </Drawer>
    </div>
  );
}

// ─── Billing Analytics ──────────────────────────────────────────────────────

function BillingAnalytics() {
  const [preset, setPreset] = useState("30d");
  const [eventTypeFilter, setEventTypeFilter] = useState<string | undefined>(
    undefined,
  );
  const [trend, setTrend] = useState<BillingTrendPoint[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState("");

  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsPage, setEventsPage] = useState(1);
  const [shopSearch, setShopSearch] = useState("");
  const [eventsError, setEventsError] = useState("");

  const presetObj = TIME_PRESETS.find((p) => p.value === preset) ?? TIME_PRESETS[1];
  const endDate = toDateStr(new Date());
  const startDate = toDateStr(new Date(Date.now() - presetObj.days * 86400_000));

  const loadTrend = useCallback(
    (p: string, et?: string) => {
      const obj = TIME_PRESETS.find((x) => x.value === p) ?? TIME_PRESETS[1];
      const sd = toDateStr(new Date(Date.now() - obj.days * 86400_000));
      const ed = toDateStr(new Date());
      setTrendLoading(true);
      setTrendError("");
      fetchBillingTrend({ period: obj.period, startDate: sd, endDate: ed, eventType: et })
        .then((r) => {
          setTrend(r.trend);
          setEventTypes(r.eventTypes);
        })
        .catch((e) => setTrendError(String(e)))
        .finally(() => setTrendLoading(false));
    },
    [],
  );

  const loadEvents = useCallback(
    (p: string, et: string | undefined, shop: string, page: number) => {
      const obj = TIME_PRESETS.find((x) => x.value === p) ?? TIME_PRESETS[1];
      const sd = toDateStr(new Date(Date.now() - obj.days * 86400_000));
      const ed = toDateStr(new Date());
      setEventsLoading(true);
      setEventsError("");
      fetchBillingEvents({
        startDate: sd,
        endDate: ed,
        eventType: et,
        shop: shop || undefined,
        page,
        pageSize: 50,
      })
        .then((r) => {
          setEvents(r.events);
          setEventsTotal(r.total);
        })
        .catch((e) => setEventsError(String(e)))
        .finally(() => setEventsLoading(false));
    },
    [],
  );

  useEffect(() => {
    loadTrend(preset, eventTypeFilter);
    loadEvents(preset, eventTypeFilter, shopSearch, 1);
    setEventsPage(1);
  }, [preset, eventTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Summary stats derived from trend data
  const totalEvents = trend.reduce((s, r) => s + r.count, 0);
  const totalCredit = trend.reduce((s, r) => s + r.creditTokens, 0);
  const totalDebit = trend.reduce((s, r) => s + r.debitTokens, 0);
  const peakDay = trend.reduce(
    (max, r) => (r.count > max.count ? r : max),
    { period: "—", count: 0 } as BillingTrendPoint,
  );

  // Format tokens for display (abbreviate large numbers)
  const fmtTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  // Chart data: creditTokens shown in 万 for readability
  const chartData = trend.map((r) => ({
    ...r,
    creditTokensW: Math.round(r.creditTokens / 10_000),
    debitTokensW: Math.round(r.debitTokens / 10_000),
  }));

  const eventColumns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>
      ),
    },
    {
      title: "App",
      dataIndex: "appName",
      key: "appName",
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: "事件类型",
      dataIndex: "eventType",
      key: "eventType",
      render: (v: string) => <Tag color={getEventTypeColor(v)}>{v}</Tag>,
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) =>
        v ? <Tag color="purple">{v}</Tag> : <span style={{ color: "#ccc" }}>—</span>,
    },
    {
      title: "Token 变化",
      dataIndex: "tokensDelta",
      key: "tokensDelta",
      sorter: (a: BillingEvent, b: BillingEvent) => a.tokensDelta - b.tokensDelta,
      render: (v: number) => (
        <Typography.Text
          strong
          style={{
            color: v > 0 ? "#52c41a" : v < 0 ? "#ff4d4f" : "#8c8c8c",
            fontSize: 13,
          }}
        >
          {v > 0 ? "+" : ""}
          {v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "累计已用",
      dataIndex: "usedTokens",
      key: "usedTokens",
      render: (v: number) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          background: "#fff",
          padding: "12px 16px",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Radio.Group
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          {TIME_PRESETS.map((p) => (
            <Radio.Button key={p.value} value={p.value}>
              {p.label}
            </Radio.Button>
          ))}
        </Radio.Group>
        <Select
          placeholder="事件类型筛选"
          allowClear
          style={{ width: 220 }}
          size="small"
          value={eventTypeFilter}
          onChange={(v) => setEventTypeFilter(v)}
          options={eventTypes.map((t) => ({ value: t, label: t }))}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {startDate} ~ {endDate}
        </Typography.Text>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: "账单事件总数", value: totalEvents, color: "#1677ff" },
          {
            title: "新增 Tokens（正向）",
            value: fmtTokens(totalCredit),
            color: "#52c41a",
          },
          {
            title: "扣减 Tokens（负向）",
            value: fmtTokens(totalDebit),
            color: "#ff4d4f",
          },
          {
            title: `峰值 ${presetObj.period === "daily" ? "单日" : "单月"}`,
            value: `${peakDay.count} 次`,
            sub: peakDay.period,
            color: "#fa8c16",
          },
        ].map((card, i) => (
          <Col xs={12} sm={6} key={i}>
            <div
              style={{
                background: "#fff",
                padding: 16,
                borderRadius: 8,
                border: "1px solid #f0f0f0",
              }}
            >
              <Statistic
                title={card.title}
                value={card.value}
                valueStyle={{ color: card.color, fontSize: 20 }}
              />
              {"sub" in card && card.sub && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {card.sub}
                </Typography.Text>
              )}
            </div>
          </Col>
        ))}
      </Row>

      {/* Trend Chart */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          marginBottom: 16,
        }}
      >
        <Typography.Text strong style={{ fontSize: 14 }}>
          账单趋势图
          <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            （左轴：事件数，右轴：Token 万）
          </Typography.Text>
        </Typography.Text>
        {trendError && (
          <Alert type="error" message={trendError} style={{ marginTop: 8 }} />
        )}
        <Spin spinning={trendLoading}>
          {chartData.length === 0 && !trendLoading ? (
            <div
              style={{ textAlign: "center", padding: 40, color: "#bbb" }}
            >
              暂无数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={chartData}
                margin={{ top: 16, right: 40, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: "事件数", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: "Token(万)", angle: 90, position: "insideRight", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "creditTokensW" || name === "debitTokensW")
                      return [`${value}万`, name === "creditTokensW" ? "新增Tokens" : "扣减Tokens"];
                    if (name === "count") return [value, "事件数"];
                    if (name === "shopCount") return [value, "活跃商店数"];
                    return [value, name];
                  }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend
                  formatter={(v) => {
                    const map: Record<string, string> = {
                      count: "事件数",
                      creditTokensW: "新增Tokens(万)",
                      debitTokensW: "扣减Tokens(万)",
                      shopCount: "活跃商店数",
                    };
                    return map[v] ?? v;
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="count"
                  fill="#1677ff"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="creditTokensW"
                  stroke="#52c41a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="debitTokensW"
                  stroke="#ff4d4f"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="shopCount"
                  fill="#722ed1"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                  opacity={0.4}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Spin>
      </div>

      {/* Events Table */}
      <div
        style={{
          background: "#fff",
          padding: 16,
          borderRadius: 8,
          border: "1px solid #f0f0f0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Typography.Text strong style={{ fontSize: 14 }}>
            账单明细
          </Typography.Text>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索商店"
            size="small"
            value={shopSearch}
            onChange={(e) => setShopSearch(e.target.value)}
            onPressEnter={() => {
              setEventsPage(1);
              loadEvents(preset, eventTypeFilter, shopSearch, 1);
            }}
            allowClear
            onClear={() => {
              setShopSearch("");
              setEventsPage(1);
              loadEvents(preset, eventTypeFilter, "", 1);
            }}
            style={{ width: 220 }}
          />
        </div>
        {eventsError && (
          <Alert type="error" message={eventsError} style={{ marginBottom: 8 }} />
        )}
        <Spin spinning={eventsLoading}>
          <Table
            dataSource={events}
            columns={eventColumns}
            rowKey={(r, i) => `${r.shop}-${r.createdAt}-${i}`}
            size="small"
            scroll={{ x: 700 }}
            pagination={{
              current: eventsPage,
              pageSize: 50,
              total: eventsTotal,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page) => {
                setEventsPage(page);
                loadEvents(preset, eventTypeFilter, shopSearch, page);
              },
            }}
          />
        </Spin>
      </div>
    </div>
  );
}

// ─── Page Entry ──────────────────────────────────────────────────────────────

export default function Subscriptions() {
  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        App 订阅统计
      </Typography.Title>
      <Tabs
        items={[
          {
            key: "overview",
            label: "订阅概览",
            children: <SubscriptionOverview />,
          },
          {
            key: "billing",
            label: "账单分析",
            children: <BillingAnalytics />,
          },
        ]}
      />
    </div>
  );
}
