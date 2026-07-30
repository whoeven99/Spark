import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Image,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import {
  ExperimentOutlined,
  PictureOutlined,
  SendOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import {
  fetchOpenRouterModels,
  fetchOpenRouterStatus,
  postOpenRouterChat,
  postOpenRouterImages,
  type OpenRouterChatResult,
  type OpenRouterImageResult,
  type OpenRouterModelOption,
  type OpenRouterStatus,
} from "../api";

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

const PRESET_TEXT_MODELS = [
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

const PRESET_IMAGE_MODELS = [
  "bytedance-seed/seedream-4.5",
  "openai/gpt-5-image",
  "openai/gpt-5-image-mini",
  "google/gemini-2.5-flash-image",
  "black-forest-labs/flux.2-pro",
];

const LANG_OPTIONS = [
  { value: "en", label: "English (en)" },
  { value: "zh", label: "中文 (zh)" },
  { value: "zh-Hant", label: "繁體中文 (zh-Hant)" },
  { value: "ja", label: "日本語 (ja)" },
  { value: "ko", label: "한국어 (ko)" },
  { value: "fr", label: "Français (fr)" },
  { value: "de", label: "Deutsch (de)" },
  { value: "es", label: "Español (es)" },
  { value: "pt", label: "Português (pt)" },
  { value: "it", label: "Italiano (it)" },
  { value: "ar", label: "العربية (ar)" },
  { value: "th", label: "ไทย (th)" },
  { value: "vi", label: "Tiếng Việt (vi)" },
];

const OTHER_MODALITIES = [
  {
    key: "vision",
    title: "Vision（看图→文）",
    note: "OCR / 描述；走 chat + 图片输入",
  },
  {
    key: "video",
    title: "视频理解 / 视频生成",
    note: "chat 视频输入，或 /videos 异步生成",
  },
  {
    key: "audio",
    title: "音频 TTS / STT",
    note: "/audio/speech、/audio/transcriptions",
  },
  {
    key: "embeddings",
    title: "Embeddings",
    note: "向量检索 / RAG；/embeddings",
  },
  {
    key: "file",
    title: "PDF / 文件输入",
    note: "chat + file content part",
  },
] as const;

type ImageHistoryItem = {
  id: string;
  at: number;
  model: string;
  previewSrc: string | null;
  ok: boolean;
};

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

function buildTranslatePrompt(source: string, target: string): string {
  return `Translate all visible text in this image from ${source} to ${target}. Keep layout, style, colors, and non-text regions unchanged. Do not add new objects. Output only the translated image.`;
}

function toModelOptions(
  models: OpenRouterModelOption[],
  presets: string[],
): Array<{ value: string; label: ReactNode; search: string }> {
  const byId = new Map(models.map((m) => [m.id, m]));
  for (const id of presets) {
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
}

function resultImageSrc(
  image: { b64: string | null; url: string | null; mimeType: string | null } | undefined,
): string | null {
  if (!image) return null;
  if (image.url) return image.url;
  if (image.b64) {
    const mime = image.mimeType || "image/png";
    return `data:${mime};base64,${image.b64}`;
  }
  return null;
}

function StatusBlock({
  status,
  statusError,
}: {
  status: OpenRouterStatus | null;
  statusError: string | null;
}) {
  return (
    <>
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
                free_tier: <Tag>{String(status.key?.is_free_tier ?? "?")}</Tag>
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
    </>
  );
}

function OtherModalitiesReminder() {
  return (
    <Card
      size="small"
      title="其它 OpenRouter 模态（暂未接入探测）"
      extra={<Tag>后续可测</Tag>}
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        当前页仅覆盖文本 Chat 与出图（单步译图）。下列能力已在 OpenRouter 存在，提醒后续补探测：
      </Paragraph>
      <Space wrap size={[8, 8]}>
        {OTHER_MODALITIES.map((item) => (
          <Tag key={item.key} style={{ padding: "4px 10px", whiteSpace: "normal" }}>
            <Text strong>{item.title}</Text>
            <Text type="secondary"> — {item.note}</Text>
          </Tag>
        ))}
      </Space>
    </Card>
  );
}

export default function OpenRouterProbe() {
  const [activeTab, setActiveTab] = useState<"text" | "image">("text");
  const [status, setStatus] = useState<OpenRouterStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // --- text tab ---
  const [textModels, setTextModels] = useState<OpenRouterModelOption[]>([]);
  const [textModelsLoading, setTextModelsLoading] = useState(false);
  const [textModelsError, setTextModelsError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("用一句话介绍你自己。");
  const [system, setSystem] = useState("");
  const [textModel, setTextModel] = useState<string>("deepseek/deepseek-chat");
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [temperature, setTemperature] = useState<number>(0.2);
  const [textSending, setTextSending] = useState(false);
  const [textResult, setTextResult] = useState<OpenRouterChatResult | null>(null);

  // --- image tab ---
  const [imageModels, setImageModels] = useState<OpenRouterModelOption[]>([]);
  const [imageModelsLoading, setImageModelsLoading] = useState(false);
  const [imageModelsError, setImageModelsError] = useState<string | null>(null);
  const [imageModel, setImageModel] = useState<string>("bytedance-seed/seedream-4.5");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("zh");
  const [imagePrompt, setImagePrompt] = useState(buildTranslatePrompt("en", "zh"));
  const [promptTouched, setPromptTouched] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [sourceBase64, setSourceBase64] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<string>("image/png");
  const [sourceUrl, setSourceUrl] = useState("");
  const [resolution, setResolution] = useState<string | undefined>(undefined);
  const [outputFormat, setOutputFormat] = useState<string | undefined>("png");
  const [imageSending, setImageSending] = useState(false);
  const [imageResult, setImageResult] = useState<OpenRouterImageResult | null>(null);
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);

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
      setTextModelsLoading(true);
      setTextModelsError(null);
      try {
        const data = await fetchOpenRouterModels("text");
        if (cancelled) return;
        setTextModels(data.models);
        if (!data.models.some((m) => m.id === textModel) && data.models.length > 0) {
          const preferred =
            data.models.find((m) => m.id === "deepseek/deepseek-chat") ??
            data.models.find((m) => m.free) ??
            data.models[0];
          setTextModel(preferred.id);
        }
      } catch (e) {
        if (!cancelled) {
          setTextModelsError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setTextModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setImageModelsLoading(true);
      setImageModelsError(null);
      try {
        const data = await fetchOpenRouterModels("image");
        if (cancelled) return;
        setImageModels(data.models);
        if (!data.models.some((m) => m.id === imageModel) && data.models.length > 0) {
          const preferred =
            data.models.find((m) => m.id === "bytedance-seed/seedream-4.5") ??
            data.models.find((m) => m.free) ??
            data.models[0];
          setImageModel(preferred.id);
        }
      } catch (e) {
        if (!cancelled) {
          setImageModelsError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setImageModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (promptTouched) return;
    setImagePrompt(buildTranslatePrompt(sourceLang, targetLang));
  }, [sourceLang, targetLang, promptTouched]);

  const textModelOptions = useMemo(
    () => toModelOptions(textModels, PRESET_TEXT_MODELS),
    [textModels],
  );
  const imageModelOptions = useMemo(
    () => toModelOptions(imageModels, PRESET_IMAGE_MODELS),
    [imageModels],
  );

  const resultPreviewSrc = resultImageSrc(imageResult?.images?.[0]);
  const displaySourceSrc =
    sourcePreview ||
    (sourceUrl.trim() && /^https:\/\//i.test(sourceUrl.trim()) ? sourceUrl.trim() : null);

  async function onSendText() {
    if (!prompt.trim()) {
      message.warning("请先输入 prompt");
      return;
    }
    if (!textModel) {
      message.warning("请选择模型");
      return;
    }
    setTextSending(true);
    setTextResult(null);
    try {
      const data = await postOpenRouterChat({
        model: textModel,
        prompt,
        system: system.trim() || undefined,
        max_tokens: maxTokens,
        temperature,
      });
      setTextResult(data);
      if (data.ok) message.success("调用成功");
      else message.error(data.error?.message || "模型调用失败");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      message.error(msg);
      setTextResult({
        ok: false,
        httpStatus: 0,
        model: textModel,
        modelUsed: null,
        content: null,
        finish_reason: null,
        usage: null,
        error: { code: 0, message: msg, metadata: null },
      });
    } finally {
      setTextSending(false);
    }
  }

  const uploadProps: UploadProps = {
    accept: "image/*",
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      if (!file.type.startsWith("image/")) {
        message.error("请上传图片文件");
        return Upload.LIST_IGNORE;
      }
      if (file.size > 8 * 1024 * 1024) {
        message.error("图片不能超过 8MB");
        return Upload.LIST_IGNORE;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const comma = dataUrl.indexOf(",");
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
        setSourcePreview(dataUrl);
        setSourceBase64(b64);
        setSourceMime(file.type || "image/png");
        setSourceUrl("");
      };
      reader.onerror = () => message.error("读取图片失败");
      reader.readAsDataURL(file);
      return false;
    },
  };

  async function onSendImage() {
    if (!imageModel) {
      message.warning("请选择出图模型");
      return;
    }
    if (!imagePrompt.trim()) {
      message.warning("请先输入 prompt");
      return;
    }
    const url = sourceUrl.trim();
    const hasUpload = Boolean(sourceBase64);
    const hasUrl = Boolean(url);
    if (!hasUpload && !hasUrl) {
      message.warning("请上传原图，或粘贴 HTTPS 图片 URL");
      return;
    }
    if (hasUrl && !/^https:\/\//i.test(url) && !/^data:image\//i.test(url)) {
      message.warning("图片 URL 必须为 HTTPS 或 data:image/*");
      return;
    }

    setImageSending(true);
    setImageResult(null);
    try {
      const data = await postOpenRouterImages({
        model: imageModel,
        prompt: imagePrompt,
        ...(hasUpload
          ? { imageBase64: sourceBase64!, mimeType: sourceMime }
          : { imageUrl: url }),
        resolution: resolution || undefined,
        output_format: outputFormat || undefined,
      });
      setImageResult(data);
      const preview = resultImageSrc(data.images?.[0]);
      setImageHistory((prev) =>
        [
          {
            id: `${Date.now()}-${imageModel}`,
            at: Date.now(),
            model: data.modelUsed || imageModel,
            previewSrc: preview,
            ok: data.ok,
          },
          ...prev,
        ].slice(0, 5),
      );
      if (data.ok) message.success("译图调用成功（结果仅驻内存，不落库）");
      else message.error(data.error?.message || "译图调用失败");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      message.error(msg);
      setImageResult({
        ok: false,
        httpStatus: 0,
        model: imageModel,
        modelUsed: null,
        images: [],
        usage: null,
        error: { code: 0, message: msg, metadata: null },
      });
    } finally {
      setImageSending(false);
    }
  }

  const textTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
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
          <Card title="语言模型与参数" size="small">
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Text type="secondary">模型（仅 text）</Text>
                <Select
                  showSearch
                  style={{ width: "100%" }}
                  value={textModel}
                  loading={textModelsLoading}
                  options={textModelOptions}
                  onChange={setTextModel}
                  optionFilterProp="search"
                  filterOption={(input, option) =>
                    String(option?.search ?? "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  placeholder="选择或搜索语言模型 id"
                />
                {textModelsError ? (
                  <Alert
                    style={{ marginTop: 8 }}
                    type="warning"
                    showIcon
                    message="文本模型列表拉取失败，仍可选手填预设 id"
                    description={textModelsError}
                  />
                ) : (
                  <Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                    已加载 {textModels.length} 个文本模型（modalities=text）
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
                loading={textSending}
                onClick={onSendText}
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
        {textSending ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin tip="等待模型响应…" />
          </div>
        ) : textResult ? (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Space wrap>
              <Tag color={textResult.ok ? "success" : "error"}>
                {textResult.ok ? "成功" : "失败"}
              </Tag>
              <Tag>upstream HTTP {textResult.httpStatus}</Tag>
              <Tag>model {textResult.modelUsed || textResult.model}</Tag>
              {textResult.finish_reason ? (
                <Tag>finish {textResult.finish_reason}</Tag>
              ) : null}
            </Space>
            <Text type="secondary">usage: {formatUsage(textResult.usage)}</Text>
            {textResult.error ? (
              <Alert
                type="error"
                showIcon
                message={textResult.error.message}
                description={
                  textResult.error.metadata ? (
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(textResult.error.metadata, null, 2)}
                    </pre>
                  ) : undefined
                }
              />
            ) : null}
            <TextArea
              value={textResult.content ?? ""}
              readOnly
              rows={12}
              placeholder={textResult.ok ? "(模型未返回文本内容)" : "(无内容)"}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </Space>
        ) : (
          <Text type="secondary">发送后，模型回复会显示在这里。</Text>
        )}
      </Card>
    </Space>
  );

  const imageTab = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="warning"
        showIcon
        message="单步译图探测（不落库）"
        description="经 OpenRouter /images + input_references 一次生成。消耗额度；结果只在当前页面内存中预览，刷新即丢失。并非所有出图模型都擅长改图中文字。"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="原图与 Prompt" size="small">
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Text type="secondary">上传原图</Text>
                <div style={{ marginTop: 6 }}>
                  <Upload {...uploadProps}>
                    <Button icon={<UploadOutlined />}>选择图片（≤8MB）</Button>
                  </Upload>
                  {sourcePreview ? (
                    <Button
                      type="link"
                      danger
                      onClick={() => {
                        setSourcePreview(null);
                        setSourceBase64(null);
                      }}
                    >
                      清除上传
                    </Button>
                  ) : null}
                </div>
              </div>
              <div>
                <Text type="secondary">或 HTTPS 图片 URL</Text>
                <Input
                  value={sourceUrl}
                  onChange={(e) => {
                    setSourceUrl(e.target.value);
                    if (e.target.value.trim()) {
                      setSourcePreview(null);
                      setSourceBase64(null);
                    }
                  }}
                  placeholder="https://..."
                  allowClear
                />
              </div>
              <Row gutter={12}>
                <Col span={12}>
                  <Text type="secondary">源语言</Text>
                  <Select
                    style={{ width: "100%" }}
                    value={sourceLang}
                    options={LANG_OPTIONS}
                    onChange={setSourceLang}
                    showSearch
                    optionFilterProp="label"
                  />
                </Col>
                <Col span={12}>
                  <Text type="secondary">目标语言</Text>
                  <Select
                    style={{ width: "100%" }}
                    value={targetLang}
                    options={LANG_OPTIONS}
                    onChange={setTargetLang}
                    showSearch
                    optionFilterProp="label"
                  />
                </Col>
              </Row>
              <div>
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <Text type="secondary">Prompt</Text>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setPromptTouched(false);
                      setImagePrompt(buildTranslatePrompt(sourceLang, targetLang));
                    }}
                  >
                    重置为默认模板
                  </Button>
                </Space>
                <TextArea
                  value={imagePrompt}
                  onChange={(e) => {
                    setPromptTouched(true);
                    setImagePrompt(e.target.value);
                  }}
                  rows={6}
                  placeholder="译图指令"
                />
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="出图模型与参数" size="small">
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Text type="secondary">模型（仅 image）</Text>
                <Select
                  showSearch
                  style={{ width: "100%" }}
                  value={imageModel}
                  loading={imageModelsLoading}
                  options={imageModelOptions}
                  onChange={setImageModel}
                  optionFilterProp="search"
                  filterOption={(input, option) =>
                    String(option?.search ?? "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  placeholder="选择或搜索出图模型 id"
                />
                {imageModelsError ? (
                  <Alert
                    style={{ marginTop: 8 }}
                    type="warning"
                    showIcon
                    message="出图模型列表拉取失败，仍可选手填预设 id"
                    description={imageModelsError}
                  />
                ) : (
                  <Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                    已加载 {imageModels.length} 个出图模型（modalities=image）
                  </Text>
                )}
              </div>
              <Row gutter={12}>
                <Col span={12}>
                  <Text type="secondary">resolution</Text>
                  <Select
                    allowClear
                    style={{ width: "100%" }}
                    value={resolution}
                    onChange={setResolution}
                    options={[
                      { value: "512", label: "512" },
                      { value: "1K", label: "1K" },
                      { value: "2K", label: "2K" },
                      { value: "4K", label: "4K" },
                    ]}
                    placeholder="可选"
                  />
                </Col>
                <Col span={12}>
                  <Text type="secondary">output_format</Text>
                  <Select
                    allowClear
                    style={{ width: "100%" }}
                    value={outputFormat}
                    onChange={setOutputFormat}
                    options={[
                      { value: "png", label: "png" },
                      { value: "jpeg", label: "jpeg" },
                      { value: "webp", label: "webp" },
                    ]}
                    placeholder="可选"
                  />
                </Col>
              </Row>
              <Button
                type="primary"
                icon={<PictureOutlined />}
                loading={imageSending}
                onClick={onSendImage}
                block
                disabled={status != null && !status.configured}
              >
                生成译图
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="预览（原图 / 结果）" size="small">
        {imageSending ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin tip="等待出图模型响应（可能较久）…" />
          </div>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            {imageResult ? (
              <>
                <Space wrap>
                  <Tag color={imageResult.ok ? "success" : "error"}>
                    {imageResult.ok ? "成功" : "失败"}
                  </Tag>
                  <Tag>upstream HTTP {imageResult.httpStatus}</Tag>
                  <Tag>model {imageResult.modelUsed || imageResult.model}</Tag>
                </Space>
                <Text type="secondary">usage: {formatUsage(imageResult.usage)}</Text>
                {imageResult.error ? (
                  <Alert
                    type="error"
                    showIcon
                    message={imageResult.error.message}
                    description={
                      imageResult.error.metadata ? (
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(imageResult.error.metadata, null, 2)}
                        </pre>
                      ) : undefined
                    }
                  />
                ) : null}
              </>
            ) : (
              <Text type="secondary">生成后在右侧显示结果图；点击图片可放大。</Text>
            )}
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Text type="secondary">原图</Text>
                <div
                  style={{
                    marginTop: 8,
                    minHeight: 200,
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                    borderRadius: 8,
                    padding: 8,
                    textAlign: "center",
                  }}
                >
                  {displaySourceSrc ? (
                    <Image
                      src={displaySourceSrc}
                      alt="source"
                      style={{ maxHeight: 360, objectFit: "contain" }}
                    />
                  ) : (
                    <Text type="secondary">尚未选择原图</Text>
                  )}
                </div>
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary">结果</Text>
                <div
                  style={{
                    marginTop: 8,
                    minHeight: 200,
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                    borderRadius: 8,
                    padding: 8,
                    textAlign: "center",
                  }}
                >
                  {resultPreviewSrc ? (
                    <Image
                      src={resultPreviewSrc}
                      alt="translated"
                      style={{ maxHeight: 360, objectFit: "contain" }}
                    />
                  ) : (
                    <Text type="secondary">尚无结果</Text>
                  )}
                </div>
              </Col>
            </Row>
          </Space>
        )}
      </Card>

      {imageHistory.length > 0 ? (
        <Card title="本次会话最近结果（最多 5 条，刷新清空）" size="small">
          <Row gutter={[12, 12]}>
            {imageHistory.map((item) => (
              <Col key={item.id} xs={12} sm={8} md={6} lg={4}>
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <Tag color={item.ok ? "success" : "error"} style={{ marginInlineEnd: 0 }}>
                    {item.model}
                  </Tag>
                  {item.previewSrc ? (
                    <Image
                      src={item.previewSrc}
                      alt={item.model}
                      style={{ width: "100%", maxHeight: 120, objectFit: "contain" }}
                    />
                  ) : (
                    <Text type="secondary">无图</Text>
                  )}
                </Space>
              </Col>
            ))}
          </Row>
        </Card>
      ) : null}
    </Space>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} />
          OpenRouter 模型探测
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          由 Admin 服务端转发到 OpenRouter（出口 IP = Admin 服务器）。文本 Tab 只列语言模型，图片
          Tab 只列出图模型。Key 不会下发到浏览器；图片结果不落库。
        </Paragraph>
      </div>

      <StatusBlock status={status} statusError={statusError} />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key === "image" ? "image" : "text")}
        items={[
          { key: "text", label: "文本 Chat", children: textTab },
          { key: "image", label: "图片翻译", children: imageTab },
        ]}
      />

      <OtherModalitiesReminder />
    </Space>
  );
}
