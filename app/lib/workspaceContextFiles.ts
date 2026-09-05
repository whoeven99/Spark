/** 从 augment 后的用户消息（含 [工作台上下文] / 附加文件上下文）解析已挂上的文件。 */

export type WorkspaceContextFile = {
  id: string;
  name: string;
};

const WORKSPACE_FILE_LINE_RE =
  /^\s*•\s+(.+?)\s+\[文件ID:\s*([^\]]+)\]\s*$/;
const ATTACHED_FILE_HEADER_RE = /^===\s*文件：(.+?)\s*===\s*$/;
const ATTACHED_FILE_ID_RE = /^文件 ID[：:]\s*(\S+)\s*$/;

function stripFileDecorations(name: string): string {
  return name
    .replace(/（[^）]*）/g, "")
    .replace(/，已解析\s*\d+k\s*字符/g, "")
    .trim();
}

/** 只收已落库的服务端 ID；上传中的本地临时 id（file-时间戳）不算。 */
export function isWorkspaceFileId(id: string): boolean {
  const trimmed = id.trim();
  return Boolean(trimmed) && !trimmed.startsWith("file-");
}

export function parseWorkspaceFilesFromText(text: string): WorkspaceContextFile[] {
  const files: WorkspaceContextFile[] = [];
  const seen = new Set<string>();
  let pendingName: string | null = null;

  const push = (id: string, name: string) => {
    if (!isWorkspaceFileId(id) || seen.has(id)) return;
    seen.add(id);
    files.push({ id, name: name.trim() || id });
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const workspaceMatch = line.match(WORKSPACE_FILE_LINE_RE);
    if (workspaceMatch) {
      push(workspaceMatch[2].trim(), stripFileDecorations(workspaceMatch[1]));
      pendingName = null;
      continue;
    }
    const headerMatch = line.trim().match(ATTACHED_FILE_HEADER_RE);
    if (headerMatch) {
      pendingName = headerMatch[1].trim();
      continue;
    }
    const idMatch = line.trim().match(ATTACHED_FILE_ID_RE);
    if (idMatch && pendingName) {
      push(idMatch[1].trim(), pendingName);
      pendingName = null;
    }
  }

  return files;
}

export function withWorkspaceFileFallback<T extends { fileId?: string; fileName?: string }>(
  payload: T,
  lastUserText: string,
): T {
  if (payload.fileId?.trim()) return payload;
  const file = parseWorkspaceFilesFromText(lastUserText)[0];
  if (!file) return payload;
  return {
    ...payload,
    fileId: file.id,
    fileName: payload.fileName?.trim() ? payload.fileName : file.name,
  };
}
