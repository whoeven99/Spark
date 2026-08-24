import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, Button, Card, Typography, Alert, Select } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import {
  setToken,
  setRole,
  setAdminUserId,
  ADMIN_USER_OPTIONS,
  type AdminRole,
  type AdminUserId,
} from "../api";

type LoginValues = {
  userId: AdminUserId;
  secret: string;
};

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onFinish({ userId, secret }: LoginValues) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/role", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.status === 401) {
        setError("密码错误");
        return;
      }
      const data = (await res.json()) as {
        role: AdminRole;
        userId: AdminUserId;
        label: string;
      };
      if (data.userId !== userId) {
        setError("身份与密码不匹配，请确认选对了自己");
        return;
      }
      setToken(secret);
      setRole(data.role);
      setAdminUserId(data.userId);
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
        <Form
          onFinish={onFinish}
          layout="vertical"
          initialValues={{ userId: "yewen" }}
        >
          <Form.Item
            name="userId"
            label="身份"
            rules={[{ required: true, message: "请选择身份" }]}
          >
            <Select
              size="large"
              options={ADMIN_USER_OPTIONS.map((u) => ({
                value: u.id,
                label: u.label,
              }))}
              suffixIcon={<UserOutlined />}
            />
          </Form.Item>
          <Form.Item
            name="secret"
            label="密码"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="个人密码"
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
