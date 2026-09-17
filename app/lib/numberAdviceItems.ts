/**
 * 「建议」小标题。模型实际会写成 `### 建议`、`**建议**`、`### **建议**`、`建议：`、
 * `建议（按优先级）` 等多种形态，识别漏一种整段就不编号，所以这里把前后缀都放宽。
 */
const ADVICE_HEADING_RE =
  /^#{0,6}\s*\*{0,2}\s*建议\s*(?:[（(][^）)]{0,24}[）)])?\s*[：:]?\s*\*{0,2}\s*[：:]?$/;
const ALREADY_LIST_RE = /^(?:\d+\.\s+|[-*]\s+)/;
/** 模型常用「**先清目录，再谈优化：**」当建议小标题，而不是 1. 2. 3. */
const BOLD_ADVICE_TITLE_RE = /^\*{1,2}([^*（(]{1,40}?)[：:]\*{0,2}$/;
const CLOSING_ASK_RE =
  /^(?:你想从|想从哪|你可以|Which step|Where (?:would|do) you|Pick (?:one|a direction))/i;

/** 供 polishFinalReply 判断是否走建议分支，避免两处各写一份会漂移的标题正则。 */
export function hasAdviceHeading(text: string): boolean {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .some((line) => ADVICE_HEADING_RE.test(line.trim()));
}

function flushAdviceItem(
  pending: string[],
  index: number,
): { line: string; nextIndex: number } | { closing: string } | null {
  if (pending.length === 0) return null;
  const lines = [...pending];
  pending.length = 0;
  const first = lines[0]?.trim() ?? "";
  if (!first) return null;
  if (CLOSING_ASK_RE.test(first)) {
    return { closing: lines.join("\n") };
  }
  if (ALREADY_LIST_RE.test(first)) {
    return { line: lines.join("\n"), nextIndex: index };
  }

  const nextIndex = index + 1;
  const titleMatch = first.match(BOLD_ADVICE_TITLE_RE);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    const body = lines
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    return {
      line: body ? `${nextIndex}. **${title}：** ${body}` : `${nextIndex}. **${title}：**`,
      nextIndex,
    };
  }

  const para = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  return { line: `${nextIndex}. ${para}`, nextIndex };
}

/**
 * 把「建议」段落下未编号的段落收成「1. 2. 3.」。
 * 兼容普通段落，也兼容「**小标题：** + 正文」这种模型常写格式。
 * 前后端共用：服务端落库前跑一遍，客户端交接时再兜底。
 */
export function numberAdviceItems(rawText: string): string {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inAdvice = false;
  let index = 0;
  const pending: string[] = [];

  const flushPending = () => {
    const result = flushAdviceItem(pending, index);
    if (!result) return;
    if ("closing" in result) {
      inAdvice = false;
      out.push(result.closing);
      return;
    }
    index = result.nextIndex;
    out.push(result.line);
    out.push("");
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (ADVICE_HEADING_RE.test(trimmed)) {
      flushPending();
      inAdvice = true;
      index = 0;
      out.push("### 建议");
      out.push("");
      continue;
    }

    if (inAdvice && /^#{1,6}\s+\S/.test(trimmed)) {
      flushPending();
      inAdvice = false;
      out.push(raw);
      continue;
    }

    if (!inAdvice) {
      out.push(raw);
      continue;
    }

    if (!trimmed) {
      if (pending.length > 1) {
        flushPending();
      } else if (pending.length === 1 && !BOLD_ADVICE_TITLE_RE.test(pending[0].trim())) {
        flushPending();
      }
      continue;
    }

    if (ALREADY_LIST_RE.test(trimmed)) {
      flushPending();
      out.push(trimmed);
      out.push("");
      continue;
    }

    if (CLOSING_ASK_RE.test(trimmed)) {
      flushPending();
      inAdvice = false;
      out.push(trimmed);
      continue;
    }

    if (BOLD_ADVICE_TITLE_RE.test(trimmed)) {
      flushPending();
      pending.push(trimmed);
      continue;
    }

    pending.push(trimmed);
  }

  flushPending();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
