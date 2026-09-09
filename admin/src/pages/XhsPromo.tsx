import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Drawer,
  Empty,
  Image as AntdImage,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import {
  CheckCircleFilled,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  LinkOutlined,
  PictureOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  ADMIN_USER_OPTIONS,
  analyzeXhsPromoReference,
  previewXhsPromoReference,
  deleteXhsPromoPromptVersion,
  fetchXhsPromoPromptLatest,
  fetchXhsPromoPromptVersions,
  fetchXhsPromoPrompts,
  fetchXhsPromoStatus,
  generateXhsPromoCards,
  generateXhsPromoCopy,
  generateXhsPromoCover,
  generateXhsPromoTitles,
  saveXhsPromoPromptVersion,
  type XhsPromoContentCard,
  type XhsPromoContentCardSlot,
  type XhsPromoCopyProvider,
  type XhsPromoCoverProvider,
  type XhsPromoCoverSlots,
  type XhsPromoDirection,
  type XhsPromoPromptLatest,
  type XhsPromoPromptSlot,
  type XhsPromoPromptVersion,
  type XhsPromoStatus,
} from "../api";

const { Title, Text } = Typography;
const { TextArea } = Input;

type PanelId = "topic" | "titles" | "copy" | "visuals";
type SourceMode = "topic" | "note";

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
    topic: "Spark 和 Sidekick，到底有什么区别？",
    notes: "对比：Shopify Sidekick vs Spark\nSidekick：官方助手，能问店里的事，不改店铺\nSpark：能看店、改文案/图、批量改，审核后再写回\n标题不要写成 Spark vs Sidekick\n左边封面写 Sidekick 短板，右边写 Spark\n没有真实数字就不要编转化率",
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
const PANELS: PanelId[] = ["topic", "titles", "copy", "visuals"];

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

function rasterizeToPng(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 768;
      canvas.height = img.naturalHeight || 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法导出 PNG"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("读图失败"));
    img.src = src;
  });
}

async function downloadPng(src: string, filename: string) {
  const href = src.includes("image/svg") ? await rasterizeToPng(src) : src;
  downloadHref(href, filename);
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

function coverProviderLabel(provider: XhsPromoCoverProvider): string {
  switch (provider) {
    case "volc-ark":
      return "Seedream";
    case "openai":
      return "GPT";
    case "template":
      return "模板";
    default: {
      const _never: never = provider;
      return _never;
    }
  }
}

function copyProviderSeesImages(provider: XhsPromoCopyProvider | null | undefined): boolean {
  return provider === "openai" || provider === "volc-ark";
}

function directionLabel(direction: XhsPromoDirection): string {
  return DIRECTION_OPTIONS.find((item) => item.value === direction)?.label ?? direction;
}

function defaultCopyProvider(status: XhsPromoStatus): XhsPromoCopyProvider | null {
  const options = status.copy.options ?? [];
  const deepseek = options.find((item) => item.provider === "deepseek");
  return deepseek?.provider ?? options[0]?.provider ?? (status.copy.provider as XhsPromoCopyProvider | null);
}

function defaultCoverProvider(status: XhsPromoStatus): XhsPromoCoverProvider {
  const options = status.cover.options ?? [];
  const seedream = options.find((item) => item.provider === "volc-ark");
  return seedream?.provider ?? (options[0]?.provider as XhsPromoCoverProvider | undefined) ?? "template";
}

function topicFromAnalyze(next: {
  suggestedTopic?: string;
  titleUser?: string;
  styleSummary?: string;
}, refTitle: string): string {
  const direct = next.suggestedTopic?.trim() ?? "";
  if (direct.length >= 2 && direct !== refTitle.trim()) return direct.slice(0, 40);
  const fromUser = next.titleUser?.match(/(?:选题|Spark选题)[：:]\s*([^\n]+)/);
  if (fromUser?.[1]) {
    const cleaned = fromUser[1].replace(/[\[\]「」【】]/g, "").replace(/已定标题/g, "").trim();
    if (cleaned.length >= 2) return cleaned.slice(0, 40);
  }
  const fromSummary = next.styleSummary?.split(/[。！？\n]/)[0]?.trim() ?? "";
  if (fromSummary.length >= 2) return fromSummary.slice(0, 40);
  return "按这篇笔记的气质写 Spark";
}

function topicKey(
  direction: XhsPromoDirection,
  topic: string,
  notes: string,
  sourceMode: SourceMode,
  refTitle: string,
): string {
  return [sourceMode, direction, topic.trim(), notes.trim(), sourceMode === "note" ? refTitle.trim() : ""].join("\n");
}

function clipPreview(text: string, max = 28): string {
  const value = text.trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function slotLabel(slot: XhsPromoPromptSlot): string {
  switch (slot) {
    case "title":
      return "标题提示词";
    case "copy":
      return "文案提示词";
    case "cover":
      return "封面提示词";
    case "cards":
      return "滑页提示词";
    default: {
      const _never: never = slot;
      return _never;
    }
  }
}

function adminName(userId: string): string {
  return ADMIN_USER_OPTIONS.find((item) => item.id === userId)?.label ?? userId;
}

function versionPreview(payload: Record<string, string>): string {
  return Object.values(payload).filter(Boolean).join("\n").slice(0, 120);
}

const EMPTY_LATEST: XhsPromoPromptLatest = {
  title: null,
  copy: null,
  cover: null,
  cards: null,
};

type RefImage = {
  mimeType: string;
  base64: string;
  preview: string;
};

function resizeImageFile(file: File, max = 1024): Promise<RefImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("无法读取图片"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      const preview = canvas.toDataURL("image/jpeg", 0.85);
      resolve({
        mimeType: "image/jpeg",
        base64: preview.slice(preview.indexOf(",") + 1),
        preview,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("读图失败"));
    };
    img.src = objectUrl;
  });
}

