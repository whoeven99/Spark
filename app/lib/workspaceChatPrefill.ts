export function buildWorkspaceChatPrefillPath(params: {
  prompt?: string | null;
  constraints?: Array<string | null | undefined>;
}) {
  const searchParams = new URLSearchParams();
  const prompt = params.prompt?.trim();

  if (prompt) {
    searchParams.set("prefillTaskPrompt", prompt);
  }

  for (const constraint of params.constraints ?? []) {
    const next = constraint?.trim();
    if (!next) continue;
    searchParams.append("prefillConstraint", next);
  }

  const query = searchParams.toString();
  return query ? `/app?${query}` : "/app";
}
