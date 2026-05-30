import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  notification,
} from "antd";
import {
  CloudSyncOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  createMonthlyFixedCost,
  deleteMonthlyFixedCost,
  fetchBillingRules,
  fetchPricingWorkbenchV2,
  isOwner,
  updateBillingRule,
  updateMonthlyFixedCost,
  updatePricingWorkbenchV2Settings,
  type BillingRuleRow,
  type MonthlyFixedCostItem,
  type PlanCatalogItem,
} from "../api";
import {
  DEFAULT_SCENARIOS,
  REFERENCE_TOKEN_FACE_VALUE,
  calcFeatureRows,
  calcPlanMargins,
  calcProbePricing,
  calcTotals,
  type FeatureCalcRow,
  type FeatureScenario,
  type GlobalAssumptions,
} from "../lib/pricingCalc";

const USD = (v: number, digits = 2) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(v)
    : "-";

const NUM = (v: number) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "-";

function marginColor(pct: number, target: number): string {
  if (pct >= target) return "#389e0d";
  if (pct >= target - 10) return "#d48806";
  return "#cf1322";
}

function findRuleForScenario(
  row: Pick<FeatureScenario, "feature" | "modelKey">,
  rules: BillingRuleRow[],
): BillingRuleRow | null {
  return (
    rules.find(
      (r) => r.enabled && r.feature === row.feature && r.modelKey === row.modelKey,
    ) ??
    rules.find(
      (r) => r.enabled && r.feature === row.feature && r.modelKey === "_default",
    ) ??
    null
  );
}

function findCalcForRule(
  rule: BillingRuleRow,
  rows: FeatureCalcRow[],
): FeatureCalcRow | undefined {
  return (
    rows.find((x) => x.feature === rule.feature && x.modelKey === rule.modelKey) ??
    rows.find((x) => x.feature === rule.feature)
  );
}

function parseScenarios(raw: unknown[] | null | undefined): FeatureScenario[] {
  if (!raw?.length) return DEFAULT_SCENARIOS;
  const parsed: FeatureScenario[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") continue;
    parsed.push({
      id: o.id,
      name: o.name,
      feature: String(o.feature ?? o.id),
      modelKey: String(o.modelKey ?? "_default"),
      callsPerUserPerMonth: Number(o.callsPerUserPerMonth ?? 0),
      inputTokensPerCall: Number(o.inputTokensPerCall ?? 0),
      outputTokensPerCall: Number(o.outputTokensPerCall ?? 0),
      priceInputPer1M: Number(o.priceInputPer1M ?? 0),
      priceOutputPer1M: Number(o.priceOutputPer1M ?? 0),
      flatCostPerCallUsd: Number(o.flatCostPerCallUsd ?? 0),
      multiplier: Number(o.multiplier ?? 1),
      baseTokenCost: Number(o.baseTokenCost ?? 0),
      enabled: o.enabled !== false,
    });
  }
  return parsed.length > 0 ? parsed : DEFAULT_SCENARIOS;
}

