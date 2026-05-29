/**
 * generateDescription 流程专用：结构化打印错误，便于排查外部请求失败。
 * 不记录 token / password / secret / cookie。
 */

export function logDetailedError(
  modulePrefix: string,
  label: string,
  error: unknown,
): void {
  const lines: string[] = [`${modulePrefix} ${label}`];
  if (error instanceof Error) {
    lines.push(`error.message: ${error.message}`);
    lines.push(`error.stack: ${error.stack ?? "(no stack)"}`);
  } else {
    lines.push(`error: ${String(error)}`);
  }
  const maybeResponse = error as {
    response?: { data?: unknown; status?: number };
  };
  if (maybeResponse?.response != null) {
    lines.push(`response.status: ${String(maybeResponse.response.status ?? "")}`);
    try {
      lines.push(`response.data: ${JSON.stringify(maybeResponse.response.data)}`);
    } catch {
      lines.push("response.data: (unserializable)");
    }
  }
  console.error(lines.join("\n"));
}
