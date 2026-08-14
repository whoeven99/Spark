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
  message,
} from "antd";
import {
  CalculatorOutlined,
  GlobalOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  fetchTsfLanguageCoverage,
  fetchTsfShopProfileDetail,
  isOwner,
  triggerTsfLanguageCoverageRefresh,
  type AutoTranslateFilter,
  type CoverageBucket,
  type CoverageDistribution,
  type CoverageSourceKind,
  type TsfLanguageCoverageData,
  type TsfLocaleCoverage,
  type TsfShopLanguageCoverageRow,
} from "../../api";

const LOCALE_PREVIEW_COUNT = 2;

const EMPTY_DISTRIBUTION: CoverageDistribution = {
  high: 0,
  mid: 0,
  low: 0,
  missing: 0,
};

const EMPTY: TsfLanguageCoverageData = {
  stats: {
    tursoShopCount: 0,
    shopsWithCache: 0,
    shopsWithoutCache: 0,
    autoTranslateShops: 0,
    avgOverallPercent: null,
    lowCoverageShops: 0,
    staleShops: 0,
    distribution: EMPTY_DISTRIBUTION,
    redisKeyCount: 0,
    tursoLocaleCount: 0,
    snapshotAt: null,
  },
  shops: [],
  total: 0,
  page: 1,
  pageSize: 20,
  note: null,
};

const DISTRIBUTION_SEGMENTS: Array<{
  bucket: Exclude<CoverageBucket, "all">;
  label: string;
  color: string;
}> = [
  { bucket: "high", label: "高 ≥90%", color: "#52c41a" },
  { bucket: "mid", label: "中 50–90%", color: "#1677ff" },
  { bucket: "low", label: "低 <50%", color: "#faad14" },
  { bucket: "missing", label: "未统计", color: "#d9d9d9" },
];

const COVERAGE_SOURCE_LABEL: Record<CoverageSourceKind | "mixed", string> = {
  finalize: "任务完成",
  refresh: "手动刷新",
  shop_scan: "店铺扫描",
  mixed: "混合来源",
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

function distributionCount(
  distribution: CoverageDistribution,
  bucket: Exclude<CoverageBucket, "all">,
): number {
  return distribution[bucket];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderLocaleRow(locale: TsfLocaleCoverage) {
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
        {locale.cacheMissing || locale.percent == null ? "—" : `${locale.percent}%`}
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
}

function CoverageDistributionBar({
  distribution,
  activeBucket,
  onSelect,
}: {
  distribution: CoverageDistribution;
  activeBucket: CoverageBucket;
  onSelect: (bucket: CoverageBucket) => void;
}) {
  const total =
    distribution.high + distribution.mid + distribution.low + distribution.missing;
  if (total === 0) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">覆盖分布：暂无商店数据</Typography.Text>
      </Card>
    );
  }

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Typography.Text type="secondary">覆盖分布（点击筛选）</Typography.Text>
      <Flex
        style={{
          marginTop: 8,
          height: 28,
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid #f0f0f0",
        }}
      >
        {DISTRIBUTION_SEGMENTS.map((segment) => {
          const count = distributionCount(distribution, segment.bucket);
          if (count <= 0) return null;
          const widthPct = (count / total) * 100;
          return (
            <button
              key={segment.bucket}
              type="button"
              title={`${segment.label}：${count}`}
              onClick={() => onSelect(segment.bucket)}
              style={{
                width: `${widthPct}%`,
                minWidth: count > 0 ? 4 : 0,
                border: "none",
                padding: 0,
                cursor: "pointer",
                background: segment.color,
                opacity: activeBucket === segment.bucket ? 1 : 0.72,
                outline: activeBucket === segment.bucket ? "2px solid #1677ff" : "none",
                outlineOffset: -2,
              }}
            />
          );
        })}
      </Flex>
      <Flex gap={8} wrap="wrap" style={{ marginTop: 12 }}>
        {DISTRIBUTION_SEGMENTS.map((segment) => {
          const count = distributionCount(distribution, segment.bucket);
          return (
            <Button
              key={segment.bucket}
              size="small"
              type={activeBucket === segment.bucket ? "primary" : "default"}
              onClick={() => onSelect(segment.bucket)}
            >
              {segment.label} {count}
            </Button>
          );
        })}
        <Button
          size="small"
          type={activeBucket === "all" ? "primary" : "default"}
          onClick={() => onSelect("all")}
        >
          全部 {total}
        </Button>
      </Flex>
    </Card>
  );
}

