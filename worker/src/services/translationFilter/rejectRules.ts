/** Aligns with Spring RejectRuleEnum */

type RejectRule = { pattern: RegExp; reason: string };

const REJECT_RULES: RejectRule[] = [
  { pattern: /^=+.*/, reason: "以 += 开头" },
  { pattern: /^[\d\p{P}]+$/u, reason: "纯数字或标点" },
  { pattern: /^[A-Za-z0-9]{15}$/, reason: "15位字母数字ID" },
  {
    pattern: /^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/,
    reason: "UUID",
  },
  { pattern: /^GA\d+(\.\d+)+$/, reason: "GA 标识" },
  { pattern: /^_(gid|gat)$/, reason: "GA key" },
  { pattern: /^[A-Za-z0-9+/]{40,}={0,2}$/, reason: "Base64 数据" },
  { pattern: /^[a-fA-F0-9]{64}$/, reason: "64位十六进制 Hash" },
  { pattern: /^[a-fA-F0-9]{32}$/, reason: "32位十六进制 Hash" },
  {
    pattern: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    reason: "JWT Token",
  },
  {
    pattern:
      /\+\d{1,3}(?:\s?(?:\(\d+\)|\d+))?\s?\d[\d\s-]{3,13}\d|\+86\s?1\d{10}|00\d{1,3}\s?1\d{10}|\+\d{8,15}/,
    reason: "电话号码",
  },
  {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    reason: "邮箱",
  },
  { pattern: /^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$/, reason: "大小写 + 数字 + 多段 -" },
  { pattern: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, reason: "日期" },
];

export function matchesRejectRule(value: string): boolean {
  return REJECT_RULES.some((r) => r.pattern.test(value));
}
