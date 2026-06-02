import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Typography,
  Spin,
  Alert,
  Tag,
  Row,
  Col,
  Statistic,
  Select,
  Space,
  Radio,
  Tooltip,
} from "antd";
import { SearchOutlined, InfoCircleOutlined } from "@ant-design/icons";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  fetchRevenueSummary,
  fetchRevenueTrend,
  fetchRevenueCharges,
  type RevenueSummary,
  type RevenueTrendPoint,
  type RevenueCharge,
} from "../api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USD = (n: number, decimals = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const USD_SHORT = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return USD(n);
};

const KIND_COLOR: Record<string, string> = {
  SUBSCRIPTION: "green",
  ONE_TIME_PACK: "orange",
  INTERNAL_TRIAL: "default",
};

const INTERVAL_LABEL: Record<string, string> = {
  MONTHLY: "月付",
  ANNUAL: "年付",
};

const TIME_PRESETS = [
  { label: "最近7天",   value: "7d",  period: "daily"   as const, days: 7   },
  { label: "最近30天",  value: "30d", period: "daily"   as const, days: 30  },
  { label: "最近3个月", value: "3m",  period: "monthly" as const, days: 90  },
  { label: "最近6个月", value: "6m",  period: "monthly" as const, days: 180 },
  { label: "最近12个月",value: "12m", period: "monthly" as const, days: 365 },
];

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function presetDates(value: string) {
  const p = TIME_PRESETS.find((x) => x.value === value) ?? TIME_PRESETS[1];
  return {
    period: p.period,
    startDate: toDateStr(new Date(Date.now() - p.days * 86_400_000)),
    endDate: toDateStr(new Date()),
  };
}

// ─── MRR Summary section ─────────────────────────────────────────────────────

