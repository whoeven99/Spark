import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
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
  type TablePaginationConfig,
  type TableProps,
} from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  fetchTsfShopProfiles,
  type TsfShopProfileDistributionRow,
  type TsfShopProfileRow,
  type TsfShopProfilesSummary,
} from "../../api";

function formatTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function resolveRecentActivityAt(row: TsfShopProfileRow): string | null {
  return row.accountUpdatedAt ?? row.lastBillingEventAt ?? row.lastScannedAt ?? row.updatedAt ?? row.createdAt;
}

function activityStatus(row: TsfShopProfileRow): {
  label: string;
  color: string;
} {
  const recentAt = resolveRecentActivityAt(row);
  if (!recentAt) return { label: "未知", color: "default" };
  const diff = Date.now() - new Date(recentAt).getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days <= 7) return { label: "7天内有动作", color: "green" };
  if (days <= 30) return { label: "30天内有动作", color: "blue" };
  if (days <= 90) return { label: "90天内无新动作", color: "orange" };
  return { label: "长期沉默", color: "red" };
}

function DescriptionBlock({
  value,
  empty = "暂无描述",
}: {
  value: string | null;
  empty?: string;
}) {
  if (!value) return <Typography.Text type="secondary">{empty}</Typography.Text>;
  return (
    <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
      {value}
    </Typography.Paragraph>
  );
}

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function DistributionCard({
  title,
  rows,
}: {
  title: string;
  rows: TsfShopProfileDistributionRow[];
}) {
  return (
    <Card size="small" title={title} bodyStyle={{ paddingTop: 12 }}>
      {rows.length ? (
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {rows.map((row) => (
            <div key={`${title}-${row.value}`} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <Typography.Text ellipsis style={{ maxWidth: "75%" }}>
                {row.value}
              </Typography.Text>
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                {row.count}
              </Tag>
            </div>
          ))}
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分布数据" />
      )}
    </Card>
  );
}

function ConversionLeaderCard({
  rows,
}: {
  rows: TsfShopProfilesSummary["industryPaymentLeaders"];
}) {
  return (
    <Card
      size="small"
      title="行业付费转化"
      extra={<Typography.Text type="secondary">按当前筛选范围</Typography.Text>}
      style={{ marginBottom: 16 }}
    >
      {rows.length ? (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {rows.map((row) => (
            <div key={row.value}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 6,
                }}
              >
                <Typography.Text strong>{row.value}</Typography.Text>
                <Space size={8} wrap>
                  <Tag color="blue">
                    付费 {row.paidShops}/{row.totalShops}
                  </Tag>
                  <Tag color="green">活跃订阅 {row.activeSubscriptionCount}</Tag>
                  <Tag color="purple">{row.paymentRate}%</Tag>
                </Space>
              </div>
              <Progress percent={Math.round(row.paymentRate)} size="small" strokeColor="#1677ff" />
            </div>
          ))}
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无行业转化数据" />
      )}
    </Card>
  );
}

