import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import {
  coerceTranslationTaskFormPayload,
  getTargetLocalesFromPayload,
  type TranslationTaskFormPayload,
} from "../../../lib/translationTaskFormPayload";
import { createTranslationV4Tasks } from "../../../lib/createTranslationV4Tasks";
import {
  formatCreateTasksToast,
  resolveValidationErrorMessage,
} from "../../../lib/translationCreateFeedback";
import { useShopLocales } from "../../../hooks/useShopLocales";
import { TranslationLocaleFields } from "./TranslationLocaleFields";
import { TranslationModuleMultiSelect } from "./TranslationModuleMultiSelect";

type Props = {
  initialPayload: TranslationTaskFormPayload;
  onSuccess: (detail: {
    jobId?: string;
    jobIds?: string[];
    message: string;
  }) => void;
  /** 嵌在助手气泡内时略收紧边距与阴影 */
  embedded?: boolean;
};

export function TranslationTaskChatCard({
  initialPayload,
  onSuccess,
  embedded = false,
}: Props) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const safeInitial = coerceTranslationTaskFormPayload(initialPayload);
  const initialTargets = getTargetLocalesFromPayload(safeInitial);
  const [limitPerType, setLimitPerType] = useState(safeInitial.limitPerType);
  const [resourceTypes, setResourceTypes] = useState<string[]>(safeInitial.resourceTypes);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const search =
    typeof window !== "undefined" ? window.location.search : "";

  const {
    sourceLocale,
    sourceLabel,
    targetLocales,
    setTargetLocales,
    targetOptions,
    loading: localesLoading,
    isFallback: localesIsFallback,
  } = useShopLocales({
    locationSearch: search,
    initialShopLocales: null,
    initialTargetLocale: safeInitial.targetLocale,
    initialTargetLocales: initialTargets,
    selectionMode: "multiple",
  });

  useEffect(() => {
    const p = coerceTranslationTaskFormPayload(initialPayload);
    setLimitPerType(p.limitPerType);
    setResourceTypes(p.resourceTypes);
    const targets = getTargetLocalesFromPayload(p);
    if (targets.length) {
      setTargetLocales(targets);
    }
  }, [initialPayload, setTargetLocales]);

  const handleCreate = async () => {
    const source = sourceLocale.trim();
    if (!source) {
      shopify.toast.show(t("common.loadingLanguage"));
      return;
    }
    if (!resourceTypes.length) {
      shopify.toast.show(t("translationRuntime.validationModule"));
      return;
    }

    const parsedLimit = Math.floor(Number(limitPerType));
    const limit = isNaN(parsedLimit) || parsedLimit < 0 ? 20 : parsedLimit;

    setIsSubmitting(true);
    try {
      const result = await createTranslationV4Tasks({
        search,
        source,
        targets: targetLocales,
        modules: resourceTypes,
        limitPerType: limit,
        targetOptions,
      });

      if (result.validationError) {
        shopify.toast.show(resolveValidationErrorMessage(result.validationError, t));
        return;
      }

      const toast = formatCreateTasksToast(result, t);
      if (toast) {
        shopify.toast.show(toast);
      }

      if (!result.created.length) {
        const err = result.failed[0]?.error ?? t("translation.createFailedRetry");
        shopify.toast.show(err);
        return;
      }

      const jobIds = result.created.map((c) => c.jobId);
      const message = toast ?? t("translationRuntime.createSuccess");
      onSuccess({
        jobId: jobIds[0],
        jobIds,
        message,
      });
    } catch {
      shopify.toast.show(t("chat.sendFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const shellStyle: CSSProperties = {
    marginTop: embedded ? 0 : "0.5rem",
    borderRadius: embedded ? "14px" : "16px",
    padding: "1px",
    background:
      "linear-gradient(135deg, rgba(44, 110, 203, 0.38) 0%, rgba(0, 128, 96, 0.28) 50%, rgba(147, 112, 219, 0.22) 100%)",
    boxShadow: embedded
      ? "0 2px 12px rgba(0, 0, 0, 0.05)"
      : "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
  };

  const innerStyle: CSSProperties = {
    borderRadius: embedded ? "13px" : "15px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbfb 100%)",
    overflow: "visible",
  };

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
              {t("translationRuntime.createTaskTitle")}
            </div>
            <div
              style={{
                marginTop: "0.35rem",
                fontSize: "0.8125rem",
                color: "#6d7175",
                lineHeight: 1.45,
              }}
            >
              {t("translationRuntime.createTaskDesc")}
            </div>
          </div>

          <div style={{ marginBottom: "0.85rem" }}>
            <TranslationLocaleFields
              sourceLocale={sourceLocale}
              sourceLabel={sourceLabel}
              selectionMode="multiple"
              targetLocales={targetLocales}
              onTargetLocalesChange={setTargetLocales}
              targetOptions={targetOptions}
              loading={localesLoading}
              disabled={isSubmitting}
              localesIsFallback={localesIsFallback}
              targetFieldId="translation-chat-target-locale"
            />
          </div>

          <div style={{ marginBottom: "0.85rem" }}>
            <s-text-field
              label={t("translationRuntime.limitPerModule")}
              value={String(limitPerType)}
              onChange={(e) =>
                { const v = parseInt(e.currentTarget.value, 10); setLimitPerType(isNaN(v) || v < 0 ? 20 : v); }
              }
              autocomplete="off"
            />
          </div>

          <div style={{ marginBottom: "0.65rem" }}>
            <TranslationModuleMultiSelect
              id="translation-chat-modules"
              values={resourceTypes}
              onChange={setResourceTypes}
              disabled={isSubmitting}
            />
          </div>

          <s-stack direction="block" gap="small">
            <div style={primaryBtnStyle}>
              <s-button
                type="button"
                variant="primary"
                onClick={handleCreate}
                {...(isSubmitting || localesLoading ? { disabled: true } : {})}
              >
                {isSubmitting ? t("translation.creating") : t("translation.createAction")}
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
                to={`/app/translation-v4${search}`}
                style={{ color: "#2c6ecb", fontWeight: 500 }}
              >
                {t("translationRuntime.openTaskPage")}
              </Link>
            </div>
          </s-stack>
        </div>
      </div>
    </div>
  );
}
