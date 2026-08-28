import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, theme, Result, Button } from "antd";
import { getToken, isOwner } from "./api";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Shops from "./pages/Shops";
import Translations from "./pages/Translations";
import ShopTranslation from "./pages/ShopTranslation";
import Usage from "./pages/Usage";
import Capabilities from "./pages/Capabilities";
import Subscriptions from "./pages/Subscriptions";
import Revenue from "./pages/Revenue";
import AgentRuns from "./pages/AgentRuns";
import PricingWorkbenchV2 from "./pages/PricingWorkbenchV2";
import Todo from "./pages/Todo";
import OpsChecklist from "./pages/OpsChecklist";
import VisitSource from "./pages/VisitSource";
import PixelLogs from "./pages/PixelLogs";
import AppLogs from "./pages/AppLogs";
import Support from "./pages/Support";
import RedisExplorer from "./pages/RedisExplorer";
import TsfOverview from "./pages/tsf/TsfOverview";
import TsfShops from "./pages/tsf/TsfShops";
import TsfUsage from "./pages/tsf/TsfUsage";
import TsfSubscriptions from "./pages/tsf/TsfSubscriptions";
import TsfPacks from "./pages/tsf/TsfPacks";
import TsfRevenue from "./pages/tsf/TsfRevenue";
import TsfRoi from "./pages/tsf/TsfRoi";
import TsfBilling from "./pages/tsf/TsfBilling";
import TsfShopProfiles from "./pages/tsf/TsfShopProfiles";
import TsfShopProfileDetail from "./pages/tsf/TsfShopProfileDetail";
import TsfLanguageCoverage from "./pages/tsf/TsfLanguageCoverage";
import TsfCredits from "./pages/tsf/TsfCredits";
import TsfSingleTranslateLogs from "./pages/tsf/TsfSingleTranslateLogs";
import TranslationOps from "./pages/TranslationOps";
import ShopifyTranslationOps from "./pages/ShopifyTranslationOps";
import OpenRouterProbe from "./pages/OpenRouterProbe";
import SparkCredits from "./pages/SparkCredits";
import SparkBilling from "./pages/SparkBilling";
import { useNavigate } from "react-router-dom";

function RequireAuth({ children }: { children: React.ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireOwner({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  if (!isOwner()) {
    return (
      <Result
        status="403"
        title="无访问权限"
        subTitle="收入分析仅限 owner 账号查看"
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            返回概览
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}

// user role default landing: redirect / to dashboard
function IndexRedirect() {
  return <Dashboard />;
}

export default function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<IndexRedirect />} />
            <Route path="shops" element={<Shops />} />
            <Route path="usage" element={<Usage />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="billing" element={<SparkBilling />} />
            <Route path="credits" element={<SparkCredits />} />
            <Route path="revenue" element={<RequireOwner><Revenue /></RequireOwner>} />
            <Route path="capabilities" element={<Capabilities />} />
            <Route path="agent-runs" element={<AgentRuns />} />
            <Route
              path="openrouter-probe"
              element={
                <RequireOwner>
                  <OpenRouterProbe />
                </RequireOwner>
              }
            />
            <Route path="pricing-workbench" element={<RequireOwner><PricingWorkbenchV2 /></RequireOwner>} />
            <Route path="ops-checklist" element={<OpsChecklist />} />
            <Route path="visit-source" element={<VisitSource />} />
            <Route path="pixel-logs" element={<RequireOwner><PixelLogs /></RequireOwner>} />
            <Route path="app-logs" element={<AppLogs />} />
            <Route path="support" element={<Support />} />
            <Route
              path="translate-v4-support"
              element={<Support source="translate-v4" title="翻译 v4 客服" />}
            />
            <Route path="todo" element={<Todo />} />
            <Route path="redis-explorer" element={<RedisExplorer />} />
            <Route path="translations" element={<Translations />} />
            <Route path="shop-translation" element={<ShopTranslation />} />
            <Route
              path="auto-translations"
              element={<Navigate to="/translations?source=auto" replace />}
            />
            <Route path="tsf/overview" element={<TsfOverview />} />
            <Route path="tsf/shops" element={<TsfShops />} />
            <Route path="tsf/usage" element={<TsfUsage />} />
            <Route path="tsf/subscriptions" element={<TsfSubscriptions />} />
            <Route path="tsf/packs" element={<TsfPacks />} />
            <Route path="tsf/billing" element={<RequireOwner><TsfBilling /></RequireOwner>} />
            <Route path="tsf/shop-profiles" element={<TsfShopProfiles />} />
            <Route path="tsf/shop-profiles/:shop" element={<TsfShopProfileDetail />} />
            <Route path="tsf/language-coverage" element={<TsfLanguageCoverage />} />
            <Route path="tsf/revenue" element={<RequireOwner><TsfRevenue /></RequireOwner>} />
            <Route path="tsf/roi" element={<RequireOwner><TsfRoi /></RequireOwner>} />
            <Route path="tsf/pricing-workbench" element={<RequireOwner><PricingWorkbenchV2 /></RequireOwner>} />
            <Route path="tsf/credits" element={<TsfCredits />} />
            <Route
              path="tsf/single-translate-logs"
              element={<TsfSingleTranslateLogs />}
            />
            <Route path="translation-ops" element={<TranslationOps />} />
            <Route path="shopify-translation" element={<ShopifyTranslationOps />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
