import {
  serializeManagedAiLaunchContext,
  type ManagedAiLaunchContext,
} from "./managedAiLaunchContext";

export const WORKSPACE_HOME_PATH = "/app";

type WorkspacePrefillParams = {
  prompt?: string | null;
  openContextTool?: string | null;
  managedAiContext?: ManagedAiLaunchContext | null;
};

function buildWorkspacePrefillPath(basePath: string, params: WorkspacePrefillParams) {
  const searchParams = new URLSearchParams();
  const prompt = params.prompt?.trim();
  const openContextTool = params.openContextTool?.trim();
  const managedAiContext = serializeManagedAiLaunchContext(params.managedAiContext);

  if (prompt) {
    searchParams.set("prefillTaskPrompt", prompt);
  }

  if (openContextTool) {
    searchParams.set("openContextTool", openContextTool);
  }

  if (managedAiContext) {
    searchParams.set("prefillManagedAiContext", managedAiContext);
  }

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** 预填后进首页 `/app` 对话。旧助手路径已重定向到这里。 */
export function buildWorkspaceHomePath(params: WorkspacePrefillParams) {
  return buildWorkspacePrefillPath(WORKSPACE_HOME_PATH, params);
}

export function buildWorkspaceAssistantPath(params: WorkspacePrefillParams) {
  return buildWorkspaceHomePath(params);
}

export function buildWorkspaceChatPrefillPath(params: WorkspacePrefillParams) {
  return buildWorkspaceHomePath(params);
}
