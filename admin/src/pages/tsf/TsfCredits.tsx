import { useCallback, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined, SearchOutlined, WalletOutlined } from "@ant-design/icons";
import {
  fetchTsfCredits,
  type TsfCreditsBillingLog,
  type TsfCreditsData,
  type TsfCreditsPackPurchase,
  type TsfCreditsPeriodHistory,
} from "../../api";

function usageColor(pct: number): string {
  if (pct >= 90) return "#ff4d4f";
  if (pct >= 70) return "#faad14";
  return "#52c41a";
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("zh-CN");
}

export default function TsfCredits() {
  const [shopInput, setShopInput] = useState("");
  const [data, setData] = useState<TsfCreditsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const load = useCallback((shop: string) => {
    const trimmed = shop.trim();
    if (!trimmed) {
      setError("请输入商店域名");
      return;
    }
    setLoading(true);
    setError("");
    setSearched(true);
    fetchTsfCredits(trimmed)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  const account = data?.account ?? null;

  const packColumns = [
    {
      title: "流量包",
      key: "pack",
      render: (_: unknown, r: TsfCreditsPackPurchase) => (
        <div>
          <Tag color="orange">{r.displayName ?? r.planKey ?? "-"}</Tag>
          {r.planKey && r.displayName && (
            <Typography.Text type="secondary" style={{ fontSize: 11, display: "block" }}>
              {r.planKey}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: "Credits 到账",
      dataIndex: "creditsDelta",
      key: "creditsDelta",
      render: (v: number) => (
        <Typography.Text strong style={{ color: "#1677ff" }}>
          +{v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "金额",
      key: "price",
      render: (_: unknown, r: TsfCreditsPackPurchase) =>
        r.priceAmount > 0 ? `${r.currencyCode} ${r.priceAmount}` : "-",
    },
    {
      title: "参考单号",
      dataIndex: "referenceId",
      key: "referenceId",
      render: (v: string | null) =>
        v ? (
          <Typography.Text copyable style={{ fontSize: 12 }}>
            {v}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
    {
      title: "购买时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDate(v)}
        </Typography.Text>
      ),
    },
  ];

  const billingColumns = [
    {
      title: "事件",
      dataIndex: "eventType",
      key: "eventType",
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "Credits 变动",
      dataIndex: "creditsDelta",
      key: "creditsDelta",
      render: (v: number) => (
        <Typography.Text type={v >= 0 ? "success" : "danger"}>
          {v >= 0 ? "+" : ""}
          {v.toLocaleString()}
        </Typography.Text>
      ),
    },
    {
      title: "当时已用",
      dataIndex: "usedCredits",
      key: "usedCredits",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDate(v)}
        </Typography.Text>
      ),
    },
  ];

  const historyColumns = [
    {
      title: "周期",
      key: "period",
      render: (_: unknown, r: TsfCreditsPeriodHistory) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {fmtDate(r.periodStart)} ~ {fmtDate(r.periodEnd)}
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
      title: "已用",
      dataIndex: "usedCredits",
      key: "usedCredits",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "订阅分配",
      dataIndex: "subscriptionCreditsAllocated",
      key: "subscriptionCreditsAllocated",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "加购剩余",
      dataIndex: "purchasedCreditsRemaining",
      key: "purchasedCreditsRemaining",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "归档时间",
      dataIndex: "archivedAt",
      key: "archivedAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDate(v)}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 8 }}>
        <WalletOutlined style={{ marginRight: 8 }} />
        用户额度查询
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        按商店域名查询 TSF Turso 中的当前额度、加购积分与计费流水。
      </Typography.Paragraph>

      {error && (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError("")}
        />
      )}

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="商店域名，如 example 或 example.myshopify.com"
          value={shopInput}
          onChange={(e) => setShopInput(e.target.value)}
          onPressEnter={() => load(shopInput)}
          allowClear
          style={{ width: 360 }}
        />
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => load(shopInput)}>
          查询
        </Button>
        <Button
          icon={<ReloadOutlined />}
          disabled={!shopInput.trim()}
          loading={loading}
          onClick={() => load(shopInput)}
        >
          刷新
        </Button>
      </Space>

      <Spin spinning={loading}>
        {!searched ? (
          <Empty description="输入商店域名后点击查询" />
        ) : !account ? (
          <Alert
            type="warning"
            showIcon
            message={`未找到账户：${data?.queriedShop ?? shopInput}`}
            description="该商店在 TSF Turso Account 表中无记录（可能尚未成为 TSF 新用户账本）。"
          />
        ) : (
          <>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                <Descriptions.Item label="商店">
                  <Typography.Text copyable>{account.shop}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {account.installed ? (
                    <Tag color="green">在装</Tag>
                  ) : (
                    <Tag color="volcano">已卸载</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="套餐">
                  {account.planKey ? <Tag color="blue">{account.planKey}</Tag> : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="订阅状态">
                  {account.subStatus ? (
                    <Tag color={account.subStatus === "ACTIVE" ? "green" : "default"}>
                      {account.subStatus}
                    </Tag>
                  ) : (
                    "-"
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="计费周期">{account.billingInterval ?? "-"}</Descriptions.Item>
                <Descriptions.Item label="周期结束">{fmtDate(account.currentPeriodEnd)}</Descriptions.Item>
                <Descriptions.Item label="注册时间">{fmtDate(account.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="额度更新">{fmtDate(account.updatedAt)}</Descriptions.Item>
                <Descriptions.Item label="试用结束">{fmtDate(account.trialEndsAt)}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="剩余 Credits" value={account.remainingCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="已用 Credits" value={account.usedCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="总量 Credits" value={account.totalCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card>
                  <Statistic title="使用率" value={account.usagePercent} suffix="%" />
                  <Progress
                    percent={account.usagePercent}
                    size="small"
                    strokeColor={usageColor(account.usagePercent)}
                    showInfo={false}
                    style={{ marginTop: 8 }}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title="订阅额度" value={account.subscriptionCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title="加购额度" value={account.purchasedCredits} />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title="试用额度" value={account.trialCredits} />
                </Card>
              </Col>
            </Row>

            <Card
              title="加购流量包"
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  共 {data?.packStats.totalPurchases ?? 0} 笔 · 累计 +
                  {(data?.packStats.totalCreditsGranted ?? 0).toLocaleString()} Credits
                </Typography.Text>
              }
            >
              <Table<TsfCreditsPackPurchase>
                dataSource={data?.packPurchases ?? []}
                columns={packColumns}
                rowKey={(r, i) => `${r.referenceId ?? r.createdAt}-${i}`}
                size="small"
                pagination={false}
                locale={{ emptyText: "无加购记录" }}
              />
            </Card>

            <Card title="计费流水（最近 100 条）" size="small" style={{ marginBottom: 16 }}>
              <Table<TsfCreditsBillingLog>
                dataSource={data?.billingLogs ?? []}
                columns={billingColumns}
                rowKey={(r, i) => `${r.eventType}-${r.createdAt}-${i}`}
                size="small"
                pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                locale={{ emptyText: "无计费流水" }}
              />
            </Card>

            <Card title="周期用量归档" size="small">
              <Table<TsfCreditsPeriodHistory>
                dataSource={data?.periodHistory ?? []}
                columns={historyColumns}
                rowKey={(r, i) => `${r.periodEnd}-${i}`}
                size="small"
                pagination={false}
                locale={{ emptyText: "暂无归档记录" }}
              />
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
}
