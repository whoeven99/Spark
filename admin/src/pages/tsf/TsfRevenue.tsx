import { useCallback, useEffect, useState } from "react";
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
  Card,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
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
  fetchTsfRevenueSummary,
  fetchTsfRevenueTrend,
  fetchTsfRevenueCharges,
  type TsfRevenueSummary,
  type TsfRevenueTrendPoint,
  type TsfRevenueCharge,
} from "../../api";

const USD = (n: number, decimals = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const KIND_COLOR: Record<string, string> = {
  SUBSCRIPTION: "green",
  ONE_TIME_PACK: "orange",
};

const INTERVAL_LABEL: Record<string, string> = {
  MONTHLY: "月付",
  ANNUAL: "年付",
};

const TIME_PRESETS = [
  { label: "最近7天", value: "7d", period: "daily" as const, days: 7 },
  { label: "最近30天", value: "30d", period: "daily" as const, days: 30 },
  { label: "最近3个月", value: "3m", period: "monthly" as const, days: 90 },
  { label: "最近6个月", value: "6m", period: "monthly" as const, days: 180 },
  { label: "最近12个月", value: "12m", period: "monthly" as const, days: 365 },
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

function fillDailyGaps(
  trend: TsfRevenueTrendPoint[],
  startDate: string,
  endDate: string,
  period: "daily" | "monthly",
): TsfRevenueTrendPoint[] {
  if (period !== "daily") return trend;
  const byDay = new Map(trend.map((r) => [r.period, r]));
  const out: TsfRevenueTrendPoint[] = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push(
      byDay.get(key) ?? {
        period: key,
        chargeCount: 0,
        shopCount: 0,
        totalRevenue: 0,
        subscriptionRevenue: 0,
        packRevenue: 0,
      },
    );
  }
  return out;
}

function MrrCards({ summary }: { summary: TsfRevenueSummary }) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="月经常性收入" value={USD(summary.mrr)} valueStyle={{ color: "#1677ff", fontSize: 22 }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="年经常性收入" value={USD(summary.arr)} valueStyle={{ color: "#722ed1", fontSize: 22 }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="付费用户" value={summary.payingCustomers} valueStyle={{ fontSize: 22 }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="人均月收入" value={USD(summary.arpu)} valueStyle={{ fontSize: 22 }} />
        </Card>
      </Col>
    </Row>
  );
}

function DailyRevenueTrend() {
  const [preset, setPreset] = useState("30d");
  const [kindFilter, setKindFilter] = useState<string | undefined>(undefined);
  const [trend, setTrend] = useState<TsfRevenueTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback((p: string, kind?: string) => {
    const { period, startDate, endDate } = presetDates(p);
    setLoading(true);
    setError("");
    fetchTsfRevenueTrend({ period, startDate, endDate, kind })
      .then((r) => setTrend(fillDailyGaps(r.trend, startDate, endDate, period)))
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
    { period: "—", totalRevenue: 0 } as TsfRevenueTrendPoint,
  );
  const today = trend[trend.length - 1];
  const { startDate, endDate } = presetDates(preset);

  return (
    <Card
      title="每日收入"
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {startDate} ~ {endDate} · Shopify 扣款日
        </Typography.Text>
      }
    >
      <Space wrap style={{ marginBottom: 12 }}>
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
          style={{ width: 140 }}
          value={kindFilter}
          onChange={(v) => setKindFilter(v)}
          options={[
            { value: "SUBSCRIPTION", label: "订阅收入" },
            { value: "ONE_TIME_PACK", label: "加量包收入" },
          ]}
        />
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}

      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6}>
          <Statistic title="区间总收入" value={USD(totalRevenue)} valueStyle={{ color: "#1677ff", fontSize: 18 }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="收费笔数" value={totalCharges} valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title={preset.endsWith("d") ? "今日收入" : "最近一期"}
            value={USD(today?.totalRevenue ?? 0)}
            valueStyle={{ color: "#52c41a", fontSize: 18 }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title={`峰值 ${peak.period}`}
            value={USD(peak.totalRevenue)}
            valueStyle={{ color: "#fa8c16", fontSize: 18 }}
          />
        </Col>
      </Row>

      <Spin spinning={loading}>
        {trend.length === 0 && !loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#bbb" }}>暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={trend} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                formatter={(value: number, name: string) => {
                  if (name === "subscriptionRevenue") return [USD(value), "订阅"];
                  if (name === "packRevenue") return [USD(value), "加量包"];
                  if (name === "totalRevenue") return [USD(value), "合计"];
                  if (name === "shopCount") return [value, "商店数"];
                  return [value, name];
                }}
              />
              <Legend
                formatter={(v) =>
                  ({
                    subscriptionRevenue: "订阅收入",
                    packRevenue: "加量包收入",
                    totalRevenue: "合计",
                    shopCount: "商店数",
                  }[v] ?? v)
                }
              />
              <Bar yAxisId="left" dataKey="subscriptionRevenue" stackId="rev" fill="#1677ff" maxBarSize={36} />
              <Bar yAxisId="left" dataKey="packRevenue" stackId="rev" fill="#fa8c16" radius={[3, 3, 0, 0]} maxBarSize={36} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="shopCount"
                stroke="#722ed1"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Spin>
    </Card>
  );
}

function ChargesList() {
  const [preset, setPreset] = useState("30d");
  const [kindFilter, setKindFilter] = useState<string | undefined>(undefined);
  const [shopSearch, setShopSearch] = useState("");
  const [charges, setCharges] = useState<TsfRevenueCharge[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback((p: string, kind: string | undefined, shop: string, pg: number) => {
    const { startDate, endDate } = presetDates(p);
    setLoading(true);
    setError("");
    fetchTsfRevenueCharges({
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
  }, []);

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
        <Typography.Text copyable style={{ fontSize: 12 }}>
          {v}
        </Typography.Text>
      ),
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
        <Tag color={KIND_COLOR[v] ?? "default"}>
          {v === "SUBSCRIPTION" ? "订阅" : v === "ONE_TIME_PACK" ? "加量包" : v}
        </Tag>
      ),
    },
    {
      title: "周期",
      dataIndex: "billingInterval",
      key: "billingInterval",
      render: (v: string | null) => (v ? INTERVAL_LABEL[v] ?? v : "—"),
    },
    {
      title: "金额",
      dataIndex: "priceAmount",
      key: "priceAmount",
      sorter: (a: TsfRevenueCharge, b: TsfRevenueCharge) => a.priceAmount - b.priceAmount,
      render: (v: number) => (
        <Typography.Text strong style={{ color: "#52c41a" }}>
          {USD(v)}
        </Typography.Text>
      ),
    },
    {
      title: "Shopify 扣款日 (UTC)",
      dataIndex: "shopifyChargedAt",
      key: "shopifyChargedAt",
      render: (v: string, row: TsfRevenueCharge) => {
        const chargeDay = new Date(v).toISOString().slice(0, 10);
        const bookedDay = new Date(row.createdAt).toISOString().slice(0, 10);
        return (
          <div>
            <Typography.Text style={{ fontSize: 12 }}>
              {new Date(v).toLocaleString("zh-CN", { timeZone: "UTC" })}
            </Typography.Text>
            {chargeDay !== bookedDay && (
              <Typography.Text type="secondary" style={{ display: "block", fontSize: 11 }}>
                入账 {new Date(row.createdAt).toLocaleString("zh-CN", { timeZone: "UTC" })}
              </Typography.Text>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Card title="收费明细" size="small">
      <Space wrap style={{ marginBottom: 12 }}>
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
          style={{ width: 140 }}
          value={kindFilter}
          onChange={(v) => setKindFilter(v)}
          options={[
            { value: "SUBSCRIPTION", label: "订阅收入" },
            { value: "ONE_TIME_PACK", label: "加量包收入" },
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
          style={{ width: 200 }}
        />
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} />}

      <Spin spinning={loading}>
        <Table
          dataSource={charges}
          columns={columns}
          rowKey={(r, i) => `${r.shop}-${r.shopifyChargedAt}-${r.eventType}-${i}`}
          size="small"
          pagination={{
            current: page,
            pageSize: 50,
            total,
            showTotal: (t) => `共 ${t} 笔`,
            onChange: (pg) => {
              setPage(pg);
              load(preset, kindFilter, shopSearch, pg);
            },
          }}
        />
      </Spin>
    </Card>
  );
}

export default function TsfRevenue() {
  const [summary, setSummary] = useState<TsfRevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTsfRevenueSummary()
      .then(setSummary)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        翻译 收入
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16, fontSize: 12 }}>
        翻译 App Turso 账本；续费按 Shopify 扣款/周期滚动日统计，金额来自 PlanCatalog（USD）。仅 owner 可见。
      </Typography.Text>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>{summary && <MrrCards summary={summary} />}</Spin>

      {summary && summary.planBreakdown.length > 0 && (
        <Card title="套餐月经常性收入分布" size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            {summary.planBreakdown.map((p) => (
              <Tag key={p.planKey} color="blue">
                {p.planKey}：{p.activeCount} 家 · 月经常性收入 {USD(p.planMrr)}
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      <DailyRevenueTrend />
      <ChargesList />
    </div>
  );
}
