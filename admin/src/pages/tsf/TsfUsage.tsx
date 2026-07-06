import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table,
  Input,
  Tag,
  Typography,
  Spin,
  Alert,
  Space,
  Button,
  Progress,
  Row,
  Col,
  Card,
  Statistic,
  Drawer,
  Timeline,
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  fetchTsfUsage,
  fetchTsfUsageHistory,
  type TsfUsageRow,
  type TsfUsageHistoryRow,
} from "../../api";

function usageColor(pct: number): string {
  if (pct >= 90) return "#ff4d4f";
  if (pct >= 70) return "#faad14";
  return "#52c41a";
}

export default function TsfUsage() {
  const [usage, setUsage] = useState<TsfUsageRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeShop, setActiveShop] = useState<string | null>(null);
  const [history, setHistory] = useState<TsfUsageHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback((keyword?: string) => {
    setLoading(true);
    fetchTsfUsage(keyword)
      .then((r) => setUsage(r.usage))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openHistory(shop: string) {
    setActiveShop(shop);
    setHistory([]);
    setHistoryLoading(true);
    fetchTsfUsageHistory(shop)
      .then((r) => setHistory(r.history))
      .catch((e) => setError(String(e)))
      .finally(() => setHistoryLoading(false));
  }

  const totals = useMemo(() => {
    return usage.reduce(
      (acc, r) => {
        acc.used += r.usedCredits;
        acc.remaining += r.remainingCredits;
        return acc;
      },
      { used: 0, remaining: 0 },
    );
  }, [usage]);

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Link onClick={() => openHistory(v)} style={{ fontSize: 13 }}>
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
    },
    {
      title: "使用率",
      key: "usagePercent",
      width: 200,
      render: (_: unknown, r: TsfUsageRow) => (
        <Progress
          percent={r.usagePercent}
          size="small"
          strokeColor={usageColor(r.usagePercent)}
        />
      ),
    },
    {
      title: "已用 / 总量",
      key: "credits",
      render: (_: unknown, r: TsfUsageRow) => (
        <span>
          {r.usedCredits.toLocaleString()} / {r.totalCredits.toLocaleString()}
        </span>
      ),
    },
    {
      title: "剩余",
      dataIndex: "remainingCredits",
      key: "remainingCredits",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v ? new Date(v).toLocaleString("zh-CN") : "-"}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        TSF Credits 用量
      </Typography.Title>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError("")} />}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card><Statistic title="新用户数（有账户）" value={usage.length} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="累计已用 Credits" value={totals.used.toLocaleString()} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="剩余 Credits 合计" value={totals.remaining.toLocaleString()} /></Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="商店域名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => load(search.trim() || undefined)}
          allowClear
          style={{ width: 260 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => load(search.trim() || undefined)}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => load(search.trim() || undefined)}>
          刷新
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Table
          dataSource={usage}
          columns={columns}
          rowKey="shop"
          size="small"
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个账户` }}
        />
      </Spin>

      <Drawer
        title={`${activeShop ?? ""} — 周期用量历史`}
        width={520}
        open={!!activeShop}
        onClose={() => setActiveShop(null)}
      >
        {historyLoading ? (
          <Spin />
        ) : history.length === 0 ? (
          <Typography.Text type="secondary">暂无归档记录</Typography.Text>
        ) : (
          <Timeline
            items={history.map((h) => ({
              children: (
                <div>
                  <Typography.Text strong>{h.planKey}</Typography.Text>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {new Date(h.periodStart).toLocaleDateString("zh-CN")} ~{" "}
                    {new Date(h.periodEnd).toLocaleDateString("zh-CN")}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    已用 {h.usedCredits.toLocaleString()} / 配额{" "}
                    {h.subscriptionCreditsAllocated.toLocaleString()}
                  </div>
                </div>
              ),
            }))}
          />
        )}
      </Drawer>
    </div>
  );
}
