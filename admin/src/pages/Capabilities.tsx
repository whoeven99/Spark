import { useEffect, useState } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Tag,
  Typography,
  Spin,
  Alert,
  Collapse,
  Table,
  Badge,
  Steps,
  Tooltip,
} from "antd";
import {
  ToolOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import {
  fetchCapabilities,
  type CapabilitiesData,
  type SkillDef,
  type PlaybookDef,
  type ToolParam,
  type StepSpec,
  type StepKind,
  type SkillStage,
} from "../api";

const CATEGORY_COLORS: Record<string, string> = {
  店铺运营: "blue",
  本地化: "purple",
  内容创作: "orange",
  商品优化: "gold",
  通知: "cyan",
  基础能力: "default",
  选品上新: "green",
  未分类: "default",
};

// 步骤类型 → 颜色 + 文案（与 app 端 STEP_KIND_LABELS 对齐）
const STEP_KIND_META: Record<StepKind, { color: string; label: string }> = {
  data: { color: "blue", label: "数据" },
  compute: { color: "default", label: "计算" },
  llm: { color: "purple", label: "大模型" },
  tool: { color: "geekblue", label: "工具" },
  qc: { color: "orange", label: "质检" },
  execute: { color: "red", label: "执行" },
};

const STAGE_LABELS: Record<SkillStage, string> = {
  dataAlign: "数据对齐",
  monitor: "监控与发现",
  diagnose: "问题定位",
  propose: "方案产出",
  qc: "质检与风控",
  execute: "执行",
  review: "复盘验证",
};

function StageTag({ stage }: { stage?: SkillStage }) {
  if (!stage) return null;
  return (
    <Tag color="default" style={{ marginLeft: 4 }}>
      {STAGE_LABELS[stage]}
    </Tag>
  );
}

function ParamTag({ p }: { p: ToolParam }) {
  return (
    <Tooltip title={p.desc}>
      <Tag style={{ cursor: "default", marginBottom: 4 }}>
        <span style={{ color: "#1677ff", fontFamily: "monospace" }}>
          {p.name}
        </span>
        <span style={{ color: "#888", fontSize: 11, marginLeft: 4 }}>
          {p.type}
        </span>
        {p.required && (
          <span style={{ color: "#d4380d", fontSize: 11, marginLeft: 3 }}>*</span>
        )}
      </Tag>
    </Tooltip>
  );
}

/** 结构化步骤流程图，原子 Skill 与 Playbook 共用 */
function StepFlow({ steps }: { steps: StepSpec[] }) {
  if (!steps || steps.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        单步直接执行（无显式流程）
      </Typography.Text>
    );
  }
  return (
    <Steps
      direction="vertical"
      size="small"
      current={steps.length}
      items={steps.map((s) => {
        const meta = STEP_KIND_META[s.kind] ?? STEP_KIND_META.compute;
        return {
          status: "finish" as const,
          title: (
            <span>
              {s.label}
              <Tag color={meta.color} style={{ marginLeft: 8 }}>
                {meta.label}
              </Tag>
              {s.stage && (
                <Tag style={{ marginLeft: 0 }}>{STAGE_LABELS[s.stage]}</Tag>
              )}
            </span>
          ),
          description: s.runningLabel ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              运行时：{s.runningLabel}…
            </Typography.Text>
          ) : undefined,
        };
      })}
    />
  );
}

function SkillCard({ skill }: { skill: SkillDef }) {
  const toolColumns = [
    {
      title: "工具名称",
      dataIndex: "name",
      key: "name",
      width: 240,
      render: (v: string) => (
        <Typography.Text code style={{ fontSize: 12, wordBreak: "break-all" }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "功能说明",
      dataIndex: "description",
      key: "description",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4 }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "参数",
      dataIndex: "params",
      key: "params",
      render: (params: ToolParam[]) =>
        params.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            无参数
          </Typography.Text>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {params.map((p) => (
              <ParamTag key={p.name} p={p} />
            ))}
          </div>
        ),
    },
  ];

  return (
    <Card
      size="small"
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {skill.displayName}
          </Typography.Text>
          <Tag color={CATEGORY_COLORS[skill.category] ?? "default"}>
            {skill.category}
          </Tag>
          <StageTag stage={skill.stage} />
          <Tag color="geekblue">{skill.tools.length} 个工具</Tag>
          {skill.conditional && <Tag color="warning">条件启用</Tag>}
        </div>
      }
      style={{ marginBottom: 12 }}
    >
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        {skill.description}
      </Typography.Text>

      {skill.steps.length > 0 && (
        <Row gutter={24} style={{ marginBottom: 12 }}>
          <Col xs={24} md={10}>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, display: "block", marginBottom: 10 }}
            >
              内部流程（运行时会在聊天里逐步点亮）
            </Typography.Text>
            <StepFlow steps={skill.steps} />
          </Col>
        </Row>
      )}

      <Table
        dataSource={skill.tools}
        columns={toolColumns}
        rowKey="name"
        size="small"
        pagination={false}
        bordered={false}
      />
    </Card>
  );
}

