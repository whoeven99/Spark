/** 解析 Markdown 表格行（去除首尾 `|` 后按列拆分）。 */
export function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** 是否为 GitHub 风格表格分隔行（`| --- | --- |`）。 */
export function isMarkdownTableSeparator(line: string): boolean {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!normalized) return false;
  return normalized
    .split("|")
    .map((part) => part.trim())
    .every((part) => /^:?-{3,}:?$/.test(part));
}

/**
 * 将 Markdown 表格转为粗体列表项（首列作条目名，其余列拼成「字段：值」）。
 * 非表格段落原样保留。
 */
export function normalizeMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    const maybeTable = current.includes("|") && isMarkdownTableSeparator(next);
    if (!maybeTable) {
      out.push(current);
      i += 1;
      continue;
    }

    const headers = splitTableRow(current);
    i += 2;
    const rows: string[][] = [];
    while (i < lines.length && (lines[i] ?? "").includes("|")) {
      const row = splitTableRow(lines[i] ?? "");
      if (row.some(Boolean)) {
        rows.push(row);
      }
      i += 1;
    }

    if (!rows.length) {
      out.push(current, next);
      continue;
    }

    for (const row of rows) {
      const first = row[0] || "项目";
      const details = row
        .slice(1)
        .map((value, idx) => `${headers[idx + 1] || `字段${idx + 2}`}：${value || "-"}`)
        .join("；");
      out.push(`- **${first}**：${details || "-"}`);
    }
  }

  return out.join("\n");
}
