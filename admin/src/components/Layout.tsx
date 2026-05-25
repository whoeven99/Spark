import { useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Layout as AntLayout, Menu, Button, Typography, Tag } from "antd";
import {
  DashboardOutlined,
  ShopOutlined,
  TranslationOutlined,
  BarChartOutlined,
  LogoutOutlined,
  RobotOutlined,
  CreditCardOutlined,
  DollarOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { clearToken, isOwner, getRole } from "../api";

const { Sider, Content, Header } = AntLayout;

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const owner = isOwner();

  function logout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  const allMenuItems = [
    { key: "/", icon: <DashboardOutlined />, label: <Link to="/">概览</Link>, ownerOnly: false },
    { key: "/shops", icon: <ShopOutlined />, label: <Link to="/shops">商店</Link>, ownerOnly: false },
    { key: "/translations", icon: <TranslationOutlined />, label: <Link to="/translations">翻译任务</Link>, ownerOnly: false },
    { key: "/usage", icon: <BarChartOutlined />, label: <Link to="/usage">用量统计</Link>, ownerOnly: false },
    { key: "/subscriptions", icon: <CreditCardOutlined />, label: <Link to="/subscriptions">订阅统计</Link>, ownerOnly: true },
    { key: "/revenue", icon: <DollarOutlined />, label: <Link to="/revenue">收入分析</Link>, ownerOnly: true },
    { key: "/capabilities", icon: <RobotOutlined />, label: <Link to="/capabilities">Agent 能力</Link>, ownerOnly: false },
    { key: "/code-agent", icon: <RocketOutlined />, label: <Link to="/code-agent">AI Code Agent</Link>, ownerOnly: false },
  ];

  const menuItems = allMenuItems
    .filter((item) => !item.ownerOnly || owner)
    .map(({ key, icon, label }) => ({ key, icon, label }));

  const selectedKey =
    menuItems.find((m) => m.key !== "/" && pathname.startsWith(m.key))?.key ??
    "/";

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: collapsed ? 14 : 18,
            transition: "all 0.2s",
          }}
        >
          {collapsed ? "S" : "Spark Admin"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            内部管理后台
          </Typography.Text>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Tag color={owner ? "gold" : "blue"}>
              {getRole() === "owner" ? "Owner" : "User"}
            </Tag>
            <Button icon={<LogoutOutlined />} type="text" onClick={logout}>
              退出
            </Button>
          </div>
        </Header>
        <Content style={{ margin: 24, overflow: "auto" }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
