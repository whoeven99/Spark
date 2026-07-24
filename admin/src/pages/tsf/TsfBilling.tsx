import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Progress,
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
  fetchTsfBillingLedger,
  fetchTsfBillingOverview,
  type TsfBillingEventRow,
  type TsfBillingLedgerData,
  type TsfBillingOverviewData,
  type TsfBillingOverviewEvent,
  type TsfBillingPeriodUsageRow,
  type TsfBillingRiskShop,
  type TsfBillingTopUsageShop,
  type TsfTranslationUsageRow,
} from "../../api";

const SOURCE_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "TsFrontend", label: "手动翻译" },
  { value: "TsFrontend-Auto", label: "自动翻译" },
];

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "COMPLETED", label: "COMPLETED" },
  { value: "FAILED", label: "FAILED" },
  { value: "PAUSED", label: "PAUSED" },
  { value: "TRANSLATING", label: "TRANSLATING" },
  { value: "WRITEBACK_QUEUED", label: "WRITEBACK_QUEUED" },
  { value: "WRITING_BACK", label: "WRITING_BACK" },
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "green",
  COMPLETED: "green",
  PENDING: "gold",
  PAUSED: "gold",
  FAILED: "red",
  CANCELLED: "red",
  EXPIRED: "default",
  TRANSLATING: "blue",
  WRITING_BACK: "blue",
};

function fmtNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleString("zh-CN");
}

function sourceLabel(value: string | null): string {
  if (value === "TsFrontend-Auto") return "自动";
  if (value === "TsFrontend") return "手动";
  return value || "-";
}

function usageColor(percent: number): string {
  if (percent >= 90) return "#d82c0d";
  if (percent >= 70) return "#b98900";
  return "#008060";
}

function statusTag(value: string | null | undefined) {
  return value ? <Tag color={STATUS_COLORS[value] ?? "default"}>{value}</Tag> : "-";
}

