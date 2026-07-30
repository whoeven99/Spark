import { useState, useCallback } from "react";
import {
  Input,
  Button,
  Table,
  Tag,
  Typography,
  Alert,
  Space,
  Empty,
  AutoComplete,
  Modal,
  Row,
  Col,
  Statistic,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import {
  browseValueCrc32Cache,
  TM_MODEL_OPTIONS,
  type TmValueCrc32Entry,
  type TmValueCrc32BrowseResult,
} from "../../api";

const { Text, Paragraph } = Typography;

function ttlLabel(ttl: number): string {
  if (ttl === -1) return "永久";
  if (ttl === -2) return "不存在";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.round(ttl / 60)} 分钟`;
  if (ttl < 86400) return `${Math.round(ttl / 3600)} 小时`;
  return `${Math.round(ttl / 86400)} 天`;
}

export default function ValueCrc32BrowseTab() {
  const [shop, setShop] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TmValueCrc32BrowseResult | null>(null);
  const [detailEntry, setDetailEntry] = useState<TmValueCrc32Entry | null>(null);

  const load = useCallback(async () => {
    if (!shop.trim()) {
      setError("请输入店铺域名");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await browseValueCrc32Cache({
        shop: shop.trim(),
        source: sourceFilter.trim() || undefined,
        target: targetFilter.trim() || undefined,
        model: modelFilter.trim() || undefined,
        limit: 100,
      });
      setData(result);
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shop, sourceFilter, targetFilter, modelFilter]);

  const columns = [
    {
      title: "源语言",
      dataIndex: "source",
      key: "source",
      width: 80,
      render: (t: string) => <Tag>{t}</Tag>,
    },
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
      title: "CRC-32",
      dataIndex: "keyId",
      key: "keyId",
      width: 100,
      render: (id: string) => (
        <Text copyable={{ text: id }} style={{ fontFamily: "monospace", fontSize: 11 }}>
          {id}
        </Text>
      ),
    },
    {
      title: "译文预览",
      dataIndex: "valuePreview",
      key: "valuePreview",
      render: (v: string, row: TmValueCrc32Entry) => (
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

  const byTargetEntries = data
    ? Object.entries(data.byTarget).sort((a, b) => b[1] - a[1])
    : [];
  const byModelEntries = data
    ? Object.entries(data.byModel).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Alert
        type="info"
        showIcon
        message="CRC-32 value 缓存（tm:v5:val:{source}:{target}:{model}:{crc32Hex}）"
        description="value 缓存无店铺维度。输入 shopName 后从翻译任务推断 source/target，SCAN 对应语言对并只保留 keyId 为 8 位 hex 的条目。结果可能含其他店写入的同语言对缓存。"
      />

      <Space wrap style={{ width: "100%" }}>
        <Input
          prefix={<ShopOutlined style={{ color: "#999" }} />}
          placeholder="店铺域名，如 demo.myshopify.com"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          onPressEnter={() => void load()}
          style={{ width: 280 }}
        />
        <Input
          placeholder="源语言（可选覆盖）"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          style={{ width: 140 }}
          allowClear
        />
        <Input
          placeholder="目标语言（可选）"
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          style={{ width: 140 }}
          allowClear
        />
        <AutoComplete
          value={modelFilter}
          onChange={setModelFilter}
          options={[...TM_MODEL_OPTIONS]}
          placeholder="模型（可选）"
          allowClear
          style={{ width: 180 }}
          filterOption={(input, option) => {
            const q = input.toLowerCase();
            const value = String(option?.value ?? "").toLowerCase();
            const label = String(option?.label ?? "").toLowerCase();
            return value.includes(q) || label.includes(q);
          }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => void load()} loading={loading}>
          一键查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </Space>

      {data?.sources?.length ? (
        <Text type="secondary">
          推断源语言：{data.sources.join(", ")}　目标语言：{data.targets.join(", ") || "—"}
          {data.pairCount != null ? `　语言对 ${data.pairCount}` : ""}
        </Text>
      ) : null}

      {data?.patterns?.[0] && (
        <Text type="secondary" style={{ fontFamily: "monospace", fontSize: 11 }}>
          SCAN pattern 示例: {data.patterns[0]}
          {data.patterns.length > 1 ? `（共 ${data.patterns.length} 个）` : ""}
        </Text>
      )}

      {error && <Alert type="error" message={error} showIcon />}
      {data?.note && <Alert type="warning" message={data.note} showIcon />}
      {data?.truncated && (
        <Alert type="info" message="结果已截断（语言对或条数上限），可收窄源/目标语言或模型后重查" showIcon />
      )}

      {data && (byTargetEntries.length > 0 || byModelEntries.length > 0) && (
        <Row gutter={12}>
          {byTargetEntries.map(([lang, count]) => (
            <Col key={`t-${lang}`}>
              <Statistic title={lang} value={count} suffix="条" valueStyle={{ fontSize: 18 }} />
            </Col>
          ))}
          {byModelEntries.map(([m, count]) => (
            <Col key={`m-${m}`}>
              <Statistic title={m} value={count} suffix="条" valueStyle={{ fontSize: 16 }} />
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
        pagination={data && data.entries.length > 30 ? { pageSize: 30 } : false}
        locale={{ emptyText: <Empty description="输入店铺后点击一键查询" /> }}
      />

      <Modal
        title={detailEntry ? `CRC-32 缓存 · ${detailEntry.target} · ${detailEntry.model}` : ""}
        open={!!detailEntry}
        onCancel={() => setDetailEntry(null)}
        footer={null}
        width={720}
      >
        {detailEntry && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Row gutter={16}>
              <Col span={8}>
                <Text type="secondary">源语言：</Text>
                <Tag>{detailEntry.source}</Tag>
              </Col>
              <Col span={8}>
                <Text type="secondary">模型：</Text>
                <Text code>{detailEntry.model}</Text>
              </Col>
              <Col span={8}>
                <Text type="secondary">TTL：</Text>
                {ttlLabel(detailEntry.ttl)}
              </Col>
            </Row>
            <div>
              <Text type="secondary">CRC-32 keyId</Text>
              <Paragraph copyable style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 0 }}>
                {detailEntry.keyId}
              </Paragraph>
            </div>
            <div>
              <Text type="secondary">Redis Key</Text>
              <Paragraph copyable style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 0 }}>
                {detailEntry.key}
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
                {detailEntry.value}
              </pre>
            </div>
          </Space>
        )}
      </Modal>
    </Space>
  );
}
