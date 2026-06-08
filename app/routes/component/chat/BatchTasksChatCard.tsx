/**
 * BatchTasksChatCard
 *
 * AI 在聊天里触发批量任务意图后展示的确认卡片。
 * 用户核对商品列表 + 语言设置后，点击确认一键创建所有任务。
 *
 * 支持两种任务类型：
 *   product_improve   — 商品描述批量生成
 *   picture_translate — 商品图片文字批量翻译
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BatchTaskProduct, BatchTasksFormPayload } from "../../../lib/batchTasksFormPayload";
import { mergeBatchTasksPayloadWithContext } from "../../../lib/batchTasksFormPayload";
import {
  filterPictureTranslateSourceLanguages,
  filterPictureTranslateTargetLanguages,
  selectModelTypeForLanguagePair,
} from "../../../config/pictureTranslateLanguages";
import type { BatchAITasksResponse } from "../../api.batch-ai-tasks";
import { pageColorTokens } from "../../page/pageUiStyles";

// ─── Styles (inline, no tailwind dependency) ─────────────────────────────────

const cardStyle = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 12,
  background: pageColorTokens.surface,
  overflow: "hidden",
  fontSize: 13,
} as const;

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
} as const;

const bodyStyle = {
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
} as const;

const productListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 220,
  overflowY: "auto",
} as const;

const productRowStyle = (checked: boolean) =>
  ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    borderRadius: 8,
    border: `1px solid ${checked ? "#c9cccf" : pageColorTokens.borderSubtle}`,
    background: checked ? "#fff" : pageColorTokens.surfaceSubtle,
    cursor: "pointer",
  }) as const;

const thumbStyle = {
  width: 36,
  height: 36,
  borderRadius: 6,
  objectFit: "cover" as const,
  background: pageColorTokens.surfaceMuted,
  flexShrink: 0,
} as const;

const thumbPlaceholderStyle = {
  width: 36,
  height: 36,
  borderRadius: 6,
  background: pageColorTokens.surfaceMuted,
  display: "grid",
  placeItems: "center",
  fontSize: 11,
  color: pageColorTokens.textFootnote,
  flexShrink: 0,
} as const;

const langRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
} as const;

const langLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  marginBottom: 4,
} as const;

const selectStyle = {
  width: "100%",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  background: "#fff",
  color: pageColorTokens.textPrimary,
} as const;

const warnBoxStyle = {
  fontSize: 12,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 8,
  padding: "7px 10px",
} as const;

const footerStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "10px 14px",
  borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
} as const;

const confirmBtnStyle = (disabled: boolean) =>
  ({
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    background: disabled ? pageColorTokens.borderSubtle : pageColorTokens.brandGreenDark,
    color: disabled ? pageColorTokens.textSecondary : "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  }) as const;

// ─── Done state ───────────────────────────────────────────────────────────────

function DoneState({
  created,
  total,
  errors,
}: {
  created: number;
  total: number;
  errors: Array<{ index: number; productId: string; error: string }>;
}) {
  return (
    <div style={{ padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: created > 0 ? "rgba(0,166,124,0.06)" : pageColorTokens.surfaceMuted,
          border: `1px solid ${created > 0 ? "#00a67c40" : pageColorTokens.borderSubtle}`,
          color: created > 0 ? "#00a67c" : pageColorTokens.textPrimary,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {created > 0
          ? `✓ 已成功创建 ${created}/${total} 个任务`
          : "任务创建失败"}
      </div>
      {errors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {errors.slice(0, 3).map((e, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: pageColorTokens.criticalText,
                padding: "4px 8px",
                borderRadius: 6,
                background: "#fff5f5",
                border: "1px solid #fcd5d5",
              }}
            >
              {e.error}
            </div>
          ))}
          {errors.length > 3 && (
            <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
              还有 {errors.length - 3} 个失败
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

type Props = {
  embedded?: boolean;
  initialPayload?: BatchTasksFormPayload;
  /** 工作台已选商品；AI payload 为空时用于补全列表 */
  contextProducts?: BatchTaskProduct[];
  onTasksCreated?: (taskIds: string[]) => void;
};

