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
  Divider,
  Tooltip,
} from "antd";
import {
  ToolOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  QuestionCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import {
  fetchCapabilities,
  type CapabilitiesData,
  type SkillDef,
  type PlaybookDef,
  type ToolParam,
} from "../api";

const CATEGORY_COLORS: Record<string, string> = {
  店铺运营: "blue",
  本地化: "purple",
  内容创作: "orange",
  通知: "cyan",
  基础能力: "default",
  选品上新: "green",
};

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
      </Tag>
    </Tooltip>
  );
}

function SkillCard({ skill }: { skill: SkillDef }) {
  const toolColumns = [
    {
      title: "工具名称",
      dataIndex: "name",
      key: "name",
      width: 220,
      render: (v: string) => (
        <Typography.Text
          code
          style={{ fontSize: 12, wordBreak: "break-all" }}
        >
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "功能说明",
      dataIndex: "displayName",
      key: "displayName",
      width: 160,
      render: (v: string, r: { description: string }) => (
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {v}
          </Typography.Text>
          <br />
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, lineHeight: 1.4 }}
          >
            {r.description}
          </Typography.Text>
        </div>
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
          <Tag color="geekblue">{skill.tools.length} 个工具</Tag>
          {skill.conditional && (
            <Tooltip title={skill.conditionalNote}>
              <Tag
                icon={<ExclamationCircleOutlined />}
                color="warning"
              >
                条件启用
              </Tag>
            </Tooltip>
          )}
        </div>
      }
      style={{ marginBottom: 12 }}
    >
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        {skill.description}
      </Typography.Text>

      <Table
        dataSource={skill.tools}
        columns={toolColumns}
        rowKey="name"
        size="small"
        pagination={false}
        bordered={false}
      />

      {skill.emailTemplates && (
        <>
          <Divider style={{ margin: "12px 0" }} />
          <div>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, marginRight: 8 }}
            >
              支持的邮件模板：
            </Typography.Text>
            {skill.emailTemplates.map((t) => (
              <Tag key={t} style={{ marginBottom: 4 }}>
                {t}
              </Tag>
            ))}
          </div>
        </>
      )}
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
          <Tag color={CATEGORY_COLORS[pb.category] ?? "green"}>
            {pb.category}
          </Tag>
          <Tag color="purple">{pb.steps.length} 步</Tag>
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
              marginBottom: 12,
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

          {pb.anomalyRules && (
            <div>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: "block", marginBottom: 6 }}
              >
                异常检测规则：
              </Typography.Text>
              {pb.anomalyRules.map((r) => (
                <div key={r} style={{ fontSize: 12, color: "#ff4d4f", marginBottom: 2 }}>
                  · {r}
                </div>
              ))}
            </div>
          )}

          {pb.completenessChecks && (
            <div>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: "block", marginBottom: 6 }}
              >
                完整度检查项：
              </Typography.Text>
              {pb.completenessChecks.map((c) => (
                <div key={c} style={{ fontSize: 12, color: "#52c41a", marginBottom: 2 }}>
                  ✓ {c}
                </div>
              ))}
            </div>
          )}
        </Col>

        <Col xs={24} md={14}>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: "block", marginBottom: 10 }}
          >
            执行步骤
          </Typography.Text>
          <Steps
            direction="vertical"
            size="small"
            current={pb.steps.length}
            items={pb.steps.map((s) => ({
              title: s,
              status: "finish" as const,
            }))}
          />
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
    return (
      <Spin
        size="large"
        style={{ display: "block", margin: "80px auto" }}
      />
    );
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
              title="技能组（Skills）"
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
              title="剧本（Playbooks）"
              value={data.stats.playbookCount}
              prefix={<ThunderboltOutlined />}
              suffix="个"
              valueStyle={{ color: "#722ed1" }}
            />
          </Card>
        </Col>
      </Row>

      {/* 技能区块 */}
      <div style={{ marginBottom: 32 }}>
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
            原子技能
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            — Agent 可直接调用的单步工具
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

      {/* 剧本区块 */}
      <div>
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
            剧本
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            — 多步骤自动化流程，Agent 编排执行
          </Typography.Text>
        </div>

        {data.playbooks.map((pb) => (
          <PlaybookCard key={pb.name} pb={pb} />
        ))}
      </div>

      {/* 说明 */}
      <Card
        size="small"
        style={{ marginTop: 24, background: "#fafafa", border: "1px solid #f0f0f0" }}
      >
        <div
          style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}
        >
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
            <Tag color="geekblue">N 个工具</Tag>
            <Typography.Text type="secondary" style={{ marginLeft: 6 }}>
              该技能组包含的原子工具数量
            </Typography.Text>
          </div>
          <div>
            <Typography.Text type="secondary">
              参数名悬停可查看详细说明
            </Typography.Text>
          </div>
        </div>
      </Card>
    </div>
  );
}
