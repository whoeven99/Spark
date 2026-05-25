import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, Button, Card, Typography, Alert } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { setToken } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onFinish({ secret }: { secret: string }) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/overview", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.status === 401) {
        setError("密码错误");
        return;
      }
      setToken(secret);
      navigate("/", { replace: true });
    } catch {
      setError("连接失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f2f5",
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={3} style={{ textAlign: "center", marginBottom: 24 }}>
          Spark Admin
        </Typography.Title>
        {error && (
          <Alert type="error" message={error} style={{ marginBottom: 16 }} />
        )}
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="secret" rules={[{ required: true, message: "请输入管理员密码" }]}>
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="管理员密码"
              size="large"
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
          >
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
