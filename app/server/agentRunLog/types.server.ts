import type { AppEntry } from "../../config/appEntry.server";

export type AgentRunFeature =
  | "chat"
  | "chat_stream"
  | "generate_description"
  | "picture_translate";

export type AgentRunStatus = "success" | "error" | "timeout" | "partial";

export type AgentRunToolSummary = {
  name: string;
  ok: boolean;
};

export type AgentRunInputSummary = {
  lastHuman?: string;
  productId?: string;
  targetLanguage?: string;
  imageUrlHost?: string;
  sourceCode?: string;
  targetCode?: string;
  modelType?: number;
};

export type AgentRunRefs = {
  requestId?: string;
  translationJobId?: string;
};

export type AgentRunErrorSummary = {
  code?: string;
  message: string;
};

export type AgentRunTokenUsage = {
  prompt: number;
  completion: number;
  total: number;
};

/** Cosmos `agent_runs` 文档（partition: shop） */
export type AgentRunDoc = {
  id: string;
  shop: string;
  appName: AppEntry | string;
  feature: AgentRunFeature;
  status: AgentRunStatus;
  startedAt: string;
  durationMs: number;
  langsmithRunId?: string;
  langsmithProject?: string;
  inputSummary?: AgentRunInputSummary;
  tools?: AgentRunToolSummary[];
  tokenUsage?: AgentRunTokenUsage;
  error?: AgentRunErrorSummary;
  refs?: AgentRunRefs;
  allowTraining?: boolean;
};

export type RecordAgentRunInput = {
  runId: string;
  shop: string;
  appName: AppEntry | string;
  feature: AgentRunFeature;
  status: AgentRunStatus;
  startedAt: string;
  durationMs: number;
  langsmithRunId?: string;
  inputSummary?: AgentRunInputSummary;
  tools?: AgentRunToolSummary[];
  tokenUsage?: AgentRunTokenUsage;
  error?: AgentRunErrorSummary;
  refs?: AgentRunRefs;
};
