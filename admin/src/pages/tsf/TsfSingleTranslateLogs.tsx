import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Segmented,
  Space,
  Spin,
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
  type SingleTranslateLogConfig,
  type SingleTranslateLogEnv,
  type SingleTranslateLogKind,
  type SingleTranslateLogRecord,
} from "../../api";

const LOG_TYPE_OPTIONS: { label: string; value: SingleTranslateLogKind }[] = [
  { label: "result", value: "result" },
  { label: "request", value: "request" },
  { label: "llm", value: "llm" },
];

function statusColor(status: string | null): string {
  if (!status) return "default";
  if (status === "translated") return "success";
  if (status === "fallback") return "warning";
  return "default";
}

function prettyJson(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string {
  const v = payload[key];
  return typeof v === "string" ? v : "";
}

type AppliedFilters = {
  shop: string;
  env: SingleTranslateLogEnv;
  types: SingleTranslateLogKind[];
  keyword: string;
  range: [number, number];
};

export default function TsfSingleTranslateLogs() {
  const [config, setConfig] = useState<SingleTranslateLogConfig | null>(null);
  const [shop, setShop] = useState("");
  const [env, setEnv] = useState<SingleTranslateLogEnv>("prod");
  const [types, setTypes] = useState<SingleTranslateLogKind[]>([
    "result",
    "request",
    "llm",
  ]);
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([
    dayjs().subtract(24, "hour"),
    dayjs(),
  ]);

  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [records, setRecords] = useState<SingleTranslateLogRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [fetchedLogLines, setFetchedLogLines] = useState(0);
  const [note, setNote] = useState<string | undefined>();

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<SingleTranslateLogRecord | null>(
    null,
  );

  useEffect(() => {
    fetchSingleTranslateLogConfig()
      .then(setConfig)
      .catch((e) => setError(String(e)));
  }, []);

  const loadPage = useCallback(
    (filters: AppliedFilters, nextCursor: string | null, append: boolean) => {
      if (!config?.configured) return;
      const setBusy = append ? setLoadingMore : setLoading;
      setBusy(true);
      setError("");

      fetchSingleTranslateLogs({
        shop: filters.shop,
        env: filters.env,
        from: filters.range[0],
        to: filters.range[1],
        types: filters.types,
        keyword: filters.keyword || undefined,
        cursor: nextCursor,
      })
        .then((r) => {
          setRecords((prev) => (append ? [...prev, ...r.records] : r.records));
          setCursor(r.cursor);
          setHasMore(r.hasMore);
          setFetchedLogLines((prev) =>
            append ? prev + r.fetchedLogLines : r.fetchedLogLines,
          );
          setNote(r.note);
        })
        .catch((e) => {
          if (!append) setRecords([]);
          setError(String(e));
        })
        .finally(() => setBusy(false));
    },
    [config?.configured],
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
    if (types.length === 0) {
      setError("请至少选择一种日志类型");
      return;
    }

    const filters: AppliedFilters = {
      shop: trimmed,
      env,
      types,
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

  function openRecord(record: SingleTranslateLogRecord) {
    setActiveRecord(record);
    setDrawerOpen(true);
  }

  const columns = [
    {
      title: "时间",
      dataIndex: "timestampMs",
      key: "time",
      width: 168,
      render: (v: number) =>
        v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "语言对",
      key: "locale",
      width: 100,
      render: (_: unknown, row: SingleTranslateLogRecord) =>
        row.source && row.target ? `${row.source}→${row.target}` : "-",
    },
    {
      title: "字段",
      dataIndex: "fieldKey",
      key: "fieldKey",
      width: 120,
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (v: string | null) =>
        v ? <Tag color={statusColor(v)}>{v}</Tag> : "-",
    },
    {
      title: "模型",
      dataIndex: "aiModel",
      key: "aiModel",
      width: 130,
      ellipsis: true,
    },
    {
      title: "Tokens",
      dataIndex: "usedTokens",
      key: "usedTokens",
      width: 80,
      render: (v: number | null) => (v != null ? v.toLocaleString() : "-"),
    },
    {
      title: "译文预览",
      dataIndex: "translatedPreview",
      key: "preview",
      ellipsis: true,
    },
  ];

  const llmPayload = activeRecord?.llm?.payload ?? {};
  const llmRequestId =
    typeof llmPayload.requestId === "string" ? llmPayload.requestId : null;
  const llmModel =
    typeof llmPayload.model === "string" ? llmPayload.model : null;
  const llmTokens =
    typeof llmPayload.tokens === "number" ? llmPayload.tokens : null;

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        单字段翻译日志
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        查询 manage 翻译页「单字段翻译」在 TSF Web Render 容器中的运行时日志（
        <code>[single] result</code> / <code>[single-llm] return</code>
        ）。Render 保留期有限，建议默认查最近 24 小时。
      </Typography.Paragraph>

      {!config?.configured ? (
        <Alert
          type="warning"
          showIcon
          message="Render 日志未配置"
          description="请在 Admin 环境变量中设置 RENDER_API_KEY（可选 RENDER_OWNER_ID）。"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={env}
          onChange={(v) => setEnv(v as SingleTranslateLogEnv)}
          options={[
            { label: "PROD", value: "prod" },
            { label: "TEST", value: "test" },
          ]}
        />
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
        <Checkbox.Group
          options={LOG_TYPE_OPTIONS}
          value={types}
          onChange={(v) => setTypes(v as SingleTranslateLogKind[])}
        />
        <Input
          placeholder="关键字（字段/原文/译文）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 200 }}
          onPressEnter={search}
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={search}
          disabled={!config?.configured}
        >
          查询
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={search}
          disabled={!config?.configured || !searched}
        >
          刷新
        </Button>
      </Space>

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
            <Table<SingleTranslateLogRecord>
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
                  加载更多 Render 日志
                </Button>
              ) : null}
              <Typography.Text type="secondary">
                共 {records.length} 条聚合记录
                {fetchedLogLines > 0 ? `（已扫描 ${fetchedLogLines} 行原始日志）` : ""}
              </Typography.Text>
            </Space>
          </>
        )}
      </Spin>

      <Drawer
        title="单字段翻译详情"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
      >
        {activeRecord ? (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="时间">
                {new Date(activeRecord.timestampMs).toLocaleString("zh-CN")}
              </Descriptions.Item>
              <Descriptions.Item label="商店">{activeRecord.shop}</Descriptions.Item>
              <Descriptions.Item label="语言对">
                {activeRecord.source && activeRecord.target
                  ? `${activeRecord.source} → ${activeRecord.target}`
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="字段">{activeRecord.fieldKey ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="类型">{activeRecord.shopifyType ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="模型">{activeRecord.aiModel ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {activeRecord.status ? (
                  <Tag color={statusColor(activeRecord.status)}>{activeRecord.status}</Tag>
                ) : (
                  "-"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="usedTokens">
                {activeRecord.usedTokens?.toLocaleString() ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="googleCredits">
                {activeRecord.googleCredits ?? "-"}
              </Descriptions.Item>
            </Descriptions>

            <Collapse
              defaultActiveKey={["text", "prompt", "llm"]}
              items={[
                {
                  key: "text",
                  label: "原文 / 译文",
                  children: (
                    <>
                      <Typography.Text strong>原文</Typography.Text>
                      <Typography.Paragraph
                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                      >
                        {activeRecord.original || activeRecord.originalPreview || "—"}
                      </Typography.Paragraph>
                      <Typography.Text strong>译文</Typography.Text>
                      <Typography.Paragraph
                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
                      >
                        {activeRecord.translated || activeRecord.translatedPreview || "—"}
                      </Typography.Paragraph>
                    </>
                  ),
                },
                {
                  key: "prompt",
                  label: "自定义 prompt",
                  children: activeRecord.customPrompt ? (
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                      {activeRecord.customPrompt}
                    </Typography.Paragraph>
                  ) : (
                    <Typography.Text type="secondary">无</Typography.Text>
                  ),
                },
                {
                  key: "llm",
                  label: "LLM 明细",
                  children: activeRecord.llm ? (
                    <>
                      <Descriptions size="small" column={1} bordered>
                        <Descriptions.Item label="model">{llmModel ?? "-"}</Descriptions.Item>
                        <Descriptions.Item label="requestId">
                          {llmRequestId ? (
                            <Typography.Text copyable>{llmRequestId}</Typography.Text>
                          ) : (
                            "-"
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="tokens">
                          {llmTokens?.toLocaleString() ?? "-"}
                        </Descriptions.Item>
                      </Descriptions>
                      <Typography.Text strong>messages</Typography.Text>
                      <pre
                        style={{
                          fontSize: 11,
                          maxHeight: 240,
                          overflow: "auto",
                          background: "#f6f7f9",
                          padding: 12,
                          borderRadius: 6,
                        }}
                      >
                        {prettyJson(llmPayload.prompt ?? llmPayload.messages)}
                      </pre>
                      <Typography.Text strong>raw 响应</Typography.Text>
                      <pre
                        style={{
                          fontSize: 11,
                          maxHeight: 240,
                          overflow: "auto",
                          background: "#f6f7f9",
                          padding: 12,
                          borderRadius: 6,
                        }}
                      >
                        {readPayloadString(llmPayload, "raw") || "—"}
                      </pre>
                    </>
                  ) : (
                    <Typography.Text type="secondary">
                      未在 ±60s 窗口内匹配到 [single-llm] return
                    </Typography.Text>
                  ),
                },
                {
                  key: "raw",
                  label: "原始日志",
                  children: (
                    <pre
                      style={{
                        fontSize: 11,
                        maxHeight: 320,
                        overflow: "auto",
                        background: "#f6f7f9",
                        padding: 12,
                        borderRadius: 6,
                      }}
                    >
                      {activeRecord.rawMessages.join("\n\n---\n\n") || "—"}
                    </pre>
                  ),
                },
              ]}
            />
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
