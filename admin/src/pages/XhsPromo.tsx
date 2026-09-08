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

function imageSrc(result: XhsPromoGenerateResult | null): string {
  if (!result?.image?.base64) return "";
  return `data:${result.image.mimeType};base64,${result.image.base64}`;
}

function modelLabel(raw: string | null | undefined): string {
  if (!raw) return "未配置";
  return raw;
}

export default function XhsPromo() {
  const [direction, setDirection] = useState<XhsPromoDirection>("compare");
  const [topic, setTopic] = useState("为什么不在后台一页页查？");
  const [notes, setNotes] = useState(
    "对比：逐页人工检查 vs API 全量导出\n痛点：漏项、标准不一致、没法批量复核\n结论：先把数据放到一张表里",
  );
  const [status, setStatus] = useState<XhsPromoStatus | null>(null);
  const [result, setResult] = useState<XhsPromoGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchXhsPromoStatus()
      .then(setStatus)
      .catch((e) => setError(String(e)));
  }, []);

  const plannedCopy = status?.copy.configured
    ? `${status.copy.provider}:${status.copy.model}`
    : "未配置 DEEPSEEK / OPENAI";
  const plannedCover = status
    ? `${status.cover.provider}:${status.cover.model}`
    : "检测中";

  const usedCopy = result?.models.copy ?? plannedCopy;
  const usedCover = result?.models.cover ?? plannedCover;

  const previewSrc = useMemo(() => imageSrc(result), [result]);

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

  function downloadCover() {
    if (!previewSrc || !result) return;
    const ext = result.image?.mimeType.includes("svg") ? "svg" : "png";
    const a = document.createElement("a");
    a.href = previewSrc;
    a.download = `xhs-cover-${result.direction}.${ext}`;
    a.click();
  }

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        <PictureOutlined /> 生成小红书图文
      </Title>
      <Paragraph type="secondary">
        填选题，生成文案和封面，复制/下载后去小红书发。不自动发布。
      </Paragraph>

      <Space wrap style={{ marginBottom: 16 }}>
        <Tag color="blue">文案模型 {modelLabel(usedCopy)}</Tag>
        <Tag color="green">封面模型 {modelLabel(usedCover)}</Tag>
      </Space>

      {!status?.copy.configured ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="未配置文案模型。请在环境变量写入 DEEPSEEK_API_KEY 或 OPENAI_API_KEY。"
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
            生成图文
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
    </div>
  );
}
