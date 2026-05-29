/**
 * LangSmith 集成配置
 * 用于追踪和可视化 Agent 执行流程
 */

import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { Client } from "langsmith";

// LangSmith 配置
export const LANGSMITH_CONFIG = {
  enabled: Boolean(process.env.LANGCHAIN_TRACING_V2 === "true"),
  apiKey: process.env.LANGCHAIN_API_KEY,
  projectName: process.env.LANGCHAIN_PROJECT || "spark-shopify-agent",
  endpoint: process.env.LANGCHAIN_ENDPOINT || "https://api.smith.langchain.com",
};

// 创建 LangSmith Client
let langsmithClient: Client | null = null;

export function getLangsmithClient(): Client | null {
  if (!LANGSMITH_CONFIG.enabled || !LANGSMITH_CONFIG.apiKey) {
    return null;
  }
  
  if (!langsmithClient) {
    langsmithClient = new Client({
      apiKey: LANGSMITH_CONFIG.apiKey,
      apiUrl: LANGSMITH_CONFIG.endpoint,
    });
  }
  
  return langsmithClient;
}

// 创建 Tracer
export function createLangsmithTracer(sessionName?: string): LangChainTracer | null {
  if (!LANGSMITH_CONFIG.enabled || !LANGSMITH_CONFIG.apiKey) {
    return null;
  }
  
  try {
    const tracer = new LangChainTracer({
      projectName: LANGSMITH_CONFIG.projectName,
      ...(sessionName ? { metadata: { sessionName } } : {}),
      client: getLangsmithClient() || undefined,
    });
    
    console.log(`[LangSmith] Tracing enabled for project: ${LANGSMITH_CONFIG.projectName}`);
    return tracer;
  } catch (error) {
    console.warn(`[LangSmith] Failed to initialize tracer:`, error);
    return null;
  }
}

// 检查 LangSmith 是否可用
export function isLangsmithAvailable(): boolean {
  return LANGSMITH_CONFIG.enabled && Boolean(LANGSMITH_CONFIG.apiKey);
}

// 获取追踪链接（runId 为 LangSmith root run uuid）
export function getTraceUrl(runId?: string): string | null {
  if (!LANGSMITH_CONFIG.enabled) {
    return null;
  }

  if (runId?.trim()) {
    return `https://smith.langchain.com/runs/${runId.trim()}`;
  }

  if (LANGSMITH_CONFIG.projectName) {
    return `https://smith.langchain.com/o/default/projects/p/${encodeURIComponent(LANGSMITH_CONFIG.projectName)}`;
  }

  return "https://smith.langchain.com";
}
