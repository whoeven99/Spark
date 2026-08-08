import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from "antd";
import {
  addTranslationQuota,
  deleteTranslationConfig,
  fetchTranslationConfig,
  upsertTranslationConfig,
  type SpringBackendEnv,
  type TranslationAddQuotaResult,
} from "../api";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function TranslationOps() {
  const [env, setEnv] = useState<SpringBackendEnv>("prod");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const [quotaOpen, setQuotaOpen] = useState(false);
  const [shopName, setShopName] = useState("");
  const [addChars, setAddChars] = useState<number | null>(null);
  const [submittingQuota, setSubmittingQuota] = useState(false);
  const [quotaResult, setQuotaResult] = useState<TranslationAddQuotaResult | null>(null);
  const [quotaResultOpen, setQuotaResultOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTranslationConfig(env);
      setConfig(data.config);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const rows = useMemo(
    () =>
      Object.keys(config)
        .sort()
        .map((key) => ({ key, value: config[key] })),
    [config],
  );

  const openCreateModal = () => {
    setEditingKey(null);
    setFormKey("");
    setFormValue("");
    setConfigModalOpen(true);
  };

  const openEditModal = (key: string, value: string) => {
    setEditingKey(key);
    setFormKey(key);
    setFormValue(value);
    setConfigModalOpen(true);
  };

  const closeConfigModal = () => {
    if (savingConfig) return;
    setConfigModalOpen(false);
    setEditingKey(null);
    setFormKey("");
    setFormValue("");
  };

  const onSaveConfig = async () => {
    if (!formKey.trim()) {
      message.warning("Key 不能为空");
      return;
    }
    setSavingConfig(true);
    try {
      const data = await upsertTranslationConfig(env, formKey.trim(), formValue);
      setConfig(data.config);
      message.success(editingKey ? "配置已更新" : "配置已新增");
      setConfigModalOpen(false);
      setEditingKey(null);
      setFormKey("");
      setFormValue("");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSavingConfig(false);
    }
  };

  const onDeleteConfig = (key: string) => {
    Modal.confirm({
      title: "删除配置",
      content: `确定要删除配置 ${key} 吗？`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          const data = await deleteTranslationConfig(env, key);
          setConfig(data.config);
          message.success("配置已删除");
        } catch (e) {
          message.error(String(e));
          throw e;
        }
      },
    });
  };

  const resetQuotaForm = () => {
    setShopName("");
    setAddChars(null);
  };

  const onSubmitQuota = async () => {
    if (!shopName.trim()) {
      message.warning("请输入商店名");
      return;
    }
    if (addChars === null || Number.isNaN(addChars)) {
      message.warning("请输入添加额度数量");
      return;
    }

    setSubmittingQuota(true);
    try {
      const result = await addTranslationQuota({
        shopName: shopName.trim(),
        addChars,
      });
      setQuotaResult(result);
      setQuotaResultOpen(true);
      message.success("添加成功");
      setQuotaOpen(false);
      resetQuotaForm();
    } catch (e) {
      message.error(String(e));
    } finally {
      setSubmittingQuota(false);
    }
  };

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>
            翻译运维
          </Title>
          <Text type="secondary">
            管理系统配置中心（Redis bogda:config）与商店翻译额度（TranslationCounter）
          </Text>
        </div>

        <Card size="small">
          <Space wrap>
            <span>环境：</span>
            <Select<SpringBackendEnv>
              value={env}
              style={{ width: 120 }}
              disabled={loading || savingConfig || submittingQuota}
              options={[
                { value: "prod", label: "Prod" },
                { value: "test", label: "Test" },
              ]}
              onChange={setEnv}
            />
            <Button onClick={loadConfig} loading={loading}>
              刷新配置
            </Button>
            <Button type="primary" onClick={openCreateModal} disabled={loading}>
              新增配置
            </Button>
            <Button onClick={() => setQuotaOpen(true)} disabled={loading}>
              增加额度
            </Button>
            {!loading && !error && (
              <Text type="secondary">共 {rows.length} 项配置</Text>
            )}
          </Space>
        </Card>

        {error && <Alert type="error" message={error} />}

        <Card title="系统配置中心">
          {loading ? (
            <Spin style={{ display: "block", margin: "40px auto" }} />
          ) : (
            <Table
              rowKey="key"
              size="small"
              dataSource={rows}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              columns={[
                {
                  title: "Key",
                  dataIndex: "key",
                  width: 260,
                  render: (v: string) => <Text code>{v}</Text>,
                },
                {
                  title: "Value",
                  dataIndex: "value",
                  render: (v: string) => (
                    <Text
                      style={{
                        display: "block",
                        maxWidth: 720,
                        wordBreak: "break-all",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {v}
                    </Text>
                  ),
                },
                {
                  title: "操作",
                  key: "ops",
                  width: 140,
                  render: (_v, row) => (
                    <Space>
                      <Button type="link" size="small" onClick={() => openEditModal(row.key, row.value)}>
                        更新
                      </Button>
                      <Button type="link" size="small" danger onClick={() => onDeleteConfig(row.key)}>
                        删除
                      </Button>
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </Space>

      <Modal
        title={editingKey ? "更新配置" : "新增配置"}
        open={configModalOpen}
        onCancel={closeConfigModal}
        onOk={onSaveConfig}
        okText="保存"
        cancelText="取消"
        confirmLoading={savingConfig}
        destroyOnClose
        width={720}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Text type="secondary">建议使用有语义的 Key，Value 支持任意字符串（含 JSON）。</Text>
          <div>
            <div style={{ marginBottom: 6 }}>Key</div>
            <Input
              value={formKey}
              onChange={(e) => setFormKey(e.target.value)}
              disabled={savingConfig || !!editingKey}
              placeholder="例如：ai_model_config"
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>Value</div>
            <TextArea
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              disabled={savingConfig}
              placeholder="例如：true 或 JSON 配置"
              autoSize={{ minRows: 4, maxRows: 16 }}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="增加额度"
        open={quotaOpen}
        onCancel={() => {
          if (submittingQuota) return;
          setQuotaOpen(false);
        }}
        onOk={onSubmitQuota}
        okText="添加"
        cancelText="取消"
        confirmLoading={submittingQuota}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Text type="secondary">额度操作固定使用 Prod 环境（与配置中心环境选择无关）</Text>
          <div>
            <div style={{ marginBottom: 6 }}>商店名</div>
            <Input
              placeholder="请输入商店名"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              disabled={submittingQuota}
              allowClear
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>添加额度数量（可为负数）</div>
            <InputNumber
              style={{ width: "100%" }}
              placeholder="例如：100 或 -50"
              value={addChars}
              onChange={(v) => setAddChars(v)}
              disabled={submittingQuota}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="本次添加结果"
        open={quotaResultOpen}
        onCancel={() => setQuotaResultOpen(false)}
        footer={null}
        destroyOnClose
      >
        {quotaResult ? (
          <Space direction="vertical">
            <Text>环境：Prod</Text>
            <Text>原额度：{quotaResult.oldChars}</Text>
            <Text>添加额度：{quotaResult.addChars}</Text>
            <Text>新额度：{quotaResult.newChars}</Text>
          </Space>
        ) : (
          <Text type="secondary">无结果</Text>
        )}
      </Modal>
    </div>
  );
}
