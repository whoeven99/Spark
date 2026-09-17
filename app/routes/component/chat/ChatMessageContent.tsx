import { createElement, type CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./ChatMessageContent.module.css";

type ChatMessageContentProps = {
  content: string;
};

/**
 * 嵌入式环境里的全局 reset 会把 h1–h6 打回 inherit、把 ol/ul 的 list-style 与 padding 清零。
 * 模块样式一旦没命中，商家看到的就是「建议不带序号、小标题和正文一样大」。
 * 字号、标题层级、列表序号是回复能不能读懂的底线，用内联样式兜住；
 * 其余（代码块、表格、引用、链接配色）仍留在 CSS Module 里。
 */
const rootStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
};

const orderedListStyle: CSSProperties = {
  listStyleType: "decimal",
  paddingLeft: "1.35em",
};

const unorderedListStyle: CSSProperties = {
  listStyleType: "disc",
  paddingLeft: "1.35em",
};

function headingStyle(fontSize: string): CSSProperties {
  return { fontSize, fontWeight: 700, lineHeight: 1.35 };
}

// react-markdown 会额外塞一个 node 进来，透传给 DOM 会触发 React 未知属性告警。
type MarkdownTagProps = { node?: unknown };

function withoutNode(props: MarkdownTagProps): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...props };
  delete rest.node;
  return rest;
}

function styledTag(tag: "ol" | "ul" | "h1" | "h2" | "h3" | "h4", style: CSSProperties) {
  return function StyledMarkdownTag(props: MarkdownTagProps) {
    return createElement(tag, { ...withoutNode(props), style });
  };
}

function ExternalLink(props: MarkdownTagProps) {
  return createElement("a", {
    ...withoutNode(props),
    target: "_blank",
    rel: "noopener noreferrer",
  });
}

const markdownComponents: Components = {
  a: ExternalLink,
  ol: styledTag("ol", orderedListStyle),
  ul: styledTag("ul", unorderedListStyle),
  h1: styledTag("h1", headingStyle("1.25em")),
  h2: styledTag("h2", headingStyle("1.125em")),
  h3: styledTag("h3", headingStyle("1.0625em")),
  h4: styledTag("h4", headingStyle("1.0625em")),
};

export function ChatMessageContent({ content }: ChatMessageContentProps) {
  return (
    <div className={styles.root} style={rootStyle}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
