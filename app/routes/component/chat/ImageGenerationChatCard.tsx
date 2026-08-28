import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { CriticalErrorBox } from "../shared/CriticalErrorBox";
import { ProductSelector } from "../product/ProductSelector";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import type { ImageGenerationFormPayload } from "../../../lib/imageGenerationFormPayload";
import type { AITaskItem } from "../../../lib/aiTaskTypes";
import type { TaskProposalEstimateResponse } from "../../../lib/taskProposalPayload";
import { IMAGE_GENERATION_SKILL_ID } from "../../../lib/taskProposalPayload";
import { formatThinkingDuration } from "../../../lib/thinkingDuration";
import { useEmbeddedNavigate } from "../../../hooks/useEmbeddedNavigate";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageTextareaStyle,
} from "../../page/pageUiStyles";

type ContextProduct = {
  id: string;
  title: string;
  imageUrl?: string | null;
};

type Props = {
  embedded?: boolean;
  initial?: ImageGenerationFormPayload;
  contextProduct?: ContextProduct | null;
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 10 * 60 * 1000;

function toSelectorSelection(product: {
  id: string;
  title: string;
  imageUrl?: string | null;
}): ProductSelectorSelection {
  return {
    id: product.id,
    title: product.title,
    featuredImageUrl: product.imageUrl ?? null,
    images: product.imageUrl ? [{ url: product.imageUrl, altText: product.title }] : [],
  };
}

function readString(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function ImageGenerationChatCard({
  embedded = false,
  initial,
  contextProduct = null,
}: Props) {
  const { t } = useTranslation();
  const shopify = useAppBridge();
  const navigate = useEmbeddedNavigate();
  const search = typeof window !== "undefined" ? window.location.search : "";

  const [selectedProduct, setSelectedProduct] = useState<ProductSelectorSelection | null>(() => {
    if (initial?.productId) {
      return toSelectorSelection({
        id: initial.productId,
        title: initial.productTitle || initial.productId,
      });
    }
    if (contextProduct?.id) return toSelectorSelection(contextProduct);
    return null;
  });
  const [description, setDescription] = useState(initial?.description ?? "");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [task, setTask] = useState<AITaskItem | null>(null);

  const [estimateLoading, setEstimateLoading] = useState(true);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const pollCancelledRef = useRef(false);

  useEffect(() => {
    pollCancelledRef.current = false;
    return () => {
      pollCancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEstimateLoading(true);
    fetch(`/api/task-proposal${search}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "estimate",
        skillId: IMAGE_GENERATION_SKILL_ID,
        params: {},
      }),
    })
      .then((res) => res.json() as Promise<TaskProposalEstimateResponse>)
      .then((json) => {
        if (cancelled || !json.ok) return;
        setEstimatedCredits(json.perItemCredits);
        setEstimatedSeconds(json.perItemSeconds);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEstimateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  const imageUrl = readString(task?.result, "imageUrl");
  const running = task?.status === "running" || isSubmitting;
  const failed = task?.status === "failed";
  const succeeded = task?.status === "succeeded" || task?.status === "applied";

  const handleGenerate = async () => {
    const trimmed = description.trim();
    if (trimmed.length < 4) {
      setErrorText(t("imageGeneration.validationDescriptionMin"));
      return;
    }
    setErrorText(null);
    setBillingBlocked(false);
    setIsSubmitting(true);
    setTask(null);
    try {
      const res = await fetch(`/api/generate-image${search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmed,
          ...(selectedProduct?.id ? { productId: selectedProduct.id } : {}),
        }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        taskId?: string;
        errorMsg?: string;
      };
      if (res.status === 402 || !body.success || !body.taskId) {
        setBillingBlocked(res.status === 402);
        setErrorText(body.errorMsg || t("imageGeneration.submitFailed"));
        return;
      }
      shopify.toast.show(t("imageGeneration.chat.submitted"));
      await pollTask(body.taskId);
    } catch {
      setErrorText(t("imageGeneration.submitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const pollTask = async (taskId: string) => {
    const startedAt = Date.now();
    while (!pollCancelledRef.current && Date.now() - startedAt <= MAX_POLL_MS) {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      const res = await fetch(`/api/ai-task/${encodeURIComponent(taskId)}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { task?: AITaskItem };
      if (pollCancelledRef.current) return;
      if (body.task) {
        setTask(body.task);
        if (body.task.status !== "running") return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (!pollCancelledRef.current) {
      setErrorText(t("imageGeneration.pollTimeout"));
    }
  };

  const estimateLine = (() => {
    if (estimateLoading) return t("workspace.taskProposal.card.estimateLoading");
    const parts: string[] = [];
    if (estimatedCredits != null) {
      parts.push(t("workspace.taskProposal.card.estimateCredits", { credits: estimatedCredits }));
    }
    if (estimatedSeconds != null) {
      parts.push(
        t("workspace.taskProposal.card.estimateDuration", {
          duration: formatThinkingDuration(estimatedSeconds * 1000, t),
        }),
      );
    }
    if (parts.length === 0) return t("workspace.taskProposal.card.estimateEmpty");
    return parts.join(" · ");
  })();

  const usedCredits = task?.actualCredits;
  const showForm = !succeeded;

  const shellStyle: CSSProperties = {
    marginTop: embedded ? 0 : "0.5rem",
    borderRadius: embedded ? 14 : 16,
    padding: 1,
    background:
      "linear-gradient(135deg, rgba(44, 110, 203, 0.38) 0%, rgba(0, 128, 96, 0.28) 50%, rgba(147, 112, 219, 0.22) 100%)",
    boxShadow: embedded ? "0 2px 12px rgba(0, 0, 0, 0.05)" : "0 4px 24px rgba(0, 0, 0, 0.06)",
  };

  return (
    <div style={shellStyle}>
      <div
        style={{
          borderRadius: embedded ? 13 : 15,
          background: "linear-gradient(180deg, #ffffff 0%, #fafbfb 100%)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: embedded ? "0.85rem 1rem 1rem" : "1rem 1.125rem 1.125rem" }}>
          <div style={{ fontSize: embedded ? "1rem" : "1.0625rem", fontWeight: 700, color: "#111213" }}>
            {t("imageGeneration.chat.title")}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#6d7175", lineHeight: 1.45 }}>
            {t("imageGeneration.chat.intro")}
          </div>

          {showForm ? (
            <>
              <div style={{ marginTop: 12, marginBottom: 12 }}>
                <div style={pageFieldLabelStyle}>{t("imageGeneration.chat.productOptional")}</div>
                <ProductSelector
                  locationSearch={search}
                  embedded={embedded}
                  selected={selectedProduct}
                  onSelectedChange={setSelectedProduct}
                />
                <div style={pageHintTextStyle}>{t("imageGeneration.chat.productHint")}</div>
              </div>

              <label style={pageFieldLabelStyle} htmlFor="image-gen-chat-description">
                {t("imageGeneration.descriptionLabel")}
              </label>
              <textarea
                id="image-gen-chat-description"
                style={pageTextareaStyle({ minHeight: "96px" })}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                placeholder={t("imageGeneration.descriptionPlaceholder")}
                disabled={running}
              />
            </>
          ) : null}

          {errorText ? (
            <CriticalErrorBox style={{ marginTop: 12 }}>
              {errorText}
              {billingBlocked ? (
                <div style={{ marginTop: 8 }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate("/app/account")}
                  >
                    {t("imageGeneration.chat.goToAccount")}
                  </s-button>
                </div>
              ) : null}
            </CriticalErrorBox>
          ) : null}

          {running ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: pageColorTokens.textSecondary,
                background: pageColorTokens.surfaceSubtle,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              {t("imageGeneration.chat.running")}
              {estimatedCredits != null
                ? ` · ${t("imageStudio.estimatedCreditsValue", { value: estimatedCredits })}`
                : ""}
            </div>
          ) : null}

          {succeeded && imageUrl ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <img
                src={imageUrl}
                alt={t("imageGeneration.generatedImageAlt")}
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: 420,
                  objectFit: "contain",
                  borderRadius: 10,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  background: "#fff",
                }}
              />
              <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                {usedCredits != null
                  ? t("imageGeneration.chat.usedCredits", {
                      actual: usedCredits,
                      estimated: task?.estimatedCredits ?? estimatedCredits ?? "—",
                    })
                  : estimatedCredits != null
                    ? t("imageStudio.estimatedCreditsValue", { value: estimatedCredits })
                    : null}
                {selectedProduct?.title
                  ? ` · ${t("imageGeneration.chat.referencedProduct", { title: selectedProduct.title })}`
                  : ""}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <s-button type="button" variant="secondary" onClick={() => window.open(imageUrl, "_blank")}>
                  {t("imageGeneration.openImage")}
                </s-button>
                <a href={imageUrl} download style={{ textDecoration: "none" }}>
                  <s-button type="button" variant="secondary">
                    {t("imageGeneration.chat.download")}
                  </s-button>
                </a>
                <s-button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setTask(null);
                    setErrorText(null);
                  }}
                >
                  {t("imageGeneration.chat.regenerate")}
                </s-button>
              </div>
            </div>
          ) : null}

          {failed ? (
            <div style={{ marginTop: 12, fontSize: 12, color: pageColorTokens.criticalText }}>
              {task?.errorMsg || t("imageGeneration.submitFailed")}
            </div>
          ) : null}

          {showForm ? (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  color: pageColorTokens.textSecondary,
                  background: pageColorTokens.surfaceSubtle,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  borderRadius: 8,
                  padding: "7px 10px",
                  marginBottom: 10,
                }}
              >
                ⏱ {estimateLine}
                {!estimateLoading && (estimatedCredits != null || estimatedSeconds != null) ? (
                  <span style={{ color: pageColorTokens.textFootnote }}>
                    {" "}
                    {t("workspace.taskProposal.card.estimateCalibrated")}
                  </span>
                ) : null}
              </div>
              <s-button
                type="button"
                variant="primary"
                onClick={() => {
                  void handleGenerate();
                }}
                {...(running || !description.trim() ? { disabled: true } : {})}
              >
                {running ? t("imageGeneration.submitting") : t("imageGeneration.submit")}
              </s-button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
