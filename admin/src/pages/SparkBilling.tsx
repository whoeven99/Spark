import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  fetchSparkBillingLedger,
  fetchSparkBillingOverview,
  type SparkBillingLowBalanceShop,
  type SparkBillingOverviewData,
  type SparkBillingOverviewEvent,
  type SparkBillingLedgerData,
  type SparkCreditsBillingLog,
} from "../api";

const EVENT_OPTIONS = [
  { value: "", label: "全部事件" },
  { value: "SYSTEM_REWARD", label: "系统奖励" },
  { value: "PROMO_TOKEN_CLAIMED", label: "限时福利" },
  { value: "TOKEN_PACK_PURCHASED", label: "购包入账" },
  { value: "SUBSCRIPTION_ACTIVATED", label: "订阅开通" },
  { value: "SUBSCRIPTION_RENEWED", label: "订阅续费" },
  { value: "SUBSCRIPTION_CANCELLED", label: "订阅取消" },
  { value: "TRIAL_GRANTED", label: "试用发放" },
];

function eventLabel(eventType: string): string {
  const found = EVENT_OPTIONS.find((o) => o.value === eventType);
  return found?.label && found.value ? found.label : eventType;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("zh-CN");
}

function fmtNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

export default function SparkBilling() {
  const [days, setDays] = useState(30);
  const [shop, setShop] = useState("");
  const [eventType, setEventType] = useState("");
  const [overview, setOverview] = useState<SparkBillingOverviewData | null>(null);
  const [ledger, setLedger] = useState<SparkBillingLedgerData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async (d: number) => {
    setOverviewLoading(true);
    try {
      setOverview(await fetchSparkBillingOverview(d));
    } catch (e) {
      setError(String(e));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadLedger = useCallback(
    async (opts?: { shop?: string; eventType?: string; days?: number }) => {
      setLedgerLoading(true);
      setError("");
      try {
        setLedger(
          await fetchSparkBillingLedger({
            shop: opts?.shop?.trim() || undefined,
            eventType: opts?.eventType || undefined,
            days: opts?.days ?? days,
          }),
        );
      } catch (e) {
        setError(String(e));
      } finally {
        setLedgerLoading(false);
      }
    },
    [days],
  );

  useEffect(() => {
    void loadOverview(days);
    void loadLedger({ days });
  }, [days, loadOverview, loadLedger]);

  function refreshAll() {
    void loadOverview(days);
    void loadLedger({ shop, eventType, days });
  }

  function runSearch() {
    void loadLedger({ shop, eventType, days });
  }

  const eventColumns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Text
          copyable
          style={{ fontSize: 12, cursor: "pointer" }}
          onClick={() => {
            setShop(v);
            void loadLedger({ shop: v, eventType, days });
          }}
        >
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "事件",
      dataIndex: "eventType",
      key: "eventType",
      render: (v: string) => (
        <Tag color={v === "SYSTEM_REWARD" ? "purple" : v === "PROMO_TOKEN_CLAIMED" ? "blue" : "default"}>
          {eventLabel(v)}
        </Tag>
      ),
    },
    {
      title: "Token Δ",
      dataIndex: "tokensDelta",
      key: "tokensDelta",
      render: (v: number) => (
        <Typography.Text style={{ color: v >= 0 ? "#1677ff" : "#cf1322" }}>
          {v >= 0 ? "+" : ""}
          {fmtNumber(v)}
        </Typography.Text>
      ),
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => fmtDate(v),
    },
  ];

  const lowBalanceColumns = [
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
      title: "用量",
      dataIndex: "usagePercent",
      key: "usagePercent",
      render: (v: number) => <Tag color={v >= 90 ? "red" : "orange"}>{v}%</Tag>,
    },
    {
      title: "已用 / 总量",
      key: "usage",
      render: (_: unknown, r: SparkBillingLowBalanceShop) =>
        `${fmtNumber(r.usedTokens)} / ${fmtNumber(r.totalTokens)}`,
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => v ?? "-",
    },
  ];

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        账单总览
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Spark BillingLog 流水、系统奖励与低余额商店。点商店域名可钻取该店流水。
      </Typography.Paragraph>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={days}
            onChange={setDays}
            style={{ width: 140 }}
            options={[
              { value: 7, label: "近 7 天" },
              { value: 30, label: "近 30 天" },
              { value: 90, label: "近 90 天" },
            ]}
          />
          <Input
            placeholder="钻取 shop.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            onPressEnter={runSearch}
            allowClear
            style={{ width: 280 }}
          />
          <Select
            value={eventType}
            onChange={setEventType}
            style={{ width: 160 }}
            options={EVENT_OPTIONS}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={runSearch}>
            查询流水
          </Button>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>
            刷新
          </Button>
        </Space>
      </Card>

      {error ? (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Spin spinning={overviewLoading}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="活跃订阅" value={overview?.summary.activeSubscriptions ?? 0} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="账务事件" value={overview?.summary.billingEvents ?? 0} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="系统奖励"
                value={`${overview?.summary.systemRewardCount ?? 0} 次 / ${fmtNumber(overview?.summary.systemRewardTokens)} Token`}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="低余额商店 (≥85%)"
                value={overview?.summary.lowBalanceShops ?? 0}
                valueStyle={{
                  color: (overview?.summary.lowBalanceShops ?? 0) > 0 ? "#d82c0d" : undefined,
                }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="事件类型分布" size="small" style={{ marginBottom: 16 }}>
          <Table
            dataSource={overview?.byEventType ?? []}
            rowKey="eventType"
            size="small"
            pagination={false}
            columns={[
              {
                title: "事件",
                dataIndex: "eventType",
                render: (v: string) => eventLabel(v),
              },
              { title: "次数", dataIndex: "count" },
              {
                title: "Token 合计",
                dataIndex: "tokensSum",
                render: (v: number) => fmtNumber(v),
              },
            ]}
          />
        </Card>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} xl={14}>
            <Card title="最近账务动态" size="small">
              <Table<SparkBillingOverviewEvent>
                dataSource={overview?.recentBillingEvents ?? []}
                columns={eventColumns}
                rowKey={(r) => `${r.shop}-${r.eventType}-${r.createdAt}-${r.referenceId ?? ""}`}
                size="small"
                pagination={{ pageSize: 8 }}
              />
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card title="低余额商店" size="small">
              <Table<SparkBillingLowBalanceShop>
                dataSource={overview?.lowBalanceShops ?? []}
                columns={lowBalanceColumns}
                rowKey="shop"
                size="small"
                pagination={{ pageSize: 8 }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>

      <Spin spinning={ledgerLoading}>
        <Card
          title={ledger?.shop ? `流水 · ${ledger.shop}` : "流水（当前筛选）"}
          size="small"
        >
          {ledger?.account ? (
            <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="订阅池">
                {fmtNumber(ledger.account.subscriptionTokens)}
              </Descriptions.Item>
              <Descriptions.Item label="按量池">
                {fmtNumber(ledger.account.purchasedTokens)}
              </Descriptions.Item>
              <Descriptions.Item label="试用池">
                {fmtNumber(ledger.account.trialTokens)}
              </Descriptions.Item>
              <Descriptions.Item label="用量">
                {ledger.account.usagePercent}%（{fmtNumber(ledger.account.usedTokens)} /{" "}
                {fmtNumber(ledger.account.totalTokens)}）
              </Descriptions.Item>
            </Descriptions>
          ) : null}
          <Table<SparkCreditsBillingLog>
            dataSource={ledger?.events ?? []}
            columns={eventColumns}
            rowKey={(r) => `${r.shop}-${r.eventType}-${r.createdAt}-${r.referenceId ?? ""}`}
            size="small"
            pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
          />
        </Card>
      </Spin>
    </div>
  );
}
