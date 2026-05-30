import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  notification,
} from "antd";
import {
  createBillingRule,
  createMonthlyFixedCost,
  deleteBillingRule,
  deleteMonthlyFixedCost,
  fetchBillingRules,
  fetchPricingStudio,
  isOwner,
  type BillingRuleRow,
  type MonthlyFixedCostItem,
  type PricingStudioSettings,
  updateBillingRule,
  updateMonthlyFixedCost,
  updatePricingStudioSettings,
} from "../api";

type RuleFormValues = {
  appName: string;
  feature: string;
  modelKey: string;
  displayName: string;
  multiplier: number;
  baseTokenCost: number | null;
  costUsdPerMillionToken: number | null;
  enabled: boolean;
};

type FixedCostFormValues = {
  name: string;
  amountUsd: number;
  enabled: boolean;
};

const DEFAULT_SETTINGS: PricingStudioSettings = {
  payingShops: 100,
  targetGrossMarginPct: 70,
  planPriceUsd: 29.99,
  tokenGrantPerUser: 500000,
  blendedCostUsdPerMillionBilledToken: 2,
  shopifyRevSharePct: 15,
  paymentFeePct: 0,
};

const USD = (v: number) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 4,
      }).format(v)
    : "-";

function positive(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export default function PricingStudio() {
  const owner = isOwner();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [settings, setSettings] = useState<PricingStudioSettings>(DEFAULT_SETTINGS);
  const [rules, setRules] = useState<BillingRuleRow[]>([]);
  const [fixedCosts, setFixedCosts] = useState<MonthlyFixedCostItem[]>([]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [fixedCostModalOpen, setFixedCostModalOpen] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [savingFixedCost, setSavingFixedCost] = useState(false);

  const [editingRule, setEditingRule] = useState<BillingRuleRow | null>(null);

  const [ruleForm] = Form.useForm<RuleFormValues>();
  const [fixedCostForm] = Form.useForm<FixedCostFormValues>();

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([fetchPricingStudio(), fetchBillingRules()])
      .then(([pricing, billing]) => {
        setSettings(pricing.settings ?? DEFAULT_SETTINGS);
        setFixedCosts(pricing.fixedCosts ?? []);
        setRules(billing.rules ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fixedCostTotal = useMemo(
    () =>
      fixedCosts
        .filter((x) => x.enabled)
        .reduce((sum, x) => sum + positive(x.amountUsd), 0),
    [fixedCosts],
  );

  const averageRuleCostPerMillionBilled = useMemo(() => {
    const samples = rules
      .filter((r) => r.enabled && r.costUsdPerMillionToken != null && r.multiplier > 0)
      .map((r) => Number(r.costUsdPerMillionToken) / Number(r.multiplier));

    if (samples.length === 0) return null;
    return samples.reduce((s, x) => s + x, 0) / samples.length;
  }, [rules]);

  const result = useMemo(() => {
    const payingShops = positive(settings.payingShops);
    const margin = Math.min(99.9, positive(settings.targetGrossMarginPct)) / 100;
    const cpb = positive(settings.blendedCostUsdPerMillionBilledToken) / 1_000_000;
    const fixedPerShop = payingShops > 0 ? fixedCostTotal / payingShops : 0;

    const suggestedPriceForGrant =
      margin < 1
        ? (fixedPerShop + positive(settings.tokenGrantPerUser) * cpb) / (1 - margin)
        : Number.POSITIVE_INFINITY;

    const suggestedGrantForPrice =
      cpb > 0
        ? Math.max(0, (positive(settings.planPriceUsd) * (1 - margin) - fixedPerShop) / cpb)
        : 0;

    const currentMarginByPrice =
      positive(settings.planPriceUsd) > 0
        ? 1 -
          (fixedPerShop + positive(settings.tokenGrantPerUser) * cpb) /
            positive(settings.planPriceUsd)
        : 0;

    return {
      cpb,
      fixedPerShop,
      suggestedPriceForGrant,
      suggestedGrantForPrice,
      currentMarginByPrice,
    };
  }, [settings, fixedCostTotal]);

  async function saveSettings() {
    if (!owner) return;
    setSavingSettings(true);
    try {
      await updatePricingStudioSettings(settings);
      notification.success({ message: "定价参数已保存" });
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleFixedCostEnabled(item: MonthlyFixedCostItem) {
    try {
      await updateMonthlyFixedCost(item.id, { enabled: !item.enabled });
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function deleteFixedCost(id: string) {
    try {
      await deleteMonthlyFixedCost(id);
      notification.success({ message: "固定成本项已删除" });
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  function openAddRule() {
    setEditingRule(null);
    ruleForm.resetFields();
    ruleForm.setFieldsValue({ enabled: true, multiplier: 1 });
    setRuleModalOpen(true);
  }

  function openEditRule(rule: BillingRuleRow) {
    setEditingRule(rule);
    ruleForm.setFieldsValue({
      appName: rule.appName,
      feature: rule.feature,
      modelKey: rule.modelKey,
      displayName: rule.displayName,
      multiplier: rule.multiplier,
      baseTokenCost: rule.baseTokenCost,
      costUsdPerMillionToken: rule.costUsdPerMillionToken,
      enabled: rule.enabled,
    });
    setRuleModalOpen(true);
  }

  async function saveRule() {
    const values = await ruleForm.validateFields();
    setSavingRule(true);
    try {
      if (editingRule) {
        await updateBillingRule(editingRule.ruleKey, {
          displayName: values.displayName,
          multiplier: values.multiplier,
          baseTokenCost: values.baseTokenCost ?? null,
          costUsdPerMillionToken: values.costUsdPerMillionToken ?? null,
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
          costUsdPerMillionToken: values.costUsdPerMillionToken ?? null,
          enabled: values.enabled,
        });
        notification.success({ message: "规则已创建" });
      }
      setRuleModalOpen(false);
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setSavingRule(false);
    }
  }

  async function removeRule(ruleKey: string) {
    try {
      await deleteBillingRule(ruleKey);
      notification.success({ message: "规则已删除" });
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function toggleRuleEnabled(rule: BillingRuleRow) {
    try {
      await updateBillingRule(rule.ruleKey, { enabled: !rule.enabled });
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function createFixedCost() {
    const values = await fixedCostForm.validateFields();
    setSavingFixedCost(true);
    try {
      await createMonthlyFixedCost({
        name: values.name,
        amountUsd: values.amountUsd,
        enabled: values.enabled,
      });
      notification.success({ message: "固定成本项已创建" });
      setFixedCostModalOpen(false);
      fixedCostForm.resetFields();
      load();
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setSavingFixedCost(false);
    }
  }

  const fixedCostColumns = [
    {
      title: "名称",
      dataIndex: "name",
      render: (v: string, row: MonthlyFixedCostItem) =>
        owner ? (
          <Input
            value={v}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== row.name) {
                updateMonthlyFixedCost(row.id, { name: next })
                  .then(load)
                  .catch((err) => notification.error({ message: String(err) }));
              }
            }}
            onChange={(e) => {
              const next = e.target.value;
              setFixedCosts((prev) =>
                prev.map((x) => (x.id === row.id ? { ...x, name: next } : x)),
              );
            }}
          />
        ) : (
          v
        ),
    },
    {
      title: "月成本(USD)",
      dataIndex: "amountUsd",
      render: (v: number, row: MonthlyFixedCostItem) =>
        owner ? (
          <InputNumber
            min={0}
            value={v}
            onChange={(n) => {
              const next = Number(n ?? 0);
              setFixedCosts((prev) =>
                prev.map((x) => (x.id === row.id ? { ...x, amountUsd: next } : x)),
              );
            }}
            onBlur={() => {
              updateMonthlyFixedCost(row.id, { amountUsd: row.amountUsd })
                .then(load)
                .catch((err) => notification.error({ message: String(err) }));
            }}
          />
        ) : (
          USD(v)
        ),
    },
    {
      title: "启用",
      dataIndex: "enabled",
      render: (v: boolean, row: MonthlyFixedCostItem) =>
        owner ? (
          <Switch size="small" checked={v} onChange={() => toggleFixedCostEnabled(row)} />
        ) : (
          <Tag color={v ? "green" : "default"}>{v ? "启用" : "禁用"}</Tag>
        ),
    },
    ...(owner
      ? [
          {
            title: "操作",
            render: (_: unknown, row: MonthlyFixedCostItem) => (
              <Popconfirm
                title="确认删除该固定成本项？"
                onConfirm={() => deleteFixedCost(row.id)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" danger size="small">
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  const ruleColumns = [
    {
      title: "规则 Key",
      dataIndex: "ruleKey",
      render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
    },
    {
      title: "显示名称",
      dataIndex: "displayName",
    },
    {
      title: "功能",
      dataIndex: "feature",
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "模型",
      dataIndex: "modelKey",
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "倍率",
      dataIndex: "multiplier",
      render: (v: number) => <Typography.Text strong>{v}x</Typography.Text>,
    },
    {
      title: "成本(USD/百万原始token)",
      dataIndex: "costUsdPerMillionToken",
      render: (v: number | null) => (v == null ? "-" : v),
    },
    {
      title: "折算(USD/百万计费token)",
      render: (_: unknown, row: BillingRuleRow) => {
        if (row.costUsdPerMillionToken == null || row.multiplier <= 0) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        return (Number(row.costUsdPerMillionToken) / Number(row.multiplier)).toFixed(4);
      },
    },
    {
      title: "启用",
      dataIndex: "enabled",
      render: (v: boolean, row: BillingRuleRow) =>
        owner ? (
          <Switch size="small" checked={v} onChange={() => toggleRuleEnabled(row)} />
        ) : (
          <Tag color={v ? "green" : "default"}>{v ? "启用" : "禁用"}</Tag>
        ),
    },
    ...(owner
      ? [
          {
            title: "操作",
            render: (_: unknown, row: BillingRuleRow) => (
              <Space>
                <Button type="link" size="small" onClick={() => openEditRule(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除该规则？"
                  onConfirm={() => removeRule(row.ruleKey)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="link" danger size="small">
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
    <Spin spinning={loading}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          定价工作台
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          所有参数均可持久化保存。你维护月固定成本、token 计费规则成本，再反推价格与发放 token。
        </Typography.Paragraph>

        {error && <Alert type="error" message={error} />}

        <Card
          title="一、核心参数（持久化）"
          extra={
            <Space>
              <Button onClick={load}>刷新</Button>
              {owner && (
                <Button type="primary" loading={savingSettings} onClick={saveSettings}>
                  保存参数
                </Button>
              )}
            </Space>
          }
        >
          {!owner && <Tag color="blue">只读模式（owner 账号可编辑）</Tag>}
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={24} md={8}>
              <Typography.Text>付费商店数</Typography.Text>
              <InputNumber
                disabled={!owner}
                style={{ width: "100%", marginTop: 6 }}
                min={1}
                value={settings.payingShops}
                onChange={(n) => setSettings((s) => ({ ...s, payingShops: Number(n ?? 1) }))}
              />
            </Col>
            <Col xs={24} md={8}>
              <Typography.Text>目标毛利率(%)</Typography.Text>
              <InputNumber
                disabled={!owner}
                style={{ width: "100%", marginTop: 6 }}
                min={0}
                max={99.9}
                step={0.1}
                value={settings.targetGrossMarginPct}
                onChange={(n) =>
                  setSettings((s) => ({ ...s, targetGrossMarginPct: Number(n ?? 0) }))
                }
              />
            </Col>
            <Col xs={24} md={8}>
              <Typography.Text>成本估算(USD/百万计费token)</Typography.Text>
              <InputNumber
                disabled={!owner}
                style={{ width: "100%", marginTop: 6 }}
                min={0}
                step={0.0001}
                value={settings.blendedCostUsdPerMillionBilledToken}
                onChange={(n) =>
                  setSettings((s) => ({
                    ...s,
                    blendedCostUsdPerMillionBilledToken: Number(n ?? 0),
                  }))
                }
              />
              {averageRuleCostPerMillionBilled != null && (
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
                  规则启用项平均参考值: {averageRuleCostPerMillionBilled.toFixed(4)}
                </Typography.Text>
              )}
            </Col>
          </Row>
        </Card>

        <Card
          title="二、月固定成本（可无限添加，持久化）"
          extra={
            owner ? (
              <Button type="primary" onClick={() => {
                fixedCostForm.resetFields();
                fixedCostForm.setFieldsValue({ enabled: true, amountUsd: 100 });
                setFixedCostModalOpen(true);
              }}>
                新增成本项
              </Button>
            ) : null
          }
        >
          <Table
            rowKey="id"
            dataSource={fixedCosts}
            columns={fixedCostColumns}
            pagination={{ pageSize: 20 }}
            size="small"
          />
          <Divider />
          <Typography.Text strong>启用项月固定成本合计: {USD(fixedCostTotal)}</Typography.Text>
        </Card>

        <Card title="三、Token 计费规则（倍率 + 成本，持久化）" extra={owner ? <Button type="primary" onClick={openAddRule}>新增规则</Button> : null}>
          <Table
            rowKey="ruleKey"
            dataSource={rules}
            columns={ruleColumns}
            pagination={{ pageSize: 20 }}
            size="small"
            scroll={{ x: 1300 }}
          />
        </Card>

        <Card title="四、反推结果">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Typography.Title level={5}>A. 给定 token，算建议月费</Typography.Title>
              <Typography.Text>计划发放 token / 店 / 月</Typography.Text>
              <InputNumber
                disabled={!owner}
                style={{ width: "100%", marginTop: 6 }}
                min={0}
                value={settings.tokenGrantPerUser}
                onChange={(n) =>
                  setSettings((s) => ({ ...s, tokenGrantPerUser: Number(n ?? 0) }))
                }
              />
              <Divider style={{ margin: "12px 0" }} />
              <Typography.Text type="secondary">固定成本分摊/店</Typography.Text>
              <Typography.Paragraph strong>{USD(result.fixedPerShop)}</Typography.Paragraph>
              <Typography.Text type="secondary">建议月费（满足目标毛利）</Typography.Text>
              <Typography.Paragraph strong style={{ fontSize: 20 }}>
                {USD(result.suggestedPriceForGrant)}
              </Typography.Paragraph>
            </Col>
            <Col xs={24} md={12}>
              <Typography.Title level={5}>B. 给定月费，算建议发放 token</Typography.Title>
              <Typography.Text>月费(USD / 店 / 月)</Typography.Text>
              <InputNumber
                disabled={!owner}
                style={{ width: "100%", marginTop: 6 }}
                min={0}
                value={settings.planPriceUsd}
                onChange={(n) =>
                  setSettings((s) => ({ ...s, planPriceUsd: Number(n ?? 0) }))
                }
              />
              <Divider style={{ margin: "12px 0" }} />
              <Typography.Text type="secondary">建议发放 token（满足目标毛利）</Typography.Text>
              <Typography.Paragraph strong style={{ fontSize: 20 }}>
                {result.suggestedGrantForPrice.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </Typography.Paragraph>
              <Typography.Text type="secondary">当前“月费+token发放”的毛利率</Typography.Text>
              <Typography.Paragraph
                strong
                style={{
                  color:
                    result.currentMarginByPrice >= settings.targetGrossMarginPct / 100
                      ? "#389e0d"
                      : "#cf1322",
                }}
              >
                {(result.currentMarginByPrice * 100).toFixed(2)}%
              </Typography.Paragraph>
            </Col>
          </Row>
        </Card>

        <Modal
          title={editingRule ? `编辑规则：${editingRule.ruleKey}` : "新增计费规则"}
          open={ruleModalOpen}
          onOk={saveRule}
          onCancel={() => setRuleModalOpen(false)}
          confirmLoading={savingRule}
          okText={editingRule ? "保存" : "创建"}
          cancelText="取消"
        >
          <Form form={ruleForm} layout="vertical" style={{ marginTop: 16 }}>
            {!editingRule && (
              <>
                <Form.Item label="App 名称 (appName)" name="appName" rules={[{ required: true, message: "请输入 appName" }]}>
                  <Input placeholder="product-improve" />
                </Form.Item>
                <Form.Item label="功能 (feature)" name="feature" rules={[{ required: true, message: "请输入 feature" }]}>
                  <Input placeholder="product_copy" />
                </Form.Item>
                <Form.Item label="模型 Key (modelKey)" name="modelKey" rules={[{ required: true, message: "请输入 modelKey" }]}>
                  <Input placeholder="deepseek-chat" />
                </Form.Item>
              </>
            )}
            <Form.Item label="显示名称" name="displayName" rules={[{ required: true, message: "请输入显示名称" }]}>
              <Input placeholder="对话 (DeepSeek)" />
            </Form.Item>
            <Form.Item label="Token 倍率" name="multiplier" rules={[{ required: true, message: "请输入倍率" }, { type: "number", min: 0, message: "倍率不能为负" }]}>
              <InputNumber min={0} step={0.1} precision={4} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="成本(USD/百万原始token)" name="costUsdPerMillionToken">
              <InputNumber min={0} step={0.0001} precision={6} style={{ width: "100%" }} placeholder="例如 2.5" />
            </Form.Item>
            <Form.Item label="固定费用 (baseTokenCost)" name="baseTokenCost">
              <InputNumber min={0} style={{ width: "100%" }} placeholder="可为空" />
            </Form.Item>
            <Form.Item label="是否启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="新增月固定成本项"
          open={fixedCostModalOpen}
          onOk={createFixedCost}
          onCancel={() => setFixedCostModalOpen(false)}
          confirmLoading={savingFixedCost}
          okText="创建"
          cancelText="取消"
        >
          <Form form={fixedCostForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
              <Input placeholder="例如: Azure Blob / Redis / 运维" />
            </Form.Item>
            <Form.Item label="月成本(USD)" name="amountUsd" rules={[{ required: true, message: "请输入月成本" }]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </Spin>
  );
}
