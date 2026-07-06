import { useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Layout as AntLayout, Menu, Button, Typography, Tag, Segmented } from "antd";
import {
  DashboardOutlined,
  ShopOutlined,
  BarChartOutlined,
  LogoutOutlined,
  RobotOutlined,
  CreditCardOutlined,
  DollarOutlined,
  MonitorOutlined,
  CalculatorOutlined,
  CheckSquareOutlined,
  SafetyCertificateOutlined,
  AimOutlined,
  FileSearchOutlined,
  AppstoreOutlined,
  CustomerServiceOutlined,
  HddOutlined,
  UserOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { clearToken, isOwner, getRole } from "../api";

const { Sider, Content, Header } = AntLayout;

type AdminSection = "spark" | "translation";

type MenuItemDef = {
  key: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  ownerOnly: boolean;
};

const TRANSLATION_ROUTE_PREFIXES = ["/redis-explorer", "/translate-v4-support", "/tsf"];

const SPARK_DEFAULT_ROUTE = "/";
const TRANSLATION_DEFAULT_ROUTE = "/tsf/overview";

function sectionFromPath(pathname: string): AdminSection {
  return TRANSLATION_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ? "translation"
    : "spark";
}

const sparkMenuItems: MenuItemDef[] = [
  { key: "/", icon: <DashboardOutlined />, label: <Link to="/">概览</Link>, ownerOnly: false },
  { key: "/shops", icon: <ShopOutlined />, label: <Link to="/shops">商店</Link>, ownerOnly: false },
  { key: "/usage", icon: <BarChartOutlined />, label: <Link to="/usage">用量统计</Link>, ownerOnly: false },
  { key: "/subscriptions", icon: <CreditCardOutlined />, label: <Link to="/subscriptions">订阅统计</Link>, ownerOnly: false },
  { key: "/revenue", icon: <DollarOutlined />, label: <Link to="/revenue">收入分析</Link>, ownerOnly: true },
  { key: "/pricing-workbench", icon: <CalculatorOutlined />, label: <Link to="/pricing-workbench">定价工作台</Link>, ownerOnly: true },
  { key: "/capabilities", icon: <RobotOutlined />, label: <Link to="/capabilities">Agent 能力</Link>, ownerOnly: false },
  { key: "/agent-runs", icon: <MonitorOutlined />, label: <Link to="/agent-runs">AI 执行监控</Link>, ownerOnly: false },
  { key: "/visit-source", icon: <AimOutlined />, label: <Link to="/visit-source">访问来源</Link>, ownerOnly: false },
  { key: "/pixel-logs", icon: <FileSearchOutlined />, label: <Link to="/pixel-logs">WebPixel 日志</Link>, ownerOnly: true },
  { key: "/app-logs", icon: <AppstoreOutlined />, label: <Link to="/app-logs">Spark 应用日志</Link>, ownerOnly: false },
  { key: "/support", icon: <CustomerServiceOutlined />, label: <Link to="/support">客服会话</Link>, ownerOnly: false },
  { key: "/ops-checklist", icon: <SafetyCertificateOutlined />, label: <Link to="/ops-checklist">服务巡检</Link>, ownerOnly: false },
  { key: "/todo", icon: <CheckSquareOutlined />, label: <Link to="/todo">Team Todo</Link>, ownerOnly: false },
];

const translationMenuItems: MenuItemDef[] = [
  { key: "/tsf/overview", icon: <TeamOutlined />, label: <Link to="/tsf/overview">TSF 新用户概览</Link>, ownerOnly: false },
  { key: "/tsf/shops", icon: <UserOutlined />, label: <Link to="/tsf/shops">TSF 新用户</Link>, ownerOnly: false },
  { key: "/tsf/usage", icon: <BarChartOutlined />, label: <Link to="/tsf/usage">TSF 用量</Link>, ownerOnly: false },
  { key: "/tsf/subscriptions", icon: <CreditCardOutlined />, label: <Link to="/tsf/subscriptions">TSF 订阅</Link>, ownerOnly: false },
  { key: "/redis-explorer", icon: <HddOutlined />, label: <Link to="/redis-explorer">翻译 TM 缓存</Link>, ownerOnly: false },
  {
    key: "/translate-v4-support",
    icon: <CustomerServiceOutlined />,
    label: <Link to="/translate-v4-support">翻译 v4 客服</Link>,
    ownerOnly: false,
  },
];

function buildMenuItems(items: MenuItemDef[], owner: boolean) {
  return items
    .filter((item) => !item.ownerOnly || owner)
    .map(({ key, icon, label }) => ({ key, icon, label }));
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const owner = isOwner();
  const section = sectionFromPath(pathname);

  function logout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  function onSectionChange(next: AdminSection) {
    if (next === section) return;
    navigate(next === "translation" ? TRANSLATION_DEFAULT_ROUTE : SPARK_DEFAULT_ROUTE);
  }

  const menuItems = buildMenuItems(
    section === "translation" ? translationMenuItems : sparkMenuItems,
    owner,
  );

  const selectedKey =
    menuItems.find((m) => m.key !== "/" && pathname.startsWith(m.key))?.key ??
    menuItems[0]?.key ??
    "/";

  return (
    <AntLayout style={{ minHeight: "100vh", overflowX: "hidden" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              内部管理后台
            </Typography.Text>
            <Segmented<AdminSection>
              value={section}
              onChange={onSectionChange}
              options={[
                { label: "Spark", value: "spark" },
                { label: "翻译", value: "translation" },
              ]}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Tag color={owner ? "gold" : "blue"}>
              {getRole() === "owner" ? "Owner" : "User"}
            </Tag>
            <Button icon={<LogoutOutlined />} type="text" onClick={logout}>
              退出
            </Button>
          </div>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
