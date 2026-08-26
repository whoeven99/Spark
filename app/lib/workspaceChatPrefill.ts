import {
  serializeManagedAiLaunchContext,
  type ManagedAiLaunchContext,
} from "./managedAiLaunchContext";

export const WORKSPACE_ASSISTANT_PATH = "/app/assistant";

export function buildWorkspaceAssistantPath(params: {
  prompt?: string | null;
  openContextTool?: string | null;
  managedAiContext?: ManagedAiLaunchContext | null;
}) {
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
  return query ? `${WORKSPACE_ASSISTANT_PATH}?${query}` : WORKSPACE_ASSISTANT_PATH;
}

export function buildWorkspaceChatPrefillPath(params: {
  prompt?: string | null;
  openContextTool?: string | null;
  managedAiContext?: ManagedAiLaunchContext | null;
}) {
  return buildWorkspaceAssistantPath(params);
}
