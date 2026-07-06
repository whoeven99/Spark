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
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  fetchTsfSubscriptions,
  type TsfSubscriptionsData,
  type TsfSubscriptionRow,
} from "../../api";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "green",
  PENDING: "gold",
  FROZEN: "blue",
  EXPIRED: "default",
  CANCELLED: "red",
};

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
        TSF 订阅统计
      </Typography.Title>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError("")} />}

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
