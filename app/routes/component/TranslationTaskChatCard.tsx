import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { ALLOWED_TRANSLATABLE_RESOURCE_TYPES } from "../../server/translation/types";

const MODULE_LABELS: Record<string, string> = {
  PRODUCT: "商品",
  COLLECTION: "集合",
  PAGE: "页面",
  ARTICLE: "博客文章",
  METAOBJECT: "元对象",
  METAFIELD: "元字段",
  ONLINE_STORE_THEME: "在线模板",
};

type Props = {
  initialPayload: TranslationTaskFormPayload;
  onSuccess: (detail: { jobId?: string; message: string }) => void;
  /** 嵌在助手气泡内时略收紧边距与阴影 */
  embedded?: boolean;
};

export function TranslationTaskChatCard({
  initialPayload,
  onSuccess,
  embedded = false,
}: Props) {
  const shopify = useAppBridge();
  const [sourceLocale, setSourceLocale] = useState(initialPayload.sourceLocale);
  const [targetLocale, setTargetLocale] = useState(initialPayload.targetLocale);
  const [limitPerType, setLimitPerType] = useState(initialPayload.limitPerType);
  const [resourceTypes, setResourceTypes] = useState<string[]>(
    initialPayload.resourceTypes.length ? initialPayload.resourceTypes : [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSourceLocale(initialPayload.sourceLocale);
    setTargetLocale(initialPayload.targetLocale);
    setLimitPerType(initialPayload.limitPerType);
    setResourceTypes(
      initialPayload.resourceTypes.length ? initialPayload.resourceTypes : [],
    );
  }, [initialPayload]);

  const search =
    typeof window !== "undefined" ? window.location.search : "";

  const toggleModule = (type: string) => {
    setResourceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleCreate = async () => {
    const target = targetLocale.trim();
    if (!target) {
      shopify.toast.show("请填写目标语言，例如 fr、ja、en");
      return;
    }
    if (!resourceTypes.length) {
      shopify.toast.show("请至少选择一个翻译模块");
      return;
    }

    const limit = Math.min(200, Math.max(1, Math.floor(Number(limitPerType) || 20)));

    setIsSubmitting(true);
    try {
      const response = await fetch(`/app/translation${search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_job",
          targetLocale: target,
          sourceLocale: sourceLocale.trim() || "zh-CN",
          resourceTypes,
          limitPerType: limit,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        jobId?: string;
      };

      if (!response.ok || payload.ok === false) {
        shopify.toast.show(payload.error || `创建失败（${response.status}）`);
        return;
      }

      shopify.toast.show(payload.message || "翻译任务创建成功");
      onSuccess({
        jobId: payload.jobId,
        message: payload.message || "翻译任务创建成功",
      });
    } catch {
      shopify.toast.show("网络异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const shellStyle: CSSProperties = {
    marginTop: embedded ? 0 : "0.5rem",
    borderRadius: embedded ? "14px" : "16px",
    padding: "1px",
    background:
      "linear-gradient(135deg, rgba(0, 128, 96, 0.35) 0%, rgba(44, 110, 203, 0.28) 45%, rgba(147, 112, 219, 0.22) 100%)",
    boxShadow: embedded
      ? "0 2px 12px rgba(0, 0, 0, 0.05)"
      : "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
  };

  const innerStyle: CSSProperties = {
    borderRadius: embedded ? "13px" : "15px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbfb 100%)",
    overflow: "hidden",
  };

  const fieldGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "0.75rem",
  };

  const pillStyle = (selected: boolean): CSSProperties => ({
    borderRadius: "999px",
    padding: "0.35rem 0.75rem",
    fontSize: "0.8125rem",
    fontWeight: selected ? 600 : 500,
    border: selected ? "1px solid #008060" : "1px solid #e3e3e3",
    background: selected ? "rgba(0, 128, 96, 0.12)" : "#ffffff",
    color: selected ? "#004d3d" : "#303030",
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
  });

  const primaryBtnStyle: CSSProperties = {
    width: "100%",
    marginTop: "0.25rem",
  };

  return (
    <div style={shellStyle}>
      <div style={innerStyle}>
        <div
          style={{
            padding: embedded ? "0.85rem 1rem 1rem" : "1rem 1.125rem 1.125rem",
          }}
        >
          <div style={{ marginBottom: "0.75rem" }}>
            <div
              style={{
                fontSize: embedded ? "1rem" : "1.0625rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#111213",
              }}
            >
              创建翻译任务
            </div>
            <div
              style={{
                marginTop: "0.35rem",
                fontSize: "0.8125rem",
                color: "#6d7175",
                lineHeight: 1.45,
              }}
            >
              将向 Cosmos 写入 JSON Runtime 任务，执行由 AgentTask 完成。请确认语言与模块后提交。
            </div>
          </div>

          <div style={{ ...fieldGridStyle, marginBottom: "0.85rem" }}>
            <s-text-field
              label="源语言"
              value={sourceLocale}
              onChange={(e) => setSourceLocale(e.currentTarget.value)}
              autocomplete="off"
            />
            <s-text-field
              label="目标语言"
              value={targetLocale}
              onChange={(e) => setTargetLocale(e.currentTarget.value)}
              autocomplete="off"
            />
          </div>

          <div style={{ marginBottom: "0.85rem" }}>
            <s-text-field
              label="每种模块最多条目数（1–200）"
              value={String(limitPerType)}
              onChange={(e) =>
                setLimitPerType(Number(e.currentTarget.value) || 20)
              }
              autocomplete="off"
            />
          </div>

          <div style={{ marginBottom: "0.65rem" }}>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#444",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              翻译模块
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.45rem",
                marginTop: "0.45rem",
              }}
            >
              {ALLOWED_TRANSLATABLE_RESOURCE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  style={pillStyle(resourceTypes.includes(type))}
                  onClick={() => toggleModule(type)}
                >
                  {MODULE_LABELS[type] ?? type}
                </button>
              ))}
            </div>
          </div>

          <s-stack direction="block" gap="small">
            <div style={primaryBtnStyle}>
              <s-button
                type="button"
                variant="primary"
                onClick={handleCreate}
                {...(isSubmitting ? { disabled: true } : {})}
              >
                {isSubmitting ? "正在创建…" : "创建翻译任务"}
              </s-button>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
                fontSize: "0.8125rem",
              }}
            >
              <Link
                to={`/app/translation${search}`}
                style={{ color: "#2c6ecb", fontWeight: 500 }}
              >
                打开翻译任务页查看进度
              </Link>
            </div>
          </s-stack>
        </div>
      </div>
    </div>
  );
}
