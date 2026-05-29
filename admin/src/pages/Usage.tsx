import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Input,
  Progress,
  Typography,
  Spin,
  Alert,
  Tag,
  Drawer,
  Timeline,
  Badge,
  Row,
  Col,
  Statistic,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { fetchUsage, fetchUsageHistory, type UsageRow } from "../api";

export default function Usage() {
  const [data, setData] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UsageRow | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const load = useCallback((q: string) => {
    setLoading(true);
    fetchUsage(q || undefined)
      .then((r) => setData(r.usage))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setHistLoading(true);
    fetchUsageHistory(selected.shop)
      .then((r) => setHistory(r.history as Record<string, unknown>[]))
      .finally(() => setHistLoading(false));
  }, [selected]);

  const totalUsed = data.reduce((s, r) => s + r.usedTokens, 0);
  const totalRemaining = data.reduce((s, r) => s + r.remainingTokens, 0);

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string, r: UsageRow) => (
        <Typography.Link
          style={{ fontSize: 13 }}
          onClick={() => setSelected(r)}
        >
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
      render: (v: string | null, r: UsageRow) => (
        <span>
          {v ?? "-"}
          {r.subStatus && (
            <Badge
              status={r.subStatus === "ACTIVE" ? "success" : "default"}
              style={{ marginLeft: 8 }}
            />
          )}
        </span>
      ),
    },
    {
      title: "已用 Tokens",
      dataIndex: "usedTokens",
      key: "usedTokens",
      sorter: (a: UsageRow, b: UsageRow) => a.usedTokens - b.usedTokens,
      render: (v: number) => (
        <Typography.Text strong>{v.toLocaleString()}</Typography.Text>
      ),
    },
    {
      title: "剩余 Tokens",
      dataIndex: "remainingTokens",
      key: "remainingTokens",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "总量",
      dataIndex: "totalTokens",
      key: "totalTokens",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "使用率",
      dataIndex: "usagePercent",
      key: "usagePercent",
      sorter: (a: UsageRow, b: UsageRow) => a.usagePercent - b.usagePercent,
      defaultSortOrder: "descend" as const,
      render: (v: number) => (
        <Progress
          percent={v}
          size="small"
          status={v >= 90 ? "exception" : v >= 70 ? "active" : "success"}
          style={{ minWidth: 100 }}
        />
      ),
    },
    {
      title: "周期结束",
      dataIndex: "currentPeriodEnd",
      key: "currentPeriodEnd",
      render: (v: string | null) =>
        v ? (
          <Typography.Text style={{ fontSize: 12 }}>
            {new Date(v).toLocaleDateString("zh-CN")}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
  ];

  if (error) return <Alert type="error" message={error} />;

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        用量统计
      </Typography.Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <div
            style={{
              background: "#fff",
              padding: 16,
              borderRadius: 8,
              border: "1px solid #f0f0f0",
            }}
          >
            <Statistic
              title="全部商店已用 Tokens（本期汇总）"
              value={totalUsed.toLocaleString()}
              valueStyle={{ color: "#1677ff" }}
            />
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div
            style={{
              background: "#fff",
              padding: 16,
              borderRadius: 8,
              border: "1px solid #f0f0f0",
            }}
          >
            <Statistic
              title="全部商店剩余 Tokens"
              value={totalRemaining.toLocaleString()}
              valueStyle={{ color: "#52c41a" }}
            />
          </div>
        </Col>
      </Row>

      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索商店域名"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onPressEnter={() => load(search)}
        allowClear
        onClear={() => {
          setSearch("");
          load("");
        }}
        style={{ marginBottom: 16, maxWidth: 320 }}
      />

      <Spin spinning={loading}>
        <Table
          dataSource={data}
          columns={columns}
          rowKey={(r) => `${r.shop}-${r.appName}`}
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Spin>

      <Drawer
        title={`${selected?.shop ?? ""} — 历史周期`}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={480}
      >
        {histLoading ? (
          <Spin />
        ) : (
          <Timeline
            items={history.map((h, i) => ({
              key: i,
              color: "blue",
              children: (
                <div>
                  <Typography.Text strong>
                    {h.planKey as string}
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(h.periodStart as string).toLocaleDateString(
                      "zh-CN",
                    )}{" "}
                    →{" "}
                    {new Date(h.periodEnd as string).toLocaleDateString(
                      "zh-CN",
                    )}
                  </Typography.Text>
                  <br />
                  <Typography.Text>
                    已用:{" "}
                    <strong>
                      {Number(h.usedTokens).toLocaleString()}
                    </strong>{" "}
                    / 配额:{" "}
                    {Number(h.subscriptionTokensAllocated).toLocaleString()}
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
