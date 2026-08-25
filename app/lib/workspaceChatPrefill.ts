export const WORKSPACE_ASSISTANT_PATH = "/app/assistant";

export function buildWorkspaceAssistantPath(params: {
  prompt?: string | null;
  openContextTool?: string | null;
}) {
  const searchParams = new URLSearchParams();
  const prompt = params.prompt?.trim();
  const openContextTool = params.openContextTool?.trim();

  if (prompt) {
    searchParams.set("prefillTaskPrompt", prompt);
  }

  if (openContextTool) {
    searchParams.set("openContextTool", openContextTool);
  }

  const query = searchParams.toString();
  return query ? `${WORKSPACE_ASSISTANT_PATH}?${query}` : WORKSPACE_ASSISTANT_PATH;
}

export function buildWorkspaceChatPrefillPath(params: {
  prompt?: string | null;
  openContextTool?: string | null;
}) {
  return buildWorkspaceAssistantPath(params);
}
