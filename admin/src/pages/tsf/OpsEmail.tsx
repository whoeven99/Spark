import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CloudDownloadOutlined, MailOutlined, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import {
  backfillOpsEmailEmails,
  fetchOpsEmailAudience,
  fetchOpsEmailSends,
  fetchOpsEmailTemplateDetail,
  fetchOpsEmailTemplates,
  previewOpsEmail,
  sendOpsEmail,
  setOpsEmailShopEmail,
  type OpsEmailAudienceRow,
  type OpsEmailBackfillResult,
  type OpsEmailSendLog,
  type OpsEmailSendResult,
  type OpsEmailTemplate,
} from "../../api";
import OpsEmailTemplateCard, {
  extractPlaceholderKeys,
  type OpsEmailTemplateMode,
} from "./OpsEmailTemplateCard";

const SEND_BATCH = 30;

function paramsForKeys(
  keys: string[],
  defaults: Record<string, string>,
  prev: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key of keys) {
    next[key] = prev[key] ?? defaults[key] ?? "";
  }
  return next;
}

function recountSummary(rows: OpsEmailAudienceRow[]) {
  return {
    total: rows.length,
    withEmail: rows.filter((row) => Boolean(row.email?.trim())).length,
    missingEmail: rows.filter((row) => !row.email?.trim()).length,
    sparkInstalled: rows.filter((row) => row.sparkInstalled).length,
  };
}

