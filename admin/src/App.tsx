import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, theme, Result, Button } from "antd";
import { getToken, isOwner } from "./api";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Shops from "./pages/Shops";
import Translations from "./pages/Translations";
import Usage from "./pages/Usage";
import Capabilities from "./pages/Capabilities";
import Subscriptions from "./pages/Subscriptions";
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
        subTitle="该页面仅限 owner 账号查看"
        extra={
          <Button type="primary" onClick={() => navigate("/translations")}>
            前往翻译任务
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
            <Route path="translations" element={<Translations />} />
            <Route path="usage" element={<Usage />} />
            <Route path="subscriptions" element={<RequireOwner><Subscriptions /></RequireOwner>} />
            <Route path="capabilities" element={<Capabilities />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
