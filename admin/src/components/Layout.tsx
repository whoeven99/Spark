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
  ShoppingCartOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  FileTextOutlined,
  CloudUploadOutlined,
  IdcardOutlined,
  FundOutlined,
  GlobalOutlined,
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

const TRANSLATION_ROUTE_PREFIXES = [
  "/translations",
  "/shop-translation",
  "/shopify-translation",
  "/auto-translations",
  "/redis-explorer",
  "/translate-v4-support",
  "/translation-ops",
  "/tsf",
];

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
  {
    key: "/translations",
    icon: <MonitorOutlined />,
    label: <Link to="/translations">翻译任务列表</Link>,
    ownerOnly: false,
  },
  {
    key: "/shop-translation",
    icon: <ShopOutlined />,
    label: <Link to="/shop-translation">商店任务查询</Link>,
    ownerOnly: false,
  },
  { key: "/tsf/overview", icon: <TeamOutlined />, label: <Link to="/tsf/overview">翻译 新用户概览</Link>, ownerOnly: false },
  { key: "/tsf/shops", icon: <UserOutlined />, label: <Link to="/tsf/shops">翻译 新用户</Link>, ownerOnly: false },
  { key: "/tsf/shop-profiles", icon: <IdcardOutlined />, label: <Link to="/tsf/shop-profiles">翻译 用户画像</Link>, ownerOnly: false },
  {
    key: "/tsf/language-coverage",
    icon: <GlobalOutlined />,
    label: <Link to="/tsf/language-coverage">语言覆盖率</Link>,
    ownerOnly: false,
  },
  { key: "/tsf/usage", icon: <BarChartOutlined />, label: <Link to="/tsf/usage">翻译 用量</Link>, ownerOnly: false },
  { key: "/tsf/subscriptions", icon: <CreditCardOutlined />, label: <Link to="/tsf/subscriptions">翻译 订阅</Link>, ownerOnly: false },
  { key: "/tsf/packs", icon: <ShoppingCartOutlined />, label: <Link to="/tsf/packs">翻译 加购流量包</Link>, ownerOnly: false },
  { key: "/tsf/billing", icon: <FileTextOutlined />, label: <Link to="/tsf/billing">翻译账单</Link>, ownerOnly: true },
  { key: "/tsf/revenue", icon: <DollarOutlined />, label: <Link to="/tsf/revenue">翻译 收入</Link>, ownerOnly: true },
  { key: "/tsf/roi", icon: <FundOutlined />, label: <Link to="/tsf/roi">翻译 ROI</Link>, ownerOnly: true },
  { key: "/tsf/pricing-workbench", icon: <CalculatorOutlined />, label: <Link to="/tsf/pricing-workbench">翻译 定价工作台</Link>, ownerOnly: true },
  {
    key: "/translation-ops",
    icon: <SettingOutlined />,
    label: <Link to="/translation-ops">翻译运维</Link>,
    ownerOnly: false,
  },
  {
    key: "/shopify-translation",
    icon: <CloudUploadOutlined />,
    label: <Link to="/shopify-translation">Shopify 翻译运维</Link>,
    ownerOnly: false,
  },
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
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              内部管理后台
            </Typography.Text>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px",
                borderRadius: 12,
                background: "linear-gradient(135deg, #f0f5ff 0%, #f6ffed 100%)",
                border: "1px solid #d6e4ff",
                boxShadow: "0 2px 8px rgba(22, 119, 255, 0.12)",
              }}
            >
              <Typography.Text strong style={{ fontSize: 13, color: "#434343", whiteSpace: "nowrap" }}>
                产品切换
              </Typography.Text>
              <Segmented<AdminSection>
                value={section}
                onChange={onSectionChange}
                size="large"
                block
                style={{ minWidth: 220, fontWeight: 600 }}
                options={[
                  {
                    label: (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
                        <ThunderboltOutlined />
                        Spark
                      </span>
                    ),
                    value: "spark",
                  },
                  {
                    label: (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
                        <AppstoreOutlined />
                        翻译
                      </span>
                    ),
                    value: "translation",
                  },
                ]}
              />
            </div>
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
