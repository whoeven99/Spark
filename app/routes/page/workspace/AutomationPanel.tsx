/**
 * 工作台自动化 Panel（从 WorkspaceAppShellPage 拆出）。
 * 阶段 4 起接入真实数据（/api/automation-overview）：
 * 已配置 = 每日经营巡检的真实快照状态；执行历史 = 近 7 天巡检记录；
 * 任务模板 = 服务端 Playbook 注册表（可在对话中触发）。
 */
import { useEffect, useState } from "react";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type {
  AutomationOverview,
  AutomationOverviewResponse,
} from "../../../lib/automationOverviewTypes";
import type { AutomationView } from "./types";
import {
  automationCardStyle,
  buttonRowStyle,
  ghostButtonStyle,
  listColumnStyle,
  mobileAutomationCardStyle,
  mobileButtonRowStyle,
  mobileSectionHeaderStyle,
  mobileSurfaceCardStyle,
  mobileTabRowStyle,
  mutedMetaStyle,
  primaryButtonStyle,
  sectionHeaderStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  sectionTitleStyle,
  statusBadgeStyle,
  surfaceCardStyle,
  tabButtonStyle,
  tabRowStyle,
} from "./styles";

function formatRunTime(iso: string | null): string {
  if (!iso) return "从未执行";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function AutomationPanel({
  activeView,
  onChangeView,
  onRunInChat,
}: {
  activeView: AutomationView;
  onChangeView: (value: AutomationView) => void;
  /** 把一条自动化相关指令带入对话（切到 chat 面板并预填输入框） */
  onRunInChat: (prompt: string) => void;
}) {
  const { isMobile } = useResponsiveLayout();
  const [overview, setOverview] = useState<AutomationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    setLoading(true);
    fetch(`/api/automation-overview${authQuery}`)
      .then((res) => res.json() as Promise<AutomationOverviewResponse>)
      .then((json) => {
        if (cancelled) return;
        if (json.ok) {
          setOverview(json.overview);
          setErrorText(null);
        } else {
          setErrorText(json.error);
        }
      })
      .catch(() => {
        if (!cancelled) setErrorText("网络异常，自动化数据加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cardStyle = isMobile ? mobileAutomationCardStyle : automationCardStyle;

  return (
    <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
      <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>自动化任务</div>
          <div style={sectionTextStyle}>系统内置巡检的真实执行状态，以及可在对话中触发的 Playbook。</div>
        </div>
        <div style={isMobile ? mobileButtonRowStyle : buttonRowStyle}>
          <button
            type="button"
            className="workspace-primary-btn"
            style={primaryButtonStyle}
            onClick={() => onRunInChat("帮我配置一个定期执行的自动化任务：")}
          >
            在对话中创建
          </button>
        </div>
      </div>

      <div style={isMobile ? mobileTabRowStyle : tabRowStyle}>
        {[
          ["configured", "已配置"],
          ["history", "执行历史"],
          ["templates", "任务模板"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            style={tabButtonStyle(activeView === key)}
            onClick={() => onChangeView(key as AutomationView)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={listColumnStyle}>
        {loading ? <div style={sectionTextStyle}>正在加载自动化数据…</div> : null}
        {!loading && errorText ? (
          <div style={{ ...sectionTextStyle, color: "#d72c0d" }}>{errorText}</div>
        ) : null}

        {!loading && !errorText && overview && activeView === "configured"
          ? overview.configured.map((item) => (
              <article key={item.id} style={cardStyle}>
                <div style={sectionHeaderStyle}>
                  <div>
                    <div style={sectionTitleSmallStyle}>{item.title}</div>
                    <div style={sectionTextStyle}>{item.schedule}</div>
                  </div>
                  <span style={statusBadgeStyle(item.status === "healthy" ? "positive" : "warning")}>
                    {item.status === "healthy" ? "正常" : "关注中"}
                  </span>
                </div>
                <div style={mutedMetaStyle}>最近执行：{formatRunTime(item.lastRun)}</div>
                <div style={sectionTextStyle}>{item.outcome}</div>
              </article>
            ))
          : null}

        {!loading && !errorText && overview && activeView === "history" ? (
          overview.history.length === 0 ? (
            <div style={sectionTextStyle}>暂无执行记录，打开经营看板即会触发首次巡检。</div>
          ) : (
            overview.history.map((item) => (
              <article key={item.id} style={cardStyle}>
                <div style={sectionTitleSmallStyle}>{item.title}</div>
                <div style={sectionTextStyle}>{item.detail}</div>
              </article>
            ))
          )
        ) : null}

        {!loading && !errorText && overview && activeView === "templates"
          ? overview.templates.map((item) => (
              <article key={item.id} style={cardStyle}>
                <div style={sectionHeaderStyle}>
                  <div>
                    <div style={sectionTitleSmallStyle}>{item.title}</div>
                    <div style={sectionTextStyle}>{item.detail}</div>
                  </div>
                  <button
                    type="button"
                    style={ghostButtonStyle}
                    onClick={() => onRunInChat(`运行 Playbook「${item.title}」`)}
                  >
                    在对话中运行
                  </button>
                </div>
                {item.steps.length > 0 ? (
                  <div style={mutedMetaStyle}>步骤：{item.steps.join(" → ")}</div>
                ) : null}
              </article>
            ))
          : null}
      </div>
    </section>
  );
}
