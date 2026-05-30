import { useEffect, useState } from "react";
import { Alert, Card, Space, Spin, Table, Tag, Typography } from "antd";
import { fetchOpsChecklist, type OpsChecklistData } from "../api";

const CATEGORY_COLOR: Record<string, string> = {
  core: "blue",
  ai: "purple",
  ops: "cyan",
};

export default function OpsChecklist() {
  const [data, setData] = useState<OpsChecklistData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchOpsChecklist()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  }
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!data) {
    return null;
  }

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            服务巡检总览
          </Typography.Title>
          <Typography.Text type="secondary">
            最后生成时间：{new Date(data.generatedAt).toLocaleString("zh-CN")}
          </Typography.Text>
        </div>

        <Card title="外部服务与成本观察点">
          <Table
            dataSource={data.services}
            rowKey={(r) => r.key}
            size="small"
            pagination={false}
            columns={[
              {
                title: "服务",
                dataIndex: "name",
                key: "name",
                render: (_v, r) => (
                  <Space>
                    <Typography.Text strong>{r.name}</Typography.Text>
                    <Tag color={CATEGORY_COLOR[r.category] ?? "default"}>{r.category}</Tag>
                    {r.required ? <Tag color="red">required</Tag> : <Tag>optional</Tag>}
                  </Space>
                ),
              },
              {
                title: "配置状态",
                key: "configured",
                dataIndex: "configured",
                width: 120,
                render: (v: boolean) =>
                  v ? <Tag color="green">已配置</Tag> : <Tag color="volcano">未配置</Tag>,
              },
              {
                title: "用途",
                dataIndex: "note",
                key: "note",
              },
              {
                title: "成本关注",
                dataIndex: "costSignal",
                key: "costSignal",
              },
              {
                title: "充值/扩容信号",
                dataIndex: "rechargeSignal",
                key: "rechargeSignal",
              },
            ]}
          />
        </Card>
      </Space>
    </div>
  );
}