export default function TsfBilling() {
  const [shop, setShop] = useState("");
  const [queriedShop, setQueriedShop] = useState("");
  const [days, setDays] = useState(30);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [overview, setOverview] = useState<TsfBillingOverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [data, setData] = useState<TsfBillingLedgerData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTask, setActiveTask] = useState<TsfTranslationUsageRow | null>(null);

  const loadOverview = useCallback(() => {
    setOverviewLoading(true);
    setError("");
    fetchTsfBillingOverview({ days })
      .then(setOverview)
      .catch((e) => setError(String(e)))
      .finally(() => setOverviewLoading(false));
  }, [days]);

  const loadDetail = useCallback(() => {
    const normalizedShop = queriedShop.trim();
    if (!normalizedShop) {
      setData(null);
      return;
    }
    setDetailLoading(true);
    setError("");
    fetchTsfBillingLedger({
      shop: normalizedShop,
      days,
      source: source || undefined,
      status: status || undefined,
      page,
      pageSize: 50,
    })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setDetailLoading(false));
  }, [days, page, queriedShop, source, status]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (queriedShop.trim()) loadDetail();
  }, [loadDetail, queriedShop]);

  function runSearch() {
    const normalizedShop = shop.trim();
    setPage(1);
    if (normalizedShop === queriedShop) {
      loadDetail();
      return;
    }
    setQueriedShop(normalizedShop);
  }

  function drillToShop(nextShop: string) {
    setShop(nextShop);
    setQueriedShop(nextShop);
    setPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refreshAll() {
    loadOverview();
    if (queriedShop.trim()) loadDetail();
  }

  const account = data?.account;
  const summary = data?.summary;
  const subscription = data?.subscription;
  const usagePercent = Math.min(100, Math.max(0, summary?.usagePercent ?? 0));

  const accountPools = useMemo(
    () => [
      { label: "订阅额度", value: account?.subscriptionCredits ?? 0, color: "blue" },
      { label: "加购额度", value: account?.purchasedCredits ?? 0, color: "purple" },
      { label: "试用额度", value: account?.trialCredits ?? 0, color: "cyan" },
    ],
    [account],
  );

  const recentBillingColumns = [
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: fmtDate,
    },
    {
      title: "店铺",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Link onClick={() => drillToShop(v)} copyable>
          {v}
        </Typography.Link>
      ),
    },
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
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
    },
    {
      title: "Credits",
      dataIndex: "creditsDelta",
      key: "creditsDelta",
      align: "right" as const,
      render: (v: number) => (
        <Typography.Text type={v < 0 ? "danger" : "success"}>
          {v > 0 ? "+" : ""}
          {fmtNumber(v)}
        </Typography.Text>
      ),
    },
    {
      title: "余额",
      dataIndex: "remainingCredits",
      key: "remainingCredits",
      align: "right" as const,
      render: (v: number) => (
        <Typography.Text type={v <= 0 ? "danger" : undefined}>{fmtNumber(v)}</Typography.Text>
      ),
    },
    {
      title: "订阅状态",
      dataIndex: "subscriptionStatus",
      key: "subscriptionStatus",
      render: statusTag,
    },
  ];

  const topJobColumns = [
    {
      title: "任务",
      dataIndex: "id",
      key: "id",
      width: 150,
      render: (v: string, row: TsfTranslationUsageRow) => (
        <Typography.Link onClick={() => setActiveTask(row)} copyable>
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "店铺",
      dataIndex: "shopName",
      key: "shopName",
      render: (v: string) => <Typography.Link onClick={() => drillToShop(v)}>{v}</Typography.Link>,
    },
    {
      title: "来源",
      dataIndex: "taskSource",
      key: "taskSource",
      width: 86,
      render: (v: string | null) => (
        <Tag color={v === "TsFrontend-Auto" ? "blue" : "default"}>{sourceLabel(v)}</Tag>
      ),
    },
    {
      title: "语言",
      key: "locale",
      render: (_: unknown, row: TsfTranslationUsageRow) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {row.source} → {row.target}
        </Typography.Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: statusTag,
    },
    {
      title: "消耗",
      dataIndex: "usedTokens",
      key: "usedTokens",
      align: "right" as const,
      render: fmtNumber,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: fmtDate,
    },
  ];

  const topShopColumns = [
    {
      title: "店铺",
      dataIndex: "shopName",
      key: "shopName",
      render: (v: string) => (
        <Typography.Link onClick={() => drillToShop(v)} copyable>
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "任务数",
      dataIndex: "taskCount",
      key: "taskCount",
      align: "right" as const,
      render: fmtNumber,
    },
    {
      title: "总消耗",
      dataIndex: "usedTokens",
      key: "usedTokens",
      align: "right" as const,
      render: fmtNumber,
    },
    {
      title: "失败任务",
      dataIndex: "failedJobs",
      key: "failedJobs",
      align: "right" as const,
      render: (v: number) => (
        <Typography.Text type={v > 0 ? "danger" : "secondary"}>{fmtNumber(v)}</Typography.Text>
      ),
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
    },
    {
      title: "余额",
      dataIndex: "remainingCredits",
      key: "remainingCredits",
      align: "right" as const,
      render: (v: number | null) =>
        v == null ? "-" : <Typography.Text type={v <= 0 ? "danger" : undefined}>{fmtNumber(v)}</Typography.Text>,
    },
  ];

  const riskColumns = [
    {
      title: "店铺",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Link onClick={() => drillToShop(v)} copyable>
          {v}
        </Typography.Link>
      ),
    },
    {
      title: "风险",
      dataIndex: "reasons",
      key: "reasons",
      render: (v: string[]) => (
        <Space wrap>
          {v.map((reason) => (
            <Tag key={reason} color="red">
              {reason}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "订阅",
      dataIndex: "subscriptionStatus",
      key: "subscriptionStatus",
      render: statusTag,
    },
    {
      title: "剩余",
      dataIndex: "remainingCredits",
      key: "remainingCredits",
      align: "right" as const,
      render: (v: number) => <Typography.Text type="danger">{fmtNumber(v)}</Typography.Text>,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: fmtDate,
    },
  ];

  const billingColumns = [
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: fmtDate,
    },
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
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "-"),
    },
    {
      title: "Credits 变动",
      dataIndex: "creditsDelta",
      key: "creditsDelta",
      align: "right" as const,
      render: (v: number) => (
        <Typography.Text type={v < 0 ? "danger" : "success"}>
          {v > 0 ? "+" : ""}
          {fmtNumber(v)}
        </Typography.Text>
      ),
    },
    {
      title: "当时已用",
      dataIndex: "usedCredits",
      key: "usedCredits",
      align: "right" as const,
      render: fmtNumber,
    },
    {
      title: "Reference",
      dataIndex: "referenceId",
      key: "referenceId",
      ellipsis: true,
      render: (v: string | null) =>
        v ? (
          <Typography.Text copyable style={{ fontSize: 12 }}>
            {v}
          </Typography.Text>
        ) : (
          "-"
        ),
    },
  ];

  const usageColumns = [
    ...topJobColumns.filter((col) => col.key !== "shopName"),
    {
      title: "模块",
      dataIndex: "modules",
      key: "modules",
      render: (v: string[]) => `${v.length} 个`,
    },
    {
      title: "失败",
      dataIndex: "translateFailed",
      key: "translateFailed",
      align: "right" as const,
      render: (v: number) => (
        <Typography.Text type={v > 0 ? "danger" : "secondary"}>{fmtNumber(v)}</Typography.Text>
      ),
    },
  ];

  const periodColumns = [
    {
      title: "周期",
      key: "period",
      render: (_: unknown, row: TsfBillingPeriodUsageRow) => (
        <span>
          {fmtDate(row.periodStart)} ~ {fmtDate(row.periodEnd)}
        </span>
      ),
    },
    {
      title: "套餐",
      dataIndex: "planKey",
      key: "planKey",
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "周期已用",
      dataIndex: "usedCredits",
      key: "usedCredits",
      align: "right" as const,
      render: fmtNumber,
    },
    {
      title: "订阅配额",
      dataIndex: "subscriptionCreditsAllocated",
      key: "subscriptionCreditsAllocated",
      align: "right" as const,
      render: fmtNumber,
    },
    {
      title: "归档时间",
      dataIndex: "archivedAt",
      key: "archivedAt",
      render: fmtDate,
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        翻译账单
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Owner 可见。默认展示所有商店近期账务和任务消耗，点击店铺可钻取单店详情。
      </Typography.Text>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={days}
            onChange={(v) => {
              setDays(v);
              setPage(1);
            }}
            style={{ width: 130 }}
            options={[
              { value: 7, label: "近 7 天" },
              { value: 30, label: "近 30 天" },
              { value: 90, label: "近 90 天" },
              { value: 365, label: "近 365 天" },
            ]}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="钻取 shop.myshopify.com"
            value={shop}
            onChange={(e) => {
              setShop(e.target.value);
              setPage(1);
            }}
            onPressEnter={runSearch}
            allowClear
            style={{ width: 280 }}
          />
          <Select
            value={source}
            onChange={(v) => {
              setSource(v);
              setPage(1);
            }}
            style={{ width: 140 }}
            options={SOURCE_OPTIONS}
          />
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            style={{ width: 180 }}
            options={STATUS_OPTIONS}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={runSearch}>
            单店查询
          </Button>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>
            刷新
          </Button>
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={overviewLoading}>
        {overview?.note ? (
          <Alert type="info" message={overview.note} style={{ marginBottom: 16 }} />
        ) : null}

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="活跃订阅" value={overview?.summary.activeSubscriptions ?? 0} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="新订阅 / 续费" value={`${overview?.summary.newSubscriptions ?? 0} / ${overview?.summary.renewedSubscriptions ?? 0}`} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="翻译任务" value={overview?.summary.translationJobs ?? 0} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="任务消耗" value={fmtNumber(overview?.summary.translationUsedTokens)} /></Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="加购包购买" value={overview?.summary.packPurchases ?? 0} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="入账 Credits" value={fmtNumber(overview?.summary.creditsGranted)} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="低余额商店" value={overview?.summary.lowBalanceShops ?? 0} valueStyle={{ color: (overview?.summary.lowBalanceShops ?? 0) > 0 ? "#d82c0d" : undefined }} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="失败 / 暂停任务" value={`${overview?.summary.failedJobs ?? 0} / ${overview?.summary.pausedJobs ?? 0}`} /></Card>
          </Col>
        </Row>

        <Card title="最近订阅与账务动态" size="small" style={{ marginBottom: 16 }}>
          <Table<TsfBillingOverviewEvent>
            dataSource={overview?.recentBillingEvents ?? []}
            columns={recentBillingColumns}
            rowKey={(r) => `${r.shop}-${r.eventType}-${r.createdAt}-${r.referenceId ?? ""}`}
            size="small"
            pagination={{ pageSize: 10 }}
          />
        </Card>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} xl={14}>
            <Card title="高消耗任务排行" size="small">
              <Table<TsfTranslationUsageRow>
                dataSource={overview?.topTranslationJobs ?? []}
                columns={topJobColumns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card title="高消耗商店排行" size="small">
              <Table<TsfBillingTopUsageShop>
                dataSource={overview?.topUsageShops ?? []}
                columns={topShopColumns}
                rowKey="shopName"
                size="small"
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="需要关注的商店" size="small" style={{ marginBottom: 16 }}>
          <Table<TsfBillingRiskShop>
            dataSource={overview?.riskShops ?? []}
            columns={riskColumns}
            rowKey="shop"
            size="small"
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </Spin>

      {queriedShop.trim() ? (
        <Spin spinning={detailLoading}>
          <Typography.Title level={5} style={{ marginTop: 8 }}>
            单店详情：{queriedShop}
          </Typography.Title>

          {data?.warnings.length ? (
            <Alert
              type="warning"
              showIcon
              message="账务状态提示"
              description={data.warnings.join("；")}
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card><Statistic title="剩余额度" value={fmtNumber(summary?.remainingCredits)} /></Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card><Statistic title="本周期已用" value={fmtNumber(summary?.usedCredits)} /></Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card><Statistic title="翻译任务扣除" value={fmtNumber(summary?.translationUsedTokens)} /></Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card><Statistic title="翻译任务数" value={summary?.translationJobsCount ?? 0} /></Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card title="当前额度池" size="small">
                <Progress
                  percent={usagePercent}
                  strokeColor={usageColor(usagePercent)}
                  style={{ marginBottom: 16 }}
                />
                <Space wrap>
                  {accountPools.map((pool) => (
                    <Tag key={pool.label} color={pool.color}>
                      {pool.label}: {fmtNumber(pool.value)}
                    </Tag>
                  ))}
                  <Tag>总额度: {fmtNumber(summary?.totalCredits)}</Tag>
                </Space>
                <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
                  <Descriptions.Item label="账户更新时间">{fmtDate(account?.updatedAt)}</Descriptions.Item>
                  <Descriptions.Item label="最近账务事件">{fmtDate(summary?.lastBillingAt)}</Descriptions.Item>
                  <Descriptions.Item label="最近翻译任务">{fmtDate(summary?.lastTranslationAt)}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="当前订阅" size="small">
                {subscription ? (
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="套餐">
                      {subscription.planKey ? <Tag color="blue">{subscription.planKey}</Tag> : "-"}
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">{statusTag(subscription.status)}</Descriptions.Item>
                    <Descriptions.Item label="计费周期">{subscription.billingInterval ?? "-"}</Descriptions.Item>
                    <Descriptions.Item label="周期额度">{fmtNumber(subscription.creditsPerPeriod)}</Descriptions.Item>
                    <Descriptions.Item label="当前周期">
                      {fmtDate(subscription.currentPeriodStart)} ~ {fmtDate(subscription.currentPeriodEnd)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Shopify 订阅 ID">
                      {subscription.shopifySubscriptionId ? (
                        <Typography.Text copyable style={{ fontSize: 12 }}>
                          {subscription.shopifySubscriptionId}
                        </Typography.Text>
                      ) : (
                        "-"
                      )}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无订阅记录" />
                )}
              </Card>
            </Col>
          </Row>

          <Card title="额度账务流水" size="small" style={{ marginBottom: 16 }}>
            <Table<TsfBillingEventRow>
              dataSource={data?.billingEvents ?? []}
              columns={billingColumns}
              rowKey={(r) => `${r.eventType}-${r.createdAt}-${r.referenceId ?? ""}`}
              size="small"
              pagination={false}
            />
          </Card>

          <Card title="翻译任务扣除记录" size="small" style={{ marginBottom: 16 }}>
            {data?.translationUsage.note ? (
              <Alert type="info" message={data.translationUsage.note} style={{ marginBottom: 12 }} />
            ) : null}
            <Table<TsfTranslationUsageRow>
              dataSource={data?.translationUsage.rows ?? []}
              columns={usageColumns}
              rowKey="id"
              size="small"
              pagination={{
                current: page,
                pageSize: 50,
                total: data?.translationUsage.total ?? 0,
                showTotal: (total) => `共 ${total} 个翻译任务`,
                onChange: (nextPage) => setPage(nextPage),
              }}
            />
          </Card>

          <Card title="历史周期用量归档" size="small">
            <Table<TsfBillingPeriodUsageRow>
              dataSource={data?.periodUsages ?? []}
              columns={periodColumns}
              rowKey={(r) => `${r.periodStart}-${r.periodEnd}`}
              size="small"
              pagination={false}
            />
          </Card>
        </Spin>
      ) : null}

      <Drawer
        title="翻译任务扣费详情"
        open={!!activeTask}
        onClose={() => setActiveTask(null)}
        width={620}
      >
        {activeTask ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="任务 ID">
              <Typography.Text copyable>{activeTask.id}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="店铺">
              <Typography.Link onClick={() => drillToShop(activeTask.shopName)}>
                {activeTask.shopName}
              </Typography.Link>
            </Descriptions.Item>
            <Descriptions.Item label="来源">{sourceLabel(activeTask.taskSource)}</Descriptions.Item>
            <Descriptions.Item label="语言">
              {activeTask.source} → {activeTask.target}
            </Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(activeTask.status)}</Descriptions.Item>
            <Descriptions.Item label="模型">{activeTask.aiModel ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="模块">{activeTask.modules.join(", ") || "-"}</Descriptions.Item>
            <Descriptions.Item label="扣除 Token">{fmtNumber(activeTask.usedTokens)}</Descriptions.Item>
            <Descriptions.Item label="翻译进度">
              {fmtNumber(activeTask.translateDone)} / {fmtNumber(activeTask.translateTotal)}
            </Descriptions.Item>
            <Descriptions.Item label="写回进度">
              {fmtNumber(activeTask.writebackDone)} / {fmtNumber(activeTask.writebackTotal)}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{fmtDate(activeTask.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{fmtDate(activeTask.updatedAt)}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </div>
  );
}