export default function OpsEmail() {
  const [templates, setTemplates] = useState<OpsEmailTemplate[]>([]);
  const [mode, setMode] = useState<OpsEmailTemplateMode>("catalog");
  const [templateKey, setTemplateKey] = useState("appInstalled-zh");
  const [paramKeys, setParamKeys] = useState<string[]>(["installUrl"]);
  const [params, setParams] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("");
  const [catalogHtml, setCatalogHtml] = useState("");
  const [customHtml, setCustomHtml] = useState("");
  const [customTemplateId, setCustomTemplateId] = useState("");
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
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResults, setBackfillResults] = useState<OpsEmailBackfillResult[]>([]);
  const [savingEmailShop, setSavingEmailShop] = useState<string | null>(null);
  const savedEmails = useRef<Record<string, string>>({});

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
      savedEmails.current = Object.fromEntries(
        data.shops.map((row) => [row.shop, row.email ?? ""]),
      );
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
        const detail = await fetchOpsEmailTemplateDetail("appInstalled-zh");
        setParamKeys(detail.keys);
        setSubject(detail.template.subject);
        setCatalogHtml(detail.html);
        setParams(paramsForKeys(detail.keys, { ...data.defaultParams, ...detail.defaultParams }, {}));
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
    setCatalogHtml(detail.html);
    setParams((prev) => paramsForKeys(detail.keys, detail.defaultParams, prev));
  }

  function parseCustomTemplateId(raw: string): number | null {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return parsed > 0 ? parsed : null;
  }

  function onModeChange(next: OpsEmailTemplateMode) {
    setMode(next);
    if (next === "custom") {
      if (!customHtml.trim()) setCustomHtml(catalogHtml);
      if (!customTemplateId.trim()) {
        const current = templates.find((item) => item.key === templateKey);
        if (current) setCustomTemplateId(String(current.templateId));
      }
    }
  }

  function extractCustomKeys() {
    const keys = [...new Set([...extractPlaceholderKeys(subject), ...extractPlaceholderKeys(customHtml)])];
    if (keys.length === 0) {
      message.warning("主题和 HTML 里没有 {{变量}}");
      return;
    }
    setParamKeys(keys);
    setParams((prev) => paramsForKeys(keys, {}, prev));
  }

  function addParam(rawKey: string) {
    const key = rawKey.trim();
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      message.warning("变量名仅限字母、数字和下划线");
      return;
    }
    if (paramKeys.includes(key)) {
      message.warning("变量已存在");
      return;
    }
    setParamKeys((prev) => [...prev, key]);
    setParams((prev) => ({ ...prev, [key]: prev[key] ?? "" }));
  }

  function removeParam(key: string) {
    setParamKeys((prev) => prev.filter((item) => item !== key));
  }

  function patchShopEmail(shop: string, email: string) {
    setShops((prev) => {
      const next = prev.map((row) =>
        row.shop === shop ? { ...row, email: email.trim() || null } : row,
      );
      setSummary(recountSummary(next));
      return next;
    });
  }

  async function saveShopEmail(shop: string, value: string) {
    const trimmed = value.trim();
    if (savedEmails.current[shop] === trimmed) return;
    setSavingEmailShop(shop);
    try {
      const data = await setOpsEmailShopEmail(shop, trimmed);
      savedEmails.current[shop] = data.email ?? "";
      setShops((prev) => {
        const next = prev.map((row) =>
          row.shop === shop
            ? { ...row, email: data.email, emailMasked: data.emailMasked }
            : row,
        );
        setSummary(recountSummary(next));
        return next;
      });
      if (!data.persisted) {
        savedEmails.current[shop] = trimmed;
        message.warning(`${shop} 本次可发送，但没有 Session 行，未写入 Turso`);
      }
    } catch (error) {
      message.error(String(error));
    } finally {
      setSavingEmailShop(null);
    }
  }

  async function runPreview(shop?: string) {
    setPreviewLoading(true);
    try {
      const data = await previewOpsEmail({
        templateKey: mode === "custom" ? "custom" : templateKey,
        subject,
        customHtml: mode === "custom" ? customHtml : undefined,
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
    if (mode === "custom") {
      if (!subject.trim()) {
        message.warning("自定义模板需要主题");
        return;
      }
      if (!parseCustomTemplateId(customTemplateId)) {
        message.warning("请填写有效的腾讯云模板 ID");
        return;
      }
    }
    Modal.confirm({
      title: `向已选 ${selected.length} 家发送？`,
      content: sendReady
        ? mode === "custom"
          ? `将使用腾讯云模板 ID ${customTemplateId.trim()} 和参数发送。粘贴的 HTML 仅预览，不会发给 SES。不可撤销。`
          : "将使用当前内置模板和参数发送，不可撤销。"
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
        const emailOverrides = Object.fromEntries(
          chunk.flatMap((shop) => {
            const email = shops.find((row) => row.shop === shop)?.email?.trim();
            return email ? [[shop, email]] : [];
          }),
        );
        const data = await sendOpsEmail({
          templateKey: mode === "custom" ? "custom" : templateKey,
          subject,
          customTemplateId:
            mode === "custom" ? parseCustomTemplateId(customTemplateId) ?? undefined : undefined,
          params,
          shops: chunk,
          emailOverrides,
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

  function confirmBackfill() {
    Modal.confirm({
      title: "拉取缺邮箱商店？",
      content:
        "按当前筛选（忽略「有邮箱」）用翻译 App token 查询 Shopify shop.email / contactEmail，写入 TSF Session.email。不覆盖已有邮箱。本次最多 80 家。",
      okText: "开始拉取",
      onOk: doBackfill,
    });
  }

  async function doBackfill() {
    setBackfillLoading(true);
    try {
      const data = await backfillOpsEmailEmails({
        search: search.trim() || undefined,
        installedOnly,
        excludeSpark,
      });
      setBackfillResults(data.results);
      message.success(
        `拉取完成：更新 ${data.updated}，失败 ${data.failed}，剩余 ${data.remaining}`,
      );
      await loadAudience();
    } catch (error) {
      message.error(String(error));
    } finally {
      setBackfillLoading(false);
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
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={confirmBackfill}
            loading={backfillLoading}
          >
            拉取邮箱
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
          loading={audienceLoading || backfillLoading}
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
              dataIndex: "email",
              width: 280,
              render: (_: unknown, row: OpsEmailAudienceRow) => (
                <Input
                  size="small"
                  value={row.email ?? ""}
                  placeholder="手动输入邮箱"
                  disabled={savingEmailShop === row.shop}
                  onChange={(event) => patchShopEmail(row.shop, event.target.value)}
                  onBlur={(event) => saveShopEmail(row.shop, event.target.value)}
                  onPressEnter={(event) => saveShopEmail(row.shop, event.currentTarget.value)}
                />
              ),
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
        {backfillResults.length > 0 && (
          <Table
            style={{ marginTop: 12 }}
            size="small"
            rowKey="shop"
            pagination={false}
            dataSource={backfillResults}
            columns={[
              { title: "商店", dataIndex: "shop", ellipsis: true },
              {
                title: "回填",
                dataIndex: "status",
                width: 90,
                render: (value: OpsEmailBackfillResult["status"]) => (
                  <Tag color={value === "updated" ? "green" : "red"}>{value}</Tag>
                ),
              },
              { title: "邮箱", dataIndex: "emailMasked", width: 160 },
              { title: "说明", dataIndex: "error" },
            ]}
          />
        )}
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="2. 模板与参数" style={{ marginBottom: 16 }}>
            <OpsEmailTemplateCard
              mode={mode}
              onModeChange={onModeChange}
              templates={templates}
              templateKey={templateKey}
              onTemplateChange={onTemplateChange}
              subject={subject}
              onSubjectChange={setSubject}
              paramKeys={paramKeys}
              params={params}
              onParamChange={(key, value) =>
                setParams((prev) => ({ ...prev, [key]: value }))
              }
              onAddParam={addParam}
              onRemoveParam={removeParam}
              customHtml={customHtml}
              onCustomHtmlChange={setCustomHtml}
              customTemplateId={customTemplateId}
              onCustomTemplateIdChange={setCustomTemplateId}
              onExtractFromHtml={extractCustomKeys}
            />
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
