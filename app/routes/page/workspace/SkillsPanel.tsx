/** 工作台技能入口 Panel（从 WorkspaceAppShellPage 拆出）。 */
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import {
  disabledTextButtonStyle,
  ghostButtonStyle,
  mobileSectionHeaderStyle,
  mobileSkillCardButtonStyle,
  mobileSkillGridStyle,
  mobileSurfaceCardStyle,
  sectionHeaderStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  sectionTitleStyle,
  skillCardButtonDisabledStyle,
  skillCardButtonStyle,
  skillCategoryStyle,
  skillFooterStyle,
  skillGridStyle,
  statusBadgeStyle,
  surfaceCardStyle,
  textButtonStyle,
} from "./styles";

type SkillApp = {
  id: string;
  title: string;
  description: string;
  status: string;
  statusTone?: "positive" | "warning" | "critical" | "neutral";
  category: string;
  path: string;
  available: boolean;
};

const skillApps: SkillApp[] = [
  { id: "s1", title: "商品文案优化", description: "批量生成和优化商品标题、卖点与描述。", status: "可用", statusTone: "positive", category: "内容", path: "/app/product-improve", available: true },
  { id: "s4", title: "图片工具", description: "处理商品图翻译、文生图和素材优化。", status: "可用", statusTone: "positive", category: "视觉", path: "/app/image-studio", available: true },
  { id: "s3", title: "每日经营待办", description: "每日巡检经营数据，按四象限生成可执行任务。", status: "可用", statusTone: "positive", category: "分析", path: "/app/daily-operations", available: true },
  { id: "s5", title: "广告素材建议", description: "结合商品和活动目标生成广告文案建议。", status: "未完成", statusTone: "warning", category: "营销", path: "/app", available: false },
  { id: "s6", title: "邮件运营助手", description: "根据商品和分群生成邮件主题与正文。", status: "未完成", statusTone: "warning", category: "运营", path: "/app", available: false },
];

export function SkillsPanel({ onOpenTool }: { onOpenTool: (path: string) => void }) {
  const { isMobile } = useResponsiveLayout();

  return (
    <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
      <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>常用工具</div>
          <div style={sectionTextStyle}>将已有 tools 作为可直接进入的应用入口。</div>
        </div>
        <button type="button" style={ghostButtonStyle}>管理排序</button>
      </div>
      <div style={isMobile ? mobileSkillGridStyle : skillGridStyle}>
        {skillApps.map((skill) => (
          <button
            key={skill.id}
            type="button"
            style={
              skill.available
                ? isMobile
                  ? mobileSkillCardButtonStyle
                  : skillCardButtonStyle
                : skillCardButtonDisabledStyle
            }
            disabled={!skill.available}
            onClick={() => {
              if (skill.available) onOpenTool(skill.path);
            }}
          >
            <div style={skillCategoryStyle}>{skill.category}</div>
            <div style={sectionTitleSmallStyle}>{skill.title}</div>
            <div style={sectionTextStyle}>{skill.description}</div>
            <div style={skillFooterStyle}>
              <span style={statusBadgeStyle(skill.statusTone ?? "neutral")}>{skill.status}</span>
              <span style={skill.available ? textButtonStyle : disabledTextButtonStyle}>
                {skill.available ? "进入" : "敬请期待"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
