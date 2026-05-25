import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";

const skillsInfo = [
  {
    name: "shopifyShopInfo",
    description: "获取 Shopify 商店的基础信息",
  },
  {
    name: "translationTaskForm",
    description: "打开翻译任务表单卡片",
  },
  {
    name: "generateProductDescription",
    description: "生成商品描述（可结合用户画像进行个性化建议）",
  },
  {
    name: "pictureTranslate",
    description: "图片翻译工具",
  },
  {
    name: "imageGeneration",
    description: "图片生成工具",
  },
  {
    name: "sendTemplateEmail",
    description: "发送模板邮件",
  },
];

const toolsList = [
  "get_shop_info",
  "open_translation_task_form",
  "generate_product_description",
  "translate_picture",
  "generate_image",
  "send_template_email",
];

const cardStyle: CSSProperties = {
  borderRadius: pageColorTokens.radiusCard,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255, 152, 0, 0.3)",
  background: `linear-gradient(180deg, rgba(255, 152, 0, 0.08), rgba(255, 152, 0, 0.02))`,
  padding: "1rem",
  marginTop: "0.75rem",
};

const titleStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  marginBottom: "0.75rem",
  color: "rgba(0, 0, 0, 0.8)",
};

const sectionStyle: CSSProperties = {
  marginBottom: "0.75rem",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  marginBottom: "0.5rem",
  color: "rgba(0, 0, 0, 0.7)",
};

const skillItemStyle: CSSProperties = {
  fontSize: "0.75rem",
  marginBottom: "0.35rem",
  color: "rgba(0, 0, 0, 0.65)",
  paddingLeft: "0.5rem",
};

const skillNameStyle: CSSProperties = {
  fontWeight: 500,
  color: "rgba(0, 0, 0, 0.8)",
};

export function DebugAgentSkillsCard() {
  const { t } = useTranslation();

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>
        🔧 Agent 技能概览 (测试环境)
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📋 已注册的 Skills ({skillsInfo.length})</div>
        {skillsInfo.map((skill) => (
          <div key={skill.name} style={skillItemStyle}>
            <span style={skillNameStyle}>{skill.name}</span>
            <br />
            <span style={{ fontSize: "0.7rem", color: "rgba(0, 0, 0, 0.5)" }}>
              → {skill.description}
            </span>
          </div>
        ))}
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>🛠️ 独立工具 ({toolsList.length})</div>
        {toolsList.map((tool, index) => (
          <div key={tool} style={skillItemStyle}>
            {index + 1}. <span style={skillNameStyle}>{tool}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
