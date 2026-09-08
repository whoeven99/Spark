import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Segmented,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { CopyOutlined, DownloadOutlined, PictureOutlined } from "@ant-design/icons";
import {
  fetchXhsPromoStatus,
  generateXhsPromo,
  type XhsPromoCopyProvider,
  type XhsPromoDirection,
  type XhsPromoGenerateResult,
  type XhsPromoStatus,
} from "../api";

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const DIRECTION_OPTIONS: Array<{ label: string; value: XhsPromoDirection }> = [
  { label: "功能", value: "howto" },
  { label: "对比", value: "compare" },
  { label: "数据", value: "data" },
];

type TopicPreset = {
  direction: XhsPromoDirection;
  topic: string;
  notes: string;
};

const TOPIC_PRESETS: TopicPreset[] = [
  {
    direction: "howto",
    topic: "早上先看异常，别先翻报表",
    notes: "功能：经营诊断\n只读，不改店铺\n对比近 7 天均值，只列最多 5 个异常",
  },
  {
    direction: "howto",
    topic: "商品页哪里差，一句话看完",
    notes: "功能：商品质量评分 / 商品诊断\n看标题、主图、描述缺什么\n先出问题清单，再决定改哪几项",
  },
  {
    direction: "howto",
    topic: "主图翻译成英语，不用重做设计",
    notes: "功能：图片翻译\n保留原版式，只换文案语言\n适合跨境店出英语 / 多语种主图",
  },
  {
    direction: "howto",
    topic: "50 个 SKU 调价，先看试算再写回",
    notes: "功能：批量调价\n先试算、待审核，确认后才写回 Shopify\nAgent 回合内不改价格",
  },
  {
    direction: "compare",
    topic: "Sidekick 能问，Spark 能改完再给你看",
    notes: "对比：Shopify Sidekick vs Spark\nSidekick：能问店里的事\nSpark：能看店、改文案/图、批量改，审核后再写回",
  },
  {
    direction: "compare",
    topic: "别把 ChatGPT 当运营",
    notes: "对比：ChatGPT 复制粘贴 vs Spark\nChatGPT 看不到店铺数据，也写不回商品\nSpark 嵌在 Shopify 后台，问完能开任务",
  },
  {
    direction: "compare",
    topic: "Claude Code 会写代码，店主要的是改商品页",
    notes: "对比：Claude Code / Codex vs Spark\n前者给开发写代码\n店主要的是诊断、改文案、译主图、批量调价",
  },
  {
    direction: "compare",
    topic: "外包美工等三天 vs 主图翻译当晚出",
    notes: "对比：等外包 vs 图片翻译\n外包：改字、排期、对稿\nSpark：保留版式，当晚出多语种主图",
  },
  {
    direction: "data",
    topic: "用了之后，改商品页不用通宵",
    notes: "数据向：先讲省下的时间，不要编百分比\n场景：商品诊断 + 文案优化 + 审核写回\n有真实工时再补数字",
  },
  {
    direction: "data",
    topic: "某店 14 天，转化率从 x% 到 y%",
    notes: "必须填真实前后数字，禁止模型编造\n口径：接入前 14 天 vs 接入后 14 天\n动作：先改标题和主图，其它先不动",
  },
  {
    direction: "data",
    topic: "图片翻译，一晚出齐 3 个语种主图",
    notes: "数据向：用件数/语种，不编转化率\n场景：图片翻译\n补充具体 SKU 数或语种再生成",
  },
  {
    direction: "data",
    topic: "改商品页不用通宵",
    notes: "备选数据向：没有转化率就先用这个\n讲流程变短，不承诺百分比",
  },
];

const FIRST_PRESET = TOPIC_PRESETS[0];

function imageSrc(image: { mimeType: string; base64: string } | null | undefined): string {
  if (!image?.base64) return "";
  return `data:${image.mimeType};base64,${image.base64}`;
}