function MrrSummary({ summary }: { summary: RevenueSummary | null }) {
  if (!summary) return <Spin />;

  const cards = [
    {
      title: "MRR",
      hint: "月经常性收入（活跃订阅折算到每月）",
      value: USD_SHORT(summary.mrr),
      color: "#1677ff",
    },
    {
      title: "ARR",
      hint: "年经常性收入（MRR × 12）",
      value: USD_SHORT(summary.arr),
      color: "#722ed1",
    },
    {
      title: "付费用户",
      hint: "当前活跃付费订阅商店数",
      value: summary.payingCustomers,
      color: "#52c41a",
    },
    {
      title: "ARPU",
      hint: "每用户平均月收入",
      value: USD(summary.arpu),
      color: "#fa8c16",
    },
  ];

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      {cards.map((c, i) => (
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
              title={
                <span>
                  {c.title}
                  <Tooltip title={c.hint}>
                    <InfoCircleOutlined
                      style={{ marginLeft: 6, color: "#8c8c8c", fontSize: 12 }}
                    />
                  </Tooltip>
                </span>
              }
              value={c.value}
              valueStyle={{ color: c.color, fontSize: 22 }}
            />
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ─── Plan Breakdown section ───────────────────────────────────────────────────

function PlanBreakdown({ summary }: { summary: RevenueSummary | null }) {
  if (!summary) return null;

  const totalMrr = summary.mrr;

  const columns = [
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string) => <Tag color="purple">{v}</Tag>,
    },
    {
      title: "单价",
      dataIndex: "priceAmount",
      key: "priceAmount",
      render: (v: number, r: (typeof summary.planBreakdown)[0]) => (
        <span>
          <Typography.Text strong>{USD(v)}</Typography.Text>
          {r.billingInterval && (
            <Tag
              color="cyan"
              style={{ marginLeft: 6, fontSize: 11 }}
            >
              {INTERVAL_LABEL[r.billingInterval] ?? r.billingInterval}
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: "活跃用户",
      dataIndex: "activeCount",
      key: "activeCount",
      sorter: (
        a: (typeof summary.planBreakdown)[0],
        b: (typeof summary.planBreakdown)[0],
      ) => a.activeCount - b.activeCount,
      render: (v: number) => <Tag color="green">{v}</Tag>,
    },
    {
      title: "套餐 MRR",
      dataIndex: "planMrr",
      key: "planMrr",
      sorter: (
        a: (typeof summary.planBreakdown)[0],
        b: (typeof summary.planBreakdown)[0],
      ) => a.planMrr - b.planMrr,
      defaultSortOrder: "descend" as const,
      render: (v: number) => (
        <Typography.Text strong style={{ color: "#1677ff" }}>
          {USD(v)}
        </Typography.Text>
      ),
    },
    {
      title: "MRR 占比",
      dataIndex: "planMrr",
      key: "planMrrPct",
      render: (v: number) => {
        const pct = totalMrr > 0 ? (v / totalMrr) * 100 : 0;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                height: 8,
                width: `${Math.max(pct, 2)}%`,
                maxWidth: 120,
                background: "#1677ff",
                borderRadius: 4,
                opacity: 0.7,
              }}
            />
            <span style={{ fontSize: 12, color: "#595959" }}>
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      },
    },
  ];

  return (
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
        套餐 MRR 分布
      </Typography.Text>
      <Table
        dataSource={summary.planBreakdown}
        columns={columns}
        rowKey="planKey"
        size="small"
        pagination={false}
        style={{ marginTop: 8 }}
      />
    </div>
  );
}

// ─── Top Shops section ────────────────────────────────────────────────────────

function TopShops({ summary }: { summary: RevenueSummary | null }) {
  if (!summary) return null;

  return (
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
        Top 10 高价值商店（按月 MRR）
      </Typography.Text>
      <Table
        dataSource={summary.topShops}
        rowKey="shop"
        size="small"
        pagination={false}
        style={{ marginTop: 8 }}
        columns={[
          {
            title: "#",
            key: "rank",
            width: 36,
            render: (_: unknown, __: unknown, i: number) => (
              <Typography.Text type="secondary">{i + 1}</Typography.Text>
            ),
          },
          {
            title: "商店",
            dataIndex: "shop",
            render: (v: string) => (
              <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>
            ),
          },
          {
            title: "App",
            dataIndex: "appName",
            render: (v: string) => <Tag style={{ fontSize: 11 }}>{v}</Tag>,
          },
          {
            title: "套餐",
            dataIndex: "planKey",
            render: (v: string) => <Tag color="purple">{v}</Tag>,
          },
          {
            title: "单价",
            dataIndex: "priceAmount",
            render: (v: number, r: (typeof summary.topShops)[0]) => (
              <span>
                {USD(v)}
                {r.billingInterval && (
                  <span style={{ color: "#8c8c8c", fontSize: 11, marginLeft: 4 }}>
                    / {INTERVAL_LABEL[r.billingInterval] ?? r.billingInterval}
                  </span>
                )}
              </span>
            ),
          },
          {
            title: "月 MRR",
            dataIndex: "shopMrr",
            render: (v: number) => (
              <Typography.Text strong style={{ color: "#52c41a" }}>
                {USD(v)}
              </Typography.Text>
            ),
          },
        ]}
      />
    </div>
  );
}

// ─── Revenue Trend section ────────────────────────────────────────────────────

function RevenueTrend() {
  const [preset, setPreset] = useState("30d");
  const [kindFilter, setKindFilter] = useState<string | undefined>(undefined);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback((p: string, kind?: string) => {
    const { period, startDate, endDate } = presetDates(p);
    setLoading(true);
    setError("");
    fetchRevenueTrend({ period, startDate, endDate, kind })
      .then((r) => setTrend(r.trend))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(preset, kindFilter);
  }, [preset, kindFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalRevenue = trend.reduce((s, r) => s + r.totalRevenue, 0);
  const totalCharges = trend.reduce((s, r) => s + r.chargeCount, 0);
  const peak = trend.reduce(
    (max, r) => (r.totalRevenue > max.totalRevenue ? r : max),
    { period: "—", totalRevenue: 0 } as RevenueTrendPoint,
  );

  const { startDate, endDate } = presetDates(preset);

  return (
    <div
      style={{
        background: "#fff",
        padding: 16,
        borderRadius: 8,
        border: "1px solid #f0f0f0",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Typography.Text strong style={{ fontSize: 14 }}>
          收入趋势
        </Typography.Text>
        <Space wrap size="small">
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
            placeholder="收入类型"
            allowClear
            size="small"
            style={{ width: 150 }}
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: "SUBSCRIPTION", label: "订阅收入" },
              { value: "ONE_TIME_PACK", label: "Credit 包" },
            ]}
          />
        </Space>
      </div>

      {/* Period summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { label: `区间总收入`, value: USD_SHORT(totalRevenue), color: "#1677ff" },
          { label: "计费次数", value: totalCharges, color: "#595959" },
          { label: `峰值 (${peak.period})`, value: USD(peak.totalRevenue), color: "#fa8c16" },
        ].map((c, i) => (
          <Col key={i}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>{c.label}</span>}
              value={c.value}
              valueStyle={{ color: c.color, fontSize: 18 }}
            />
          </Col>
        ))}
        <Col flex="auto" style={{ textAlign: "right" }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {startDate} ~ {endDate}
          </Typography.Text>
        </Col>
      </Row>

      {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} />}
      <Spin spinning={loading}>
        {trend.length === 0 && !loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}>
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={trend}
              margin={{ top: 8, right: 40, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                formatter={(value: number, name: string) => {
                  if (name === "subscriptionRevenue") return [USD(value), "订阅收入"];
                  if (name === "packRevenue") return [USD(value), "Token包收入"];
                  if (name === "totalRevenue") return [USD(value), "总收入"];
                  if (name === "chargeCount") return [value, "计费次数"];
                  if (name === "shopCount") return [value, "付费商店数"];
                  return [value, name];
                }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend
                formatter={(v) => {
                  const m: Record<string, string> = {
                    subscriptionRevenue: "订阅收入",
                    packRevenue: "Token包收入",
                    chargeCount: "计费次数",
                    shopCount: "付费商店数",
                  };
                  return m[v] ?? v;
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="subscriptionRevenue"
                stackId="rev"
                fill="#1677ff"
                radius={[0, 0, 0, 0]}
                maxBarSize={48}
              />
              <Bar
                yAxisId="left"
                dataKey="packRevenue"
                stackId="rev"
                fill="#fa8c16"
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="chargeCount"
                stroke="#722ed1"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Spin>
    </div>
  );
}

// ─── Charges List section ─────────────────────────────────────────────────────

function ChargesList() {
  const [preset, setPreset] = useState("30d");
  const [kindFilter, setKindFilter] = useState<string | undefined>(undefined);
  const [shopSearch, setShopSearch] = useState("");
  const [charges, setCharges] = useState<RevenueCharge[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    (p: string, kind: string | undefined, shop: string, pg: number) => {
      const { startDate, endDate } = presetDates(p);
      setLoading(true);
      setError("");
      fetchRevenueCharges({
        startDate,
        endDate,
        kind,
        shop: shop || undefined,
        page: pg,
        pageSize: 50,
      })
        .then((r) => {
          setCharges(r.charges);
          setTotal(r.total);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    setPage(1);
    load(preset, kindFilter, shopSearch, 1);
  }, [preset, kindFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
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
      title: "事件",
      dataIndex: "eventType",
      key: "eventType",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string) => <Tag color="purple">{v}</Tag>,
    },
    {
      title: "类型",
      dataIndex: "kind",
      key: "kind",
      render: (v: string) => (
        <Tag color={KIND_COLOR[v] ?? "default"} style={{ fontSize: 11 }}>
          {v === "SUBSCRIPTION" ? "订阅" : v === "ONE_TIME_PACK" ? "Token包" : v}
        </Tag>
      ),
    },
    {
      title: "计费周期",
      dataIndex: "billingInterval",
      key: "billingInterval",
      render: (v: string | null) =>
        v ? (
          <Tag color="cyan" style={{ fontSize: 11 }}>
            {INTERVAL_LABEL[v] ?? v}
          </Tag>
        ) : (
          <span style={{ color: "#ccc" }}>—</span>
        ),
    },
    {
      title: "金额 (USD)",
      dataIndex: "priceAmount",
      key: "priceAmount",
      sorter: (a: RevenueCharge, b: RevenueCharge) => a.priceAmount - b.priceAmount,
      render: (v: number) => (
        <Typography.Text strong style={{ color: "#52c41a" }}>
          {USD(v)}
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
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Typography.Text strong style={{ fontSize: 14 }}>
          账单收入明细
        </Typography.Text>
        <Space wrap size="small">
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
            placeholder="收入类型"
            allowClear
            size="small"
            style={{ width: 130 }}
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: "SUBSCRIPTION", label: "订阅" },
              { value: "ONE_TIME_PACK", label: "Token包" },
            ]}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索商店"
            size="small"
            value={shopSearch}
            onChange={(e) => setShopSearch(e.target.value)}
            onPressEnter={() => {
              setPage(1);
              load(preset, kindFilter, shopSearch, 1);
            }}
            allowClear
            onClear={() => {
              setShopSearch("");
              setPage(1);
              load(preset, kindFilter, "", 1);
            }}
            style={{ width: 200 }}
          />
        </Space>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} />}
      <Spin spinning={loading}>
        <Table
          dataSource={charges}
          columns={columns}
          rowKey={(r, i) => `${r.shop}-${r.createdAt}-${i}`}
          size="small"
          scroll={{ x: 800 }}
          pagination={{
            current: page,
            pageSize: 50,
            total,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (pg) => {
              setPage(pg);
              load(preset, kindFilter, shopSearch, pg);
            },
          }}
        />
      </Spin>
    </div>
  );
}

// ─── Page Entry ──────────────────────────────────────────────────────────────

export default function Revenue() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    fetchRevenueSummary()
      .then(setSummary)
      .catch((e) => setSummaryError(String(e)))
      .finally(() => setSummaryLoading(false));
  }, []);

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        收入分析
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 20, fontSize: 12 }}>
        基于 PlanCatalog 定价与 BillingLog 账单事件计算，单位美元（USD）
      </Typography.Text>

      {summaryError && (
        <Alert type="error" message={summaryError} style={{ marginBottom: 16 }} />
      )}

      <Spin spinning={summaryLoading}>
        <MrrSummary summary={summary} />
      </Spin>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <PlanBreakdown summary={summary} />
        </Col>
        <Col xs={24} lg={10}>
          <TopShops summary={summary} />
        </Col>
      </Row>

      <RevenueTrend />
      <ChargesList />
    </div>
  );
}
