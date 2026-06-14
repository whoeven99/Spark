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
  planFeatureMarginMatrix,
  suggestVolumeLadder,
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

  const [maxPremiumPct, setMaxPremiumPct] = useState(100);
  /** 阶梯调价的承保成本/1M credits；null = 跟随混合成本 */
  const [underwriteOverride, setUnderwriteOverride] = useState<number | null>(null);

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

  const matrix = useMemo(
    () =>
      planFeatureMarginMatrix(
        plans.map((p) => ({
          planKey: p.planKey,
          displayName: p.displayName,
          kind: p.kind,
          billingInterval: p.billingInterval,
          priceAmount: p.priceAmount,
          tokens: p.tokens,
        })),
        featureRows,
        assumptions,
      ),
    [plans, featureRows, assumptions],
  );

  const underwriteCost = underwriteOverride ?? matrix.blendedCostPerMCredits;

  const ladder = useMemo(
    () =>
      suggestVolumeLadder(
        plans.map((p) => ({
          planKey: p.planKey,
          displayName: p.displayName,
          kind: p.kind,
          billingInterval: p.billingInterval,
          priceAmount: p.priceAmount,
          tokens: p.tokens,
        })),
        underwriteCost,
        assumptions,
        maxPremiumPct,
      ),
    [plans, underwriteCost, assumptions, maxPremiumPct],
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

  function patchOnlineRule(ruleKey: string, patch: Partial<BillingRuleRow>) {
    setBillingRules((prev) =>
      prev.map((r) => (r.ruleKey === ruleKey ? { ...r, ...patch } : r)),
    );
  }

  async function saveOnlineRule(rule: BillingRuleRow) {
    if (!owner) return;
    try {
      await updateBillingRule(rule.ruleKey, {
        displayName: rule.displayName,
        multiplier: rule.multiplier,
        baseTokenCost: rule.baseTokenCost,
        enabled: rule.enabled,
      });
      notification.success({ message: `已保存 ${rule.ruleKey}` });
      loadRules();
    } catch (e) {
      notification.error({ message: String(e) });
    }
  }

  function copySimulationToRule(rule: BillingRuleRow) {
    const calc = findCalcForRule(rule, featureRows);
    if (!calc) {
      notification.warning({ message: "模拟表中无对应能力行" });
      return;
    }
    patchOnlineRule(rule.ruleKey, {
      multiplier: calc.multiplier,
      baseTokenCost: calc.baseTokenCost > 0 ? calc.baseTokenCost : null,
    });
    notification.info({ message: "已从模拟复制，请点击保存写回 Turso" });
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
      <Card
        title="成本模拟"
        extra={
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={addScenario}>
              新增能力
            </Button>
            <Button icon={<SyncOutlined />} onClick={syncFromBillingRules}>
              从线上拉取倍率
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="仅用于反推与套餐对照"
          description="在此调整 API 成本假设与模拟倍率/base，驱动上方探针与套餐毛利率估算。不会写入 Turso。"
        />
        <Table
          size="small"
          scroll={{ x: 1200 }}
          pagination={false}
          rowKey="id"
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
              title: "能力",
              width: 168,
              fixed: "left" as const,
              render: (_: unknown, r: FeatureCalcRow) => (
                <Space direction="vertical" size={0}>
                  <Input
                    size="small"
                    value={r.name}
                    onChange={(e) => patchScenario(r.id, { name: e.target.value })}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                    {r.feature} · {r.modelKey}
                  </Typography.Text>
                </Space>
              ),
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
              title: "模拟倍率",
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
                  width: 120,
                  render: (_: unknown, r: FeatureCalcRow) => (
                    <Space size={0} wrap>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => adoptSuggestionToScenario(r)}
                      >
                        采纳建议
                      </Button>
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
                  ),
                },
              ],
            },
          ]}
        />
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Typography.Text type="secondary">综合 $ / 计费 Token（各能力均权）</Typography.Text>
            <Typography.Title level={4} style={{ margin: "4px 0" }}>
              {USD(totals.effectiveCostPerBilledToken, 6)}
            </Typography.Title>
          </Col>
        </Row>
      </Card>

      <Card
        title="线上计费规则（Turso）"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadRules} loading={rulesLoading}>
            刷新
          </Button>
        }
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="生产环境 TokenBillingRule"
          description="在此直接编辑并保存到 Turso，影响主 App 实际扣费。与上方模拟互不影响，可用「从模拟复制」对照后再保存。"
        />
        <Table
          size="small"
          scroll={{ x: 1100 }}
          pagination={false}
          rowKey="ruleKey"
          loading={rulesLoading}
          dataSource={billingRules}
          columns={[
            {
              title: "规则",
              width: 200,
              fixed: "left" as const,
              render: (_: unknown, r: BillingRuleRow) => (
                <Space direction="vertical" size={0}>
                  <Input
                    size="small"
                    value={r.displayName}
                    disabled={!owner}
                    onChange={(e) =>
                      patchOnlineRule(r.ruleKey, { displayName: e.target.value })
                    }
                  />
                  <Typography.Text code style={{ fontSize: 10 }}>
                    {r.ruleKey}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                    {r.feature} · {r.modelKey}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: "×",
              width: 80,
              render: (_: unknown, r: BillingRuleRow) => {
                const sim = findCalcForRule(r, featureRows);
                const drift = sim && Math.abs(sim.multiplier - r.multiplier) > 0.05;
                return (
                  <Space direction="vertical" size={0}>
                    <InputNumber
                      size="small"
                      min={0}
                      step={0.1}
                      disabled={!owner}
                      value={r.multiplier}
                      onChange={(n) =>
                        patchOnlineRule(r.ruleKey, { multiplier: Number(n ?? 0) })
                      }
                    />
                    {sim && drift && (
                      <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                        模拟 {sim.multiplier}x
                      </Typography.Text>
                    )}
                  </Space>
                );
              },
            },
            {
              title: "base",
              width: 88,
              render: (_: unknown, r: BillingRuleRow) => {
                const sim = findCalcForRule(r, featureRows);
                const simBase = sim && sim.baseTokenCost > 0 ? sim.baseTokenCost : null;
                const drift =
                  simBase != null &&
                  r.baseTokenCost != null &&
                  r.baseTokenCost !== simBase;
                return (
                  <Space direction="vertical" size={0}>
                    <InputNumber
                      size="small"
                      min={0}
                      disabled={!owner}
                      value={r.baseTokenCost ?? undefined}
                      placeholder="-"
                      onChange={(n) =>
                        patchOnlineRule(r.ruleKey, {
                          baseTokenCost: n == null || n === 0 ? null : Number(n),
                        })
                      }
                    />
                    {simBase != null && drift && (
                      <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                        模拟 {NUM(simBase)}
                      </Typography.Text>
                    )}
                  </Space>
                );
              },
            },
            {
              title: "启用",
              width: 64,
              render: (_: unknown, r: BillingRuleRow) =>
                owner ? (
                  <Switch
                    size="small"
                    checked={r.enabled}
                    onChange={(v) => patchOnlineRule(r.ruleKey, { enabled: v })}
                  />
                ) : (
                  <Tag color={r.enabled ? "green" : "default"}>{r.enabled ? "是" : "否"}</Tag>
                ),
            },
            {
              title: "操作",
              width: 160,
              render: (_: unknown, r: BillingRuleRow) => (
                <Space size={0} wrap>
                  {owner && (
                    <Button
                      type="link"
                      size="small"
                      icon={<SaveOutlined />}
                      onClick={() => saveOnlineRule(r)}
                    >
                      保存
                    </Button>
                  )}
                  <Button
                    type="link"
                    size="small"
                    disabled={!findCalcForRule(r, featureRows)}
                    onClick={() => copySimulationToRule(r)}
                  >
                    从模拟复制
                  </Button>
                </Space>
              ),
            },
          ]}
        />
        {orphanRules.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message={`${orphanRules.length} 条线上规则尚未纳入模拟对照`}
            description={
              <Space wrap style={{ marginTop: 8 }}>
                {orphanRules.map((rule) => (
                  <Button
                    key={rule.ruleKey}
                    size="small"
                    onClick={() => importRuleAsScenario(rule)}
                  >
                    加入模拟 {rule.displayName}
                  </Button>
                ))}
              </Space>
            }
          />
        )}
      </Card>
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

  const marginTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="套餐 × 能力 毛利热力表">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="若用户把该套餐额度全部用在某能力上的毛利率"
          description={`统一标尺：$ / 100 万 credits。绿≥目标(${targetGrossMarginPct}%) · 黄=接近 · 红=不达标/亏本。「混合」列按上方各能力月调用量加权（综合成本 ${USD(
            matrix.blendedCostPerMCredits,
            2,
          )}/1M credits）。`}
        />
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 900 }}
          rowKey="planKey"
          dataSource={matrix.plans}
          columns={[
            {
              title: "套餐",
              width: 200,
              fixed: "left" as const,
              render: (_: unknown, p) => (
                <Space direction="vertical" size={0}>
                  <Space size={4}>
                    <Typography.Text strong>{p.displayName}</Typography.Text>
                    <Tag color={p.kind === "SUBSCRIPTION" ? "green" : "orange"}>
                      {p.kind === "SUBSCRIPTION" ? "订阅" : "按量包"}
                    </Tag>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                    {NUM(p.credits)} credits · 售价 {USD(p.salePerMCredits, 2)}/1M
                  </Typography.Text>
                </Space>
              ),
            },
            ...matrix.features.map((f) => ({
              title: (
                <Tooltip title={`成本 ${USD(f.costPerMCredits, 2)}/1M credits`}>
                  <span>{f.name}</span>
                </Tooltip>
              ),
              width: 92,
              align: "center" as const,
              render: (_: unknown, p: { planKey: string }) => {
                const pct = matrix.cells[p.planKey]?.[f.id] ?? 0;
                return (
                  <Typography.Text
                    strong
                    style={{ color: marginColor(pct, targetGrossMarginPct) }}
                  >
                    {pct.toFixed(0)}%
                  </Typography.Text>
                );
              },
            })),
            {
              title: "混合",
              width: 92,
              align: "center" as const,
              render: (_: unknown, p) => {
                const pct = matrix.blendedMarginByPlan[p.planKey] ?? 0;
                return (
                  <Badge
                    color={marginColor(pct, targetGrossMarginPct)}
                    text={`${pct.toFixed(0)}%`}
                  />
                );
              },
            },
            {
              title: (
                <Tooltip title="该套餐每 100 万 credits 允许的最高模型成本（达标线）">
                  <span>成本上限/1M</span>
                </Tooltip>
              ),
              width: 110,
              align: "right" as const,
              render: (_: unknown, p) => USD(p.costCeilingPerMCredits, 2),
            },
          ]}
        />
      </Card>

      <Card title="阶梯调价建议（保利润 + 越大越划算）">
        <Row gutter={[24, 16]} align="middle" style={{ marginBottom: 12 }}>
          <Col xs={24} md={8}>
            <Typography.Text type="secondary">承保成本/1M credits</Typography.Text>
            <Space.Compact style={{ width: "100%", marginTop: 4 }}>
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                step={0.5}
                precision={2}
                value={underwriteCost}
                onChange={(n) => setUnderwriteOverride(Number(n ?? 0))}
              />
              <Button onClick={() => setUnderwriteOverride(null)}>跟随混合</Button>
            </Space.Compact>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {underwriteOverride == null
                ? `当前=混合成本 ${USD(matrix.blendedCostPerMCredits, 2)}`
                : "手动覆盖；点「跟随混合」恢复"}
            </Typography.Text>
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">最小档溢价 (%)</Typography.Text>
            <InputNumber
              style={{ width: "100%", marginTop: 4 }}
              min={0}
              max={400}
              step={10}
              value={maxPremiumPct}
              onChange={(n) => setMaxPremiumPct(Number(n ?? 0))}
            />
          </Col>
          <Col xs={24} md={10}>
            <Alert
              type="success"
              showIcon
              message="最大套餐 = 刚好达标的地板价，越小的套餐溢价越高"
              description="每档毛利率都 ≥ 目标，且越大的套餐每 credit 越便宜（量大优惠）。"
            />
          </Col>
        </Row>
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 980 }}
          rowKey="planKey"
          dataSource={ladder}
          columns={[
            {
              title: "套餐",
              width: 170,
              fixed: "left" as const,
              render: (_: unknown, r) => (
                <Space size={4}>
                  <Typography.Text strong>{r.displayName}</Typography.Text>
                  <Tag color={r.kind === "SUBSCRIPTION" ? "green" : "orange"}>
                    {r.kind === "SUBSCRIPTION" ? "订阅" : "包"}
                  </Tag>
                </Space>
              ),
            },
            { title: "credits", width: 100, render: (_: unknown, r) => NUM(r.credits) },
            {
              title: "现价",
              width: 130,
              render: (_: unknown, r) => (
                <Space direction="vertical" size={0}>
                  <span>{USD(r.currentPriceUsd)}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                    {USD(r.currentSalePerMCredits, 2)}/1M
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: "建议价",
              width: 130,
              render: (_: unknown, r) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{USD(r.suggestedPriceUsd)}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                    {USD(r.suggestedSalePerMCredits, 2)}/1M
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: "建议毛利",
              width: 90,
              align: "center" as const,
              render: (_: unknown, r) => (
                <Badge
                  color={marginColor(r.suggestedMarginPct, targetGrossMarginPct)}
                  text={`${r.suggestedMarginPct.toFixed(0)}%`}
                />
              ),
            },
            {
              title: (
                <Tooltip title="相对同类最小套餐，每 credit 便宜多少">
                  <span>量大优惠</span>
                </Tooltip>
              ),
              width: 90,
              align: "center" as const,
              render: (_: unknown, r) => (
                <Tag color={r.discountVsSmallestPct > 0 ? "green" : "default"}>
                  -{r.discountVsSmallestPct.toFixed(0)}%
                </Tag>
              ),
            },
          ]}
        />
      </Card>
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
          { key: "margin", label: "毛利热力 & 调价", children: marginTab },
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
