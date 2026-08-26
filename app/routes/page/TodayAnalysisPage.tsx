import type { CSSProperties } from "react";
import { getTodayAnalysisTodoActionLabel, getTodayAnalysisTodoActionTone } from "../../lib/todayAnalysisTodo";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import type { TodayAnalysisCard, TodayAnalysisTodo } from "../../lib/todayReportTypes";
import { DestinationPage } from "../component/shared/DestinationPage";
import {
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
  PageSurface,
} from "./pageUiStyles";
import { TodayCountryFilterCard, type TodayCountryFilterOption } from "../component/today/TodayCountryFilterCard";

export type TodayAnalysisTodoAction = TodayAnalysisTodo & {
  onClick: () => void;
};

export type TodayAnalysisRenderableCard = Omit<TodayAnalysisCard, "todos"> & {
  todos: TodayAnalysisTodoAction[];
  detail?: string;
};

export function TodayAnalysisPage({
  title,
  subtitle,
  returnTo,
  countryOptions,
  activeCountry,
  onCountryChange,
  notes,
  lead,
  cards,
}: {
  title: string;
  subtitle: string;
  returnTo?: string;
  countryOptions: TodayCountryFilterOption[];
  activeCountry: string;
  onCountryChange: (country: string) => void;
  notes?: string[];
  lead?: {
    title: string;
    summary: string;
    points?: string[];
  };
  cards: TodayAnalysisRenderableCard[];
}) {
  const { isMobile } = useResponsiveLayout();

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={title}
        subtitle={subtitle}
        titleBarTitle={title}
        backLabel="返回经营"
        fallbackPath="/app/today"
        returnTo={returnTo}
        isMobile={isMobile}
        chromeless
      >
        <TodayCountryFilterCard
          options={countryOptions}
          activeCountry={activeCountry}
          onChange={onCountryChange}
          notes={notes}
        />

        {lead ? (
          <PageSurface title={lead.title}>
            <div style={leadWrapStyle}>
              <p style={leadSummaryStyle}>{lead.summary}</p>
              {lead.points && lead.points.length > 0 ? (
                <div style={leadPointListStyle}>
                  {lead.points.map((point) => (
                    <div key={point} style={leadPointItemStyle}>
                      {point}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </PageSurface>
        ) : null}

        <PageSurface title="分析卡片" subtitle="每张卡片先回答一个经营问题，再进入对应详情页继续下钻。">
          <div style={analysisGridStyle(isMobile)}>
            {cards.map((card) => (
              <div key={card.key} style={analysisCardStyle}>
                <div style={analysisTitleStyle}>{card.title}</div>
                <div style={analysisQuestionLabelStyle}>问题</div>
                <p style={analysisQuestionStyle}>{card.question}</p>
                <div style={analysisMetricLabelStyle}>{card.metricLabel}</div>
                <div style={analysisMetricValueStyle}>{card.metricValue}</div>
                <div style={analysisConclusionLabelStyle}>分析结论</div>
                <p style={analysisConclusionStyle}>{card.conclusion}</p>
                {card.evidence.length > 0 ? (
                  <div style={analysisEvidenceWrapStyle}>
                    {card.evidence.map((item) => (
                      <div key={`${card.key}-${item.label}`} style={analysisEvidenceItemStyle}>
                        <span style={analysisEvidenceLabelStyle}>{item.label}</span>
                        <strong style={analysisEvidenceValueStyle}>{item.value}</strong>
                        {item.change ? <span style={analysisEvidenceChangeStyle}>{item.change}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {card.ideas.length > 0 ? (
                  <div style={analysisIdeaBlockStyle}>
                    <div style={analysisIdeaLabelStyle}>优化思路</div>
                    <div style={analysisIdeaListStyle}>
                      {card.ideas.map((idea) => (
                        <div key={idea} style={analysisIdeaItemStyle}>
                          {idea}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {card.detail ? <div style={analysisDetailStyle}>{card.detail}</div> : null}
                {card.todos.length > 0 ? (
                  <div style={analysisTodoBlockStyle}>
                    <div style={analysisTodoLabelStyle}>Todo</div>
                    <div style={analysisTodoListStyle}>
                      {card.todos.map((todo, index) => (
                        <div key={todo.key} style={analysisTodoItemStyle}>
                          <div style={analysisTodoHeaderStyle}>
                            <div style={analysisTodoTitleStyle}>{todo.title}</div>
                            <span style={analysisTodoTypeBadgeStyle(getTodayAnalysisTodoActionTone(todo.actionType))}>
                              {getTodayAnalysisTodoActionLabel(todo.actionType)}
                            </span>
                          </div>
                          <div style={analysisTodoDetailStyle}>{todo.detail}</div>
                          <button
                            type="button"
                            onClick={todo.onClick}
                            style={analysisActionButtonStyle(index === 0)}
                          >
                            {todo.actionLabel}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </PageSurface>
      </DestinationPage>
    </div>
  );
}

const leadWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.8rem",
};

const leadSummaryStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textPrimary,
  fontSize: "0.95rem",
  lineHeight: 1.7,
};

const leadPointListStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
};

const leadPointItemStyle: CSSProperties = {
  ...pageHintTextStyle,
  color: pageColorTokens.textSecondary,
};

const analysisGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
  gap: "1rem",
});

const analysisCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surfaceSubtle,
  padding: "1rem",
  display: "grid",
  gap: "0.42rem",
};

const analysisTitleStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const analysisQuestionLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  marginTop: "0.15rem",
};

const analysisQuestionStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textPrimary,
  fontSize: "0.9rem",
  fontWeight: 650,
  lineHeight: 1.55,
};

const analysisMetricLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textFootnote,
  marginTop: "0.15rem",
};

const analysisMetricValueStyle: CSSProperties = {
  fontSize: "1.45rem",
  fontWeight: 780,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.18,
};

const analysisConclusionLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  marginTop: "0.18rem",
};

const analysisConclusionStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.88rem",
  lineHeight: 1.65,
};

const analysisEvidenceWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  marginTop: "0.15rem",
};

const analysisEvidenceItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  flexWrap: "wrap",
  gap: "0.35rem 0.5rem",
};

const analysisEvidenceLabelStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.78rem",
  fontWeight: 700,
};

const analysisEvidenceValueStyle: CSSProperties = {
  color: pageColorTokens.textPrimary,
  fontSize: "0.9rem",
};

const analysisEvidenceChangeStyle: CSSProperties = {
  color: pageColorTokens.textSecondary,
  fontSize: "0.8rem",
  fontWeight: 700,
};

const analysisIdeaBlockStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  marginTop: "0.2rem",
};

const analysisIdeaLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const analysisIdeaListStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const analysisIdeaItemStyle: CSSProperties = {
  color: pageColorTokens.textSecondary,
  fontSize: "0.84rem",
  lineHeight: 1.6,
};

const analysisDetailStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.78rem",
  lineHeight: 1.55,
};

const analysisTodoBlockStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  marginTop: "0.2rem",
};

const analysisTodoLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const analysisTodoListStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const analysisTodoItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.32rem",
  padding: "0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
};

const analysisTodoHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.6rem",
};

const analysisTodoTitleStyle: CSSProperties = {
  fontSize: "0.86rem",
  fontWeight: 720,
  color: pageColorTokens.textPrimary,
};

function analysisTodoTypeBadgeStyle(tone: "blue" | "green" | "orange" | "neutral"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.18rem 0.45rem",
    borderRadius: 999,
    fontSize: "0.7rem",
    fontWeight: 700,
    color:
      tone === "green"
        ? pageColorTokens.brandGreenDark
        : tone === "orange"
          ? "#9a5b00"
          : tone === "blue"
            ? pageColorTokens.brandBlueDark
            : pageColorTokens.textSecondary,
    background:
      tone === "green"
        ? pageColorTokens.brandGreenLight
        : tone === "orange"
          ? pageColorTokens.warningBg
          : tone === "blue"
            ? pageColorTokens.brandBlueLight
            : pageColorTokens.surfaceMuted,
    border: `1px solid ${
      tone === "green"
        ? "rgba(0, 128, 96, 0.18)"
        : tone === "orange"
          ? "#f1d58d"
          : tone === "blue"
            ? "rgba(0, 91, 211, 0.18)"
            : pageColorTokens.borderSubtle
    }`,
  };
}

const analysisTodoDetailStyle: CSSProperties = {
  color: pageColorTokens.textSecondary,
  fontSize: "0.8rem",
  lineHeight: 1.55,
};

const analysisActionButtonStyle = (primary: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 36,
  padding: "0.55rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${primary ? pageColorTokens.brandBlue : pageColorTokens.border}`,
  background: primary ? pageColorTokens.brandBlue : pageColorTokens.surface,
  color: primary ? "#ffffff" : pageColorTokens.textSecondary,
  fontSize: "0.8125rem",
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content",
});