export default function TsfLanguageCoverage() {
  const owner = isOwner();
  const [messageApi, messageContext] = message.useMessage();
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
  const [computingShop, setComputingShop] = useState<string | null>(null);
  const [expandedShops, setExpandedShops] = useState<Set<string>>(() => new Set());
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

  function selectBucket(next: CoverageBucket) {
    setBucket(next);
    setPage(1);
  }

  function toggleExpanded(shop: string) {
    setExpandedShops((prev) => {
      const next = new Set(prev);
      if (next.has(shop)) next.delete(shop);
      else next.add(shop);
      return next;
    });
  }

  async function computeCoverage(shop: string) {
    if (computingShop) return;
    setComputingShop(shop);
    try {
      const result = await triggerTsfLanguageCoverageRefresh(shop);
      messageApi.loading(`现算已入队 ${result.scanId.slice(0, 24)}…`, 0);
      const terminal = new Set(["COMPLETED", "PARTIAL", "FAILED"]);
      const deadline = Date.now() + 5 * 60_000;
      let finalStatus = "CREATED";
      while (Date.now() < deadline) {
        await sleep(3000);
        const detail = await fetchTsfShopProfileDetail(shop);
        const scan = detail.scan;
        if (!scan) continue;
        if (scan.id === result.scanId) {
          finalStatus = scan.status;
          if (terminal.has(scan.status)) break;
        }
      }
      messageApi.destroy();
      if (finalStatus === "FAILED") {
        messageApi.error(`${shop} 现算失败`);
      } else if (terminal.has(finalStatus)) {
        messageApi.success(`${shop} 覆盖率已更新（${finalStatus}）`);
      } else {
        messageApi.warning(`${shop} 仍在计算，稍后点右上角「刷新」`);
      }
      hardRefresh();
    } catch (err) {
      messageApi.destroy();
      messageApi.error(String(err instanceof Error ? err.message : err));
    } finally {
      setComputingShop(null);
    }
  }

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      width: 260,
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
      width: 120,
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
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatCount(row.translated)} / {formatCount(row.total)}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: "最低语言",
      key: "lowestLocale",
      width: 110,
      render: (_: unknown, row: TsfShopLanguageCoverageRow) => {
        if (!row.lowestLocale) return <Typography.Text type="secondary">—</Typography.Text>;
        const tone = coverageTone(row.lowestLocale.percent);
        return (
          <Space direction="vertical" size={2}>
            <Tag color={tone === "default" ? undefined : tone}>{row.lowestLocale.locale}</Tag>
            <Typography.Text>{row.lowestLocale.percent}%</Typography.Text>
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
        const expanded = expandedShops.has(row.shop);
        const visibleLocales = expanded
          ? row.locales
          : row.locales.slice(0, LOCALE_PREVIEW_COUNT);
        const hiddenCount = row.locales.length - visibleLocales.length;
        return (
          <Space direction="vertical" size={6} style={{ width: "100%", minWidth: 360 }}>
            {visibleLocales.map((locale) => renderLocaleRow(locale))}
            {hiddenCount > 0 ? (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => toggleExpanded(row.shop)}>
                展开 {hiddenCount} 语
              </Button>
            ) : null}
            {expanded && row.locales.length > LOCALE_PREVIEW_COUNT ? (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => toggleExpanded(row.shop)}>
                收起
              </Button>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: "来源",
      key: "coverageSourceSummary",
      width: 100,
      render: (_: unknown, row: TsfShopLanguageCoverageRow) => {
        if (!row.coverageSourceSummary) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        return <Tag>{COVERAGE_SOURCE_LABEL[row.coverageSourceSummary]}</Tag>;
      },
    },
    {
      title: "更新",
      key: "updatedAt",
      width: 140,
      align: "right" as const,
      render: (_: unknown, row: TsfShopLanguageCoverageRow) => (
        <Space direction="vertical" size={4} style={{ alignItems: "flex-end" }}>
          <Space size={4}>
            <Typography.Text type="secondary">
              {row.updatedAtLabel || "—"}
            </Typography.Text>
            {row.isStale ? <Tag color="warning">过期</Tag> : null}
          </Space>
          {owner ? (
            <Button
              size="small"
              type={row.cacheMissing ? "primary" : "default"}
              icon={<CalculatorOutlined />}
              loading={computingShop === row.shop}
              disabled={computingShop != null && computingShop !== row.shop}
              onClick={() => void computeCoverage(row.shop)}
            >
              现算
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {messageContext}
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
            超过 7 天未更新标为「过期」；「现算」入队 Worker 重算该店覆盖率。
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
          "商店列表：Turso Account；自动翻译与覆盖率均来自 ShopTargetLocale。行内「现算」= shop scan trigger=admin（仅 coverage → Turso），需 Owner。"
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
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="Turso 在装商店" value={data.stats.tursoShopCount} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="目标语言总数" value={data.stats.tursoLocaleCount} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic
              title="已统计 / 未统计"
              value={`${data.stats.shopsWithCache} / ${data.stats.shopsWithoutCache}`}
            />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic
              title="已开自动翻译"
              value={data.stats.autoTranslateShops}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic
              title="店均整体覆盖率"
              value={data.stats.avgOverallPercent ?? "—"}
              suffix={data.stats.avgOverallPercent == null ? undefined : "%"}
            />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic
              title="低覆盖 / 过期"
              value={`${data.stats.lowCoverageShops} / ${data.stats.staleShops}`}
            />
          </Card>
        </Col>
      </Row>

      <CoverageDistributionBar
        distribution={data.stats.distribution ?? EMPTY_DISTRIBUTION}
        activeBucket={bucket}
        onSelect={selectBucket}
      />

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
          scroll={{ x: 1180 }}
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
