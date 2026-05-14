import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import type { loader } from "../app.translation";
import { JsonRuntimeTaskStatusPanel } from "../component/translation/JsonRuntimeTaskStatusPanel";
import { TranslationMonitorCard } from "../component/translation/TranslationMonitorCard";
import { ALLOWED_TRANSLATABLE_RESOURCE_TYPES } from "../../server/translation/types";

const RESOURCE_TYPE_OPTIONS = ALLOWED_TRANSLATABLE_RESOURCE_TYPES;

export function TranslationPage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const [targetLocale, setTargetLocale] = useState(loaderData.defaults.targetLocale);
  const [sourceLocale, setSourceLocale] = useState(loaderData.defaults.sourceLocale);
  const [limitPerType, setLimitPerType] = useState(loaderData.defaults.limitPerType);
  const [resourceTypes, setResourceTypes] = useState<string[]>(
    loaderData.defaults.resourceTypes,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setTargetLocale(loaderData.defaults.targetLocale);
    setSourceLocale(loaderData.defaults.sourceLocale);
    setLimitPerType(loaderData.defaults.limitPerType);
    setResourceTypes(loaderData.defaults.resourceTypes);
  }, [loaderData.defaults]);

  const handleToggleResourceType = (type: string) => {
    setResourceTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type],
    );
  };

  const handleCreateJob = async () => {
    const query = typeof window !== "undefined" ? window.location.search : "";
    if (!targetLocale.trim()) {
      shopify.toast.show(t("translation.validationTargetLocale"));
      return;
    }
    if (!resourceTypes.length) {
      shopify.toast.show(t("translation.validationResourceTypes"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/app/translation${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_job",
          targetLocale,
          sourceLocale,
          resourceTypes,
          limitPerType,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      // 兼容部分情况下 payload.ok 缺失但响应 2xx 的场景，避免误报“创建失败(200)”。
      if (!response.ok || payload.ok === false) {
        shopify.toast.show(payload.error || t("translation.createFailed", { status: response.status }));
        return;
      }
      shopify.toast.show(payload.message || t("translation.createSuccess"));
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch {
      shopify.toast.show(t("translation.createFailedRetry"));
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <s-page heading={t("translation.pageTitle")}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1.5rem",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <s-stack direction="block" gap="large">
            <s-section heading={t("translation.createSectionTitle")}>
              <s-stack direction="block" gap="base">
                <s-text-field
                  label={t("translation.targetLocale")}
                  value={targetLocale}
                  onChange={(event) => setTargetLocale(event.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("translation.sourceLocale")}
                  value={sourceLocale}
                  onChange={(event) => setSourceLocale(event.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("translation.limitPerType")}
                  value={String(limitPerType)}
                  onChange={(event) => setLimitPerType(Number(event.currentTarget.value) || 20)}
                  autocomplete="off"
                />
                <s-stack direction="inline" gap="small">
                  {RESOURCE_TYPE_OPTIONS.map((type) => (
                    <s-button
                      key={type}
                      type="button"
                      variant={resourceTypes.includes(type) ? "primary" : "secondary"}
                      onClick={() => handleToggleResourceType(type)}
                    >
                      {type}
                    </s-button>
                  ))}
                </s-stack>
                <div>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleCreateJob}
                    {...(isSubmitting ? { disabled: true } : {})}
                  >
                    {isSubmitting ? t("translation.creating") : t("translation.createAction")}
                  </s-button>
                </div>
              </s-stack>
            </s-section>

            <s-section heading={t("translation.runtimeSectionTitle")}>
              <JsonRuntimeTaskStatusPanel defaultShopName={loaderData.shop} />
            </s-section>
          </s-stack>
        </div>

        <div
          style={{
            flex: "0 1 400px",
            width: "100%",
            maxWidth: 440,
            position: "sticky",
            top: "1rem",
            alignSelf: "flex-start",
          }}
        >
          <TranslationMonitorCard defaultShopName={loaderData.shop} />
        </div>
      </div>
    </s-page>
  );
}
