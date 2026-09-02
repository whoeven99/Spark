/** CSV 序列化工具（浏览器与服务端共用，无 IO）。 */

/** 含逗号、引号或换行的单元格必须加引号，内部引号翻倍。 */
export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(headers: readonly string[], rows: string[][]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }
  return `${lines.join("\n")}\n`;
}