export function BatchTasksChatCard({
  embedded = false,
  initialPayload,
  contextProducts = [],
  onTasksCreated,
}: Props) {
  const { t } = useTranslation();

  const resolvedPayload = useMemo(
    () =>
      mergeBatchTasksPayloadWithContext(
        initialPayload ?? {
          taskType: "product_improve",
          products: [],
          targetLanguage: "en",
          sourceLanguage: "auto",
        },
        contextProducts,
      ),
    [initialPayload, contextProducts],
  );

  const taskType = resolvedPayload.taskType;
  const initProducts = resolvedPayload.products;

  // Checked product ids
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(initProducts.map((p) => p.id)),
  );

  useEffect(() => {
    if (initProducts.length === 0) return;
    setCheckedIds(new Set(initProducts.map((p) => p.id)));
  }, [initProducts]);

  const toggleProduct = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Language state
  const [targetLanguage, setTargetLanguage] = useState(
    resolvedPayload.targetLanguage ?? (taskType === "picture_translate" ? "zh" : "en"),
  );
  const [sourceLanguage, setSourceLanguage] = useState(
    resolvedPayload.sourceLanguage ?? "auto",
  );

  const sourceLanguageOptions = useMemo(() => filterPictureTranslateSourceLanguages(null), []);
  const targetLanguageOptions = useMemo(
    () => filterPictureTranslateTargetLanguages({ sourceLanguage, provider: null }),
    [sourceLanguage],
  );

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [doneCreated, setDoneCreated] = useState(0);
  const [doneErrors, setDoneErrors] = useState<
    Array<{ index: number; productId: string; error: string }>
  >([]);

  const selectedProducts = initProducts.filter((p) => checkedIds.has(p.id));

  const productsWithoutImage = useMemo(
    () =>
      taskType === "picture_translate"
        ? selectedProducts.filter((p) => !p.imageUrl)
        : [],
    [taskType, selectedProducts],
  );

  const effectiveProducts =
    taskType === "picture_translate"
      ? selectedProducts.filter((p) => p.imageUrl)
      : selectedProducts;

  const canSubmit = effectiveProducts.length > 0 && !submitting && !done;

  const handleConfirm = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let body: unknown;
      if (taskType === "product_improve") {
        body = {
          taskType: "product_improve",
          targetLanguage,
          productIds: effectiveProducts.map((p) => p.id),
        };
      } else {
        const modelType = selectModelTypeForLanguagePair(sourceLanguage, targetLanguage);
        body = {
          taskType: "picture_translate",
          sourceCode: sourceLanguage,
          targetCode: targetLanguage,
          modelType,
          items: effectiveProducts.map((p) => ({
            productId: p.id,
            imageUrl: p.imageUrl as string,
          })),
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
        onTasksCreated?.(json.taskIds);
      } else {
        setDoneCreated(0);
        setDoneErrors([{ index: 0, productId: "", error: json.error }]);
      }
    } catch (e) {
      setDoneCreated(0);
      setDoneErrors([
        { index: 0, productId: "", error: e instanceof Error ? e.message : "网络错误" },
      ]);
    } finally {
      setSubmitting(false);
      setDone(true);
    }
  }, [canSubmit, taskType, targetLanguage, sourceLanguage, effectiveProducts, onTasksCreated]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const typeLabel =
    taskType === "product_improve" ? "批量生成商品描述" : "批量翻译商品图片";
  const typeBadgeColor = taskType === "product_improve" ? "#4070f4" : "#7c3aed";

  return (
    <div style={{ ...cardStyle, maxWidth: embedded ? 480 : 560 }}>
      {/* Header */}
      <div style={headerStyle}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: typeBadgeColor,
            color: "#fff",
          }}
        >
          {typeLabel}
        </span>
        <span style={{ fontSize: 12, color: pageColorTokens.textSecondary, flex: 1 }}>
          {done ? "已提交" : `${initProducts.length} 个商品 · 点击确认批量创建`}
        </span>
      </div>

      {/* Done state */}
      {done ? (
        <DoneState
          created={doneCreated}
          total={effectiveProducts.length}
          errors={doneErrors}
        />
      ) : (
        <>
          {/* Body */}
          <div style={bodyStyle as React.CSSProperties}>
            {/* Product list */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: pageColorTokens.textSecondary, marginBottom: 6 }}>
                已选商品（{checkedIds.size} / {initProducts.length}）
              </div>
              <div style={productListStyle as React.CSSProperties}>
                {initProducts.map((p) => {
                  const checked = checkedIds.has(p.id);
                  return (
                    <label key={p.id} style={productRowStyle(checked)}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(p.id)}
                        style={{ flexShrink: 0 }}
                      />
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" style={thumbStyle} />
                      ) : (
                        <div style={thumbPlaceholderStyle}>商品</div>
                      )}
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 12,
                          fontWeight: 600,
                          color: pageColorTokens.textPrimary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.title}
                      </span>
                      {taskType === "picture_translate" && !p.imageUrl && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#92400e",
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            borderRadius: 4,
                            padding: "1px 5px",
                            flexShrink: 0,
                          }}
                        >
                          无图
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Warning for products without image */}
            {productsWithoutImage.length > 0 && (
              <div style={warnBoxStyle}>
                ⚠️ {productsWithoutImage.length} 个商品没有主图，将被跳过
              </div>
            )}

            {/* Language settings */}
            {taskType === "product_improve" ? (
              <div>
                <div style={langLabelStyle}>目标语言</div>
                <select
                  style={selectStyle}
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                >
                  {[
                    { value: "en", label: "English" },
                    { value: "zh-CN", label: "简体中文" },
                    { value: "zh-TW", label: "繁體中文" },
                    { value: "ja", label: "日本語" },
                    { value: "ko", label: "한국어" },
                    { value: "de", label: "Deutsch" },
                    { value: "fr", label: "Français" },
                    { value: "es", label: "Español" },
                    { value: "pt", label: "Português" },
                  ].map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={langRowStyle}>
                <div>
                  <div style={langLabelStyle}>源语言</div>
                  <select
                    style={selectStyle}
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
                <div>
                  <div style={langLabelStyle}>目标语言</div>
                  <select
                    style={selectStyle}
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                  >
                    {targetLanguageOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {t(opt.i18nKey, { defaultValue: opt.code })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={footerStyle}>
            <span style={{ fontSize: 12, color: pageColorTokens.textFootnote, alignSelf: "center", flex: 1 }}>
              {taskType === "picture_translate" && effectiveProducts.length === 0
                ? "没有可用图片的商品"
                : `将创建 ${effectiveProducts.length} 个任务`}
            </span>
            <button
              type="button"
              disabled={!canSubmit}
              style={confirmBtnStyle(!canSubmit)}
              onClick={() => void handleConfirm()}
            >
              {submitting ? "创建中…" : `确认创建 ${effectiveProducts.length} 个任务`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