export default function PricingWorkbenchV2() {
  const owner = isOwner();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [targetGrossMarginPct, setTargetGrossMarginPct] = useState(70);
  const [shopifyRevSharePct, setShopifyRevSharePct] = useState(15);
  const [probePriceUsd, setProbePriceUsd] = useState(10);

  const [fixedCosts, setFixedCosts] = useState<MonthlyFixedCostItem[]>([]);
  const [scenarios, setScenarios] = useState<FeatureScenario[]>(DEFAULT_SCENARIOS);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [billingRules, setBillingRules] = useState<BillingRuleRow[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  const [fixedModalOpen, setFixedModalOpen] = useState(false);
  const [newFixedName, setNewFixedName] = useState("");
  const [newFixedAmount, setNewFixedAmount] = useState(100);

  const fixedMonthly = useMemo(
    () => fixedCosts.filter((c) => c.enabled).reduce((s, c) => s + c.amountUsd, 0),
    [fixedCosts],
  );

  const assumptions: GlobalAssumptions = useMemo(
    () => ({
      targetGrossMarginPct,
      shopifyRevSharePct,
    }),
    [targetGrossMarginPct, shopifyRevSharePct],
  );

  const featureRows = useMemo(
    () => calcFeatureRows(scenarios, REFERENCE_TOKEN_FACE_VALUE),
    [scenarios],
  );

  const totals = useMemo(
    () => calcTotals(featureRows, fixedMonthly),
    [featureRows, fixedMonthly],
  );

  const probe = useMemo(
    () =>
      calcProbePricing(
        { probePriceUsd, targetGrossMarginPct, shopifyRevSharePct },
        totals,
      ),
    [probePriceUsd, targetGrossMarginPct, shopifyRevSharePct, totals],
  );

  const planMargins = useMemo(
    () => calcPlanMargins(plans, assumptions, totals),
    [plans, assumptions, totals],
  );

  const orphanRules = useMemo(
    () =>
      billingRules.filter(
        (rule) =>
          rule.enabled &&
          !featureRows.some(
            (row) => row.feature === rule.feature && row.modelKey === rule.modelKey,
          ),
      ),
    [billingRules, featureRows],
  );

  function importRuleAsScenario(rule: BillingRuleRow) {
    setScenarios((prev) => {
      if (prev.some((r) => r.feature === rule.feature && r.modelKey === rule.modelKey)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `rule_${rule.ruleKey}`,
          name: rule.displayName.split("·")[0]?.trim() || rule.feature,
          feature: rule.feature,
          modelKey: rule.modelKey,
          callsPerUserPerMonth: 10,
          inputTokensPerCall: 1000,
          outputTokensPerCall: 500,
          priceInputPer1M: 0.14,
          priceOutputPer1M: 0.28,
          flatCostPerCallUsd: 0,
          multiplier: rule.multiplier,
          baseTokenCost: rule.baseTokenCost ?? 0,
          enabled: true,
        },
      ];
    });
    notification.success({ message: `已导入 ${rule.ruleKey}` });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPricingWorkbenchV2();
      const s = data.settings;
      setTargetGrossMarginPct(s.targetGrossMarginPct);
      setShopifyRevSharePct(s.shopifyRevSharePct ?? 15);
      setProbePriceUsd(s.probePriceUsd ?? 10);
      setFixedCosts(data.fixedCosts);
      setPlans(data.plans ?? []);
      setScenarios(parseScenarios(s.usageScenarios));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const r = await fetchBillingRules();
      setBillingRules(r.rules);
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadRules();
  }, [load, loadRules]);

  function patchScenario(id: string, patch: Partial<FeatureScenario>) {
    setScenarios((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function addScenario() {
    const id = `custom_${Date.now()}`;
    setScenarios((prev) => [
      ...prev,
      {
        id,
        name: "新能力",
        feature: "custom",
        modelKey: "_default",
        callsPerUserPerMonth: 10,
        inputTokensPerCall: 1000,
        outputTokensPerCall: 500,
        priceInputPer1M: 0.14,
        priceOutputPer1M: 0.28,
        flatCostPerCallUsd: 0,
        multiplier: 1,
        baseTokenCost: 0,
        enabled: true,
      },
    ]);
  }

  function syncFromBillingRules() {
    setScenarios((prev) =>
      prev.map((row) => {
        const rule = findRuleForScenario(row, billingRules);
        if (!rule) return row;
        return {
          ...row,
          multiplier: rule.multiplier,
          baseTokenCost: rule.baseTokenCost ?? row.baseTokenCost,
          name: rule.displayName.split("·")[0]?.trim() || row.name,
        };
      }),
    );
    notification.success({ message: "已从线上规则同步倍率与 base" });
  }

  function adoptSuggestionToScenario(row: FeatureCalcRow) {
    patchScenario(row.id, {
      multiplier: row.suggestedMultiplier,
      baseTokenCost: row.suggestedBaseTokenCost,
    });
    notification.success({ message: `${row.name} 已采纳建议参数` });
  }

  async function handleSave() {
    if (!owner) return;
    setSaving(true);
    try {
      await updatePricingWorkbenchV2Settings({
        targetGrossMarginPct,
        probePriceUsd,
        shopifyRevSharePct,
        usageScenarios: scenarios,
      });
      notification.success({ message: "工作台配置已保存" });
    } catch (e) {
      notification.error({ message: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFixedCost() {
    if (!newFixedName.trim()) return;
    try {
      await createMonthlyFixedCost({
        name: newFixedName.trim(),
        amountUsd: newFixedAmount,
      });
      setFixedModalOpen(false);
      setNewFixedName("");
      setNewFixedAmount(100);
      await load();
      notification.success({ message: "固定成本项已添加" });
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function toggleFixedCost(item: MonthlyFixedCostItem) {
    try {
      await updateMonthlyFixedCost(item.id, { enabled: !item.enabled });
      await load();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function removeFixedCost(id: string) {
    try {
      await deleteMonthlyFixedCost(id);
      await load();
      notification.success({ message: "已删除" });
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  async function applyRuleSuggestion(rule: BillingRuleRow) {
    if (!owner) return;
    const calc = findCalcForRule(rule, featureRows);
    if (!calc) {
      notification.warning({ message: "请先在本页添加对应能力行" });
      return;
    }
    try {
      await updateBillingRule(rule.ruleKey, {
        multiplier: calc.multiplier,
        baseTokenCost: calc.baseTokenCost > 0 ? calc.baseTokenCost : null,
      });
      notification.success({ message: `已写回 ${rule.ruleKey}` });
      loadRules();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  const overviewTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="反推模拟（主套餐探针）">
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={8}>
            <Typography.Text type="secondary">探针价格 (USD)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0.01}
              step={1}
              precision={2}
              value={probePriceUsd}
              onChange={(n) => setProbePriceUsd(Number(n ?? 10))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Typography.Text type="secondary">目标毛利率 (%)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              max={99}
              step={0.5}
              value={targetGrossMarginPct}
              onChange={(n) => setTargetGrossMarginPct(Number(n ?? 0))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Typography.Text type="secondary">Shopify 分成 (%)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              max={99}
              step={0.5}
              value={shopifyRevSharePct}
              onChange={(n) => setShopifyRevSharePct(Number(n ?? 0))}
            />
          </Col>
          <Col xs={24} md={8}>
            <Typography.Text type="secondary">
              {USD(probePriceUsd)} 建议发放 Token
            </Typography.Text>
            <Typography.Title level={2} style={{ margin: "4px 0" }}>
              {NUM(probe.suggestedTokens)}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              净收 {USD(probe.netRevenueUsd)} · 成本{" "}
              {USD(probe.effectiveCostPerBilledToken, 6)}/计费 Token
            </Typography.Text>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space>
            月固定成本
            <Tag>{USD(fixedMonthly)}/月</Tag>
          </Space>
        }
        extra={
          owner && (
            <Button icon={<PlusOutlined />} onClick={() => setFixedModalOpen(true)}>
              添加
            </Button>
          )
        }
      >
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={fixedCosts}
          columns={[
            { title: "项目", dataIndex: "name" },
            {
              title: "金额/月",
              dataIndex: "amountUsd",
              render: (v: number) => USD(v),
            },
            {
              title: "启用",
              dataIndex: "enabled",
              render: (v: boolean, r: MonthlyFixedCostItem) =>
                owner ? (
                  <Switch size="small" checked={v} onChange={() => toggleFixedCost(r)} />
                ) : (
                  <Tag color={v ? "green" : "default"}>{v ? "是" : "否"}</Tag>
                ),
            },
            ...(owner
              ? [
                  {
                    title: "",
                    render: (_: unknown, r: MonthlyFixedCostItem) => (
                      <Popconfirm title="删除此项？" onConfirm={() => removeFixedCost(r.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
    </Space>
  );

  const capabilitiesTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="能力与计费规则"
        description="左侧编辑成本与模拟参数（驱动套餐反推）；右侧对照线上 TokenBillingRule。写回规则会把当前模拟倍率/base 同步到 Turso，不影响 PlanCatalog。"
      />
      <Space wrap>
        <Button icon={<PlusOutlined />} onClick={addScenario}>
          新增能力
        </Button>
        <Button icon={<SyncOutlined />} onClick={syncFromBillingRules}>
          从线上规则拉取
        </Button>
        <Button icon={<ReloadOutlined />} onClick={loadRules} loading={rulesLoading}>
          刷新规则
        </Button>
      </Space>
      <Table
        size="small"
        scroll={{ x: 1680 }}
        pagination={false}
        rowKey="id"
        loading={rulesLoading}
        dataSource={featureRows}
        columns={[
          {
            title: "",
            width: 48,
            fixed: "left" as const,
            render: (_: unknown, r: FeatureScenario) => (
              <Switch
                size="small"
                checked={r.enabled}
                onChange={(v) => patchScenario(r.id, { enabled: v })}
              />
            ),
          },
          {
            title: "能力 / 规则",
            width: 168,
            fixed: "left" as const,
            render: (_: unknown, r: FeatureCalcRow) => {
              const rule = findRuleForScenario(r, billingRules);
              return (
                <Space direction="vertical" size={0}>
                  <Input
                    size="small"
                    value={r.name}
                    onChange={(e) => patchScenario(r.id, { name: e.target.value })}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                    {r.feature} · {r.modelKey}
                  </Typography.Text>
                  {rule ? (
                    <Typography.Text code style={{ fontSize: 10 }}>
                      {rule.ruleKey}
                    </Typography.Text>
                  ) : (
                    <Tag color="default" style={{ marginTop: 2, fontSize: 10 }}>
                      无线上规则
                    </Tag>
                  )}
                </Space>
              );
            },
          },
          {
            title: "成本",
            children: [
              {
                title: "$/1M In",
                width: 80,
                render: (_: unknown, r: FeatureScenario) => (
                  <InputNumber
                    size="small"
                    min={0}
                    step={0.01}
                    style={{ width: "100%" }}
                    value={r.priceInputPer1M}
                    onChange={(n) =>
                      patchScenario(r.id, { priceInputPer1M: Number(n ?? 0) })
                    }
                  />
                ),
              },
              {
                title: "$/1M Out",
                width: 80,
                render: (_: unknown, r: FeatureScenario) => (
                  <InputNumber
                    size="small"
                    min={0}
                    step={0.01}
                    style={{ width: "100%" }}
                    value={r.priceOutputPer1M}
                    onChange={(n) =>
                      patchScenario(r.id, { priceOutputPer1M: Number(n ?? 0) })
                    }
                  />
                ),
              },
              {
                title: "$/次固定",
                width: 80,
                render: (_: unknown, r: FeatureScenario) => (
                  <InputNumber
                    size="small"
                    min={0}
                    step={0.001}
                    value={r.flatCostPerCallUsd}
                    onChange={(n) =>
                      patchScenario(r.id, { flatCostPerCallUsd: Number(n ?? 0) })
                    }
                  />
                ),
              },
              {
                title: "API/次",
                width: 72,
                render: (_: unknown, r: FeatureCalcRow) => (
                  <Typography.Text style={{ fontSize: 11 }}>
                    {USD(r.costPerCallUsd, 4)}
                  </Typography.Text>
                ),
              },
            ],
          },
          {
            title: "模拟（工作台）",
            children: [
              {
                title: "×",
                width: 64,
                render: (_: unknown, r: FeatureScenario) => (
                  <InputNumber
                    size="small"
                    min={0}
                    step={0.1}
                    value={r.multiplier}
                    onChange={(n) => patchScenario(r.id, { multiplier: Number(n ?? 0) })}
                  />
                ),
              },
              {
                title: "base",
                width: 72,
                render: (_: unknown, r: FeatureScenario) => (
                  <InputNumber
                    size="small"
                    min={0}
                    value={r.baseTokenCost}
                    onChange={(n) =>
                      patchScenario(r.id, { baseTokenCost: Number(n ?? 0) })
                    }
                  />
                ),
              },
              {
                title: "扣费/次",
                width: 80,
                render: (_: unknown, r: FeatureCalcRow) => NUM(r.billedTokensPerCall),
              },
            ],
          },
          {
            title: "线上（Turso）",
            children: [
              {
                title: "×",
                width: 56,
                render: (_: unknown, r: FeatureCalcRow) => {
                  const rule = findRuleForScenario(r, billingRules);
                  if (!rule) return "-";
                  const drift = Math.abs(rule.multiplier - r.multiplier) > 0.05;
                  return (
                    <Tag color={drift ? "orange" : "default"}>{rule.multiplier}x</Tag>
                  );
                },
              },
              {
                title: "base",
                width: 72,
                render: (_: unknown, r: FeatureCalcRow) => {
                  const rule = findRuleForScenario(r, billingRules);
                  if (!rule || rule.baseTokenCost == null) return "-";
                  const drift = rule.baseTokenCost !== r.baseTokenCost;
                  return (
                    <Tag color={drift ? "orange" : "default"}>{NUM(rule.baseTokenCost)}</Tag>
                  );
                },
              },
            ],
          },
          {
            title: "建议",
            children: [
              {
                title: "× / base",
                width: 120,
                render: (_: unknown, r: FeatureCalcRow) => (
                  <Space size={4} wrap>
                    <Tag
                      color={
                        Math.abs(r.suggestedMultiplier - r.multiplier) > 0.15
                          ? "gold"
                          : "default"
                      }
                    >
                      {r.suggestedMultiplier}x
                    </Tag>
                    {r.suggestedBaseTokenCost > 0 && (
                      <Tag color="purple">{NUM(r.suggestedBaseTokenCost)}</Tag>
                    )}
                  </Space>
                ),
              },
              {
                title: "操作",
                width: 148,
                render: (_: unknown, r: FeatureCalcRow) => {
                  const rule = findRuleForScenario(r, billingRules);
                  return (
                    <Space size={0} wrap>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => adoptSuggestionToScenario(r)}
                      >
                        采纳建议
                      </Button>
                      {owner && rule && (
                        <Button
                          type="link"
                          size="small"
                          icon={<CloudSyncOutlined />}
                          onClick={() => applyRuleSuggestion(rule)}
                        >
                          写回
                        </Button>
                      )}
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() =>
                          setScenarios((prev) => prev.filter((x) => x.id !== r.id))
                        }
                      />
                    </Space>
                  );
                },
              },
            ],
          },
        ]}
      />
      {orphanRules.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${orphanRules.length} 条线上规则尚未纳入模拟`}
          description={
            <Space wrap style={{ marginTop: 8 }}>
              {orphanRules.map((rule) => (
                <Button
                  key={rule.ruleKey}
                  size="small"
                  onClick={() => importRuleAsScenario(rule)}
                >
                  导入 {rule.displayName}
                </Button>
              ))}
            </Space>
          }
        />
      )}
      <Row gutter={16}>
        <Col xs={24}>
          <Card size="small">
            <Typography.Text type="secondary">综合 $ / 计费 Token（各能力均权）</Typography.Text>
            <Typography.Title level={4} style={{ margin: "4px 0" }}>
              {USD(totals.effectiveCostPerBilledToken, 6)}
            </Typography.Title>
          </Card>
        </Col>
      </Row>
    </Space>
  );

  const plansTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="PlanCatalog 对照"
        description="读取 Turso 当前启用套餐，按工作台成本模型估算隐含毛利率与建议 Token 发放量（不含年付周期折算）。"
      />
      {plans.length === 0 ? (
        <Alert type="warning" message="未读取到 PlanCatalog，请确认 Turso 已迁移种子数据" />
      ) : (
        <Table
          size="small"
          rowKey="planKey"
          pagination={false}
          scroll={{ x: 1100 }}
          dataSource={planMargins}
          columns={[
            {
              title: "套餐",
              dataIndex: "displayName",
              render: (v: string, r) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{v}</Typography.Text>
                  <Typography.Text code style={{ fontSize: 10 }}>
                    {r.planKey}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: "类型",
              render: (_: unknown, r) => (
                <Space>
                  <Tag color={r.kind === "SUBSCRIPTION" ? "green" : "orange"}>
                    {r.kind === "SUBSCRIPTION" ? "订阅" : "按量包"}
                  </Tag>
                  {r.billingInterval && <Tag>{r.billingInterval}</Tag>}
                </Space>
              ),
            },
            {
              title: "标价",
              dataIndex: "priceUsd",
              render: (v: number) => USD(v),
            },
            {
              title: "净收入",
              dataIndex: "netRevenueUsd",
              render: (v: number) => USD(v),
            },
            {
              title: "当前 Token",
              dataIndex: "tokens",
              render: (v: number) => NUM(v),
            },
            {
              title: "Token/$",
              dataIndex: "tokensPerDollar",
              render: (v: number) => NUM(v),
            },
            {
              title: "隐含毛利率",
              dataIndex: "impliedMarginPct",
              render: (v: number) => (
                <Badge
                  color={marginColor(v, targetGrossMarginPct)}
                  text={`${v.toFixed(1)}%`}
                />
              ),
            },
            {
              title: "建议 Token",
              dataIndex: "suggestedTokens",
              render: (v: number) => NUM(v),
            },
            {
              title: "偏差",
              dataIndex: "tokenDeltaPct",
              render: (v: number) => (
                <Tag color={v >= 0 ? "green" : "red"}>
                  {v >= 0 ? "+" : ""}
                  {v.toFixed(0)}%
                </Tag>
              ),
            },
          ]}
        />
      )}
    </Space>
  );

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            定价工作台
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 720 }}>
            模型/API 成本、基础设施固定成本与 Shopify 分成 → 套餐 Token 面值与计费倍率。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            重新加载
          </Button>
          {owner && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存配置
            </Button>
          )}
        </Space>
      </div>

      {error && <Alert type="error" message={error} closable />}
      {!owner && (
        <Alert type="warning" showIcon message="只读模式 — 保存与写回规则需 Owner 账号" />
      )}

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: "overview",
            label: (
              <span>
                概览与反推{" "}
                <Tooltip title="KPI + 双向反推">
                  <InfoCircleOutlined />
                </Tooltip>
              </span>
            ),
            children: overviewTab,
          },
          { key: "capabilities", label: "能力与计费", children: capabilitiesTab },
          { key: "plans", label: "套餐对照", children: plansTab },
        ]}
      />

      <Modal
        title="添加月固定成本"
        open={fixedModalOpen}
        onOk={handleAddFixedCost}
        onCancel={() => setFixedModalOpen(false)}
        okText="添加"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
          <div>
            <Typography.Text>项目名称</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              placeholder="如 Render Web、Turso、Cosmos"
              value={newFixedName}
              onChange={(e) => setNewFixedName(e.target.value)}
            />
          </div>
          <div>
            <Typography.Text>月金额 (USD)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              value={newFixedAmount}
              onChange={(n) => setNewFixedAmount(Number(n ?? 0))}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
