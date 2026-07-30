import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
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
import { GlobalOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  fetchTsfLanguageCoverage,
  type AutoTranslateFilter,
  type CoverageBucket,
  type TsfLanguageCoverageData,
  type TsfShopLanguageCoverageRow,
} from "../../api";

const EMPTY: TsfLanguageCoverageData = {
  stats: {
    tursoShopCount: 0,
    shopsWithCache: 0,
    shopsWithoutCache: 0,
    autoTranslateShops: 0,
    avgOverallPercent: null,
    lowCoverageShops: 0,
    redisKeyCount: 0,
    snapshotAt: null,
  },
  shops: [],
  total: 0,
  page: 1,
  pageSize: 20,
  note: null,
};

function coverageTone(percent: number | null): "success" | "warning" | "error" | "default" {
  if (percent == null) return "default";
  if (percent >= 90) return "success";
  if (percent >= 50) return "warning";
  return "error";
}

function formatCount(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

export default function TsfLanguageCoverage() {
  const [data, setData] = useState<TsfLanguageCoverageData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<CoverageBucket>("all");
  const [autoFilter, setAutoFilter] = useState<AutoTranslateFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefreshRef = useRef(false);

  const load = useCallback(() => {
    const refresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    setLoading(true);
    setError("");
    fetchTsfLanguageCoverage({
      search,
      bucket,
      autoTranslate: autoFilter,
      page,
      pageSize,
      refresh,
    })
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [autoFilter, bucket, page, pageSize, search]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function submitSearch() {
    const next = draftSearch.trim();
    setPage(1);
    if (next === search) setRefreshKey((key) => key + 1);
    else setSearch(next);
  }

  function hardRefresh() {
    forceRefreshRef.current = true;
    setRefreshKey((key) => key + 1);
  }

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      width: 280,
      fixed: "left" as const,
      render: (_: string, row: TsfShopLanguageCoverageRow) => (
        <Space direction="vertical" size={4}>
          <Typography.Link>
            <RouterLink to={`/tsf/shop-profiles/${encodeURIComponent(row.shop)}`}>
              {row.shop}
            </RouterLink>
          </Typography.Link>
          <Space size={4} wrap>
            {row.autoTranslate ? (
              <Tag color="processing">
                自动翻译 · {row.autoTranslateLocaleCount} 语
              </Tag>
            ) : (
              <Tag>未开自动翻译</Tag>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.localeCount === 0
                ? "无目标语言"
                : row.cacheMissing
                  ? "未统计覆盖率"
                  : `${row.localeCount} 个目标语言`}
            </Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: "整体",
      dataIndex: "overallPercent",
      key: "overallPercent",
      width: 100,
      render: (percent: number | null, row: TsfShopLanguageCoverageRow) => {
        if (row.localeCount === 0) return <Tag>无语言</Tag>;
        if (row.cacheMissing || percent == null) return <Tag>未统计</Tag>;
        const tone = coverageTone(percent);
        return (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{percent}%</Typography.Text>
            <Tag color={tone === "default" ? undefined : tone}>
              {percent >= 90 ? "高" : percent >= 50 ? "中" : "低"}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: "各语言覆盖",
      key: "locales",
      render: (_: unknown, row: TsfShopLanguageCoverageRow) => {
        if (row.locales.length === 0) {
          return (
            <Typography.Text type="secondary">
              Turso 无 ShopTargetLocale — 待语言页添加 / shop scan 同步
            </Typography.Text>
          );
        }
        return (
          <Space direction="vertical" size={6} style={{ width: "100%", minWidth: 400 }}>
            {row.locales.map((locale) => {
              const percent = locale.percent ?? 0;
              const status = locale.cacheMissing
                ? "normal"
                : locale.percent == null
                  ? "normal"
                  : locale.percent >= 90
                    ? "success"
                    : locale.percent >= 50
                      ? "normal"
                      : "exception";
              return (
                <Flex key={locale.locale} align="center" gap={8} wrap="nowrap">
                  <Tag
                    color={
                      locale.cacheMissing
                        ? undefined
                        : coverageTone(locale.percent) === "default"
                          ? undefined
                          : coverageTone(locale.percent)
                    }
                    style={{ marginInlineEnd: 0, minWidth: 64, textAlign: "center" }}
                  >
                    {locale.locale}
                  </Tag>
                  <span style={{ width: 44, flex: "0 0 auto" }}>
                    {locale.autoTranslate ? (
                      <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                        自动
                      </Tag>
                    ) : null}
                  </span>
                  <Typography.Text style={{ width: 40, flex: "0 0 auto" }}>
                    {locale.cacheMissing || locale.percent == null
                      ? "—"
                      : `${locale.percent}%`}
                  </Typography.Text>
                  <div style={{ flex: 1, minWidth: 120, maxWidth: 240 }}>
                    <Progress
                      percent={locale.cacheMissing ? 0 : percent}
                      size="small"
                      showInfo={false}
                      status={status}
                    />
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {locale.cacheMissing
                      ? "未统计"
                      : `${formatCount(locale.translated)} / ${formatCount(locale.total)}`}
                  </Typography.Text>
                </Flex>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: "更新",
      dataIndex: "updatedAtLabel",
      key: "updatedAtLabel",
      width: 80,
      align: "right" as const,
      render: (label: string) => (
        <Typography.Text type="secondary">{label || "—"}</Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" gap={16} wrap="wrap" style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            <Space>
              <GlobalOutlined />
              语言覆盖率
            </Space>
          </Typography.Title>
          <Typography.Text type="secondary">
            商店以 Turso 在装 Account 为准；覆盖率读 ShopTargetLocale.coverage*。
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={hardRefresh}>
          刷新
        </Button>
      </Flex>

      <Alert
        type="info"
        showIcon
        message="数据口径"
        description={
          data.note ||
          "商店列表：Turso Account；自动翻译与覆盖率均来自 ShopTargetLocale（coverageTranslated/Total/Percent）。"
        }
        style={{ marginBottom: 16 }}
      />
      {error ? (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic title="Turso 在装商店" value={data.stats.tursoShopCount} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic
              title="已开自动翻译"
              value={data.stats.autoTranslateShops}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic
              title="店均整体覆盖率"
              value={data.stats.avgOverallPercent ?? "—"}
              suffix={data.stats.avgOverallPercent == null ? undefined : "%"}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card size="small">
            <Statistic
              title="低覆盖 / 未统计"
              value={`${data.stats.lowCoverageShops} / ${data.stats.shopsWithoutCache}`}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Flex gap={12} wrap="wrap" align="center">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索商店域名"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            onPressEnter={submitSearch}
            allowClear
            style={{ width: 280 }}
          />
          <Select<CoverageBucket>
            value={bucket}
            onChange={(value) => {
              setBucket(value);
              setPage(1);
            }}
            style={{ width: 150 }}
            options={[
              { value: "all", label: "全部覆盖" },
              { value: "low", label: "< 50%" },
              { value: "mid", label: "50–90%" },
              { value: "high", label: "≥ 90%" },
              { value: "missing", label: "未统计覆盖率" },
            ]}
          />
          <Select<AutoTranslateFilter>
            value={autoFilter}
            onChange={(value) => {
              setAutoFilter(value);
              setPage(1);
            }}
            style={{ width: 150 }}
            options={[
              { value: "all", label: "全部自动翻译" },
              { value: "on", label: "已开自动翻译" },
              { value: "off", label: "未开自动翻译" },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={submitSearch}>
            查询
          </Button>
          <Typography.Text type="secondary">
            当前结果 {data.total} 家
            {data.stats.snapshotAt
              ? ` · 快照 ${new Date(data.stats.snapshotAt).toLocaleString("zh-CN")}`
              : ""}
          </Typography.Text>
        </Flex>
      </Card>

      <Spin spinning={loading}>
        <Table<TsfShopLanguageCoverageRow>
          rowKey="shop"
          size="small"
          scroll={{ x: 1020 }}
          dataSource={data.shops}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total: data.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 家`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
        />
      </Spin>
    </div>
  );
}