function PlaybookCard({ pb }: { pb: PlaybookDef }) {
  return (
    <Card
      size="small"
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {pb.displayName}
          </Typography.Text>
          <Tag color={CATEGORY_COLORS[pb.category] ?? "green"}>{pb.category}</Tag>
          <Tag color="purple">{pb.steps.length} 步</Tag>
          {pb.conditional && <Tag color="warning">条件启用</Tag>}
        </div>
      }
      style={{ marginBottom: 12 }}
    >
      <Row gutter={24}>
        <Col xs={24} md={10}>
          <Typography.Text
            type="secondary"
            style={{ display: "block", marginBottom: 12 }}
          >
            {pb.description}
          </Typography.Text>

          <div
            style={{
              background: "#f9f9f9",
              borderRadius: 6,
              padding: "10px 14px",
            }}
          >
            <Typography.Text
              type="secondary"
              style={{ fontSize: 11, display: "block", marginBottom: 4 }}
            >
              <QuestionCircleOutlined style={{ marginRight: 4 }} />
              触发条件
            </Typography.Text>
            <Typography.Text style={{ fontSize: 13 }}>
              {pb.triggerDescription}
            </Typography.Text>
          </div>
        </Col>

        <Col xs={24} md={14}>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: "block", marginBottom: 10 }}
          >
            执行流程
          </Typography.Text>
          <StepFlow steps={pb.steps} />
        </Col>
      </Row>
    </Card>
  );
}

export default function Capabilities() {
  const [data, setData] = useState<CapabilitiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCapabilities()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (error) return <Alert type="error" message={error} />;
  if (!data) return null;

  const collapseSkillItems = data.skills.map((skill) => ({
    key: skill.name,
    label: (
      <span>
        <Typography.Text strong>{skill.displayName}</Typography.Text>
        <Tag
          color={CATEGORY_COLORS[skill.category] ?? "default"}
          style={{ marginLeft: 8 }}
        >
          {skill.category}
        </Tag>
        <Tag color="geekblue" style={{ marginLeft: 4 }}>
          {skill.tools.length} 个工具
        </Tag>
        {skill.steps.length > 0 && (
          <Tag color="purple" style={{ marginLeft: 4 }}>
            {skill.steps.length} 步流程
          </Tag>
        )}
        {skill.conditional && (
          <Tag color="warning" style={{ marginLeft: 4 }}>
            条件启用
          </Tag>
        )}
      </span>
    ),
    children: <SkillCard skill={skill} />,
  }));

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>
        AI Agent 能力概览
      </Typography.Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="原子技能（Skills）"
              value={data.stats.skillCount}
              prefix={<RobotOutlined />}
              suffix="组"
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="原子工具（Tools）"
              value={data.stats.toolCount}
              prefix={<ToolOutlined />}
              suffix="个"
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="复合剧本（Playbooks）"
              value={data.stats.playbookCount}
              prefix={<ThunderboltOutlined />}
              suffix="个"
              valueStyle={{ color: "#722ed1" }}
            />
          </Card>
        </Col>
      </Row>

      {/* 剧本区块（用户主入口，放前面） */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <ThunderboltOutlined style={{ color: "#722ed1", fontSize: 16 }} />
          <Typography.Title level={5} style={{ margin: 0 }}>
            复合 Skill（Playbook）
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            — 以业务目标为入口，Agent 编排多步骤闭环
          </Typography.Text>
        </div>

        {data.playbooks.map((pb) => (
          <PlaybookCard key={pb.name} pb={pb} />
        ))}
      </div>

      {/* 原子技能区块 */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <ToolOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <Typography.Title level={5} style={{ margin: 0 }}>
            原子 Skill（Atomic）
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            — 单一职责的能力积木，被 Playbook 编排复用
          </Typography.Text>
        </div>

        <Collapse
          items={collapseSkillItems}
          defaultActiveKey={data.skills
            .filter((s) => !s.conditional)
            .map((s) => s.name)}
          bordered={false}
          style={{ background: "transparent" }}
        />
      </div>

      {/* 说明 */}
      <Card
        size="small"
        style={{ marginTop: 24, background: "#fafafa", border: "1px solid #f0f0f0" }}
      >
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
          <div>
            <Badge status="success" />
            <Typography.Text type="secondary" style={{ marginLeft: 6 }}>
              默认启用 — 所有商店均可使用
            </Typography.Text>
          </div>
          <div>
            <Badge status="warning" />
            <Typography.Text type="secondary" style={{ marginLeft: 6 }}>
              条件启用 — 需要特定环境变量或配置
            </Typography.Text>
          </div>
          <div>
            <Typography.Text type="secondary">
              步骤标签颜色对应类型：数据 / 计算 / 大模型 / 工具 / 质检 / 执行
            </Typography.Text>
          </div>
          <div>
            <Typography.Text type="secondary">
              本页由注册表自动派生（/api/ai-capabilities），新增 Skill 自动出现
            </Typography.Text>
          </div>
        </div>
      </Card>
    </div>
  );
}
