import { hasAdviceHeading, numberAdviceItems } from "../../../lib/numberAdviceItems";
import { normalizeMarkdownTables } from "./markdownTableNormalize";

export { numberAdviceItems } from "../../../lib/numberAdviceItems";

/** 规整模型最终回复：表格转列表、建议段编号、多行「指标：值」转为小节与列表等。 */
export function polishFinalReply(rawText: string): string {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  if (/```/.test(text)) {
    return numberAdviceItems(text);
  }

  const normalizedText = normalizeMarkdownTables(text);
  // 建议类三段答不要走「指标：值」列表润色，否则会把 **小标题：** 拆成乱列表
  if (hasAdviceHeading(normalizedText)) {
    return numberAdviceItems(normalizedText);
  }
  if (/^#{1,6}\s/m.test(normalizedText) || /^\s*[-*]\s/m.test(normalizedText)) {
    return numberAdviceItems(normalizedText);
  }

  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return numberAdviceItems(text);
  }

  const metricLineCount = lines.filter(
    (line) => /^[^-].+[：:].+/.test(line) && !line.startsWith("注："),
  ).length;
  if (metricLineCount < 2) {
    return numberAdviceItems(lines.join("\n\n"));
  }

  const polished: string[] = [];
  const firstLine = lines[0];
  const firstLineLooksLikeMetric = /^[^-].+[：:].+/.test(firstLine);

  if (firstLineLooksLikeMetric) {
    polished.push("### 查询结果");
  } else {
    polished.push(`### ${firstLine}`);
  }
  polished.push("");

  for (let i = firstLineLooksLikeMetric ? 0 : 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("注：")) {
      polished.push("");
      polished.push(`> ${line}`);
      continue;
    }

    const metricMatch = line.match(/^([^：:]{1,60})[：:]\s*(.+)$/);
    if (metricMatch) {
      polished.push(`- **${metricMatch[1].trim()}**：${metricMatch[2].trim()}`);
    } else {
      polished.push(`- ${line}`);
    }
  }

  return numberAdviceItems(polished.join("\n").replace(/\n{3,}/g, "\n\n"));
}
