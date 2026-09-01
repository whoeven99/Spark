import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { MailOutlined, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import {
  fetchOpsEmailAudience,
  fetchOpsEmailSends,
  fetchOpsEmailTemplateDetail,
  fetchOpsEmailTemplates,
  previewOpsEmail,
  sendOpsEmail,
  type OpsEmailAudienceRow,
  type OpsEmailSendLog,
  type OpsEmailSendResult,
  type OpsEmailTemplate,
} from "../../api";

const SEND_BATCH = 30;

export default function OpsEmail() {
  const [templates, setTemplates] = useState<OpsEmailTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("appInstalled-zh");
  const [paramKeys, setParamKeys] = useState<string[]>(["installUrl"]);
  const [params, setParams] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("");
  const [sendReady, setSendReady] = useState(false);

  const [search, setSearch] = useState("");
  const [installedOnly, setInstalledOnly] = useState(true);
  const [hasEmailOnly, setHasEmailOnly] = useState(true);
  const [excludeSpark, setExcludeSpark] = useState(true);
  const [shops, setShops] = useState<OpsEmailAudienceRow[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    withEmail: 0,
    missingEmail: 0,
    sparkInstalled: 0,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [audienceLoading, setAudienceLoading] = useState(false);

  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewShop, setPreviewShop] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);

  const [sends, setSends] = useState<OpsEmailSendLog[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResults, setLastResults] = useState<OpsEmailSendResult[]>([]);

  const loadAudience = useCallback(async () => {
    setAudienceLoading(true);
    try {
      const data = await fetchOpsEmailAudience({
        search: search.trim() || undefined,
        installedOnly,
        hasEmailOnly,
        excludeSpark,
      });
      setShops(data.shops);
      setSummary(data.summary);
      setSelected((prev) => prev.filter((shop) => data.shops.some((row) => row.shop === shop)));
    } catch (error) {
      message.error(String(error));
    } finally {
      setAudienceLoading(false);
    }
  }, [excludeSpark, hasEmailOnly, installedOnly, search]);

  useEffect(() => {
    fetchOpsEmailTemplates()
      .then(async (data) => {
        setTemplates(data.templates);
        setSendReady(data.sendReady);
        setParams((prev) => ({ ...data.defaultParams, ...prev }));
        const detail = await fetchOpsEmailTemplateDetail("appInstalled-zh");
        setParamKeys(detail.keys);
        setSubject(detail.template.subject);
      })
      .catch((error) => message.error(String(error)));
    fetchOpsEmailSends()
      .then((data) => setSends(data.sends))
      .catch(() => undefined);
    loadAudience();
  }, []);

  async function onTemplateChange(key: string) {
    setTemplateKey(key);
    const detail = await fetchOpsEmailTemplateDetail(key);
    setParamKeys(detail.keys);
    setSubject(detail.template.subject);
    setParams((prev) => ({ ...detail.defaultParams, ...prev }));
  }

  async function runPreview(shop?: string) {
    setPreviewLoading(true);
    try {
      const data = await previewOpsEmail({
        templateKey,
        subject,
        params,
        shop,
      });
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
      setPreviewShop(shop);
    } catch (error) {
      message.error(String(error));
    } finally {
      setPreviewLoading(false);
    }
  }

  const selectedRows = useMemo(
    () => shops.filter((row) => selected.includes(row.shop)),
    [selected, shops],
  );

  async function confirmSend() {
    if (!selected.length) {
      message.warning("请先勾选商店");
      return;
    }
    Modal.confirm({
      title: `向已选 ${selected.length} 家发送？`,
      content: sendReady
        ? "将使用当前模板和参数发送，不可撤销。"
        : "当前未检测到 SES 凭证，发送会失败。仍要继续？",
      okText: "发送",
      okButtonProps: { danger: true },
      onOk: doSend,
    });
  }

  async function doSend() {
    setSending(true);
    const all: OpsEmailSendResult[] = [];
    try {
      for (let i = 0; i < selected.length; i += SEND_BATCH) {
        const chunk = selected.slice(i, i + SEND_BATCH);
        const data = await sendOpsEmail({
          templateKey,
          subject,
          params,
          shops: chunk,
        });
        all.push(...data.results);
        if (data.testRecipient) {
          message.info(`EMAIL_TEST_RECIPIENT 已重定向到测试邮箱`);
        }
      }
      setLastResults(all);
      const sent = all.filter((item) => item.status === "sent").length;
      const failed = all.filter((item) => item.status === "failed").length;
      message.success(`发送完成：成功 ${sent}，失败 ${failed}，跳过 ${all.length - sent - failed}`);
      const logs = await fetchOpsEmailSends();
      setSends(logs.sends);
      await loadAudience();
    } catch (error) {
      message.error(String(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          运营邮件
        </Typography.Title>
        <Button onClick={() => setLogOpen(true)}>发送记录</Button>
      </Space>

      {!sendReady && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="未配置腾讯云 SES 凭证，可预览但不能真发。需要 TENCENT_CLOUD_KEY_ID / TENCENT_CLOUD_KEY。"
        />
      )}

      <Card size="small" title="1. 选择用户" style={{ marginBottom: 16 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Checkbox checked={installedOnly} onChange={(e) => setInstalledOnly(e.target.checked)}>
            翻译在装
          </Checkbox>
          <Checkbox checked={hasEmailOnly} onChange={(e) => setHasEmailOnly(e.target.checked)}>
            有邮箱
          </Checkbox>
          <Checkbox checked={excludeSpark} onChange={(e) => setExcludeSpark(e.target.checked)}>
            排除已装 Spark
          </Checkbox>
          <Input
            placeholder="商店域名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={loadAudience}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadAudience} loading={audienceLoading}>
            预览名单
          </Button>
        </Space>
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col><Statistic title="符合" value={summary.total} /></Col>
          <Col><Statistic title="有邮箱" value={summary.withEmail} /></Col>
          <Col><Statistic title="缺邮箱" value={summary.missingEmail} /></Col>
          <Col><Statistic title="已装 Spark" value={summary.sparkInstalled} /></Col>
          <Col><Statistic title="已选" value={selected.length} /></Col>
        </Row>
        <Table
          rowKey="shop"
          size="small"
          loading={audienceLoading}
          dataSource={shops}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys.map(String)),
          }}
          pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 家` }}
          columns={[
            { title: "商店", dataIndex: "shop", ellipsis: true },
            {
              title: "邮箱",
              dataIndex: "emailMasked",
              render: (value: string | null) => value || <Typography.Text type="secondary">—</Typography.Text>,
            },
            {
              title: "套餐",
              dataIndex: "planKey",
              width: 110,
              render: (value: string | null) => (value ? <Tag>{value}</Tag> : "—"),
            },
            {
              title: "Spark",
              dataIndex: "sparkInstalled",
              width: 90,
              render: (value: boolean) =>
                value ? <Tag color="green">已装</Tag> : <Tag>未装</Tag>,
            },
            {
              title: "上次发送",
              key: "last",
              width: 180,
              render: (_: unknown, row: OpsEmailAudienceRow) =>
                row.lastSentAt
                  ? `${row.lastSentStatus} · ${new Date(row.lastSentAt).toLocaleString("zh-CN")}`
                  : "—",
            },
          ]}
        />
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="2. 模板与参数" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <Select
                value={templateKey}
                onChange={onTemplateChange}
                options={templates.map((item) => ({
                  value: item.key,
                  label: `${item.label}（${item.templateId}）`,
                }))}
                style={{ width: "100%" }}
              />
              <Input
                addonBefore="主题"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              {paramKeys.map((key) => (
                <Input
                  key={key}
                  addonBefore={key}
                  value={params[key] ?? ""}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={key === "installUrl" ? "Spark 安装链接" : undefined}
                />
              ))}
              <Typography.Text type="secondary">
                填写 installUrl 后，预览/发送会替换模板里的 App 按钮链接。按店字段（shopName 等）发送时自动填充。
              </Typography.Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={`3. 预览${previewSubject ? ` · ${previewSubject}` : ""}`}
            extra={
              <Space>
                <Select
                  allowClear
                  placeholder="用已选店预览"
                  value={previewShop}
                  onChange={(value) => runPreview(value)}
                  style={{ width: 220 }}
                  options={selectedRows.map((row) => ({
                    value: row.shop,
                    label: row.shop,
                  }))}
                />
                <Button icon={<MailOutlined />} loading={previewLoading} onClick={() => runPreview(previewShop)}>
                  预览
                </Button>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            {previewHtml ? (
              <iframe
                title="email-preview"
                sandbox=""
                srcDoc={previewHtml}
                style={{ width: "100%", height: 520, border: "1px solid #f0f0f0", background: "#fff" }}
              />
            ) : (
              <Typography.Text type="secondary">选择模板并点击预览</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Space>
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={sending}
          onClick={confirmSend}
        >
          向已选 {selected.length} 家发送
        </Button>
      </Space>

      {lastResults.length > 0 && (
        <Table
          style={{ marginTop: 16 }}
          size="small"
          rowKey={(row) => `${row.shop}-${row.status}-${row.requestId ?? row.error ?? ""}`}
          dataSource={lastResults}
          pagination={false}
          columns={[
            { title: "商店", dataIndex: "shop" },
            { title: "邮箱", dataIndex: "emailMasked" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: OpsEmailSendResult["status"]) => {
                const color = value === "sent" ? "green" : value === "failed" ? "red" : "default";
                return <Tag color={color}>{value}</Tag>;
              },
            },
            { title: "说明", dataIndex: "error" },
          ]}
        />
      )}

      <Drawer title="发送记录" width={720} open={logOpen} onClose={() => setLogOpen(false)}>
        <Table
          size="small"
          rowKey="id"
          dataSource={sends}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: "商店", dataIndex: "shop", ellipsis: true },
            { title: "邮箱", dataIndex: "emailMasked", width: 160 },
            { title: "模板", dataIndex: "templateKey", width: 160 },
            {
              title: "状态",
              dataIndex: "status",
              width: 90,
              render: (value: string) => <Tag>{value}</Tag>,
            },
            {
              title: "时间",
              dataIndex: "createdAt",
              width: 170,
              render: (value: string) => new Date(value).toLocaleString("zh-CN"),
            },
          ]}
        />
      </Drawer>
    </div>
  );
}