function PromptEditor(props: {
  dirty: boolean;
  saved: boolean;
  fields: Array<{ label: string; value: string; rows: number; onChange: (value: string) => void }>;
  onReset: () => void;
  onSave: () => void;
  onHistory: () => void;
}) {
  const label = props.dirty
    ? "调提示词（已改）"
    : props.saved
      ? "调提示词（已套保存版）"
      : "调提示词";
  return (
    <Collapse
      ghost
      items={[
        {
          key: "prompt",
          label,
          children: (
            <Space direction="vertical" style={{ width: "100%" }} size={10}>
              {props.fields.map((field) => (
                <div key={field.label}>
                  <Text type="secondary">{field.label}</Text>
                  <TextArea
                    style={{ marginTop: 6 }}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    rows={field.rows}
                    maxLength={12000}
                  />
                </div>
              ))}
              <Space wrap>
                <Button icon={<SaveOutlined />} onClick={props.onSave}>
                  保存此版
                </Button>
                <Button icon={<HistoryOutlined />} onClick={props.onHistory}>
                  历史
                </Button>
                <Button type="link" style={{ paddingLeft: 0 }} onClick={props.onReset}>
                  恢复默认
                </Button>
              </Space>
            </Space>
          ),
        },
      ]}
    />
  );
}

function DoneRow(props: {
  title: string;
  detail: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onEdit}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        padding: "12px 16px",
        border: "1px solid #f0f0f0",
        borderRadius: 10,
        background: "#fafafa",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <CheckCircleFilled style={{ color: "#52c41a", fontSize: 16 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650 }}>{props.title}</div>
        <Text type="secondary" ellipsis style={{ display: "block" }}>
          {props.detail}
        </Text>
      </div>
      <span style={{ color: "#1677ff", whiteSpace: "nowrap" }}>
        <EditOutlined /> 修改
      </span>
    </button>
  );
}

function PanelFooter(props: {
  hint: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid #f0f0f0",
      }}
    >
      <Text type="secondary">{props.hint}</Text>
      <Space wrap>
        {props.extra}
        {props.children}
      </Space>
    </div>
  );
}