function downloadHref(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

function modelLabel(raw: string | null | undefined): string {
  if (!raw) return "未配置";
  return raw;
}

function copyProviderLabel(provider: XhsPromoCopyProvider): string {
  switch (provider) {
    case "volc-ark":
      return "豆包";
    case "deepseek":
      return "DeepSeek";
    case "openai":
      return "GPT";
    default: {
      const _never: never = provider;
      return _never;
    }
  }
}

export default function XhsPromo() {
  const [direction, setDirection] = useState<XhsPromoDirection>(FIRST_PRESET.direction);
  const [topic, setTopic] = useState(FIRST_PRESET.topic);
  const [notes, setNotes] = useState(FIRST_PRESET.notes);
  const [status, setStatus] = useState<XhsPromoStatus | null>(null);
  const [copyProvider, setCopyProvider] = useState<XhsPromoCopyProvider | null>(null);
  const [result, setResult] = useState<XhsPromoGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchXhsPromoStatus()
      .then((next) => {
        setStatus(next);
        const options = next.copy.options ?? [];
        const first = options[0]?.provider ?? (next.copy.provider as XhsPromoCopyProvider | null);
        setCopyProvider(first);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const copyOptions = status?.copy.options ?? [];
  const selectedCopy = copyOptions.find((item) => item.provider === copyProvider)
    ?? copyOptions[0]
    ?? null;
  const plannedCopy = selectedCopy
    ? `${selectedCopy.provider}:${selectedCopy.model}`
    : "未配置豆包 / DeepSeek / GPT";
  const plannedCover = status
    ? `${status.cover.provider}:${status.cover.model}`
    : "检测中";

  const usedCopy = result?.models.copy ?? plannedCopy;
  const usedCover = result?.models.cover ?? plannedCover;

  const previewSrc = useMemo(() => imageSrc(result?.image), [result]);
  const cards = result?.cards ?? [];

  async function onGenerate() {
    if (topic.trim().length < 2) {
      message.warning("请填写选题");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await generateXhsPromo({
        direction,
        topic: topic.trim(),
        notes: notes.trim(),
        copyProvider: copyProvider ?? undefined,
      });
      setResult(next);
      if (next.coverError) {
        message.warning(`文案已生成，封面已回退模板：${next.coverError}`);
      } else {
        message.success("已生成");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copyText(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    message.success(`已复制${label}`);
  }

  function applyPreset(preset: TopicPreset) {
    setDirection(preset.direction);
    setTopic(preset.topic);
    setNotes(preset.notes);
  }

  function downloadCover() {
    if (!previewSrc || !result) return;
    const ext = result.image?.mimeType.includes("svg") ? "svg" : "png";
    downloadHref(previewSrc, `xhs-cover-${result.direction}.${ext}`);
  }

  function downloadCard(index: number) {
    const card = cards[index];
    if (!card || !result) return;
    const src = imageSrc(card.image);
    if (!src) return;
    downloadHref(src, `xhs-card-${index + 1}-${result.direction}.svg`);
  }

  function downloadAllCards() {
    cards.forEach((_, index) => downloadCard(index));
  }

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        <PictureOutlined /> 小红书图文
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        选题后一次生成，复制正文、下载封面和滑页，去创作者后台发。每天 12:00 / 17:00 人发，不自动发布。
      </Paragraph>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Text type="secondary">1 文案</Text>
            <div style={{ fontWeight: 650 }}>200–400 字</div>
            <Text type="secondary">标题 + 正文 + 话题，前 80 字是钩子</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Text type="secondary">2 封面</Text>
            <div style={{ fontWeight: 650 }}>黑白 + 荧光绿</div>
            <Text type="secondary">3:4 瑞士信息卡，Seedream 出图</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Text type="secondary">3 滑页</Text>
            <div style={{ fontWeight: 650 }}>2–4 张卡片</div>
            <Text type="secondary">模板排字，细节不塞进正文</Text>
          </Card>
        </Col>
      </Row>

      <Space wrap style={{ marginBottom: 16 }}>
        <Tag color="blue">文案 {modelLabel(usedCopy)}</Tag>
        <Tag color="green">封面 {modelLabel(usedCover)}</Tag>
      </Space>

      {status?.copy.hint ? (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={status.copy.hint} />
      ) : null}
      {!status?.copy.configured && !status?.copy.hint ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="未配置文案模型。豆包需要 VOLC_ARK_TEXT_MODEL（对话 Model ID 或 ep-），或配置 DEEPSEEK_API_KEY / OPENAI_API_KEY。"
        />
      ) : null}

      {error ? (
        <Alert
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          message={error}
          onClose={() => setError("")}
        />
      ) : null}

      <Card size="small" title="选题" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            <Text type="secondary">参考选题，点击填入</Text>
            <div style={{ marginTop: 8 }}>
              {DIRECTION_OPTIONS.map((group) => (
                <div key={group.value} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ marginRight: 8 }}>
                    {group.label}
                  </Text>
                  <Space wrap size={[8, 8]}>
                    {TOPIC_PRESETS.filter((item) => item.direction === group.value).map((item) => (
                      <Button
                        key={item.topic}
                        size="small"
                        type={topic === item.topic ? "primary" : "default"}
                        onClick={() => applyPreset(item)}
                      >
                        {item.topic}
                      </Button>
                    ))}
                  </Space>
                </div>
              ))}
            </div>
          </div>
          {copyOptions.length > 1 ? (
            <div>
              <Text type="secondary">文案模型</Text>
              <div style={{ marginTop: 6 }}>
                <Segmented
                  options={copyOptions.map((item) => ({
                    label: `${copyProviderLabel(item.provider)} · ${item.model}`,
                    value: item.provider,
                  }))}
                  value={copyProvider ?? copyOptions[0]?.provider}
                  onChange={(v) => setCopyProvider(v as XhsPromoCopyProvider)}
                />
              </div>
            </div>
          ) : null}
          <div>
            <Text type="secondary">方向</Text>
            <div style={{ marginTop: 6 }}>
              <Segmented
                options={DIRECTION_OPTIONS}
                value={direction}
                onChange={(v) => setDirection(v as XhsPromoDirection)}
              />
            </div>
          </div>
          <div>
            <Text type="secondary">选题</Text>
            <Input
              style={{ marginTop: 6 }}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={40}
            />
          </div>
          <div>
            <Text type="secondary">补充（可选）</Text>
            <TextArea
              style={{ marginTop: 6 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={2000}
            />
          </div>
          <Button type="primary" loading={loading} onClick={onGenerate}>
            生成文案和图片
          </Button>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title="文案"
            extra={
              result ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  onClick={() =>
                    copyText(
                      "全文",
                      `${result.title}\n\n${result.body}\n\n${result.tags.map((t) => `#${t}`).join(" ")}`,
                    )
                  }
                >
                  复制全部
                </Button>
              ) : null
            }
          >
            {result ? (
              <Space direction="vertical" style={{ width: "100%" }} size={16}>
                <div>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Text type="secondary">标题</Text>
                    <Button type="link" onClick={() => copyText("标题", result.title)}>
                      复制
                    </Button>
                  </Space>
                  <div style={{ fontSize: 18, fontWeight: 650 }}>{result.title}</div>
                </div>
                <div>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Text type="secondary">正文</Text>
                    <Button type="link" onClick={() => copyText("正文", result.body)}>
                      复制
                    </Button>
                  </Space>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      margin: 0,
                      fontFamily: "inherit",
                      background: "#fafafa",
                      padding: 12,
                      borderRadius: 8,
                    }}
                  >
                    {result.body}
                  </pre>
                </div>
                <div>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Text type="secondary">话题</Text>
                    <Button
                      type="link"
                      onClick={() =>
                        copyText("话题", result.tags.map((t) => `#${t}`).join(" "))
                      }
                    >
                      复制
                    </Button>
                  </Space>
                  <Space wrap>
                    {result.tags.map((tag) => (
                      <Tag key={tag} color="red">
                        #{tag}
                      </Tag>
                    ))}
                  </Space>
                </div>
              </Space>
            ) : (
              <Text type="secondary">生成后显示标题、正文和话题。</Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title="封面"
            extra={
              previewSrc ? (
                <Button type="link" icon={<DownloadOutlined />} onClick={downloadCover}>
                  下载
                </Button>
              ) : null
            }
          >
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="小红书封面"
                style={{ width: "100%", maxWidth: 320, borderRadius: 8, border: "1px solid #f0f0f0" }}
              />
            ) : (
              <Text type="secondary">生成后显示 3:4 封面。</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="正文卡片"
        style={{ marginTop: 16 }}
        extra={
          cards.length > 0 ? (
            <Button type="link" icon={<DownloadOutlined />} onClick={downloadAllCards}>
              全部下载
            </Button>
          ) : null
        }
      >
        {cards.length > 0 ? (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
            {cards.map((card, index) => {
              const src = imageSrc(card.image);
              return (
                <div key={`${card.headline}-${index}`} style={{ flex: "0 0 220px" }}>
                  {src ? (
                    <img
                      src={src}
                      alt={card.headline || `正文卡片 ${index + 1}`}
                      style={{
                        width: "100%",
                        borderRadius: 8,
                        border: "1px solid #f0f0f0",
                        display: "block",
                      }}
                    />
                  ) : null}
                  <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    onClick={() => downloadCard(index)}
                    style={{ paddingLeft: 0 }}
                  >
                    卡片 {index + 1}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <Text type="secondary">生成后显示 2–4 张滑页卡片，和封面同一套风格，字由模板排出。</Text>
        )}
      </Card>
    </div>
  );
}
