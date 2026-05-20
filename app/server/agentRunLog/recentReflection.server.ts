import { getAgentRunsSparkOpsContainer } from "../cosmos/cosmosSparkOps.server";
import type { AgentRunDoc, AgentRunReflection } from "./types.server";

const MAX_RECENT_REFLECTIONS = 5;
const MAX_REFLECTION_TEXT_CHARS = 900;

function truncateReflectionText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_REFLECTION_TEXT_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_REFLECTION_TEXT_CHARS)}…`;
}

function docToReflectionSummary(doc: AgentRunDoc): string | undefined {
  const reflection = doc.reflection;
  if (!reflection) return undefined;

  const lines = [
    `- ${doc.feature} / ${doc.status} / ${reflection.summary}`,
  ];

  if (reflection.rootCause) {
    lines.push(`  - 根因：${reflection.rootCause}`);
  }

  if (reflection.nextTimeStrategy?.length) {
    lines.push(`  - 下次策略：${reflection.nextTimeStrategy.join("；")}`);
  }

  return truncateReflectionText(lines.join("\n"));
}

export async function fetchRecentReflectionSummary(shop: string): Promise<string | undefined> {
  try {
    const shopTrim = shop.trim();
    if (!shopTrim) return undefined;

    const container = await getAgentRunsSparkOpsContainer();
    const query = container.items.query<AgentRunDoc>({
      query:
        "SELECT * FROM c WHERE c.shop = @shop AND IS_DEFINED(c.reflection) ORDER BY c.startedAt DESC",
      parameters: [{ name: "@shop", value: shopTrim }],
    });
    const { resources } = await query.fetchAll();
    const summaries: string[] = [];

    for (const doc of resources.slice(0, MAX_RECENT_REFLECTIONS)) {
      const summary = docToReflectionSummary(doc);
      if (summary) summaries.push(summary);
    }

    if (!summaries.length) return undefined;
    return summaries.join("\n");
  } catch (error) {
    console.error("[AgentRunLog] fetchRecentReflectionSummary failed:", error);
    return undefined;
  }
}

export function buildReflectionFromRun(params: {
  status: AgentRunDoc["status"];
  replyText?: string;
  toolNames: string[];
  errorMessage?: string;
  inputText?: string;
}): AgentRunReflection {
  const { status, replyText, toolNames, errorMessage, inputText } = params;
  const hasTools = toolNames.length > 0;

  const summary =
    status === "error"
      ? "本次调用未成功完成，已记录失败原因。"
      : hasTools
        ? "本次调用完成，且已使用工具支持回答。"
        : "本次调用完成，但未使用工具。";

  const nextTimeStrategy: string[] = [];
  if (!hasTools) {
    nextTimeStrategy.push("优先判断是否需要调用工具，避免直接凭常识回答复杂店铺问题");
  }
  if (status === "error") {
    nextTimeStrategy.push("先定位错误来源，再决定是否切换 fallback 回答");
  }
  if (replyText && replyText.length > 800) {
    nextTimeStrategy.push("回答尽量压缩为短段落和列表，避免过长输出");
  }
  if (inputText?.includes("最近") || inputText?.includes("本周") || inputText?.includes("本月")) {
    nextTimeStrategy.push("遇到时间范围问题时，先确认时间窗口再输出结论");
  }

  return {
    summary,
    rootCause:
      status === "error"
        ? truncateReflectionText(errorMessage ?? "运行异常或工具链路失败")
        : hasTools
          ? "当前链路可正常调用工具"
          : "本次问题类型未触发工具调用",
    nextTimeStrategy: nextTimeStrategy.length ? nextTimeStrategy : undefined,
    confidence: status === "error" ? 0.78 : 0.7,
    generatedAt: new Date().toISOString(),
  };
}