export default function XhsPromo() {
  const [direction, setDirection] = useState<XhsPromoDirection>(FIRST_PRESET.direction);
  const [topic, setTopic] = useState(FIRST_PRESET.topic);
  const [notes, setNotes] = useState(FIRST_PRESET.notes);
  const [status, setStatus] = useState<XhsPromoStatus | null>(null);
  const [copyProvider, setCopyProvider] = useState<XhsPromoCopyProvider | null>(null);
  const [coverProvider, setCoverProvider] = useState<XhsPromoCoverProvider>("volc-ark");

  const [titleSystem, setTitleSystem] = useState("");
  const [titleUser, setTitleUser] = useState("");
  const [copySystem, setCopySystem] = useState("");
  const [copyUser, setCopyUser] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [cardSystem, setCardSystem] = useState("");
  const [cardUser, setCardUser] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [copyDirty, setCopyDirty] = useState(false);
  const [imageDirty, setImageDirty] = useState(false);
  const [cardDirty, setCardDirty] = useState(false);
  const [defaultImagePrompt, setDefaultImagePrompt] = useState("");
  const [defaultCardSystem, setDefaultCardSystem] = useState("");
  const [defaultCardUser, setDefaultCardUser] = useState("");

  const [titles, setTitles] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [lockedTopic, setLockedTopic] = useState("");

  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [coverSlots, setCoverSlots] = useState<XhsPromoCoverSlots | null>(null);
  const [lockedTitle, setLockedTitle] = useState("");
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  const [coverImage, setCoverImage] = useState<{ mimeType: string; base64: string } | null>(null);
  const [coverError, setCoverError] = useState("");

  const [cardSlots, setCardSlots] = useState<XhsPromoContentCardSlot[]>([]);
  const [cardImages, setCardImages] = useState<XhsPromoContentCard[]>([]);
  const [cardModel, setCardModel] = useState("");
  const [cardError, setCardError] = useState("");
  const [cardsTextDirty, setCardsTextDirty] = useState(false);

  const [titlesLoading, setTitlesLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState<PanelId>("topic");
  const [latestBySlot, setLatestBySlot] = useState<XhsPromoPromptLatest>(EMPTY_LATEST);
  const [savedSlots, setSavedSlots] = useState<Record<XhsPromoPromptSlot, boolean>>({
    title: false,
    copy: false,
    cover: false,
    cards: false,
  });
  const [historySlot, setHistorySlot] = useState<XhsPromoPromptSlot | null>(null);
  const [historyList, setHistoryList] = useState<XhsPromoPromptVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saveSlot, setSaveSlot] = useState<XhsPromoPromptSlot | null>(null);
  const [saveNote, setSaveNote] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [refLink, setRefLink] = useState("");
  const [refTitle, setRefTitle] = useState("");
  const [refBody, setRefBody] = useState("");
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [refWarning, setRefWarning] = useState("");
  const [refOpened, setRefOpened] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [styleSummary, setStyleSummary] = useState("");
  const [analyzeSawImages, setAnalyzeSawImages] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("topic");

  const panelRef = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(false);

  useEffect(() => {
    fetchXhsPromoStatus()
      .then((next) => {
        setStatus(next);
        setCopyProvider(defaultCopyProvider(next));
        setCoverProvider(defaultCoverProvider(next));
      })
      .catch((e) => setError(String(e)));
  }, []);

  function applyVersion(slot: XhsPromoPromptSlot, version: XhsPromoPromptVersion | null) {
    const payload = version?.payload ?? {};
    switch (slot) {
      case "title":
        if (version) {
          setTitleSystem(payload.titleSystem ?? "");
          setTitleUser(payload.titleUser ?? "");
          setTitleDirty(true);
        } else {
          setTitleDirty(false);
        }
        break;
      case "copy":
        if (version) {
          setCopySystem(payload.copySystem ?? "");
          setCopyUser(payload.copyUser ?? "");
          setCopyDirty(true);
        } else {
          setCopyDirty(false);
        }
        break;
      case "cover":
        if (version) {
          setImagePrompt(payload.imagePrompt ?? "");
          setDefaultImagePrompt(payload.imagePrompt ?? "");
          setImageDirty(true);
        } else {
          setImageDirty(false);
          setDefaultImagePrompt("");
        }
        break;
      case "cards":
        if (version) {
          setCardSystem(payload.cardSystem ?? "");
          setCardUser(payload.cardUser ?? "");
          setDefaultCardSystem(payload.cardSystem ?? "");
          setDefaultCardUser(payload.cardUser ?? "");
          setCardDirty(true);
        } else {
          setCardDirty(false);
        }
        break;
      default: {
        const _never: never = slot;
        return _never;
      }
    }
    setSavedSlots((prev) => ({ ...prev, [slot]: Boolean(version) }));
  }

  function currentPayload(slot: XhsPromoPromptSlot): Record<string, string> {
    switch (slot) {
      case "title":
        return { titleSystem, titleUser };
      case "copy":
        return { copySystem, copyUser };
      case "cover":
        return { imagePrompt };
      case "cards":
        return { cardSystem, cardUser };
      default: {
        const _never: never = slot;
        return _never;
      }
    }
  }

  async function addRefFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/")).slice(0, 4);
    if (images.length === 0) return;
    try {
      const next = await Promise.all(images.map((file) => resizeImageFile(file)));
      setRefImages((prev) => [...prev, ...next].slice(0, 4));
      setRefOpened(true);
    } catch (e) {
      setError(String(e));
    }
  }

  function toPreviewImage(image: { mimeType: string; base64: string }): RefImage {
    return {
      mimeType: image.mimeType,
      base64: image.base64,
      preview: `data:${image.mimeType};base64,${image.base64}`,
    };
  }

  async function onPreviewReference() {
    if (!refLink.trim()) {
      message.warning("先贴小红书链接");
      return;
    }
    setPreviewLoading(true);
    setError("");
    try {
      const next = await previewXhsPromoReference({ link: refLink.trim() });
      setRefTitle(next.title);
      setRefBody(next.description);
      setRefImages(next.images.map(toPreviewImage).slice(0, 4));
      setRefWarning(next.warning ?? "");
      setRefOpened(true);
      setStyleSummary("");
      setAnalyzeSawImages(false);
      if (next.warning) {
        message.warning(next.warning);
      } else {
        message.success("已读到公开内容，缺的再自己补");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onAnalyzeReference() {
    if (!refTitle.trim() && !refBody.trim() && refImages.length === 0) {
      message.warning("先读取链接，或贴上标题、正文、图片");
      return;
    }
    setAnalyzeLoading(true);
    setError("");
    try {
      const next = await analyzeXhsPromoReference({
        direction,
        title: refTitle.trim() || undefined,
        body: refBody.trim() || undefined,
        images: copyProviderSeesImages(copyProvider)
          ? refImages.map((image) => ({ mimeType: image.mimeType, base64: image.base64 }))
          : [],
        copyProvider: copyProvider ?? undefined,
      });
      setTitleSystem(next.titleSystem);
      setTitleUser(next.titleUser);
      setTitleDirty(true);
      setCopySystem(next.copySystem);
      setCopyUser(next.copyUser);
      setCopyDirty(true);
      setImagePrompt(next.imagePrompt);
      setDefaultImagePrompt(next.imagePrompt);
      setImageDirty(true);
      setCardSystem(next.cardSystem);
      setCardUser(next.cardUser);
      setDefaultCardSystem(next.cardSystem);
      setDefaultCardUser(next.cardUser);
      setCardDirty(true);
      setSavedSlots({ title: false, copy: false, cover: false, cards: false });
      setStyleSummary(next.styleSummary);
      setAnalyzeSawImages(next.sawImages);
      const sparkTopic = topicFromAnalyze(next, refTitle);
      setTopic(sparkTopic);
      message.success("已分析这篇笔记，可以生成标题");
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzeLoading(false);
    }
  }

  async function refreshHistory(slot: XhsPromoPromptSlot) {
    setHistoryLoading(true);
    try {
      const next = await fetchXhsPromoPromptVersions({ direction, slot });
      setHistoryList(next.versions);
    } catch (e) {
      setError(String(e));
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchXhsPromoPromptLatest(direction)
      .then((latest) => {
        if (cancelled) return;
        setLatestBySlot(latest);
        applyVersion("title", latest.title);
        applyVersion("copy", latest.copy);
        applyVersion("cover", latest.cover);
        applyVersion("cards", latest.cards);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [direction]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      fetchXhsPromoPrompts({
        direction,
        topic: topic.trim() || "（选题）",
        notes: notes.trim(),
        title: title.trim(),
        body: body.trim(),
      })
        .then((next) => {
          if (!titleDirty && !savedSlots.title) {
            setTitleSystem(next.titleSystem);
            setTitleUser(next.titleUser);
          }
          if (!copyDirty && !savedSlots.copy) {
            setCopySystem(next.copySystem);
            setCopyUser(next.copyUser);
          }
          if (!imageDirty && !savedSlots.cover && !defaultImagePrompt) {
            setImagePrompt(next.image);
          }
          if (!cardDirty && !savedSlots.cards) {
            setCardSystem(next.cardSystem);
            setCardUser(next.cardUser);
            setDefaultCardSystem(next.cardSystem);
            setDefaultCardUser(next.cardUser);
          }
        })
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [direction, topic, notes, title, body, titleDirty, copyDirty, imageDirty, cardDirty, savedSlots, defaultImagePrompt]);

  useEffect(() => {
    if (!shouldScroll.current) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldScroll.current = false;
  }, [activePanel]);

  const copyOptions = status?.copy.options ?? [];
  const coverOptions = status?.cover.options ?? [];
  const previewSrc = useMemo(() => imageSrc(coverImage), [coverImage]);
  const currentTopicKey = topicKey(direction, topic, notes, sourceMode, refTitle);

  function generationNotes(): string {
    if (sourceMode !== "note") return notes.trim();
    const parts = [notes.trim()];
    if (refTitle.trim()) parts.push(`气质来自参考笔记：${refTitle.trim()}`);
    return parts.filter(Boolean).join("\n");
  }

  function resetDownstreamFromTopic() {
    setTitles([]);
    setTitle("");
    setLockedTopic("");
    setBody("");
    setTags([]);
    setCoverSlots(null);
    setLockedTitle("");
    setCopyConfirmed(false);
    setCoverImage(null);
    setCoverError("");
    setCardSlots([]);
    setCardImages([]);
    setCardError("");
    setCardsTextDirty(false);
  }

  function clearNoteSource() {
    setRefLink("");
    setRefTitle("");
    setRefBody("");
    setRefImages([]);
    setRefWarning("");
    setRefOpened(false);
    setStyleSummary("");
    setAnalyzeSawImages(false);
  }

  function restoreDefaultPrompts() {
    applyVersion("title", latestBySlot.title);
    applyVersion("copy", latestBySlot.copy);
    applyVersion("cover", latestBySlot.cover);
    applyVersion("cards", latestBySlot.cards);
    setTitleDirty(false);
    setCopyDirty(false);
    setImageDirty(false);
    setCardDirty(false);
  }

  function switchSource(mode: SourceMode) {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    resetDownstreamFromTopic();
    setError("");
    if (mode === "topic") {
      clearNoteSource();
      restoreDefaultPrompts();
      applyPreset(presets[0] ?? FIRST_PRESET);
    } else {
      setTopic("");
      setNotes("");
      restoreDefaultPrompts();
    }
  }
  const topicChanged = Boolean(lockedTopic) && lockedTopic !== currentTopicKey;
  const titleChanged = Boolean(lockedTitle) && lockedTitle !== title.trim();
  const bodyLen = body.trim().length;
  const bodyTone = bodyLen > 0 && (bodyLen < 200 || bodyLen > 400) ? "#d48806" : "#8c8c8c";
  const presets = TOPIC_PRESETS.filter((item) => item.direction === direction);

  function goTo(panel: PanelId) {
    shouldScroll.current = true;
    setActivePanel(panel);
  }

  function canOpen(panel: PanelId): boolean {
    switch (panel) {
      case "topic":
        return true;
      case "titles":
        return topic.trim().length >= 2 || titles.length > 0 || titlesLoading;
      case "copy":
        return title.trim().length >= 2 || Boolean(body) || copyLoading;
      case "visuals":
        return copyConfirmed;
      default: {
        const _never: never = panel;
        return _never;
      }
    }
  }

  async function onGenerateTitles() {
    if (sourceMode === "note" && !styleSummary.trim()) {
      message.warning("先分析这篇参考笔记，再出标题");
      return;
    }
    let nextTopic = topic.trim();
    if (nextTopic.length < 2) {
      if (sourceMode === "note" && styleSummary.trim()) {
        nextTopic = "按这篇笔记的气质写 Spark";
        setTopic(nextTopic);
      } else {
        message.warning(sourceMode === "note" ? "先分析这篇笔记" : "请填写选题");
        return;
      }
    }
    goTo("titles");
    setTitlesLoading(true);
    setError("");
    try {
      const next = await generateXhsPromoTitles({
        direction,
        topic: nextTopic,
        notes: generationNotes(),
        copyProvider: copyProvider ?? undefined,
        titleSystemPrompt: titleSystem.trim() || undefined,
        titleUserPrompt: titleUser.trim() || undefined,
      });
      setTitles(next.titles);
      setLockedTopic(currentTopicKey);
      if (!title.trim() || !next.titles.includes(title.trim())) {
        setTitle(next.titles[0] ?? "");
      }
      message.success("选出一个标题，或直接改");
    } catch (e) {
      setError(String(e));
    } finally {
      setTitlesLoading(false);
    }
  }

  async function onGenerateCopy() {
    if (title.trim().length < 2) {
      message.warning("请先选定或填写标题");
      return;
    }
    goTo("copy");
    setCopyLoading(true);
    setError("");
    try {
      const next = await generateXhsPromoCopy({
        direction,
        topic: topic.trim(),
        notes: generationNotes(),
        title: title.trim(),
        copyProvider: copyProvider ?? undefined,
        copySystemPrompt: copySystem.trim() || undefined,
        copyUserPrompt: copyUser.trim() || undefined,
      });
      setTitle(next.title);
      setBody(next.body);
      setTags(next.tags);
      setCoverSlots(next.coverSlots);
      setLockedTitle(next.title);
      if (!savedSlots.cover) {
        setImagePrompt(next.imagePrompt);
        if (!imageDirty) {
          setDefaultImagePrompt(next.imagePrompt);
        }
      }
      message.success("改完正文再确定，不会出图");
    } catch (e) {
      setError(String(e));
    } finally {
      setCopyLoading(false);
    }
  }

  function onConfirmCopy() {
    if (body.trim().length < 20) {
      message.warning("请先生成或填写文案");
      return;
    }
    setCopyConfirmed(true);
    goTo("visuals");
    message.success("可以分别出封面和滑页");
  }

  async function onGenerateCover() {
    if (title.trim().length < 2) {
      message.warning("请先确定标题");
      return;
    }
    setCoverLoading(true);
    setError("");
    setCoverError("");
    try {
      const next = await generateXhsPromoCover({
        direction,
        topic: topic.trim(),
        title: title.trim(),
        coverProvider,
        coverSlots: coverSlots ?? undefined,
        imagePrompt: imagePrompt.trim() || undefined,
      });
      setCoverImage(next.image);
      setCoverSlots(next.coverSlots);
      if (next.coverError) {
        setCoverError(next.coverError);
        message.warning(`封面已回退模板：${next.coverError}`);
      } else {
        message.success("封面已更新，文案和滑页没动");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCoverLoading(false);
    }
  }

  async function onGenerateCards(mode: "model" | "layout") {
    if (title.trim().length < 2) {
      message.warning("请先确定标题");
      return;
    }
    setCardsLoading(true);
    setError("");
    setCardError("");
    try {
      const next = await generateXhsPromoCards({
        direction,
        topic: topic.trim(),
        notes: generationNotes(),
        title: title.trim(),
        bodyText: body.trim(),
        copyProvider: copyProvider ?? undefined,
        coverProvider,
        cardSystemPrompt: cardSystem.trim() || undefined,
        cardUserPrompt: cardUser.trim() || undefined,
        cards: mode === "layout" ? cardSlots : undefined,
      });
      setCardImages(next.cards);
      setCardSlots(next.cards.map((card) => ({ headline: card.headline, lines: card.lines })));
      setCardModel(next.model ?? cardModel);
      setCardsTextDirty(false);
      if (next.cardError) {
        setCardError(next.cardError);
        message.warning(`滑页已回退模板：${next.cardError}`);
      } else {
        message.success(mode === "layout" ? "已按当前文字和提示词重出滑页" : "滑页已更新，封面没动");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCardsLoading(false);
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

  async function downloadCover() {
    if (!previewSrc || !coverImage) return;
    try {
      await downloadPng(previewSrc, `xhs-cover-${direction}.png`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function downloadCard(index: number) {
    const card = cardImages[index];
    if (!card) return;
    const src = imageSrc(card.image);
    if (!src) return;
    try {
      await downloadPng(src, `xhs-card-${index + 1}-${direction}.png`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function downloadAllCards() {
    for (let index = 0; index < cardImages.length; index += 1) {
      await downloadCard(index);
    }
  }

  function updateCardSlot(index: number, patch: Partial<XhsPromoContentCardSlot>) {
    setCardSlots((prev) =>
      prev.map((card, i) => (i === index ? { ...card, ...patch } : card)),
    );
    setCardsTextDirty(true);
  }

  function updateCardLine(index: number, lineIndex: number, value: string) {
    setCardSlots((prev) =>
      prev.map((card, i) => {
        if (i !== index) return card;
        return { ...card, lines: card.lines.map((line, j) => (j === lineIndex ? value : line)) };
      }),
    );
    setCardsTextDirty(true);
  }

  const fullPost = `${title}\n\n${body}\n\n${tags.map((tag) => `#${tag}`).join(" ")}`;

  return (
    <div style={{ maxWidth: 1080 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <PictureOutlined /> 小红书图文
          </Title>
          <Text type="secondary">每天 12:00 / 17:00 人发。改哪一步，只重跑哪一步。</Text>
        </div>
        {copyOptions.length > 0 ? (
          <div>
            <Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
              写文案用
            </Text>
            <Segmented
              size="small"
              options={copyOptions.map((item) => ({
                label: copyProviderLabel(item.provider),
                value: item.provider,
              }))}
              value={copyProvider ?? copyOptions[0]?.provider}
              onChange={(v) => setCopyProvider(v as XhsPromoCopyProvider)}
            />
          </div>
        ) : null}
      </div>

      <Steps
        size="small"
        current={PANELS.indexOf(activePanel)}
        style={{ marginBottom: 20 }}
        onChange={(index) => {
          const panel = PANELS[index];
          if (panel && canOpen(panel)) goTo(panel);
        }}
        items={[
          { title: "选题", disabled: false },
          { title: "标题", disabled: !canOpen("titles") },
          { title: "文案", disabled: !canOpen("copy") },
          { title: "出图", disabled: !canOpen("visuals") },
        ]}
      />

      {status?.copy.hint ? (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={status.copy.hint} />
      ) : null}
      {!status?.copy.configured && !status?.copy.hint ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="还没配文案模型。需要 DEEPSEEK_API_KEY，或给豆包配 VOLC_ARK_TEXT_MODEL。"
        />
      ) : null}
      {error ? (
        <Alert
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          message={error}
          onClose={() => setError("")}
        />
      ) : null}

      {canOpen("titles") && activePanel !== "topic" ? (
        <DoneRow
          title="选题"
          detail={
            sourceMode === "note"
              ? `参考笔记 · ${clipPreview(refTitle || "未读链接")} · ${topic || "待定选题"}`
              : `${directionLabel(direction)} · ${topic}`
          }
          onEdit={() => goTo("topic")}
        />
      ) : null}

      {activePanel === "topic" ? (
        <div ref={panelRef}>
          <Card size="small" title="今天发哪条" style={{ marginBottom: 12, borderRadius: 10 }}>
            <Space direction="vertical" style={{ width: "100%" }} size={14}>
              <div>
                <Text strong style={{ display: "block", marginBottom: 8, fontSize: 15 }}>
                  先选一条路，只能走其中一个
                </Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {(
                    [
                      {
                        value: "topic" as const,
                        title: "选选题",
                        desc: "点预设或自己写，不分析链接",
                        icon: <FileTextOutlined />,
                      },
                      {
                        value: "note" as const,
                        title: "参考笔记",
                        desc: "贴小红书链接，只分析这篇笔记",
                        icon: <LinkOutlined />,
                      },
                    ] as const
                  ).map((item) => {
                    const selected = sourceMode === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => switchSource(item.value)}
                        style={{
                          textAlign: "left",
                          padding: "16px 18px",
                          borderRadius: 10,
                          border: selected ? "2px solid #1677ff" : "2px solid #d9d9d9",
                          background: selected ? "#e6f4ff" : "#fff",
                          cursor: "pointer",
                          boxShadow: selected ? "0 0 0 3px rgba(22,119,255,0.12)" : "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 18, color: selected ? "#1677ff" : "#8c8c8c" }}>{item.icon}</span>
                          <span style={{ fontSize: 17, fontWeight: 700, color: selected ? "#1677ff" : "#141414" }}>
                            {item.title}
                          </span>
                          {selected ? <CheckCircleFilled style={{ marginLeft: "auto", color: "#1677ff" }} /> : null}
                        </div>
                        <div style={{ fontSize: 13, color: selected ? "#1677ff" : "#8c8c8c", lineHeight: 1.4 }}>
                          {item.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Segmented
                options={DIRECTION_OPTIONS}
                value={direction}
                onChange={(v) => setDirection(v as XhsPromoDirection)}
              />
              {sourceMode === "topic" ? (
                <>
                  <div>
                    <Text type="secondary">点一条填入，也可自己写。这条路不分析小红书链接。</Text>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {presets.map((item) => (
                        <Button
                          key={item.topic}
                          size="small"
                          type={topic === item.topic ? "primary" : "default"}
                          onClick={() => applyPreset(item)}
                        >
                          {item.topic}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    maxLength={40}
                    placeholder="选题"
                    showCount
                  />
                  <TextArea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="补充：真实数字、对比对象、不要写什么"
                  />
                </>
              ) : (
                <div
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData.files);
                    if (files.some((file) => file.type.startsWith("image/"))) {
                      event.preventDefault();
                      void addRefFiles(files);
                    }
                  }}
                >
                  <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                    只分析这篇笔记的标题和正文，不会用上面的预设选题。分析完再写 Spark 发什么。
                  </Text>
                  <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    <Space.Compact style={{ width: "100%" }}>
                      <Input
                        value={refLink}
                        onChange={(e) => setRefLink(e.target.value)}
                        placeholder="小红书链接，或整段分享文案"
                        allowClear
                        onPressEnter={() => void onPreviewReference()}
                      />
                      <Button type="primary" loading={previewLoading} onClick={() => void onPreviewReference()}>
                        读取链接
                      </Button>
                    </Space.Compact>
                    {!refOpened ? (
                      <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setRefOpened(true)}>
                        没有链接，自己贴文字和图片
                      </Button>
                    ) : null}
                    {refOpened ? (
                      <>
                        {refWarning ? <Alert type="warning" showIcon message={refWarning} /> : null}
                        <Input
                          value={refTitle}
                          onChange={(e) => setRefTitle(e.target.value)}
                          placeholder="读到的笔记标题，不对就改"
                          maxLength={80}
                          showCount
                        />
                        <TextArea
                          value={refBody}
                          onChange={(e) => setRefBody(e.target.value)}
                          rows={6}
                          maxLength={4000}
                          showCount
                          placeholder="读到的笔记正文。通常读不到，在这里补全。"
                        />
                        <Upload
                          accept="image/*"
                          multiple
                          showUploadList={false}
                          beforeUpload={(file) => {
                            void addRefFiles([file]);
                            return false;
                          }}
                          disabled={refImages.length >= 4}
                        >
                          <Button icon={<UploadOutlined />} disabled={refImages.length >= 4}>
                            补图或粘贴图片（最多 4 张）
                          </Button>
                        </Upload>
                        {refImages.length > 0 ? (
                          <AntdImage.PreviewGroup items={refImages.map((image) => image.preview)}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {refImages.map((image, index) => (
                                <div key={`${index}-${image.base64.slice(0, 16)}`} style={{ position: "relative" }}>
                                  <AntdImage
                                    src={image.preview}
                                    alt={`参考图 ${index + 1}`}
                                    width={88}
                                    height={88}
                                    style={{ objectFit: "cover", borderRadius: 6 }}
                                  />
                                  <Button
                                    size="small"
                                    type="text"
                                    danger
                                    style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, zIndex: 2 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRefImages((prev) => prev.filter((_, i) => i !== index));
                                    }}
                                  >
                                    ×
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </AntdImage.PreviewGroup>
                        ) : (
                          <Text type="secondary">链接没读到图，在这里上传或粘贴。</Text>
                        )}
                        <Button type="primary" loading={analyzeLoading} onClick={() => void onAnalyzeReference()}>
                          分析这篇笔记
                        </Button>
                        <Text type="secondary">
                          {copyProviderSeesImages(copyProvider) && refImages.length > 0
                            ? `只拆这篇笔记，会看文字和 ${refImages.length} 张图，所以会慢一些。`
                            : "只拆这篇笔记的标题和正文，不看图，也不看预设选题。"}
                        </Text>
                        {styleSummary ? (
                          <Alert
                            type="info"
                            showIcon
                            message={analyzeSawImages ? "已按这篇笔记的文字和图片拆气质" : "已按这篇笔记的文字拆气质，没有看图"}
                            description={styleSummary}
                          />
                        ) : null}
                      </>
                    ) : null}
                    {styleSummary ? (
                      <>
                        <Text type="secondary">这篇 Spark 发什么（分析给出，可改）</Text>
                        <Input
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          maxLength={40}
                          placeholder="不要照抄参考笔记标题"
                          showCount
                        />
                        <TextArea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          maxLength={2000}
                          placeholder="补充：真实数字、不要写什么（可选）"
                        />
                      </>
                    ) : null}
                  </Space>
                </div>
              )}
              <PromptEditor
                dirty={titleDirty}
                saved={savedSlots.title}
                onSave={() => {
                  setSaveSlot("title");
                  setSaveNote("");
                }}
                onHistory={() => {
                  setHistorySlot("title");
                  void refreshHistory("title");
                }}
                onReset={() => applyVersion("title", latestBySlot.title)}
                fields={[
                  {
                    label: "系统规则",
                    value: titleSystem,
                    rows: 5,
                    onChange: (value) => {
                      setTitleDirty(true);
                      setTitleSystem(value);
                    },
                  },
                  {
                    label: "本次选题",
                    value: titleUser,
                    rows: 5,
                    onChange: (value) => {
                      setTitleDirty(true);
                      setTitleUser(value);
                    },
                  },
                ]}
              />
              <PanelFooter
                hint={
                  sourceMode === "note" && !styleSummary
                    ? "先分析这篇笔记，再出标题"
                    : "下一步只出标题，还不出图"
                }
              >
                <Button
                  type="primary"
                  size="large"
                  loading={titlesLoading}
                  disabled={sourceMode === "note" && !styleSummary}
                  onClick={onGenerateTitles}
                >
                  {titles.length > 0 ? "按这个选题换一批标题" : "生成标题"}
                </Button>
              </PanelFooter>
            </Space>
          </Card>
        </div>
      ) : null}

      {canOpen("copy") && activePanel !== "titles" ? (
        <DoneRow
          title="标题"
          detail={title || "未选"}
          onEdit={() => goTo("titles")}
        />
      ) : null}

      {activePanel === "titles" ? (
        <div ref={panelRef}>
          <Card size="small" title="选一个标题" style={{ marginBottom: 12, borderRadius: 10 }}>
            <Spin spinning={titlesLoading}>
              <Space direction="vertical" style={{ width: "100%" }} size={14}>
                {topicChanged ? (
                  <Alert type="info" showIcon message="选题改过了。换一批标题不会动已经写好的文案和图片。" />
                ) : null}
                {titles.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {titles.map((item) => {
                      const selected = title === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setTitle(item)}
                          style={{
                            textAlign: "left",
                            padding: "12px 14px",
                            borderRadius: 8,
                            border: selected ? "2px solid #1677ff" : "1px solid #f0f0f0",
                            background: selected ? "#e6f4ff" : "#fff",
                            cursor: "pointer",
                            fontSize: 15,
                            fontWeight: selected ? 650 : 500,
                          }}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={titlesLoading ? "正在出标题" : "还没有标题，点「换一批」再试"}
                  />
                )}
                <div>
                  <Text type="secondary">选完还能改几个字</Text>
                  <Input
                    style={{ marginTop: 6 }}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={20}
                    showCount
                    placeholder="标题"
                  />
                </div>
                <PanelFooter
                  hint="下一步只写正文，仍不出图"
                  extra={
                    <Button icon={<ReloadOutlined />} loading={titlesLoading} onClick={onGenerateTitles}>
                      换一批
                    </Button>
                  }
                >
                  <Button type="primary" size="large" loading={copyLoading} onClick={onGenerateCopy}>
                    {body ? "用这个标题重写文案" : "用这个标题写文案"}
                  </Button>
                </PanelFooter>
              </Space>
            </Spin>
          </Card>
        </div>
      ) : null}

      {copyConfirmed && activePanel !== "copy" ? (
        <DoneRow
          title="文案"
          detail={`${clipPreview(title)} · ${bodyLen} 字`}
          onEdit={() => goTo("copy")}
        />
      ) : null}

      {activePanel === "copy" ? (
        <div ref={panelRef}>
          <Card
            size="small"
            title="改正文"
            style={{ marginBottom: 12, borderRadius: 10 }}
            extra={
              body ? (
                <Button type="link" icon={<CopyOutlined />} onClick={() => copyText("全文", fullPost)}>
                  复制全文
                </Button>
              ) : null
            }
          >
            <Spin spinning={copyLoading}>
              <Space direction="vertical" style={{ width: "100%" }} size={14}>
                {titleChanged ? (
                  <Alert type="info" showIcon message="标题改过了。重写文案不会动封面和滑页。" />
                ) : null}
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={20}
                  showCount
                />
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text type="secondary">正文</Text>
                    <Text style={{ color: bodyTone }}>
                      {bodyLen} 字{bodyLen > 0 && (bodyLen < 200 || bodyLen > 400) ? " · 建议 200–400" : ""}
                    </Text>
                  </div>
                  <TextArea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    maxLength={800}
                    placeholder="钩子 → 共鸣 → 怎么做 → 收尾"
                  />
                </div>
                <div>
                  <Text type="secondary">话题</Text>
                  <Select
                    mode="tags"
                    style={{ width: "100%", marginTop: 6 }}
                    value={tags}
                    onChange={setTags}
                    tokenSeparators={[" ", ",", "，", "#"]}
                    placeholder="输入后回车"
                    open={false}
                  />
                </div>
                <PromptEditor
                  dirty={copyDirty}
                  saved={savedSlots.copy}
                  onSave={() => {
                    setSaveSlot("copy");
                    setSaveNote("");
                  }}
                  onHistory={() => {
                    setHistorySlot("copy");
                    void refreshHistory("copy");
                  }}
                  onReset={() => applyVersion("copy", latestBySlot.copy)}
                  fields={[
                    {
                      label: "系统规则",
                      value: copySystem,
                      rows: 6,
                      onChange: (value) => {
                        setCopyDirty(true);
                        setCopySystem(value);
                      },
                    },
                    {
                      label: "本次标题",
                      value: copyUser,
                      rows: 6,
                      onChange: (value) => {
                        setCopyDirty(true);
                        setCopyUser(value);
                      },
                    },
                  ]}
                />
                <PanelFooter
                  hint={copyConfirmed ? "出图已解锁，改字不会自动重画" : "确定后才出封面和滑页"}
                  extra={
                    <Button icon={<ReloadOutlined />} loading={copyLoading} onClick={onGenerateCopy}>
                      重写文案
                    </Button>
                  }
                >
                  <Button type="primary" size="large" onClick={onConfirmCopy}>
                    {copyConfirmed ? "回到出图" : "文案没问题，去出图"}
                  </Button>
                </PanelFooter>
              </Space>
            </Spin>
          </Card>
        </div>
      ) : null}

      {activePanel === "visuals" ? (
        <div ref={panelRef}>
          <Card size="small" style={{ marginBottom: 12, borderRadius: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 650, fontSize: 16 }}>{title}</div>
                <Text type="secondary">封面和滑页分开出，互不影响。下载都是 PNG。</Text>
              </div>
              <Space wrap>
                {coverOptions.length > 0 ? (
                  <Segmented
                    size="small"
                    options={coverOptions.map((item) => ({
                      label: coverProviderLabel(item.provider),
                      value: item.provider,
                    }))}
                    value={coverProvider}
                    onChange={(v) => setCoverProvider(v as XhsPromoCoverProvider)}
                  />
                ) : null}
                <Button icon={<CopyOutlined />} onClick={() => copyText("全文", fullPost)}>
                  复制全文
                </Button>
                <Button icon={<DownloadOutlined />} disabled={!previewSrc} onClick={() => void downloadCover()}>
                  下载封面
                </Button>
                <Button icon={<DownloadOutlined />} disabled={cardImages.length === 0} onClick={() => void downloadAllCards()}>
                  下载滑页
                </Button>
              </Space>
            </div>
          </Card>

          <Row gutter={16}>
            <Col xs={24} lg={10}>
              <Card size="small" title="封面" style={{ borderRadius: 10, marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: "100%" }} size={12}>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 320,
                      aspectRatio: "3 / 4",
                      borderRadius: 10,
                      border: "1px solid #f0f0f0",
                      background: "#fafafa",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {coverLoading ? (
                      <Spin tip="封面生成中" />
                    ) : previewSrc ? (
                      <AntdImage
                        src={previewSrc}
                        alt="小红书封面"
                        preview={{ mask: "看大图" }}
                        width="100%"
                        style={{ height: "100%", objectFit: "cover" }}
                        wrapperStyle={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没出封面" />
                    )}
                  </div>
                  {coverError ? <Alert type="warning" showIcon message={coverError} /> : null}
                  <PromptEditor
                    dirty={imageDirty}
                    saved={savedSlots.cover}
                    onSave={() => {
                      setSaveSlot("cover");
                      setSaveNote("");
                    }}
                    onHistory={() => {
                      setHistorySlot("cover");
                      void refreshHistory("cover");
                    }}
                    onReset={() => applyVersion("cover", latestBySlot.cover)}
                    fields={[
                      {
                        label: "封面提示词",
                        value: imagePrompt,
                        rows: 8,
                        onChange: (value) => {
                          setImageDirty(true);
                          setImagePrompt(value);
                        },
                      },
                    ]}
                  />
                  <Button type="primary" block loading={coverLoading} onClick={onGenerateCover}>
                    {coverImage ? "重出封面" : "生成封面"}
                  </Button>
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={14}>
              <Card size="small" title="滑页" style={{ borderRadius: 10, marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: "100%" }} size={12}>
                  {cardsTextDirty ? (
                    <Alert type="info" showIcon message="字改过了，点「按文字重排」会按当前提示词重出 PNG。" />
                  ) : null}
                  {cardError ? <Alert type="warning" showIcon message={cardError} /> : null}
                  <Spin spinning={cardsLoading}>
                    {cardSlots.length > 0 ? (
                      <AntdImage.PreviewGroup>
                      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                        {cardSlots.map((card, index) => {
                          const src = imageSrc(cardImages[index]?.image);
                          return (
                            <div
                              key={`card-${index}`}
                              style={{
                                flex: "0 0 200px",
                                padding: 10,
                                border: "1px solid #f0f0f0",
                                borderRadius: 10,
                                background: "#fff",
                              }}
                            >
                              <div
                                style={{
                                  aspectRatio: "3 / 4",
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  background: "#fafafa",
                                  marginBottom: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {src ? (
                                  <AntdImage
                                    src={src}
                                    alt={card.headline || `滑页 ${index + 1}`}
                                    preview={{ mask: "看大图" }}
                                    width="100%"
                                    style={{ height: "100%", objectFit: "cover" }}
                                    wrapperStyle={{ width: "100%", height: "100%" }}
                                  />
                                ) : (
                                  <Text type="secondary">{index + 1}</Text>
                                )}
                              </div>
                              <Input
                                value={card.headline}
                                onChange={(e) => updateCardSlot(index, { headline: e.target.value })}
                                maxLength={12}
                                style={{ marginBottom: 6 }}
                              />
                              {card.lines.map((line, lineIndex) => (
                                <Input
                                  key={`${index}-${lineIndex}`}
                                  value={line}
                                  onChange={(e) => updateCardLine(index, lineIndex, e.target.value)}
                                  maxLength={18}
                                  style={{ marginBottom: 6 }}
                                />
                              ))}
                              <Button
                                type="link"
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={() => void downloadCard(index)}
                                disabled={!src}
                                style={{ paddingLeft: 0 }}
                              >
                                下载 {index + 1}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      </AntdImage.PreviewGroup>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没出滑页" />
                    )}
                  </Spin>
                  <PromptEditor
                    dirty={cardDirty}
                    saved={savedSlots.cards}
                    onSave={() => {
                      setSaveSlot("cards");
                      setSaveNote("");
                    }}
                    onHistory={() => {
                      setHistorySlot("cards");
                      void refreshHistory("cards");
                    }}
                    onReset={() => applyVersion("cards", latestBySlot.cards)}
                    fields={[
                      {
                        label: "滑页画面",
                        value: cardSystem,
                        rows: 6,
                        onChange: (value) => {
                          setCardDirty(true);
                          setCardSystem(value);
                        },
                      },
                      {
                        label: "本次滑页",
                        value: cardUser,
                        rows: 6,
                        onChange: (value) => {
                          setCardDirty(true);
                          setCardUser(value);
                        },
                      },
                    ]}
                  />
                  <Space wrap>
                    <Button type="primary" loading={cardsLoading} onClick={() => onGenerateCards("model")}>
                      {cardImages.length > 0 ? "按提示词重出滑页" : "生成滑页"}
                    </Button>
                    <Button
                      loading={cardsLoading}
                      disabled={cardSlots.length === 0}
                      onClick={() => onGenerateCards("layout")}
                    >
                      按文字重排
                    </Button>
                  </Space>
                </Space>
              </Card>
            </Col>
          </Row>
        </div>
      ) : null}

      <Modal
        title={saveSlot ? `保存${slotLabel(saveSlot)}` : "保存此版"}
        open={saveSlot != null}
        confirmLoading={saveLoading}
        okText="保存"
        onCancel={() => setSaveSlot(null)}
        onOk={async () => {
          if (!saveSlot) return;
          setSaveLoading(true);
          try {
            const result = await saveXhsPromoPromptVersion({
              direction,
              slot: saveSlot,
              note: saveNote.trim() || undefined,
              payload: currentPayload(saveSlot),
            });
            setLatestBySlot((prev) => ({ ...prev, [saveSlot]: result.version }));
            setSavedSlots((prev) => ({ ...prev, [saveSlot]: true }));
            if (historySlot === saveSlot) {
              void refreshHistory(saveSlot);
            }
            setSaveSlot(null);
            if (result.duplicate) {
              message.info("和最新一版相同，没有重复存");
            } else {
              message.success("已保存，进页会套这一版");
            }
          } catch (e) {
            setError(String(e));
          } finally {
            setSaveLoading(false);
          }
        }}
      >
        <Input
          value={saveNote}
          onChange={(e) => setSaveNote(e.target.value)}
          maxLength={80}
          placeholder="备注，比如：对比封面左右对仗"
        />
      </Modal>

      <Drawer
        title={historySlot ? `${slotLabel(historySlot)}历史` : "历史"}
        open={historySlot != null}
        width={420}
        onClose={() => setHistorySlot(null)}
      >
        <Spin spinning={historyLoading}>
          {historyList.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有保存过" />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              {historyList.map((item, index) => (
                <Card
                  key={item.id}
                  size="small"
                  title={
                    <Space size={8}>
                      <Text>{new Date(item.createdAt).toLocaleString("zh-CN")}</Text>
                      {index === 0 ? <Tag color="blue">最新</Tag> : null}
                    </Space>
                  }
                  extra={<Text type="secondary">{adminName(item.createdBy)}</Text>}
                >
                  {item.note ? <div style={{ marginBottom: 8 }}>{item.note}</div> : null}
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      margin: 0,
                      maxHeight: 96,
                      overflow: "hidden",
                      fontSize: 12,
                      color: "#595959",
                      background: "#fafafa",
                      padding: 8,
                      borderRadius: 6,
                    }}
                  >
                    {versionPreview(item.payload)}
                  </pre>
                  <Space style={{ marginTop: 8 }}>
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => {
                        if (!historySlot) return;
                        applyVersion(historySlot, item);
                        message.success("已载入这一版");
                      }}
                    >
                      载入
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => {
                        Modal.confirm({
                          title: "删除这一版？",
                          content: "编辑器里的字不会马上变。下次进页会套当时剩下的最新版。",
                          okText: "删除",
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            await deleteXhsPromoPromptVersion(item.id);
                            const latest = await fetchXhsPromoPromptLatest(direction);
                            setLatestBySlot(latest);
                            if (historySlot) {
                              await refreshHistory(historySlot);
                            }
                            message.success("已删除");
                          },
                        });
                      }}
                    >
                      删除
                    </Button>
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </Spin>
      </Drawer>
    </div>
  );
}
