import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import { ExperimentOutlined, SendOutlined } from "@ant-design/icons";
import {
  fetchOpenRouterModels,
  fetchOpenRouterStatus,
  postOpenRouterChat,
  type OpenRouterChatResult,
  type OpenRouterModelOption,
  type OpenRouterStatus,
} from "../api";

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

const PRESET_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
  "anthropic/claude-3.5-haiku",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-r1",
  "qwen/qwen-2.5-7b-instruct",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-small-3.1-24b-instruct",
  "openai/gpt-oss-20b:free",
];

function formatUsage(usage: Record<string, unknown> | null | undefined): string {
  if (!usage) return "—";
  const prompt = usage.prompt_tokens ?? "—";
  const completion = usage.completion_tokens ?? "—";
  const total = usage.total_tokens ?? "—";
  const cost = usage.cost;
  const costText =
    typeof cost === "number" ? ` · cost $${cost}` : cost != null ? ` · cost ${String(cost)}` : "";
  return `prompt ${prompt} / completion ${completion} / total ${total}${costText}`;
}

export default function OpenRouterProbe() {
  const [status, setStatus] = useState<OpenRouterStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [models, setModels] = useState<OpenRouterModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("用一句话介绍你自己。");
  const [system, setSystem] = useState("");
  const [model, setModel] = useState<string>("deepseek/deepseek-chat");
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [temperature, setTemperature] = useState<number>(0.2);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<OpenRouterChatResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchOpenRouterStatus();
        if (!cancelled) {
          setStatus(s);
          setStatusError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus(null);
          setStatusError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const data = await fetchOpenRouterModels("text");
        if (cancelled) return;
        setModels(data.models);
        if (!data.models.some((m) => m.id === model) && data.models.length > 0) {
          const preferred =
            data.models.find((m) => m.id === "deepseek/deepseek-chat") ??
            data.models.find((m) => m.free) ??
            data.models[0];
          setModel(preferred.id);
        }
      } catch (e) {
        if (!cancelled) {
          setModelsError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modelOptions = useMemo(() => {
    const byId = new Map(models.map((m) => [m.id, m]));
    for (const id of PRESET_MODELS) {
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name: id,
          context_length: null,
          pricing: null,
          free: id.endsWith(":free"),
          provider: id.split("/")[0] || "unknown",
        });
      }
    }
    return [...byId.values()]
      .sort((a, b) => {
        if (a.free !== b.free) return a.free ? -1 : 1;
        return a.id.localeCompare(b.id);
      })
      .map((m) => ({
        value: m.id,
        label: (
          <span>
            {m.id}
            {m.free ? (
              <Tag color="green" style={{ marginLeft: 8 }}>
                free
              </Tag>
            ) : null}
          </span>
        ),
        search: `${m.id} ${m.name} ${m.provider}`,
      }));
  }, [models]);

  async function onSend() {
    if (!prompt.trim()) {
      message.warning("请先输入 prompt");
      return;
    }
    if (!model) {
      message.warning("请选择模型");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const data = await postOpenRouterChat({
        model,
        prompt,
        system: system.trim() || undefined,
        max_tokens: maxTokens,
        temperature,
      });
      setResult(data);
      if (data.ok) {
        message.success("调用成功");
      } else {
        message.error(data.error?.message || "模型调用失败");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      message.error(msg);
      setResult({
        ok: false,
        httpStatus: 0,
        model,
        modelUsed: null,
        content: null,
        finish_reason: null,
        usage: null,
        error: { code: 0, message: msg, metadata: null },
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} />
          OpenRouter 模型探测
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          由 Admin 服务端转发到 OpenRouter（出口 IP = Admin 服务器）。适合验证海外机器能否打通
          GPT / Gemini 等地区受限模型。Key 不会下发到浏览器。
        </Paragraph>
      </div>

      {statusError ? (
        <Alert type="error" showIcon message="状态探测失败" description={statusError} />
      ) : null}
      {status && !status.configured ? (
        <Alert
          type="warning"
          showIcon
          message="未配置 OPENROUTER_API_KEY"
          description={status.error}
        />
      ) : null}
      {status?.configured ? (
        <Alert
          type="info"
          showIcon
          message="OpenRouter 已配置"
          description={
            <Space wrap size={[8, 8]}>
              <Text>
                free_tier:{" "}
                <Tag>{String(status.key?.is_free_tier ?? "?")}</Tag>
              </Text>
              <Text>
                credits:{" "}
                {status.credits
                  ? `${String(status.credits.total_credits ?? "?")} (used ${String(status.credits.total_usage ?? "?")})`
                  : "—"}
              </Text>
              <Text>
                key usage: {String(status.key?.usage ?? "—")} / daily{" "}
                {String(status.key?.usage_daily ?? "—")}
              </Text>
              <Text type="secondary">{status.note}</Text>
            </Space>
          }
        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="输入" size="small">
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Text type="secondary">System（可选）</Text>
                <TextArea
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  rows={2}
                  placeholder="可选系统提示"
                />
              </div>
              <div>
                <Text type="secondary">Prompt</Text>
                <TextArea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={10}
                  placeholder="输入要发给模型的内容"
                />
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="模型与参数" size="small">
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Text type="secondary">模型</Text>
                <Select
                  showSearch
                  style={{ width: "100%" }}
                  value={model}
                  loading={modelsLoading}
                  options={modelOptions}
                  onChange={setModel}
                  optionFilterProp="search"
                  filterOption={(input, option) =>
                    String(option?.search ?? "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  placeholder="选择或搜索模型 id"
                />
                {modelsError ? (
                  <Alert
                    style={{ marginTop: 8 }}
                    type="warning"
                    showIcon
                    message="模型列表拉取失败，仍可手填预设 id"
                    description={modelsError}
                  />
                ) : (
                  <Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                    已加载 {models.length} 个文本模型
                  </Text>
                )}
              </div>
              <Row gutter={12}>
                <Col span={12}>
                  <Text type="secondary">max_tokens</Text>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={1}
                    max={8192}
                    value={maxTokens}
                    onChange={(v) => setMaxTokens(typeof v === "number" ? v : 1024)}
                  />
                </Col>
                <Col span={12}>
                  <Text type="secondary">temperature</Text>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(v) => setTemperature(typeof v === "number" ? v : 0.2)}
                  />
                </Col>
              </Row>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={sending}
                onClick={onSend}
                block
                disabled={status != null && !status.configured}
              >
                发送到 OpenRouter
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="AI 回复" size="small">
        {sending ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin tip="等待模型响应…" />
          </div>
        ) : result ? (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Space wrap>
              <Tag color={result.ok ? "success" : "error"}>
                {result.ok ? "成功" : "失败"}
              </Tag>
              <Tag>upstream HTTP {result.httpStatus}</Tag>
              <Tag>model {result.modelUsed || result.model}</Tag>
              {result.finish_reason ? <Tag>finish {result.finish_reason}</Tag> : null}
            </Space>
            <Text type="secondary">usage: {formatUsage(result.usage)}</Text>
            {result.error ? (
              <Alert
                type="error"
                showIcon
                message={result.error.message}
                description={
                  result.error.metadata ? (
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(result.error.metadata, null, 2)}
                    </pre>
                  ) : undefined
                }
              />
            ) : null}
            <TextArea
              value={result.content ?? ""}
              readOnly
              rows={12}
              placeholder={result.ok ? "(模型未返回文本内容)" : "(无内容)"}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </Space>
        ) : (
          <Text type="secondary">发送后，模型回复会显示在这里。</Text>
        )}
      </Card>
    </Space>
  );
}
