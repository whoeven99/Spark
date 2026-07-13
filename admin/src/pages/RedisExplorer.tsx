import { useState, useCallback } from "react";
import {
  Tabs,
  Input,
  Button,
  Table,
  Tag,
  Typography,
  Alert,
  Space,
  Empty,
  Select,
  AutoComplete,
  Modal,
  Form,
  Row,
  Col,
  Statistic,
  message,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  TranslationOutlined,
  ShopOutlined,
  FileTextOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import {
  lookupTmCache,
  browseTmCache,
  fetchShopTmTargets,
  TM_MODEL_OPTIONS,
  DEFAULT_TM_MODEL,
  type TmLookupRow,
  type TmLookupResult,
  type TmBrowseEntry,
  type TmBrowseResult,
} from "../api";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

function ttlLabel(ttl: number): string {
  if (ttl === -1) return "永久";
  if (ttl === -2) return "不存在";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.round(ttl / 60)} 分钟`;
  if (ttl < 86400) return `${Math.round(ttl / 3600)} 小时`;
  return `${Math.round(ttl / 86400)} 天`;
}

function SharedFields({
  shop,
  model,
  targets,
  onModelChange,
  onTargetsChange,
}: {
  shop?: string;
  model: string;
  targets: string[];
  onModelChange: (v: string) => void;
  onTargetsChange: (v: string[]) => void;
}) {
  const [fillingTargets, setFillingTargets] = useState(false);

  async function fillTargetsFromJobs() {
    if (!shop?.trim()) {
      message.warning("请先填写店铺域名");
      return;
    }
    setFillingTargets(true);
    try {
      const data = await fetchShopTmTargets(shop.trim());
      if (data.targets.length === 0) {
        message.info(data.note ?? "未找到该店铺的目标语言");
        return;
      }
      onTargetsChange(data.targets);
      message.success(data.note ?? `已填充 ${data.targets.length} 个语言`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setFillingTargets(false);
    }
  }

  return (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item label="翻译模型" style={{ marginBottom: 12 }}>
          <AutoComplete
            value={model}
            onChange={onModelChange}
            options={[...TM_MODEL_OPTIONS]}
            placeholder="选择或输入模型 id"
            allowClear
            filterOption={(input, option) => {
              const q = input.toLowerCase();
              const value = String(option?.value ?? "").toLowerCase();
              const label = String(option?.label ?? "").toLowerCase();
              return value.includes(q) || label.includes(q);
            }}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Col>
      <Col span={16}>
        <Form.Item
          label="目标语言"
          style={{ marginBottom: 12 }}
          extra={
            shop ? (
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: "auto" }}
                loading={fillingTargets}
                onClick={fillTargetsFromJobs}
              >
                从翻译任务推断
              </Button>
            ) : (
              "填写店铺后可从 Cosmos 翻译任务自动推断"
            )
          }
        >
          <Select
            mode="tags"
            value={targets}
            onChange={onTargetsChange}
            placeholder="输入目标语言，如 fr、zh-CN"
            style={{ width: "100%" }}
            tokenSeparators={[",", " "]}
          />
        </Form.Item>
      </Col>
    </Row>
  );
}

function LookupResultTable({
  results,
  showModel,
  onShowValue,
}: {
  results: TmLookupRow[];
  showModel?: boolean;
  onShowValue: (row: TmLookupRow) => void;
}) {
  const columns = [
    {
      title: "目标语言",
      dataIndex: "target",
      key: "target",
      width: 100,
      render: (t: string) => <Tag color="blue">{t}</Tag>,
    },
    ...(showModel
      ? [
          {
            title: "模型",
            dataIndex: "model",
            key: "model",
            width: 140,
            render: (m: string) => <Text code style={{ fontSize: 11 }}>{m}</Text>,
          },
        ]
      : []),
    {
      title: "命中",
      dataIndex: "hit",
      key: "hit",
      width: 80,
      render: (hit: boolean) =>
        hit ? <Tag color="success">命中</Tag> : <Tag>未命中</Tag>,
    },
    {
      title: "缓存类型",
      dataIndex: "cacheType",
      key: "cacheType",
      width: 90,
      render: (t: string) => (
        <Tag color={t === "value" ? "purple" : "green"}>{t}</Tag>
      ),
    },
    {
      title: "译文预览",
      dataIndex: "value",
      key: "value",
      ellipsis: true,
      render: (v: string | null, row: TmLookupRow) =>
        v ? (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onShowValue(row)}>
            {v.length > 80 ? `${v.slice(0, 80)}…` : v}
          </Button>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "TTL",
      dataIndex: "ttl",
      key: "ttl",
      width: 90,
      render: (ttl: number) => <Text type="secondary">{ttlLabel(ttl)}</Text>,
    },
    {
      title: "Redis Key",
      dataIndex: "key",
      key: "key",
      width: 200,
      ellipsis: true,
      render: (k: string) => (
        <Text copyable={{ text: k }} style={{ fontFamily: "monospace", fontSize: 11 }}>
          {k.length > 36 ? `…${k.slice(-34)}` : k}
        </Text>
      ),
    },
  ];

  const hitCount = results.filter((r) => r.hit).length;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="small">
      <Text type="secondary">
        共 {results.length} 种语言，命中 {hitCount} 个
      </Text>
      <Table
        dataSource={results}
        columns={columns}
        rowKey={(r) => `${r.target}:${r.model}`}
        size="small"
        pagination={results.length > 30 ? { pageSize: 30 } : false}
        locale={{ emptyText: <Empty description="暂无结果" /> }}
      />
    </Space>
  );
}

function TextLookupTab() {
  const [shop, setShop] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [source, setSource] = useState("en");
  const [digest, setDigest] = useState("");
  const [model, setModel] = useState(DEFAULT_TM_MODEL);
  const [targets, setTargets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TmLookupResult | null>(null);
  const [detailRow, setDetailRow] = useState<TmLookupRow | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await lookupTmCache({
        mode: "text",
        sourceText,
        source,
        digest: digest.trim() || undefined,
        model,
        targets,
      });
      setResult(data);
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [sourceText, source, digest, model, targets]);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Alert
        type="info"
        showIcon
        message="按原文查询（value 缓存 tm:v5:val:{source}:{target}:{model}:{keyId}）"
        description="跨店复用。有 Shopify digest 时 keyId 用 digest；否则对原文算 CRC-32（8 位 hex）。与「按 digest」主缓存（带店铺）是两套 key。"
      />

      <Form layout="vertical">
        <Form.Item label="店铺（可选，用于推断目标语言）">
          <Input
            prefix={<ShopOutlined style={{ color: "#999" }} />}
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="demo.myshopify.com"
          />
        </Form.Item>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label="源语言" required>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="en"
              />
            </Form.Item>
          </Col>
          <Col span={18}>
            <Form.Item
              label="digest（可选）"
              extra="有 digest 时优先用作 keyId；留空则对原文 CRC-32"
            >
              <Input
                value={digest}
                onChange={(e) => setDigest(e.target.value)}
                placeholder="Shopify 字段 digest"
                style={{ fontFamily: "monospace" }}
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="原文" required>
          <TextArea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="输入要查询的源文本，如 Add to cart"
            rows={3}
            showCount
          />
        </Form.Item>
        <SharedFields
          shop={shop}
          model={model}
          targets={targets}
          onModelChange={setModel}
          onTargetsChange={setTargets}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={search} loading={loading}>
          查询各语言缓存
        </Button>
      </Form>

      {error && <Alert type="error" message={error} showIcon />}
      {result && (
        <>
          {result.note && <Alert type="info" message={result.note} showIcon />}
          {result.keyId && (
            <Text type="secondary" style={{ fontFamily: "monospace" }}>
              keyId: {result.keyId}
            </Text>
          )}
          <LookupResultTable results={result.results} onShowValue={setDetailRow} />
        </>
      )}

      <ValueDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </Space>
  );
}

function DigestLookupTab() {
  const [shop, setShop] = useState("");
  const [digest, setDigest] = useState("");
  const [model, setModel] = useState(DEFAULT_TM_MODEL);
  const [targets, setTargets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAllModels, setLoadingAllModels] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TmLookupResult | null>(null);
  const [detailRow, setDetailRow] = useState<TmLookupRow | null>(null);

  const search = useCallback(
    async (tryAllModels = false) => {
      if (tryAllModels) setLoadingAllModels(true);
      else setLoading(true);
      setError("");
      try {
        const data = await lookupTmCache({
          mode: "digest",
          shop,
          digest,
          model: tryAllModels ? undefined : model,
          targets,
          tryAllModels,
        });
        setResult(data);
      } catch (e) {
        setError(String(e));
        setResult(null);
      } finally {
        setLoading(false);
        setLoadingAllModels(false);
      }
    },
    [shop, digest, model, targets],
  );

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Alert
        type="info"
        showIcon
        message="按 digest 查询（主缓存 tm:v5:{shop}:{target}:{model}:{digest}）"
        description="适用于长文本、HTML 或任意 Shopify 字段。digest 可从翻译任务详情 / Shopify translatableResources 获取。"
      />

      <Form layout="vertical">
        <Form.Item label="店铺" required>
          <Input
            prefix={<ShopOutlined style={{ color: "#999" }} />}
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="demo.myshopify.com"
          />
        </Form.Item>
        <Form.Item label="digest" required>
          <TextArea
            value={digest}
            onChange={(e) => setDigest(e.target.value)}
            placeholder="Shopify 字段 digest"
            rows={2}
            style={{ fontFamily: "monospace" }}
          />
        </Form.Item>
        <SharedFields
          shop={shop}
          model={model}
          targets={targets}
          onModelChange={setModel}
          onTargetsChange={setTargets}
        />
        <Space>
          <Button type="primary" icon={<SearchOutlined />} onClick={() => search(false)} loading={loading}>
            查询各语言缓存
          </Button>
          <Button onClick={() => search(true)} loading={loadingAllModels}>
            尝试全部常见模型
          </Button>
        </Space>
      </Form>

      {error && <Alert type="error" message={error} showIcon />}
      {result && (
        <>
          {result.note && <Alert type="info" message={result.note} showIcon />}
          <LookupResultTable
            results={result.results}
            showModel={Boolean(result.tryAllModels)}
            onShowValue={setDetailRow}
          />
        </>
      )}

      <ValueDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </Space>
  );
}

function ShopBrowseTab() {
  const [shop, setShop] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [targetOptions, setTargetOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fillingTargets, setFillingTargets] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TmBrowseResult | null>(null);
  const [detailEntry, setDetailEntry] = useState<TmBrowseEntry | null>(null);
  const [cursor, setCursor] = useState("0");

  async function fillTargetOptions() {
    if (!shop.trim()) {
      message.warning("请先输入店铺域名");
      return;
    }
    setFillingTargets(true);
    try {
      const res = await fetchShopTmTargets(shop.trim());
      setTargetOptions(res.targets);
      message.success(res.note ?? `已加载 ${res.targets.length} 个语言`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setFillingTargets(false);
    }
  }

  const load = useCallback(
    async (nextCursor = "0", append = false) => {
      if (!shop.trim()) {
        setError("请输入店铺域名");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const result = await browseTmCache({
          shop: shop.trim(),
          target: targetFilter || undefined,
          cursor: nextCursor,
          limit: 50,
        });
        setCursor(result.cursor);
        setData((prev) => {
          const entries =
            append && prev ? [...prev.entries, ...result.entries] : result.entries;
          const byTarget: Record<string, number> = {};
          for (const e of entries) {
            byTarget[e.target] = (byTarget[e.target] ?? 0) + 1;
          }
          return { ...result, entries, byTarget };
        });
      } catch (e) {
        setError(String(e));
        if (!append) setData(null);
      } finally {
        setLoading(false);
      }
    },
    [shop, targetFilter],
  );

  const columns = [
    {
      title: "目标语言",
      dataIndex: "target",
      key: "target",
      width: 100,
      render: (t: string) => <Tag color="blue">{t}</Tag>,
    },
    {
      title: "模型",
      dataIndex: "model",
      key: "model",
      width: 140,
      render: (m: string) => <Text code style={{ fontSize: 11 }}>{m}</Text>,
    },
    {
      title: "digest",
      dataIndex: "digest",
      key: "digest",
      width: 160,
      ellipsis: true,
      render: (d: string) => (
        <Text copyable={{ text: d }} style={{ fontFamily: "monospace", fontSize: 11 }}>
          {d.length > 24 ? `${d.slice(0, 24)}…` : d}
        </Text>
      ),
    },
    {
      title: "译文预览",
      dataIndex: "valuePreview",
      key: "valuePreview",
      render: (v: string, row: TmBrowseEntry) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setDetailEntry(row)}>
          {v}
        </Button>
      ),
    },
    {
      title: "TTL",
      dataIndex: "ttl",
      key: "ttl",
      width: 90,
      render: (ttl: number) => <Text type="secondary">{ttlLabel(ttl)}</Text>,
    },
  ];

  const byTargetEntries = data
    ? Object.entries(data.byTarget).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Alert
        type="info"
        showIcon
        message="按店铺浏览 digest 型 TM 缓存"
        description="严格 cursor 分页（每页最多 6 轮 SCAN）。填写目标语言后 pattern 收窄为 tm:v5:{shop}:{target}:*。value 缓存 tm:v5:val 无店铺维度，请用「按原文」查询。"
      />

      <Space wrap style={{ width: "100%" }}>
        <Input
          prefix={<ShopOutlined style={{ color: "#999" }} />}
          placeholder="店铺域名，如 demo.myshopify.com"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          onPressEnter={() => load("0", false)}
          style={{ width: 280 }}
        />
        <Select
          allowClear
          showSearch
          placeholder="目标语言过滤（可选）"
          value={targetFilter || undefined}
          onChange={(v) => setTargetFilter(v ?? "")}
          options={targetOptions.map((t) => ({ value: t, label: t }))}
          style={{ width: 180 }}
          dropdownRender={(menu) => (
            <>
              {menu}
              <div style={{ padding: "4px 8px", borderTop: "1px solid #f0f0f0" }}>
                <Button
                  type="link"
                  size="small"
                  loading={fillingTargets}
                  onClick={fillTargetOptions}
                  disabled={!shop.trim()}
                >
                  从翻译任务加载语言列表
                </Button>
              </div>
            </>
          )}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => load("0", false)} loading={loading}>
          扫描
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => load("0", false)} disabled={loading}>
          刷新
        </Button>
      </Space>

      {data?.pattern && (
        <Text type="secondary" style={{ fontFamily: "monospace", fontSize: 11 }}>
          SCAN pattern: {data.pattern}
        </Text>
      )}

      {error && <Alert type="error" message={error} showIcon />}
      {data?.note && <Alert type="warning" message={data.note} showIcon />}

      {data && byTargetEntries.length > 0 && (
        <Row gutter={12}>
          {byTargetEntries.map(([lang, count]) => (
            <Col key={lang}>
              <Statistic title={lang} value={count} suffix="条" valueStyle={{ fontSize: 18 }} />
            </Col>
          ))}
        </Row>
      )}

      <Table
        dataSource={data?.entries ?? []}
        columns={columns}
        rowKey="key"
        size="small"
        loading={loading}
        pagination={false}
        locale={{ emptyText: <Empty description="输入店铺后点击扫描" /> }}
      />

      {data?.hasMore && (
        <Button onClick={() => load(cursor, true)} loading={loading}>
          加载更多
        </Button>
      )}

      <BrowseDetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />
    </Space>
  );
}

function ValueDetailModal({
  row,
  onClose,
}: {
  row: TmLookupRow | null;
  onClose: () => void;
}) {
  return (
    <Modal
      title={row ? `译文详情 · ${row.target} · ${row.model}` : ""}
      open={!!row}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      {row && (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary">模型：</Text>
              <Text code>{row.model}</Text>
            </Col>
            <Col span={12}>
              <Text type="secondary">TTL：</Text>
              {ttlLabel(row.ttl)}
            </Col>
          </Row>
          <div>
            <Text type="secondary">Redis Key</Text>
            <Paragraph copyable style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 0 }}>
              {row.key}
            </Paragraph>
          </div>
          <div>
            <Text type="secondary">缓存译文</Text>
            <pre
              style={{
                background: "#fafafa",
                padding: 12,
                borderRadius: 4,
                maxHeight: 400,
                overflow: "auto",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {row.value}
            </pre>
          </div>
        </Space>
      )}
    </Modal>
  );
}

function BrowseDetailModal({
  entry,
  onClose,
}: {
  entry: TmBrowseEntry | null;
  onClose: () => void;
}) {
  return (
    <Modal
      title={entry ? `缓存条目 · ${entry.target}` : ""}
      open={!!entry}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      {entry && (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Row gutter={16}>
            <Col span={12}><Text type="secondary">模型：</Text><Text code>{entry.model}</Text></Col>
            <Col span={12}><Text type="secondary">TTL：</Text>{ttlLabel(entry.ttl)}</Col>
          </Row>
          <div>
            <Text type="secondary">digest</Text>
            <Paragraph copyable style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 0 }}>
              {entry.digest}
            </Paragraph>
          </div>
          <div>
            <Text type="secondary">Redis Key</Text>
            <Paragraph copyable style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 0 }}>
              {entry.key}
            </Paragraph>
          </div>
          <div>
            <Text type="secondary">缓存译文</Text>
            <pre
              style={{
                background: "#fafafa",
                padding: 12,
                borderRadius: 4,
                maxHeight: 400,
                overflow: "auto",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {entry.value}
            </pre>
          </div>
        </Space>
      )}
    </Modal>
  );
}

export default function RedisExplorer() {
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <div>
        <Title level={4} style={{ marginBottom: 4 }}>翻译 TM 缓存</Title>
        <Text type="secondary">
          查询 worker 写入 Redis 的翻译记忆（tm:v5），与翻译流水线读写规则一致。
        </Text>
      </div>

      <Tabs
        defaultActiveKey="text"
        items={[
          {
            key: "text",
            label: (
              <Space>
                <FileTextOutlined />
                按原文
              </Space>
            ),
            children: <TextLookupTab />,
          },
          {
            key: "digest",
            label: (
              <Space>
                <KeyOutlined />
                按 digest
              </Space>
            ),
            children: <DigestLookupTab />,
          },
          {
            key: "browse",
            label: (
              <Space>
                <ShopOutlined />
                按店铺浏览
              </Space>
            ),
            children: <ShopBrowseTab />,
          },
        ]}
      />
    </Space>
  );
}
