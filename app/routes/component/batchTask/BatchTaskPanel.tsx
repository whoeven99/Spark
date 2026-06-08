/**
 * BatchTaskPanel
 *
 * 三步对话框：
 *   1. select   — 选商品 + 语言设置
 *   2. creating — 提交中（全屏 loading）
 *   3. done     — 结果摘要
 *
 * 支持两种任务类型：
 *   "product_improve"   — 商品描述批量生成
 *   "picture_translate" — 商品图片批量翻译
 */
import { useCallback, useMemo, useState } from "react";
import { Spin } from "antd";
import { useTranslation } from "react-i18next";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import {
  filterPictureTranslateSourceLanguages,
  filterPictureTranslateTargetLanguages,
  selectModelTypeForLanguagePair,
} from "../../../config/pictureTranslateLanguages";
import { ProductSelector } from "../product/ProductSelector";
import { DialogShell } from "../shared/DialogShell";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageSelectStyle,
} from "../../page/pageUiStyles";
import type { BatchAITasksResponse, BatchTaskError } from "../../api.batch-ai-tasks";

const MAX_BATCH = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

export type BatchTaskPanelTaskType = "product_improve" | "picture_translate";

type LocaleOption = { value: string; label: string };

type Props = {
  isOpen: boolean;
  taskType: BatchTaskPanelTaskType;
  locationSearch: string;
  /** For product_improve: locale dropdown options */
  localeOptions?: LocaleOption[];
  /** For product_improve: default target language */
  defaultTargetLanguage?: string;
  onClose: () => void;
  /** Called after successful batch creation */
  onBatchCreated?: (taskIds: string[]) => void;
};

type Step = "select" | "creating" | "done";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  marginBottom: 6,
};

const warnBoxStyle: React.CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.5rem 0.75rem",
  lineHeight: 1.55,
};

const selectedChipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  maxHeight: 80,
  overflowY: "auto",
  padding: "0.25rem 0",
};

function SelectedChip({
  title,
  onRemove,
}: {
  title: string;
  onRemove: () => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: 999,
        padding: "2px 8px",
        maxWidth: 180,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 140,
          display: "inline-block",
        }}
        title={title}
      >
        {title}
      </span>
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          color: pageColorTokens.textFootnote,
          fontSize: 11,
        }}
        aria-label={`移除 ${title}`}
      >
        ×
      </button>
    </span>
  );
}

// ─── Done summary ─────────────────────────────────────────────────────────────

