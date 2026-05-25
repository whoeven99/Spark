import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Button,
  Tag,
  Typography,
  Spin,
  Alert,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Popconfirm,
  notification,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  fetchBillingRules,
  createBillingRule,
  updateBillingRule,
  deleteBillingRule,
  isOwner,
  type BillingRuleRow,
} from "../api";

type FormValues = {
  appName: string;
  feature: string;
  modelKey: string;
  displayName: string;
  multiplier: number;
  baseTokenCost: number | null;
  enabled: boolean;
};

export default function BillingRules() {
  const [rules, setRules] = useState<BillingRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BillingRuleRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const owner = isOwner();

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchBillingRules()
      .then((r) => setRules(r.rules))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true, multiplier: 1.0 });
    setModalOpen(true);
  }

  function openEdit(rule: BillingRuleRow) {
    setEditing(rule);
    form.setFieldsValue({
      appName: rule.appName,
      feature: rule.feature,
      modelKey: rule.modelKey,
      displayName: rule.displayName,
      multiplier: rule.multiplier,
      baseTokenCost: rule.baseTokenCost,
      enabled: rule.enabled,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updateBillingRule(editing.ruleKey, {
          displayName: values.displayName,
          multiplier: values.multiplier,
          baseTokenCost: values.baseTokenCost ?? null,
          enabled: values.enabled,
        });
        notification.success({ message: "规则已更新" });
      } else {
        await createBillingRule({
          appName: values.appName,
          feature: values.feature,
          modelKey: values.modelKey,
          displayName: values.displayName,
          multiplier: values.multiplier,
          baseTokenCost: values.baseTokenCost ?? null,
          enabled: values.enabled,
        });
        notification.success({ message: "规则已创建" });
      }
      setModalOpen(false);
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleKey: string) {
    try {
      await deleteBillingRule(ruleKey);
      notification.success({ message: "规则已删除" });
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function handleToggleEnabled(rule: BillingRuleRow) {
    try {
      await updateBillingRule(rule.ruleKey, { enabled: !rule.enabled });
      notification.success({ message: `规则已${!rule.enabled ? "启用" : "禁用"}` });
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  const columns = [
    {
      title: "规则 Key",
      dataIndex: "ruleKey",
      key: "ruleKey",
      render: (v: string) => (
        <Typography.Text code style={{ fontSize: 11 }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "显示名称",
      dataIndex: "displayName",
      key: "displayName",
    },
    {
      title: "功能",
      dataIndex: "feature",
      key: "feature",
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "模型",
      dataIndex: "modelKey",
      key: "modelKey",
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "倍率",
      dataIndex: "multiplier",
      key: "multiplier",
      render: (v: number) => (
        <Typography.Text
          strong
          style={{ color: v > 1 ? "#fa8c16" : v < 1 ? "#52c41a" : undefined }}
        >
          {v}×
        </Typography.Text>
      ),
    },
    {
      title: "固定费用",
      dataIndex: "baseTokenCost",
      key: "baseTokenCost",
      render: (v: number | null) =>
        v != null ? (
          <Tag color="purple">{v.toLocaleString()} tokens</Tag>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: "启用",
      dataIndex: "enabled",
      key: "enabled",
      render: (v: boolean, r: BillingRuleRow) =>
        owner ? (
          <Switch
            size="small"
            checked={v}
            onChange={() => handleToggleEnabled(r)}
          />
        ) : (
          <Tag color={v ? "green" : "default"}>{v ? "启用" : "禁用"}</Tag>
        ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
    ...(owner
      ? [
          {
            title: "操作",
            key: "action",
            render: (_: unknown, r: BillingRuleRow) => (
              <Space>
                <Button type="link" size="small" onClick={() => openEdit(r)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除该规则？"
                  onConfirm={() => handleDelete(r.ruleKey)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Token 计费规则
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
        {owner && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增规则
          </Button>
        )}
        {!owner && (
          <Tag color="blue">只读模式（owner 账号可编辑）</Tag>
        )}
      </div>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <div style={{ background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #f0f0f0" }}>
        <Spin spinning={loading}>
          <Table
            dataSource={rules}
            columns={columns}
            rowKey="ruleKey"
            size="small"
            pagination={{ pageSize: 20 }}
          />
        </Spin>
      </div>

      <Modal
        title={editing ? `编辑规则：${editing.ruleKey}` : "新增计费规则"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={editing ? "保存" : "创建"}
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editing && (
            <>
              <Form.Item
                label="App 名称 (appName)"
                name="appName"
                rules={[{ required: true, message: "请输入 appName" }]}
                extra="如: chat, product-improve, * (通配)"
              >
                <Input placeholder="chat" />
              </Form.Item>
              <Form.Item
                label="功能 (feature)"
                name="feature"
                rules={[{ required: true, message: "请输入 feature" }]}
                extra="如: product_copy, image_prompt, image_generate, picture_translate"
              >
                <Input placeholder="product_copy" />
              </Form.Item>
              <Form.Item
                label="模型 Key (modelKey)"
                name="modelKey"
                rules={[{ required: true, message: "请输入 modelKey" }]}
                extra="如: deepseek-chat, volc-translate, _default"
              >
                <Input placeholder="_default" />
              </Form.Item>
            </>
          )}
          <Form.Item
            label="显示名称"
            name="displayName"
            rules={[{ required: true, message: "请输入显示名称" }]}
          >
            <Input placeholder="对话 (DeepSeek)" />
          </Form.Item>
          <Form.Item
            label="Token 倍率"
            name="multiplier"
            rules={[{ required: true, message: "请输入倍率" }, { type: "number", min: 0, message: "倍率不能为负" }]}
            extra="实际扣费 = 模型 token 数 × 倍率"
          >
            <InputNumber min={0} step={0.1} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="固定费用 (baseTokenCost)"
            name="baseTokenCost"
            extra="每次调用固定扣除的 token 数，可为空"
          >
            <InputNumber min={0} style={{ width: "100%" }} placeholder="不填则不收取固定费" />
          </Form.Item>
          <Form.Item label="是否启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
