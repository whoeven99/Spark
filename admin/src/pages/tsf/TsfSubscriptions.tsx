import { useCallback, useEffect, useState } from "react";
import {
  Table,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Space,
  Button,
  Row,
  Col,
  Card,
  Statistic,
  Select,
  Radio,
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  fetchTsfSubscriptions,
  fetchTsfRenewals,
  type TsfSubscriptionsData,
  type TsfSubscriptionRow,
  type TsfRenewalsData,
  type TsfRenewalEventRow,
} from "../../api";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "green",
  PENDING: "gold",
  FROZEN: "blue",
  EXPIRED: "default",
  CANCELLED: "red",
};

const DAY_PRESETS = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
];

function RenewalSection() {
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TsfRenewalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchTsfRenewals({ days, page, pageSize: 50 })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [days, page]);

  useEffect(() => {
    load();
  }, [load]);

  const eventColumns = [
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
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
    },
    {
      title: "Credits 入账",
      dataIndex: "creditsDelta",
      key: "creditsDelta",
      render: (v: number) => (
        <Typography.Text style={{ color: v > 0 ? "#52c41a" : undefined }}>
          {v > 0 ? "+" : ""}
          {v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "续费时间 (UTC)",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC
        </Typography.Text>
      ),
    },
  ];

  return (
    <Card
      title="每日续费"
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Space>
          <Radio.Group
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setPage(1);
            }}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            {DAY_PRESETS.map((p) => (
              <Radio.Button key={p.value} value={p.value}>
                {p.label}
              </Radio.Button>
            ))}
          </Radio.Group>
          <Button size="small" icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
        </Space>
      }
    >
      <Typography.Text
        type="secondary"
        style={{ display: "block", marginBottom: 12, fontSize: 12 }}
      >
        统计 BillingLog 中 eventType = SUBSCRIPTION_RENEWED 的商店数（含 webhook 与 Worker 对账入账），按 UTC 日切。
      </Typography.Text>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 12 }} closable onClose={() => setError("")} />
      )}

      <Spin spinning={loading}>
        {data && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6}>
                <Statistic
                  title="今日续费商店"
                  value={data.summary.todayShops}
                  suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>({data.summary.todayEvents} 笔)</Typography.Text>}
                  valueStyle={{ color: "#1677ff" }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="昨日续费商店"
                  value={data.summary.yesterdayShops}
                  suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>({data.summary.yesterdayEvents} 笔)</Typography.Text>}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="近 7 天续费商店"
                  value={data.summary.last7Shops}
                  suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>({data.summary.last7Events} 笔)</Typography.Text>}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="近 30 天续费商店"
                  value={data.summary.last30Shops}
                  suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>({data.summary.last30Events} 笔)</Typography.Text>}
                />
              </Col>
            </Row>

            <div style={{ width: "100%", height: 260, marginBottom: 16 }}>
              <Typography.Text strong style={{ fontSize: 13 }}>
                每日续费商店数
              </Typography.Text>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={data.daily} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      value,
                      name === "shopCount" ? "续费商店数" : "续费笔数",
                    ]}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="shopCount" fill="#1677ff" radius={[3, 3, 0, 0]} maxBarSize={36} name="shopCount" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Typography.Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
              续费明细
            </Typography.Text>
            <Table
              dataSource={data.events}
              columns={eventColumns}
              rowKey={(r: TsfRenewalEventRow) => `${r.shop}-${r.createdAt}`}
              size="small"
              pagination={{
                current: page,
                pageSize: 50,
                total: data.total,
                showTotal: (t) => `共 ${t} 笔续费`,
                onChange: (p) => setPage(p),
              }}
            />
          </>
        )}
      </Spin>
    </Card>
  );
}

export default function TsfSubscriptions() {
  const [data, setData] = useState<TsfSubscriptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(() => {
    setLoading(true);
    fetchTsfSubscriptions({
      search: search.trim() || undefined,
      status: statusFilter || undefined,
    })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

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
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (v: string) => <Tag color={STATUS_COLORS[v] ?? "default"}>{v}</Tag>,
    },
    {
      title: "计费周期",
      dataIndex: "billingInterval",
      key: "billingInterval",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "本期已用 Credits",
      dataIndex: "usedCredits",
      key: "usedCredits",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "周期结束",
      dataIndex: "currentPeriodEnd",
      key: "currentPeriodEnd",
      render: (v: string | null) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v ? new Date(v).toLocaleDateString("zh-CN") : "-"}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        翻译 订阅统计
      </Typography.Title>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError("")} />}

      <RenewalSection />

      {data && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card><Statistic title="订阅总数" value={data.stats.total} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card><Statistic title="活跃订阅" value={data.stats.byStatus.ACTIVE ?? 0} valueStyle={{ color: "#52c41a" }} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card><Statistic title="30 天内到期" value={data.stats.expiringSoon} valueStyle={{ color: "#faad14" }} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card><Statistic title="已取消" value={data.stats.byStatus.CANCELLED ?? 0} valueStyle={{ color: "#ff4d4f" }} /></Card>
          </Col>
        </Row>
      )}

      {data && data.stats.byPlan.length > 0 && (
        <Card title="套餐分布" size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            {data.stats.byPlan.map((p) => (
              <Tag key={p.planKey ?? "none"} color="blue">
                {p.planKey ?? "无套餐"}：{p.activeCount} 活跃 / {p.total} 总
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      <Space style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="商店域名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={load}
          allowClear
          style={{ width: 240 }}
        />
        <Select
          placeholder="状态"
          value={statusFilter || undefined}
          onChange={(v) => setStatusFilter(v ?? "")}
          allowClear
          style={{ width: 150 }}
          options={[
            { value: "ACTIVE", label: "ACTIVE" },
            { value: "PENDING", label: "PENDING" },
            { value: "FROZEN", label: "FROZEN" },
            { value: "EXPIRED", label: "EXPIRED" },
            { value: "CANCELLED", label: "CANCELLED" },
          ]}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Table
          dataSource={data?.subscriptions ?? []}
          columns={columns}
          rowKey={(r: TsfSubscriptionRow) => r.shop}
          size="small"
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条订阅` }}
        />
      </Spin>
    </div>
  );
}