export default function TsfShopProfiles() {
  const [rows, setRows] = useState<TsfShopProfileRow[]>([]);
  const [summary, setSummary] = useState<TsfShopProfilesSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeRow, setActiveRow] = useState<TsfShopProfileRow | null>(null);

  const load = useCallback(
    (next: { page?: number; pageSize?: number; search?: string } = {}) => {
      const targetPage = next.page ?? page;
      const targetPageSize = next.pageSize ?? pageSize;
      const targetSearch = next.search ?? search;

      setLoading(true);
      setError("");
      fetchTsfShopProfiles({
        page: targetPage,
        pageSize: targetPageSize,
        search: targetSearch,
      })
        .then((result) => {
          setRows(result.rows);
          setSummary(result.summary);
          setTotal(result.total);
          setPage(result.page);
          setPageSize(result.pageSize);
        })
        .catch((err) => setError(String(err)))
        .finally(() => setLoading(false));
    },
    [page, pageSize, search],
  );

  useEffect(() => {
    load({ page: 1, pageSize, search });
  }, [load, pageSize, search]);

  const columns = useMemo<NonNullable<TableProps<TsfShopProfileRow>["columns"]>>(
    () => [
      {
        title: "商店",
        dataIndex: "shop",
        key: "shop",
        width: 240,
        render: (value: string, row: TsfShopProfileRow) => (
          <Space direction="vertical" size={0}>
            <Typography.Link onClick={() => setActiveRow(row)}>{value}</Typography.Link>
            {row.shopName ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.shopName}
              </Typography.Text>
            ) : null}
          </Space>
        ),
      },
      {
        title: "语言 / 行业",
        key: "profile",
        width: 180,
        render: (_: unknown, row: TsfShopProfileRow) => (
          <Space direction="vertical" size={4}>
            <Tag>{row.primaryLocale ?? "-"}</Tag>
            <Typography.Text>{row.industry ?? "-"}</Typography.Text>
          </Space>
        ),
      },
      {
        title: "安装 / 活跃",
        key: "installActivity",
        width: 200,
        render: (_: unknown, row: TsfShopProfileRow) => {
          const status = activityStatus(row);
          return (
            <Space direction="vertical" size={4}>
              <Tag color={row.installed ? "green" : "volcano"}>
                {row.installed ? "在装" : "已卸载"}
              </Tag>
              <Tag color={status.color}>{status.label}</Tag>
            </Space>
          );
        },
      },
      {
        title: "品牌语气",
        dataIndex: "brandTone",
        key: "brandTone",
        width: 160,
        render: (value: string | null) => value ?? <Typography.Text type="secondary">-</Typography.Text>,
      },
      {
        title: "关键词",
        key: "keywords",
        width: 220,
        render: (_: unknown, row: TsfShopProfileRow) =>
          row.keywords.length ? (
            <Space size={[4, 4]} wrap>
              {row.keywords.slice(0, 4).map((keyword: string) => (
                <Tag key={keyword}>{keyword}</Tag>
              ))}
              {row.keywords.length > 4 ? <Tag>+{row.keywords.length - 4}</Tag> : null}
            </Space>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          ),
      },
      {
        title: "订阅",
        key: "subscription",
        width: 180,
        render: (_: unknown, row: TsfShopProfileRow) => (
          <Space direction="vertical" size={4}>
            <Tag color={row.subStatus === "ACTIVE" ? "green" : "default"}>
              {row.subStatus ?? "无订阅"}
            </Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.planKey ?? "-"}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "付费 / 收入",
        key: "payment",
        width: 190,
        render: (_: unknown, row: TsfShopProfileRow) => (
          <Space direction="vertical" size={4}>
            <Tag color={row.hasPaid ? "green" : "default"}>
              {row.hasPaid ? "已付费" : "未付费"}
            </Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatUsd(row.totalRevenueUsd)}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "首次付费",
        key: "firstPaidAt",
        width: 180,
        render: (_: unknown, row: TsfShopProfileRow) => (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatTime(row.firstPaidAt)}
          </Typography.Text>
        ),
      },
      {
        title: "画像更新时间",
        key: "lastScannedAt",
        width: 180,
        render: (_: unknown, row: TsfShopProfileRow) => (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatTime(row.lastScannedAt ?? row.updatedAt)}
          </Typography.Text>
        ),
      },
      {
        title: "描述摘要",
        dataIndex: "description",
        key: "description",
        render: (value: string | null) =>
          value ? (
            <Typography.Paragraph ellipsis={{ rows: 2, tooltip: value }} style={{ marginBottom: 0 }}>
              {value}
            </Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          ),
      },
    ],
    [],
  );

  function handleSearch() {
    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleTableChange(nextPagination: TablePaginationConfig) {
    const nextPage = nextPagination.current ?? 1;
    const nextPageSize = nextPagination.pageSize ?? pageSize;
    setPage(nextPage);
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize);
      setPage(1);
      return;
    }
    load({ page: nextPage, pageSize: nextPageSize });
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 8 }}>
        翻译 店铺画像
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        直接查询 TSF 独立 Turso 的 <code>ShopProfile</code> 表，查看当前已生成的店铺画像内容。
      </Typography.Paragraph>

      {error ? (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {summary ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="画像总数" value={summary.totalProfiles} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic
                  title="当前在装"
                  value={summary.installedShopCount}
                  suffix={`/ ${summary.totalProfiles || 0}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic
                  title="近 7 天活跃信号"
                  value={summary.activeSignal7Days}
                  suffix={`/ ${summary.totalProfiles || 0}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic
                  title="近 30 天活跃信号"
                  value={summary.activeSignal30Days}
                  suffix={`/ ${summary.totalProfiles || 0}`}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic
                  title="活跃订阅店铺"
                  value={summary.activeSubscriptionCount}
                  suffix={`/ ${summary.totalProfiles || 0}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="已付费店铺" value={summary.paidShopCount} suffix={`/ ${summary.totalProfiles || 0}`} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="首订店铺" value={summary.subscribedShopCount} suffix={`/ ${summary.totalProfiles || 0}`} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="取消订阅店铺" value={summary.cancelledShopCount} suffix={`/ ${summary.totalProfiles || 0}`} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="累计收入" value={summary.totalRevenueUsd} precision={2} prefix="$" />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="已卸载" value={summary.totalProfiles - summary.installedShopCount} suffix={`/ ${summary.totalProfiles || 0}`} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="近 7 天更新画像" value={summary.scannedLast7Days} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="近 30 天更新画像" value={summary.scannedLast30Days} />
              </Card>
            </Col>
          </Row>

          <Card size="small" title={search ? "当前搜索结果画像覆盖" : "全量画像覆盖"} style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12} xl={6}>
                <Typography.Text type="secondary">店铺描述覆盖</Typography.Text>
                <Progress
                  percent={percent(summary.withDescriptionCount, summary.totalProfiles)}
                  size="small"
                  status="active"
                />
                <Typography.Text type="secondary">
                  {summary.withDescriptionCount} / {summary.totalProfiles}
                </Typography.Text>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <Typography.Text type="secondary">关键词覆盖</Typography.Text>
                <Progress
                  percent={percent(summary.withKeywordsCount, summary.totalProfiles)}
                  size="small"
                  strokeColor="#722ed1"
                />
                <Typography.Text type="secondary">
                  {summary.withKeywordsCount} / {summary.totalProfiles}
                </Typography.Text>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <Typography.Text type="secondary">品牌语气覆盖</Typography.Text>
                <Progress
                  percent={percent(summary.withBrandToneCount, summary.totalProfiles)}
                  size="small"
                  strokeColor="#13c2c2"
                />
                <Typography.Text type="secondary">
                  {summary.withBrandToneCount} / {summary.totalProfiles}
                </Typography.Text>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <Typography.Text type="secondary">行业覆盖</Typography.Text>
                <Progress
                  percent={percent(summary.withIndustryCount, summary.totalProfiles)}
                  size="small"
                  strokeColor="#fa8c16"
                />
                <Typography.Text type="secondary">
                  {summary.withIndustryCount} / {summary.totalProfiles}
                </Typography.Text>
              </Col>
            </Row>
          </Card>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12} xl={6}>
              <DistributionCard title="主语言分布" rows={summary.localeDistribution} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <DistributionCard title="行业分布" rows={summary.industryDistribution} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <DistributionCard title="品牌语气分布" rows={summary.brandToneDistribution} />
            </Col>
            <Col xs={24} md={12} xl={6}>
              <DistributionCard title="套餐分布" rows={summary.planDistribution} />
            </Col>
          </Row>

          <ConversionLeaderCard rows={summary.industryPaymentLeaders} />
        </>
      ) : null}

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="按 shop / 店铺名 / 行业 / 描述搜索"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onPressEnter={handleSearch}
          allowClear
          style={{ width: 320 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => load({ page, pageSize })}>
          刷新
        </Button>
      </Space>

      <Divider style={{ margin: "8px 0 16px" }} />

      <Spin spinning={loading}>
        <Table
          rowKey="shop"
          dataSource={rows}
          columns={columns}
          size="small"
          scroll={{ x: 1620 }}
          locale={{
            emptyText: loading ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="加载中" /> : undefined,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 条店铺画像`,
          }}
          onChange={handleTableChange}
        />
      </Spin>

      <Drawer
        title={activeRow?.shop ?? "店铺画像详情"}
        width={720}
        open={!!activeRow}
        onClose={() => setActiveRow(null)}
      >
        {activeRow ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="店铺域名">{activeRow.shop}</Descriptions.Item>
              <Descriptions.Item label="店铺展示名">{activeRow.shopName ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="主语言">{activeRow.primaryLocale ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="行业">{activeRow.industry ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="安装状态">
                {activeRow.installed ? <Tag color="green">在装</Tag> : <Tag color="volcano">已卸载</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="近期活跃信号">
                {(() => {
                  const status = activityStatus(activeRow);
                  return <Tag color={status.color}>{status.label}</Tag>;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="品牌语气">{activeRow.brandTone ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="AI 模型">{activeRow.aiModel ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="账本系统">{activeRow.billingSystem ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="订阅状态">{activeRow.subStatus ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="套餐">{activeRow.planKey ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="是否已付费">
                {activeRow.hasPaid ? <Tag color="green">已付费</Tag> : <Tag>未付费</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="绑定原因">{activeRow.boundReason ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="累计收入">{formatUsd(activeRow.totalRevenueUsd)}</Descriptions.Item>
              <Descriptions.Item label="付费次数">{activeRow.paidChargeCount}</Descriptions.Item>
              <Descriptions.Item label="加购包次数">{activeRow.packPurchaseCount}</Descriptions.Item>
              <Descriptions.Item label="首次付费时间">{formatTime(activeRow.firstPaidAt)}</Descriptions.Item>
              <Descriptions.Item label="首次订阅时间">{formatTime(activeRow.firstSubscriptionAt)}</Descriptions.Item>
              <Descriptions.Item label="最近付费时间">{formatTime(activeRow.lastPaidAt)}</Descriptions.Item>
              <Descriptions.Item label="最近取消时间">{formatTime(activeRow.cancelledAt)}</Descriptions.Item>
              <Descriptions.Item label="最近业务动作时间">{formatTime(resolveRecentActivityAt(activeRow))}</Descriptions.Item>
              <Descriptions.Item label="账户更新时间">{formatTime(activeRow.accountUpdatedAt)}</Descriptions.Item>
              <Descriptions.Item label="最近扫描 ID">{activeRow.lastScanId ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="最近扫描时间">
                {formatTime(activeRow.lastScannedAt)}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(activeRow.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{formatTime(activeRow.updatedAt)}</Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Title level={5}>关键词</Typography.Title>
              {activeRow.keywords.length ? (
                <Space size={[8, 8]} wrap>
                  {activeRow.keywords.map((keyword) => (
                    <Tag key={keyword}>{keyword}</Tag>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">暂无关键词</Typography.Text>
              )}
            </div>

            <div>
              <Typography.Title level={5}>店铺描述</Typography.Title>
              <DescriptionBlock value={activeRow.description} />
            </div>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
