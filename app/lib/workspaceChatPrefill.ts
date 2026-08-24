export const WORKSPACE_ASSISTANT_PATH = "/app/assistant";

export function buildWorkspaceAssistantPath(params: {
  prompt?: string | null;
  constraints?: Array<string | null | undefined>;
  openContextTool?: string | null;
}) {
  const searchParams = new URLSearchParams();
  const prompt = params.prompt?.trim();
  const openContextTool = params.openContextTool?.trim();

  if (prompt) {
    searchParams.set("prefillTaskPrompt", prompt);
  }

  for (const constraint of params.constraints ?? []) {
    const next = constraint?.trim();
    if (!next) continue;
    searchParams.append("prefillConstraint", next);
  }

  if (openContextTool) {
    searchParams.set("openContextTool", openContextTool);
  }

  const query = searchParams.toString();
  return query ? `${WORKSPACE_ASSISTANT_PATH}?${query}` : WORKSPACE_ASSISTANT_PATH;
}

export function buildWorkspaceChatPrefillPath(params: {
  prompt?: string | null;
  constraints?: Array<string | null | undefined>;
}) {
  return buildWorkspaceAssistantPath(params);
}
