import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
  Upload,
  message,
} from "antd";
import { DownloadOutlined, DeleteOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import {
  batchDeleteShopifyTranslationsCsv,
  checkShopifyTranslationSession,
  deleteShopifyTranslation,
  exportTranslationRowsToCsv,
  fetchShopifyTranslationResourceTypes,
  importShopifyQueryCsv,
  importShopifyStandardCsv,
  queryShopifyTranslations,
  registerShopifyTranslation,
  type BatchDeleteCsvResult,
  type ShopifyTranslationRow,
} from "../api";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

function QueryExportTab() {
  const [shopName, setShopName] = useState("");
  const [targetLocale, setTargetLocale] = useState("");
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>(["PRODUCT", "METAFIELD"]);
  const [rows, setRows] = useState<ShopifyTranslationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);

  useEffect(() => {
    fetchShopifyTranslationResourceTypes()
      .then((d) => setResourceTypes(d.resourceTypes))
      .catch((e) => message.error(String(e)));
  }, []);

  const onCheckSession = async () => {
    if (!shopName.trim()) {
      message.warning("请输入商店名");
      return;
    }
    setCheckingSession(true);
    try {
      const info = await checkShopifyTranslationSession(shopName.trim());
      setSessionOk(true);
      setShopName(info.shop);
      message.success(`已找到 Session${info.scope ? `，scope: ${info.scope}` : ""}`);
    } catch (e) {
      setSessionOk(false);
      message.error(String(e));
    } finally {
      setCheckingSession(false);
    }
  };

  const onQuery = async () => {
    if (!shopName.trim() || !targetLocale.trim()) {
      message.warning("请填写商店名与目标语言");
      return;
    }
    if (!selectedModules.length) {
      message.warning("请至少选择一个模块");
      return;
    }
    setLoading(true);
    try {
      const result = await queryShopifyTranslations({
        shopName: shopName.trim(),
        targetLocale: targetLocale.trim(),
        selectedModules,
      });
      setRows(result.data);
      message.success(`查询完成，共 ${result.count} 条`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      { title: "Module", dataIndex: "moduleType", width: 120, ellipsis: true },
      { title: "Resource ID", dataIndex: "resourceId", width: 180, ellipsis: true },
      { title: "Key", dataIndex: "key", width: 100 },
      { title: "Source", dataIndex: "source_text", ellipsis: true },
      { title: "Target", dataIndex: "target_text", ellipsis: true },
      { title: "Digest", dataIndex: "digest", width: 120, ellipsis: true },
      { title: "Outdated", dataIndex: "outdated", width: 80, render: (v: boolean | null) => (v == null ? "" : String(v)) },
    ],
    [],
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small" title="查询条件">
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={10}>
              <Form.Item label="Shop Name" required>
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    placeholder="xxx 或 xxx.myshopify.com"
                    value={shopName}
                    onChange={(e) => {
                      setShopName(e.target.value);
                      setSessionOk(null);
                    }}
                  />
                  <Button loading={checkingSession} onClick={onCheckSession}>
                    验证 Session
                  </Button>
                </Space.Compact>
                {sessionOk === true && <Text type="success">TSF Turso 中已找到 accessToken</Text>}
                {sessionOk === false && <Text type="danger">未找到 Session</Text>}
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Target Locale" required>
                <Input
                  placeholder="如 zh-CN"
                  value={targetLocale}
                  onChange={(e) => setTargetLocale(e.target.value)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="模块">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="选择资源类型"
                  value={selectedModules}
                  onChange={setSelectedModules}
                  options={resourceTypes.map((t) => ({ label: t, value: t }))}
                  maxTagCount={3}
                />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={onQuery}>
              查询
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!rows.length}
              onClick={() => exportTranslationRowsToCsv(rows)}
            >
              导出 CSV
            </Button>
          </Space>
        </Form>
      </Card>

      <Table
        rowKey={(r) => `${r.resourceId}:${r.key}`}
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />
    </Space>
  );
}

function QueryCsvImportTab() {
  const [shopName, setShopName] = useState("");
  const [locale, setLocale] = useState("");
  const [concurrency, setConcurrency] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const onImport = async () => {
    if (!shopName.trim() || !locale.trim()) {
      message.warning("请填写商店名与目标语言");
      return;
    }
    if (!file) {
      message.warning("请上传 Query 格式 CSV");
      return;
    }
    setImporting(true);
    setLogs([]);
    try {
      await importShopifyQueryCsv(
        { shopName: shopName.trim(), locale: locale.trim(), concurrency, file },
        (line) => setLogs((prev) => [...prev, line]),
      );
      message.success("导入流程结束");
    } catch (e) {
      message.error(String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="Query CSV 格式"
        description="必需列：resource_id, node_key, target_value, digest；可选 is_deleted（为 true 时跳过）。locale 在下方统一填写。"
      />
      <Card size="small">
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Shop Name" required>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Locale" required>
                <Input value={locale} onChange={(e) => setLocale(e.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="并发数（按 resource_id）">
                <InputNumber min={1} max={10} value={concurrency} onChange={(v) => setConcurrency(v ?? 1)} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item label="CSV 文件">
                <Upload
                  accept=".csv"
                  maxCount={1}
                  beforeUpload={(f) => {
                    setFile(f);
                    return false;
                  }}
                  onRemove={() => setFile(null)}
                >
                  <Button icon={<UploadOutlined />}>选择文件</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" loading={importing} onClick={onImport}>
            开始导入
          </Button>
        </Form>
      </Card>
      {logs.length > 0 && (
        <Card size="small" title="导入日志">
          <TextArea value={logs.join("\n")} rows={16} readOnly style={{ fontFamily: "monospace" }} />
        </Card>
      )}
    </Space>
  );
}

function StandardCsvImportTab() {
  const [shopName, setShopName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const onImport = async () => {
    if (!shopName.trim()) {
      message.warning("请填写商店名");
      return;
    }
    if (!file) {
      message.warning("请上传标准格式 CSV");
      return;
    }
    setImporting(true);
    setLogs([]);
    try {
      await importShopifyStandardCsv(
        { shopName: shopName.trim(), file },
        (line) => setLogs((prev) => [...prev, line]),
      );
      message.success("写回流程结束");
    } catch (e) {
      message.error(String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="标准 CSV 格式（与查询导出一致）"
        description="必需列：resourceId, target_code, key, target_text, digest。locale 取自 CSV 每行的 target_code。"
      />
      <Card size="small">
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={10}>
              <Form.Item label="Shop Name" required>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="CSV 文件">
                <Upload
                  accept=".csv"
                  maxCount={1}
                  beforeUpload={(f) => {
                    setFile(f);
                    return false;
                  }}
                  onRemove={() => setFile(null)}
                >
                  <Button icon={<UploadOutlined />}>选择文件</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" loading={importing} onClick={onImport}>
            开始批量写回
          </Button>
        </Form>
      </Card>
      {logs.length > 0 && (
        <Card size="small" title="写回日志">
          <TextArea value={logs.join("\n")} rows={16} readOnly style={{ fontFamily: "monospace" }} />
        </Card>
      )}
    </Space>
  );
}

function BatchDeleteCsvTab() {
  const [shopName, setShopName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [summary, setSummary] = useState("");
  const [results, setResults] = useState<BatchDeleteCsvResult["results"]>([]);

  const onDelete = async () => {
    if (!shopName.trim()) {
      message.warning("请填写商店名");
      return;
    }
    if (!file) {
      message.warning("请上传删除用 CSV");
      return;
    }
    setDeleting(true);
    setSummary("");
    setResults([]);
    try {
      const data = await batchDeleteShopifyTranslationsCsv({
        shopName: shopName.trim(),
        file,
      });
      setSummary(data.summary ?? "");
      setResults(data.results ?? []);
      message.success("批量删除完成");
    } catch (e) {
      message.error(String(e));
    } finally {
      setDeleting(false);
    }
  };

  const resultColumns = useMemo(
    () => [
      { title: "行号", dataIndex: "row", width: 70 },
      { title: "Resource ID", dataIndex: "resourceId", ellipsis: true },
      { title: "Locale", dataIndex: "locale", width: 100 },
      { title: "Key", dataIndex: "key", width: 120 },
      {
        title: "状态",
        dataIndex: "status",
        width: 90,
        render: (s: string) =>
          s === "deleted" ? (
            <Text type="success">deleted</Text>
          ) : s === "skipped" ? (
            <Text type="warning">skipped</Text>
          ) : (
            <Text type="danger">failed</Text>
          ),
      },
      { title: "说明", dataIndex: "message", ellipsis: true },
    ],
    [],
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Alert
        type="warning"
        showIcon
        message="批量删除 CSV 格式"
        description="必需列：resourceId, target_code, key。将逐行调用 translationsRemove 删除对应翻译。"
      />
      <Card size="small">
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={10}>
              <Form.Item label="Shop Name" required>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="CSV 文件">
                <Upload
                  accept=".csv"
                  maxCount={1}
                  beforeUpload={(f) => {
                    setFile(f);
                    return false;
                  }}
                  onRemove={() => setFile(null)}
                >
                  <Button icon={<UploadOutlined />}>选择文件</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
          <Button danger type="primary" icon={<DeleteOutlined />} loading={deleting} onClick={onDelete}>
            开始批量删除
          </Button>
        </Form>
      </Card>
      {summary && (
        <Alert type="info" message={summary} />
      )}
      {results && results.length > 0 && (
        <Table
          rowKey="row"
          size="small"
          dataSource={results}
          columns={resultColumns}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 900 }}
        />
      )}
    </Space>
  );
}

function SingleWriteDeleteTab() {
  const [shopName, setShopName] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [locale, setLocale] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [digest, setDigest] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onRegister = async () => {
    if (!shopName.trim() || !resourceId.trim() || !locale.trim() || !key.trim() || !value || !digest.trim()) {
      message.warning("写回需要填写全部字段");
      return;
    }
    setSubmitting(true);
    try {
      await registerShopifyTranslation({
        shopName: shopName.trim(),
        resourceId: resourceId.trim(),
        locale: locale.trim(),
        key: key.trim(),
        value,
        digest: digest.trim(),
      });
      message.success("写回成功");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!shopName.trim() || !resourceId.trim() || !locale.trim() || !key.trim()) {
      message.warning("删除需要填写 shop / resourceId / locale / key");
      return;
    }
    setSubmitting(true);
    try {
      await deleteShopifyTranslation({
        shopName: shopName.trim(),
        resourceId: resourceId.trim(),
        locale: locale.trim(),
        translationKey: key.trim(),
      });
      message.success("删除成功");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card size="small">
      <Paragraph type="secondary">
        accessToken 由服务端根据 Shop Name 从 TSF Turso Session 自动解析，无需手动填写。
      </Paragraph>
      <Form layout="vertical" style={{ maxWidth: 720 }}>
        <Form.Item label="Shop Name" required>
          <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
        </Form.Item>
        <Form.Item label="Resource ID" required>
          <Input value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder="gid://shopify/..." />
        </Form.Item>
        <Form.Item label="Locale" required>
          <Input value={locale} onChange={(e) => setLocale(e.target.value)} />
        </Form.Item>
        <Form.Item label="Key" required>
          <Input value={key} onChange={(e) => setKey(e.target.value)} />
        </Form.Item>
        <Form.Item label="Target Value（写回时必填）">
          <TextArea rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
        </Form.Item>
        <Form.Item label="Digest（写回时必填）">
          <Input value={digest} onChange={(e) => setDigest(e.target.value)} />
        </Form.Item>
        <Space>
          <Button type="primary" loading={submitting} onClick={onRegister}>
            单条写回
          </Button>
          <Button danger loading={submitting} onClick={onDelete}>
            单条删除
          </Button>
        </Space>
      </Form>
    </Card>
  );
}

export default function ShopifyTranslationOps() {
  const tabItems = useMemo(
    () => [
      { key: "query", label: "查询与导出", children: <QueryExportTab /> },
      { key: "import", label: "Query CSV 导入", children: <QueryCsvImportTab /> },
      { key: "standard", label: "标准 CSV 写回", children: <StandardCsvImportTab /> },
      { key: "batch-delete", label: "批量删除 CSV", children: <BatchDeleteCsvTab /> },
      { key: "single", label: "单条写回/删除", children: <SingleWriteDeleteTab /> },
    ],
    [],
  );

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        Shopify 翻译资源运维
      </Title>
      <Paragraph type="secondary">
        从小工具迁移：查询可翻译资源、导出 CSV、Query/标准 CSV 批量写回、批量删除、单条写回/删除。Token 通过商店名从 TSF Turso Session 自动获取。
      </Paragraph>
      <Tabs items={tabItems} />
    </div>
  );
}
