import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  fetchSingleTranslateLogConfig,
  fetchSingleTranslateLogs,
  type SingleTranslateCreditRecord,
  type SingleTranslateLogConfig,
  type SingleTranslateLogStats,
} from "../../api";

type AppliedFilters = {
  shop: string;
  keyword: string;
  range: [number, number];
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("zh-CN");
}

function localeLabel(row: SingleTranslateCreditRecord): string {
  const source = row.metadata.sourceLocale;
  const target = row.metadata.target;
  if (source && target) return `${source}→${target}`;
  return target ?? source ?? "-";
}

export default function TsfSingleTranslateLogs() {
  const [config, setConfig] = useState<SingleTranslateLogConfig | null>(null);
  const [shop, setShop] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([
    dayjs().subtract(24, "hour"),
    dayjs(),
  ]);

  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [records, setRecords] = useState<SingleTranslateCreditRecord[]>([]);
  const [stats, setStats] = useState<SingleTranslateLogStats | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [note, setNote] = useState<string | undefined>();

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRecord, setActiveRecord] =
    useState<SingleTranslateCreditRecord | null>(null);

  useEffect(() => {
    fetchSingleTranslateLogConfig()
      .then(setConfig)
      .catch((e) => setError(String(e)));
  }, []);

  const loadPage = useCallback(
    (filters: AppliedFilters, nextCursor: string | null, append: boolean) => {
      const setBusy = append ? setLoadingMore : setLoading;
      setBusy(true);
      setError("");

      fetchSingleTranslateLogs({
        shop: filters.shop,
        from: filters.range[0],
        to: filters.range[1],
        keyword: filters.keyword || undefined,
        cursor: nextCursor,
      })
        .then((r) => {
          setRecords((prev) => (append ? [...prev, ...r.records] : r.records));
          setStats(r.stats);
          setCursor(r.cursor);
          setHasMore(r.hasMore);
          setNote(r.note);
        })
        .catch((e) => {
          if (!append) {
            setRecords([]);
            setStats(null);
          }
          setError(String(e));
        })
        .finally(() => setBusy(false));
    },
    [],
  );

  function search() {
    const trimmed = shop.trim();
    if (!trimmed) {
      setError("请输入商店域名");
      return;
    }
    if (!range?.[0] || !range[1]) {
      setError("请选择时间范围");
      return;
    }

    const filters: AppliedFilters = {
      shop: trimmed,
      keyword: keyword.trim(),
      range: [range[0].valueOf(), range[1].valueOf()],
    };
    setApplied(filters);
    setSearched(true);
    setCursor(null);
    loadPage(filters, null, false);
  }

  function loadMore() {
    if (!applied || !cursor || !hasMore) return;
    loadPage(applied, cursor, true);
  }

  function openRecord(record: SingleTranslateCreditRecord) {
    setActiveRecord(record);
    setDrawerOpen(true);
  }

  const columns = [
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "time",
      width: 168,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "语言对",
      key: "locale",
      width: 110,
      render: (_: unknown, row: SingleTranslateCreditRecord) => localeLabel(row),
    },
    {
      title: "字段",
      key: "fieldKey",
      width: 120,
      ellipsis: true,
      render: (_: unknown, row: SingleTranslateCreditRecord) =>
        row.metadata.fieldKey ?? "-",
    },
    {
      title: "类型",
      key: "shopifyType",
      width: 120,
      ellipsis: true,
      render: (_: unknown, row: SingleTranslateCreditRecord) =>
        row.metadata.shopifyType ?? "-",
    },
    {
      title: "模型",
      key: "aiModel",
      width: 130,
      ellipsis: true,
      render: (_: unknown, row: SingleTranslateCreditRecord) =>
        row.metadata.aiModel ?? "-",
    },
    {
      title: "计费积分",
      dataIndex: "credits",
      key: "credits",
      width: 90,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "LLM Tokens",
      key: "rawTokens",
      width: 100,
      render: (_: unknown, row: SingleTranslateCreditRecord) => {
        const v = row.metadata.rawTokens;
        return v != null ? v.toLocaleString() : "-";
      },
    },
    {
      title: "原文字数",
      key: "textLength",
      width: 90,
      render: (_: unknown, row: SingleTranslateCreditRecord) => {
        const v = row.metadata.textLength;
        return v != null ? v.toLocaleString() : "-";
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        单字段翻译日志
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        只读查询 TSF Turso <code>CreditUsage</code>（<code>source=single</code>
        ）扣费审计。记录每次 manage 单字段翻译的计费积分与元数据，不含原文/译文正文。
      </Typography.Paragraph>

      {config ? (
        <Alert
          type="info"
          showIcon
          message={`数据源：CreditUsage · 默认时间窗 ${config.defaultWindowHours} 小时`}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="商店域名，如 foo 或 foo.myshopify.com"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          style={{ width: 280 }}
          onPressEnter={search}
        />
        <DatePicker.RangePicker
          showTime
          value={range}
          onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
        />
        <Input
          placeholder="关键字（字段/类型/模型/语言）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 220 }}
          onPressEnter={search}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
          查询
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={search}
          disabled={!searched}
        >
          刷新
        </Button>
      </Space>

      {stats && searched ? (
        <Space size="large" style={{ marginBottom: 16 }}>
          <Statistic title="时间窗内总次数" value={stats.totalCount} />
          <Statistic title="计费积分合计" value={stats.totalCredits} />
          <Statistic title="LLM Tokens 合计" value={stats.totalRawTokens} />
        </Space>
      ) : null}

      {error ? (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      ) : null}
      {note ? (
        <Alert type="info" message={note} showIcon style={{ marginBottom: 16 }} />
      ) : null}

      <Spin spinning={loading}>
        {!searched ? (
          <Empty description="输入商店并查询" />
        ) : (
          <>
            <Table<SingleTranslateCreditRecord>
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={records}
              pagination={false}
              locale={{ emptyText: "无匹配记录" }}
              onRow={(record) => ({
                onClick: () => openRecord(record),
                style: { cursor: "pointer" },
              })}
            />
            <Space style={{ marginTop: 16 }}>
              {hasMore ? (
                <Button loading={loadingMore} onClick={loadMore}>
                  加载更多
                </Button>
              ) : null}
              <Typography.Text type="secondary">
                已展示 {records.length} 条
                {stats ? ` / 时间窗共 ${stats.totalCount} 条` : ""}
              </Typography.Text>
            </Space>
          </>
        )}
      </Spin>

      <Drawer
        title="单字段翻译详情"
        width={640}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {activeRecord ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="时间">
                {fmtDate(activeRecord.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="商店">
                {activeRecord.shop}
              </Descriptions.Item>
              <Descriptions.Item label="计费积分">
                <Tag color="blue">{activeRecord.credits}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="语言对">
                {localeLabel(activeRecord)}
              </Descriptions.Item>
              <Descriptions.Item label="字段">
                {activeRecord.metadata.fieldKey ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Shopify 类型">
                {activeRecord.metadata.shopifyType ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="AI 模型">
                {activeRecord.metadata.aiModel ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="LLM Tokens">
                {activeRecord.metadata.rawTokens?.toLocaleString() ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Google 积分">
                {activeRecord.metadata.googleCredits?.toLocaleString() ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="原文字数">
                {activeRecord.metadata.textLength?.toLocaleString() ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="referenceId">
                <Typography.Text copyable code>
                  {activeRecord.referenceId}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="CreditUsage id">
                <Typography.Text copyable code>
                  {activeRecord.id}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
              message="审计记录不含原文/译文"
              description="如需排查翻译质量，请结合 Render 运行时日志或商户反馈；本页仅反映成功扣费后的审计元数据。"
            />
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
