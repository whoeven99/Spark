import { useEffect, useState } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Typography,
  Spin,
  Alert,
} from "antd";
import {
  UserOutlined,
  CrownOutlined,
  ThunderboltOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import { fetchTsfOverview, type TsfOverviewData } from "../../api";

export default function TsfOverview() {
  const [data, setData] = useState<TsfOverviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTsfOverview()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (error) return <Alert type="error" message={error} />;
  if (!data) return null;

  const columns = [
    {
      title: "商店",
      dataIndex: "shop",
      key: "shop",
      render: (v: string) => (
        <Typography.Text copyable style={{ fontSize: 12 }}>
          {v}
        </Typography.Text>
      ),
    },
    {
      title: "判定原因",
      dataIndex: "boundReason",
      key: "boundReason",
      render: (v: string | null) => <Tag color="green">{v ?? "-"}</Tag>,
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString("zh-CN")}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        TSF 新用户概览
      </Typography.Title>
      <Typography.Text
        type="secondary"
        style={{ display: "block", marginBottom: 24, fontSize: 12 }}
      >
        仅统计 TSF 新用户（ShopBillingBinding = tsf），数据来自 TSF 独立 Turso 库，不含 Spring 老用户。
      </Typography.Text>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="新用户总数"
              value={data.totalNewUsers}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="当前在装"
              value={data.installedNewUsers}
              prefix={<ApiOutlined />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="已卸载"
              value={data.churnedNewUsers}
              valueStyle={{ color: "#ff4d4f" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="活跃订阅"
              value={data.activeSubs}
              prefix={<CrownOutlined />}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="累计已用 Credits"
              value={data.totalUsedCredits.toLocaleString()}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="订阅 Credits 总量"
              value={data.totalSubscriptionCredits.toLocaleString()}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="购买 Credits 总量"
              value={data.totalPurchasedCredits.toLocaleString()}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="试用 Credits 总量"
              value={data.totalTrialCredits.toLocaleString()}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="最近注册的新用户"
        style={{ marginTop: 24 }}
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            最近 30 条
          </Typography.Text>
        }
      >
        <Table
          dataSource={data.recentRegistrations}
          columns={columns}
          rowKey={(r, i) => `${r.shop}-${i}`}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
