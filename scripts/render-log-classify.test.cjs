const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyLog,
  buildDigest,
  formatDigestMarkdown,
} = require("./render-log-classify.cjs");
const { getBeijingYesterdayWindow } = require("./beijing-digest-window.cjs");

describe("classifyLog", () => {
  it("classifies chat agent errors", () => {
    assert.equal(
      classifyLog({ message: "Chat agent error: DEEPSEEK_API_KEY", level: "error" }),
      "chat_agent",
    );
  });

  it("classifies http 5xx request logs", () => {
    assert.equal(
      classifyLog({ type: "request", statusCode: 503, message: "GET /chat" }),
      "http_5xx",
    );
  });

  it("returns null for benign info logs", () => {
    assert.equal(
      classifyLog({ message: "Server listening on port 10000", level: "info" }),
      null,
    );
  });
});

describe("getBeijingYesterdayWindow", () => {
  it("uses yesterday 00:00–24:00 Asia/Shanghai", () => {
    const ref = new Date("2026-05-19T00:30:00.000Z");
    const w = getBeijingYesterdayWindow(ref);
    assert.equal(w.reportDate, "2026-05-18");
    assert.equal(w.windowLabel, "2026-05-18 北京时间 00:00–24:00");
    assert.equal(w.start.toISOString(), "2026-05-17T16:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-05-18T16:00:00.000Z");
  });
});

describe("buildDigest", () => {
  it("aggregates categories", () => {
    const digest = buildDigest(
      [
        { message: "Chat agent error: boom", level: "error", timestamp: "2026-05-18T10:00:00Z" },
        { message: "Chat agent error: boom again", level: "error", timestamp: "2026-05-18T11:00:00Z" },
        { message: "GET /health", level: "info" },
      ],
      { serviceId: "srv-test", windowLabel: "2026-05-17 ~ 2026-05-18 UTC" },
    );
    assert.equal(digest.hasIssues, true);
    assert.equal(digest.categories[0].id, "chat_agent");
    assert.equal(digest.categories[0].count, 2);
    assert.match(formatDigestMarkdown(digest), /AI 聊天 Agent/);
  });
});