function DoneSummary({
  created,
  errors,
  onClose,
  onViewTasks,
}: {
  created: number;
  errors: BatchTaskError[];
  onClose: () => void;
  onViewTasks?: () => void;
}) {
  const { t } = useTranslation();
  const total = created + errors.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Headline */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "0.75rem 1rem",
          borderRadius: pageColorTokens.radiusControl,
          background:
            created > 0
              ? "rgba(0, 166, 124, 0.06)"
              : pageColorTokens.surfaceMuted,
          border: `1px solid ${created > 0 ? "#00a67c40" : pageColorTokens.borderSubtle}`,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: created > 0 ? "#00a67c" : pageColorTokens.textPrimary,
          }}
        >
          {created > 0
            ? `✓ 已成功创建 ${created}/${total} 个任务`
            : `创建失败`}
        </span>
        {errors.length > 0 && (
          <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {errors.length} 个商品创建失败
          </span>
        )}
      </div>

      {/* Error list */}
      {errors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={sectionLabelStyle}>失败详情</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 160,
              overflowY: "auto",
            }}
          >
            {errors.map((err, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  padding: "0.4rem 0.65rem",
                  borderRadius: 6,
                  background: "#fff5f5",
                  border: "1px solid #fcd5d5",
                  color: pageColorTokens.criticalText,
                  display: "flex",
                  gap: 6,
                }}
              >
                <span style={{ opacity: 0.6 }}>#{err.index + 1}</span>
                <span>{err.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onViewTasks && created > 0 && (
          <button
            type="button"
            onClick={onViewTasks}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: 8,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              background: pageColorTokens.surface,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              color: pageColorTokens.textPrimary,
            }}
          >
            查看任务
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "0.45rem 1rem",
            borderRadius: 8,
            border: "none",
            background: pageColorTokens.brandGreenDark,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          完成
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function BatchTaskPanel({
  isOpen,
  taskType,
  locationSearch,
  localeOptions = [],
  defaultTargetLanguage = "zh-CN",
  onClose,
  onBatchCreated,
}: Props) {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("select");
  const [selectedProducts, setSelectedProducts] = useState<ProductSelectorSelection[]>([]);

  // product_improve fields
  const [targetLanguage, setTargetLanguage] = useState(defaultTargetLanguage);

  // picture_translate fields
  const sourceLanguageOptions = useMemo(() => filterPictureTranslateSourceLanguages(null), []);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const targetLanguageOptions = useMemo(
    () => filterPictureTranslateTargetLanguages({ sourceLanguage, provider: null }),
    [sourceLanguage],
  );
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState("zh");

  // Done state
  const [doneCreated, setDoneCreated] = useState(0);
  const [doneErrors, setDoneErrors] = useState<BatchTaskError[]>([]);

  // Derived
  const productsWithoutImage = useMemo(
    () =>
      taskType === "picture_translate"
        ? selectedProducts.filter((p) => !p.featuredImageUrl)
        : [],
    [selectedProducts, taskType],
  );

  const canSubmit =
    selectedProducts.length > 0 &&
    selectedProducts.length <= MAX_BATCH &&
    (taskType === "product_improve" ||
      (taskType === "picture_translate" &&
        selectedProducts.some((p) => p.featuredImageUrl)));

  function handleClose() {
    if (step === "creating") return;
    // Reset state when closing
    setStep("select");
    setSelectedProducts([]);
    setTargetLanguage(defaultTargetLanguage);
    setSourceLanguage("auto");
    setTranslateTargetLanguage("zh");
    setDoneCreated(0);
    setDoneErrors([]);
    onClose();
  }

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setStep("creating");

    try {
      let body: unknown;
      if (taskType === "product_improve") {
        body = {
          taskType: "product_improve",
          targetLanguage,
          productIds: selectedProducts.map((p) => p.id),
        };
      } else {
        const modelType = selectModelTypeForLanguagePair(sourceLanguage, translateTargetLanguage);
        const items = selectedProducts
          .filter((p) => p.featuredImageUrl)
          .map((p) => ({ productId: p.id, imageUrl: p.featuredImageUrl as string }));
        body = {
          taskType: "picture_translate",
          sourceCode: sourceLanguage,
          targetCode: translateTargetLanguage,
          modelType,
          items,
        };
      }

      const resp = await fetch("/api/batch-ai-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await resp.json()) as BatchAITasksResponse;
      if (json.ok) {
        setDoneCreated(json.created);
        setDoneErrors(json.errors);
        onBatchCreated?.(json.taskIds);
      } else {
        setDoneCreated(0);
        setDoneErrors([{ index: 0, productId: "", error: json.error }]);
      }
    } catch (e) {
      setDoneCreated(0);
      setDoneErrors([
        { index: 0, productId: "", error: e instanceof Error ? e.message : "网络错误" },
      ]);
    }
    setStep("done");
  }, [
    canSubmit,
    taskType,
    targetLanguage,
    sourceLanguage,
    translateTargetLanguage,
    selectedProducts,
    onBatchCreated,
  ]);

  // ── Panel title ────────────────────────────────────────────────────────────
  const panelTitle =
    step === "done"
      ? "批量创建结果"
      : taskType === "product_improve"
        ? "批量生成商品描述"
        : "批量翻译商品图片";

  // ── Language settings section ──────────────────────────────────────────────
  const languageSection =
    taskType === "product_improve" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={sectionLabelStyle}>目标语言</div>
        <select
          style={{ ...pageSelectStyle, width: "100%" }}
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
        >
          {localeOptions.length > 0
            ? localeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : (
                <>
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                  <option value="ko">한국어</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                </>
              )}
        </select>
      </div>
    ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={sectionLabelStyle}>源语言</div>
          <select
            style={{ ...pageSelectStyle, width: "100%" }}
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
          >
            {sourceLanguageOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {t(opt.i18nKey, { defaultValue: opt.code })}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={sectionLabelStyle}>目标语言</div>
          <select
            style={{ ...pageSelectStyle, width: "100%" }}
            value={translateTargetLanguage}
            onChange={(e) => setTranslateTargetLanguage(e.target.value)}
          >
            {targetLanguageOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {t(opt.i18nKey, { defaultValue: opt.code })}
              </option>
            ))}
          </select>
        </div>
      </div>
    );

  // ── Select step body ───────────────────────────────────────────────────────
  const selectBody = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Selected chips */}
      {selectedProducts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={sectionLabelStyle}>
            已选商品（{selectedProducts.length}/{MAX_BATCH}）
          </div>
          <div style={selectedChipRowStyle}>
            {selectedProducts.map((p) => (
              <SelectedChip
                key={p.id}
                title={p.title}
                onRemove={() =>
                  setSelectedProducts((prev) => prev.filter((x) => x.id !== p.id))
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Picture translate: warn products without featured image */}
      {taskType === "picture_translate" && productsWithoutImage.length > 0 && (
        <div style={warnBoxStyle}>
          ⚠️ 以下 {productsWithoutImage.length} 个商品没有主图，将被跳过：
          {productsWithoutImage.map((p) => p.title).join("、")}
        </div>
      )}

      {/* Max limit warning */}
      {selectedProducts.length >= MAX_BATCH && (
        <div style={{ ...warnBoxStyle, color: pageColorTokens.criticalText }}>
          最多批量创建 {MAX_BATCH} 个任务，请减少选择
        </div>
      )}

      {/* Language settings */}
      {languageSection}

      {/* Product selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={sectionLabelStyle}>
          选择商品{" "}
          <span style={{ fontWeight: 400, color: pageColorTokens.textFootnote }}>
            （点击添加到批量列表）
          </span>
        </div>
        <div
          style={{
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            borderRadius: pageColorTokens.radiusControl,
            padding: "0.5rem 0.75rem",
            background: pageColorTokens.surfaceSubtle,
          }}
        >
          <ProductSelector
            locationSearch={locationSearch}
            selectionMode="multiple"
            selectedMultiple={selectedProducts}
            onSelectedMultipleChange={(next) => {
              // Enforce max
              if (next.length > MAX_BATCH) return;
              setSelectedProducts(next);
            }}
            embedded
          />
        </div>
      </div>
    </div>
  );

  // ── Footer ─────────────────────────────────────────────────────────────────
  const selectFooter = (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <button
        type="button"
        onClick={handleClose}
        style={{
          padding: "0.45rem 1rem",
          borderRadius: 8,
          border: `1px solid ${pageColorTokens.borderSubtle}`,
          background: pageColorTokens.surface,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          color: pageColorTokens.textPrimary,
        }}
      >
        取消
      </button>
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
        style={{
          padding: "0.45rem 1.1rem",
          borderRadius: 8,
          border: "none",
          background: canSubmit ? pageColorTokens.brandGreenDark : pageColorTokens.borderSubtle,
          color: canSubmit ? "#fff" : pageColorTokens.textSecondary,
          fontSize: 13,
          fontWeight: 600,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {taskType === "product_improve"
          ? `批量生成（${selectedProducts.length} 个）`
          : `批量翻译（${selectedProducts.filter((p) => p.featuredImageUrl).length} 个）`}
      </button>
    </div>
  );

  return (
    <DialogShell
      open={isOpen}
      onClose={handleClose}
      closeDisabled={step === "creating"}
      width={580}
      title={panelTitle}
      destroyOnHidden={false}
    >
      {step === "creating" ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "2.5rem 1rem",
          }}
        >
          <Spin size="large" />
          <span style={{ fontSize: 14, color: pageColorTokens.textSecondary }}>
            正在批量创建任务，请稍候…
          </span>
        </div>
      ) : step === "done" ? (
        <DoneSummary
          created={doneCreated}
          errors={doneErrors}
          onClose={handleClose}
        />
      ) : (
        <>
          {selectBody}
          <div style={{ marginTop: 16 }}>{selectFooter}</div>
        </>
      )}
    </DialogShell>
  );
}
