import type { CSSProperties } from "react";
import type { ManagedAiOutputParseResult } from "../../../lib/managedAiOutputRuntime";
import type {
  TodayGroupAnalysisReply,
  TodayObjectAnalysisReply,
  TodayPageAnalysisReply,
  TodayTodoRefineReply,
} from "../../../lib/todayAiOutputSchemas";

export function ManagedAiResultCard({ result }: { result: ManagedAiOutputParseResult }) {
  const success = result.success;
  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <span style={badgeStyle(success ? "success" : "warning")}>{success ? "结构化已匹配" : "结构化未匹配"}</span>
        <span style={summaryTextStyle}>{result.schemaKey}</span>
      </div>
      {success ? renderSuccessResult(result) : renderFailureResult(result)}
      <details style={detailsStyle}>
        <summary style={summaryStyle}>查看原始结构化结果</summary>
        <div style={bodyStyle}>
          <pre style={preStyle}>
            {JSON.stringify(result.success ? result.data : { reason: result.reason, rawText: result.rawText }, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}

function renderFailureReason(reason: "no_json" | "invalid_json" | "schema_mismatch") {
  if (reason === "no_json") return "没有检测到可解析 JSON";
  if (reason === "invalid_json") return "检测到 JSON 片段，但格式不合法";
  return "JSON 格式合法，但不符合当前输出 schema";
}

function renderSuccessResult(result: Extract<ManagedAiOutputParseResult, { success: true }>) {
  switch (result.schemaKey) {
    case "today.page.analysis.reply.v1":
      return <TodayPageAnalysisView data={result.data as TodayPageAnalysisReply} />;
    case "today.object.analysis.reply.v1":
      return <TodayObjectAnalysisView data={result.data as TodayObjectAnalysisReply} />;
    case "today.group.analysis.reply.v1":
      return <TodayGroupAnalysisView data={result.data as TodayGroupAnalysisReply} />;
    case "today.todo.refine.v1":
      return <TodayTodoRefineView data={result.data as TodayTodoRefineReply} />;
  }
}

function renderFailureResult(result: Extract<ManagedAiOutputParseResult, { success: false }>) {
  return (
    <div style={failureWrapStyle}>
      <div style={failureReasonStyle}>原因：{renderFailureReason(result.reason)}</div>
      <div style={failureHintStyle}>这次回复已经保存，你可以直接继续调提示词和输出 schema。</div>
      <pre style={preStyle}>{result.rawText}</pre>
    </div>
  );
}

function TodayPageAnalysisView({ data }: { data: TodayPageAnalysisReply }) {
  return (
    <div style={contentStackStyle}>
      <div style={headlineStyle}>{data.headline}</div>
      <div style={dualColumnStyle}>
        <InfoList title="主要支撑项" tone="success" items={data.supports} />
        <InfoList title="主要拖累项" tone="warning" items={data.drags} />
      </div>
      <PriorityList
        title="优先处理顺序"
        items={data.priorities.map((item) => ({
          title: item.title,
          detail: item.detail,
          priority: item.priority,
        }))}
      />
      {data.missingEvidence.length > 0 ? <InfoList title="缺失证据" tone="neutral" items={data.missingEvidence} /> : null}
    </div>
  );
}

function TodayObjectAnalysisView({ data }: { data: TodayObjectAnalysisReply }) {
  return (
    <div style={contentStackStyle}>
      <div style={headlineRowStyle}>
        <div style={headlineStyle}>{data.headline}</div>
        <span style={decisionBadgeStyle(data.decision)}>{renderDecisionLabel(data.decision)}</span>
      </div>
      <InfoList title="核心原因" tone="neutral" items={data.reasons} />
      <PriorityList
        title="下一步动作"
        items={data.nextSteps.map((item) => ({
          title: item.title,
          detail: item.detail,
          priority: item.priority,
        }))}
      />
    </div>
  );
}

function TodayGroupAnalysisView({ data }: { data: TodayGroupAnalysisReply }) {
  return (
    <div style={contentStackStyle}>
      <div style={headlineStyle}>{data.groupJudgment}</div>
      <div style={cardListStyle}>
        {data.priorities.map((item) => (
          <div key={`${item.objectTitle}-${item.reason}`} style={miniCardStyle}>
            <div style={miniCardHeaderStyle}>
              <strong style={miniCardTitleStyle}>{item.objectTitle}</strong>
              <span style={decisionBadgeStyle(item.decision)}>{renderDecisionLabel(item.decision)}</span>
            </div>
            <div style={miniCardDetailStyle}>{item.reason}</div>
          </div>
        ))}
      </div>
      <InfoList title="建议继续补的证据" tone="neutral" items={data.nextEvidence} />
    </div>
  );
}

function TodayTodoRefineView({ data }: { data: TodayTodoRefineReply }) {
  return (
    <div style={cardListStyle}>
      {data.todos.map((todo) => (
        <div key={`${todo.title}-${todo.target}`} style={miniCardStyle}>
          <div style={miniCardHeaderStyle}>
            <strong style={miniCardTitleStyle}>{todo.title}</strong>
            <span style={priorityBadgeStyle(todo.priority)}>{todo.priority}</span>
          </div>
          <div style={todoMetaStyle}>动作：{todo.action}</div>
          <div style={todoMetaStyle}>对象：{todo.target}</div>
          <div style={todoMetaStyle}>目标指标：{todo.metric}</div>
        </div>
      ))}
    </div>
  );
}

function InfoList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "success" | "warning" | "neutral";
  items: string[];
}) {
  return (
    <div style={sectionCardStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={listStyle}>
        {items.map((item) => (
          <div key={item} style={listItemStyle}>
            <span style={dotStyle(tone)} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriorityList({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; detail: string; priority: "P0" | "P1" | "P2" }>;
}) {
  return (
    <div style={sectionCardStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={cardListStyle}>
        {items.map((item) => (
          <div key={`${item.priority}-${item.title}`} style={miniCardStyle}>
            <div style={miniCardHeaderStyle}>
              <strong style={miniCardTitleStyle}>{item.title}</strong>
              <span style={priorityBadgeStyle(item.priority)}>{item.priority}</span>
            </div>
            <div style={miniCardDetailStyle}>{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderDecisionLabel(decision: "expand" | "stop_loss" | "watch" | "investigate") {
  if (decision === "expand") return "继续放大";
  if (decision === "stop_loss") return "先止损";
  if (decision === "watch") return "继续观察";
  return "继续排查";
}

function badgeStyle(tone: "success" | "warning"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.14rem 0.45rem",
    borderRadius: 999,
    background: tone === "success" ? "rgba(0, 128, 96, 0.12)" : "rgba(185, 137, 0, 0.14)",
    color: tone === "success" ? "#006b50" : "#8a6500",
    fontSize: "0.72rem",
    fontWeight: 700,
  };
}

function dotStyle(tone: "success" | "warning" | "neutral"): CSSProperties {
  return {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginTop: "0.38rem",
    flex: "0 0 auto",
    background:
      tone === "success"
        ? "#008060"
        : tone === "warning"
          ? "#B98900"
          : "#005BD3",
  };
}

function priorityBadgeStyle(priority: "P0" | "P1" | "P2"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.12rem 0.4rem",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 700,
    color: priority === "P0" ? "#B42318" : priority === "P1" ? "#8a6500" : "#005BD3",
    background: priority === "P0" ? "rgba(216, 44, 13, 0.1)" : priority === "P1" ? "rgba(185, 137, 0, 0.14)" : "rgba(0, 91, 211, 0.1)",
  };
}

function decisionBadgeStyle(decision: "expand" | "stop_loss" | "watch" | "investigate"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.14rem 0.48rem",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 700,
    color:
      decision === "expand"
        ? "#006b50"
        : decision === "stop_loss"
          ? "#B42318"
          : decision === "watch"
            ? "#8a6500"
            : "#005BD3",
    background:
      decision === "expand"
        ? "rgba(0, 128, 96, 0.12)"
        : decision === "stop_loss"
          ? "rgba(216, 44, 13, 0.1)"
          : decision === "watch"
            ? "rgba(185, 137, 0, 0.14)"
            : "rgba(0, 91, 211, 0.1)",
  };
}

const shellStyle: CSSProperties = {
  marginTop: "0.85rem",
  border: "1px solid rgba(31, 33, 36, 0.1)",
  borderRadius: "10px",
  background: "rgba(255,255,255,0.8)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  padding: "0.7rem 0.8rem",
  borderBottom: "1px solid rgba(31, 33, 36, 0.06)",
};

const summaryTextStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "#61666C",
  fontWeight: 600,
};

const contentStackStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  padding: "0.8rem",
};

const headlineStyle: CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 760,
  color: "#1F2124",
  lineHeight: 1.55,
};

const headlineRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const dualColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "0.75rem",
};

const sectionCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "#61666C",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "0.42rem",
};

const listItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
  fontSize: "0.82rem",
  lineHeight: 1.55,
  color: "#1F2124",
};

const cardListStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
};

const miniCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.38rem",
  padding: "0.7rem",
  borderRadius: "8px",
  border: "1px solid rgba(31, 33, 36, 0.08)",
  background: "#FFFFFF",
};

const miniCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.6rem",
};

const miniCardTitleStyle: CSSProperties = {
  fontSize: "0.84rem",
  color: "#1F2124",
};

const miniCardDetailStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "#61666C",
  lineHeight: 1.55,
};

const todoMetaStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "#61666C",
};

const detailsStyle: CSSProperties = {
  borderTop: "1px solid rgba(31, 33, 36, 0.06)",
};

const summaryStyle: CSSProperties = {
  listStyle: "none",
  cursor: "pointer",
  padding: "0.7rem 0.8rem",
  fontSize: "0.78rem",
  fontWeight: 700,
  color: "#61666C",
};

const bodyStyle: CSSProperties = {
  padding: "0 0.8rem 0.8rem",
};

const failureWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.5rem",
};

const failureReasonStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "#61666C",
  fontWeight: 600,
};

const failureHintStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: "#8C9196",
  lineHeight: 1.5,
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: "0.75rem",
  borderRadius: "8px",
  background: "#F6F6F7",
  border: "1px solid rgba(31, 33, 36, 0.06)",
  color: "#1F2124",
  fontSize: "0.75rem",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily:
    'ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};
