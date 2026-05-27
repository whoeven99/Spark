import { useState, useRef, useEffect } from "react";
import {
  Card,
  Button,
  Input,
  Typography,
  Alert,
  Space,
  Tag,
  Divider,
  Form,
} from "antd";
import {
  RocketOutlined,
  LoadingOutlined,
  FileTextOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { getToken } from "../api";

const { TextArea } = Input;
const { Text, Link } = Typography;

type LogEntry = {
  id: number;
  type: "log" | "tool_call" | "file_queued" | "committing" | "done" | "error";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  path?: string;
  fileCount?: number;
  prUrl?: string;
  branch?: string;
  prNumber?: number;
  message?: string;
};

let logIdCounter = 0;

export default function CodeAgent() {
  const [prompt, setPrompt] = useState("");
  const [baseBranch, setBaseBranch] = useState("master");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function addLog(entry: Omit<LogEntry, "id">) {
    setLogs((prev) => [...prev, { ...entry, id: ++logIdCounter }]);
  }

  async function run() {
    if (!prompt.trim()) return;
    setRunning(true);
    setLogs([]);
    setPrUrl(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/code-agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ prompt, baseBranch: baseBranch.trim() || "master" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? `HTTP ${res.status}`);
        setRunning(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line) as LogEntry;
            addLog(event);
            if (event.type === "done" && event.prUrl) {
              setPrUrl(event.prUrl);
            }
            if (event.type === "error") {
              setErrorMsg(event.message ?? "Unknown error");
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }

    setRunning(false);
  }

  function renderLog(entry: LogEntry) {
    switch (entry.type) {
      case "tool_call":
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            <ToolOutlined style={{ color: "#1677ff", marginTop: 2, flexShrink: 0 }} />
            <span>
              <Tag color="blue" style={{ fontSize: 12 }}>{entry.name}</Tag>
              {entry.input && (
                <Text type="secondary" style={{ fontSize: 12, fontFamily: "monospace" }}>
                  {JSON.stringify(entry.input).slice(0, 120)}
                </Text>
              )}
            </span>
          </div>
        );
      case "file_queued":
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <FileTextOutlined style={{ color: "#52c41a", flexShrink: 0 }} />
            <Text style={{ fontSize: 12 }}>
              <Tag color="green" style={{ fontSize: 12 }}>写入</Tag>
              <Text code style={{ fontSize: 12 }}>{entry.path}</Text>
            </Text>
          </div>
        );
      case "committing":
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <LoadingOutlined style={{ color: "#fa8c16" }} />
            <Text style={{ fontSize: 12, color: "#fa8c16" }}>
              提交 {entry.fileCount} 个文件到 GitHub...
            </Text>
          </div>
        );
      case "done":
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Text style={{ fontSize: 12, color: "#52c41a" }}>
              PR #{entry.prNumber} 已创建 — 分支: <Text code style={{ fontSize: 12 }}>{entry.branch}</Text>
            </Text>
          </div>
        );
      case "error":
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />
            <Text style={{ fontSize: 12, color: "#ff4d4f" }}>{entry.message}</Text>
          </div>
        );
      default:
        return (
          <div key={entry.id} style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {entry.text}
            </Text>
          </div>
        );
    }
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      <Card title={<span><RocketOutlined /> AI Code Agent</span>}>
        <Form layout="vertical" onFinish={run}>
          <Form.Item label="任务描述" style={{ marginBottom: 12 }}>
            <TextArea
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="用自然语言描述你想要做的代码改动，例如：在 admin/src/pages/Dashboard.tsx 顶部添加一个提示 banner，显示当前有多少活跃商店..."
              disabled={running}
            />
          </Form.Item>
          <Form.Item label="目标分支（可选）" style={{ marginBottom: 16 }}>
            <Input
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="master"
              style={{ width: 200 }}
              disabled={running}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={running ? <LoadingOutlined /> : <RocketOutlined />}
            loading={running}
            disabled={!prompt.trim() || running}
          >
            {running ? "Agent 运行中..." : "运行 Agent"}
          </Button>
        </Form>
      </Card>

      {(logs.length > 0 || running) && (
        <Card
          title="运行日志"
          size="small"
          bodyStyle={{ padding: "12px 16px" }}
        >
          <div
            style={{
              maxHeight: 420,
              overflowY: "auto",
              background: "#fafafa",
              border: "1px solid #f0f0f0",
              borderRadius: 6,
              padding: "12px 16px",
            }}
          >
            {logs.map(renderLog)}
            {running && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <LoadingOutlined style={{ color: "#1677ff" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>思考中...</Text>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}

      {prUrl && (
        <>
          <Divider style={{ margin: "0" }} />
          <Alert
            type="success"
            icon={<CheckCircleOutlined />}
            showIcon
            message="Pull Request 已创建"
            description={
              <Link href={prUrl} target="_blank">
                {prUrl}
              </Link>
            }
          />
        </>
      )}

      {errorMsg && !running && (
        <Alert
          type="error"
          showIcon
          message="出错了"
          description={errorMsg}
        />
      )}
    </Space>
  );
}
