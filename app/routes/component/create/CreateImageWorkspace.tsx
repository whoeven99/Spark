import { useEffect, useState } from "react";
import { Alert, Button, Empty, Input, Select, Spin } from "antd";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useImageGeneration } from "../../../hooks/useImageGeneration";
import { usePictureTranslate } from "../../../hooks/usePictureTranslate";
import { useEmbeddedLocationSearch } from "../../../hooks/useEmbeddedLocationSearch";
import type { AITaskItem } from "../../../lib/aiTaskTypes";
import type { loader } from "../../app.create";
import {
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
} from "../../page/pageUiStyles";
import { CreateConfirmDialog } from "./CreateConfirmDialog";
import { CreateOperationShell } from "./CreateOperationShell";
import { useCreateAiTaskPoll } from "./useCreateAiTaskPoll";
import { useCreateEstimationRows } from "./useCreateEstimationRows";

export type CreateImageMode = "generate" | "translate";

function readResultImageUrl(task: AITaskItem | null): string | null {
  const value = task?.result?.imageUrl;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string, max = 60): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function CreateImageResult({
  task,
  pollFailed,
  runningText,
}: {
  task: AITaskItem | null;
  pollFailed: boolean;
  runningText: string;
}) {
  const { t } = useTranslation();
  const imageUrl = readResultImageUrl(task);

  if (!task) {
    return (
      <Empty className="spark-ant-empty py-10" description={t("createPage.image.resultEmpty")} />
    );
  }

  if (task.status === "failed") {
    return (
      <Alert type="error" showIcon message={task.errorMsg || t("createPage.image.failed")} />
    );
  }

  if (imageUrl) {
    return (
      <div className="flex flex-col gap-3">
        <img
          src={imageUrl}
          alt={t("createPage.image.resultAlt")}
          className="max-h-[520px] w-full rounded-xl border object-contain"
          style={{
            borderColor: pageColorTokens.border,
            background: pageColorTokens.surfaceMuted,
          }}
        />
        <div>
          <Button onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}>
            {t("createPage.image.openImage")}
          </Button>
        </div>
      </div>
    );
  }

  if (task.status === "running") {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3">
        <Spin />
        <p className="m-0 text-sm" style={{ color: pageColorTokens.textSecondary }}>
          {runningText}
        </p>
        {pollFailed ? (
          <p className="m-0 text-xs" style={{ color: pageColorTokens.textFootnote }}>
            {t("createPage.image.pollFailed")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Empty className="spark-ant-empty py-10" description={t("createPage.image.resultEmpty")} />
  );
}

function GenerateView({ onBack }: { onBack: () => void }) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();
  const { estimations } = useLoaderData<typeof loader>();
  const buildEstimationRows = useCreateEstimationRows();
  const poll = useCreateAiTaskPoll(locationSearch);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const imageGen = useImageGeneration({
    locationSearch,
    toastShow: (message) => shopify.toast.show(message),
    onTaskCreated: (taskId, batchId, taskType, config) => {
      poll.startWatching(taskId, { batchId, taskType, config });
    },
  });

  function handleRequestGenerate() {
    if (!imageGen.prepareSubmit()) return;
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setConfirmOpen(false);
    await imageGen.submitGenerate();
  }

  const config = (
    <PageSurface
      title={t("createPage.image.generateTitle")}
      subtitle={t("createPage.image.generateSubtitle")}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="create-image-prompt" style={pageFieldLabelStyle}>
            {t("createPage.image.promptLabel")}
          </label>
          <Input.TextArea
            id="create-image-prompt"
            value={imageGen.description}
            autoSize={{ minRows: 5, maxRows: 10 }}
            placeholder={t("createPage.image.promptPlaceholder")}
            disabled={imageGen.isSubmitting}
            onChange={(event) => imageGen.setDescription(event.target.value)}
          />
        </div>
        {imageGen.descriptionErrorText ? (
          <div style={formErrorBoxStyle}>{imageGen.descriptionErrorText}</div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="primary"
            loading={imageGen.isSubmitting}
            onClick={handleRequestGenerate}
          >
            {imageGen.isSubmitting
              ? t("createPage.image.generating")
              : t("createPage.image.generateAction")}
          </Button>
          {poll.task ? (
            <Button disabled={imageGen.isSubmitting} onClick={poll.clear}>
              {t("createPage.image.newRound")}
            </Button>
          ) : null}
        </div>
      </div>
    </PageSurface>
  );

  const result = (
    <PageSurface
      title={t("createPage.image.resultTitle")}
      subtitle={t("createPage.image.generateResultHint")}
    >
      <CreateImageResult
        task={poll.task}
        pollFailed={poll.pollFailed}
        runningText={t("createPage.image.generating")}
      />
    </PageSurface>
  );

  return (
    <>
      <CreateOperationShell kind="generate" onBack={onBack} config={config} result={result} />
      <CreateConfirmDialog
        open={confirmOpen}
        title={t("createPage.image.generateConfirmTitle")}
        goal={t("createPage.image.generateConfirmGoal")}
        rows={[
          {
            label: t("createPage.image.promptLabel"),
            value: truncate(imageGen.description),
          },
          ...buildEstimationRows(estimations.imageGeneration),
        ]}
        confirmLabel={t("createPage.image.generateAction")}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function TranslateView({ onBack }: { onBack: () => void }) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();
  const { estimations } = useLoaderData<typeof loader>();
  const buildEstimationRows = useCreateEstimationRows();
  const poll = useCreateAiTaskPoll(locationSearch);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const picture = usePictureTranslate({
    locationSearch,
    toastShow: (message) => shopify.toast.show(message),
    mode: "page",
    onTaskCreated: (taskId, batchId, taskType, config) => {
      poll.startWatching(taskId, { batchId, taskType, config });
    },
  });

  // hook 默认从「上传」起步，但本页只支持商品图与链接两种来源。
  const { selectedSource, setSelectedSource } = picture;
  useEffect(() => {
    if (selectedSource === "upload") setSelectedSource("product");
  }, [selectedSource, setSelectedSource]);

  function handleRequestTranslate() {
    if (!picture.prepareSubmit()) return;
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setConfirmOpen(false);
    await picture.submitTranslate();
  }

  const sourceSummary =
    picture.selectedSource === "product"
      ? picture.selectedProduct?.title || truncate(picture.imageUrl)
      : truncate(picture.imageUrl);

  function sourceButtonStyle(active: boolean) {
    return active
      ? {
          borderColor: pageColorTokens.brandBlue,
          background: pageColorTokens.brandBlueLight,
          color: pageColorTokens.brandBlueDark,
        }
      : undefined;
  }

  const config = (
    <PageSurface
      title={t("createPage.image.translateTitle")}
      subtitle={t("createPage.image.translateSubtitle")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setSelectedSource("product")}
            style={sourceButtonStyle(picture.selectedSource === "product")}
          >
            {t("createPage.image.sourceProduct")}
          </Button>
          <Button
            onClick={() => setSelectedSource("url")}
            style={sourceButtonStyle(picture.selectedSource === "url")}
          >
            {t("createPage.image.sourceUrl")}
          </Button>
        </div>

        {picture.selectedSource === "url" ? (
          <div>
            <label htmlFor="create-image-url" style={pageFieldLabelStyle}>
              {t("createPage.image.urlLabel")}
            </label>
            <Input
              id="create-image-url"
              value={picture.imageUrl}
              placeholder={t("createPage.image.urlPlaceholder")}
              onChange={(event) => picture.setImageUrl(event.target.value)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                value={picture.productKeyword}
                placeholder={t("createPage.image.productSearch")}
                onChange={(event) => picture.setProductKeyword(event.target.value)}
                onPressEnter={picture.executeSearch}
              />
              <Button onClick={picture.executeSearch}>{t("createPage.image.search")}</Button>
            </div>
            {picture.productSearchError ? (
              <Alert type="error" showIcon message={picture.productSearchError} />
            ) : null}
            {picture.isProductSearching ? (
              <div className="flex justify-center py-6">
                <Spin />
              </div>
            ) : (
              <div className="flex max-h-52 flex-col gap-1 overflow-auto">
                {picture.productItems.map((product) => {
                  const active = picture.selectedProduct?.id === product.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className="rounded-lg border px-3 py-2 text-left text-sm"
                      style={{
                        borderColor: active
                          ? pageColorTokens.brandBlue
                          : pageColorTokens.border,
                        background: active
                          ? pageColorTokens.brandBlueLight
                          : pageColorTokens.surface,
                        color: pageColorTokens.textPrimary,
                      }}
                      onClick={() => picture.handleProductSelect(product)}
                    >
                      {product.title}
                    </button>
                  );
                })}
              </div>
            )}
            {picture.selectedProduct ? (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
              >
                {picture.selectedProduct.images.map((image) => {
                  const active = picture.selectedImage?.url === image.url;
                  return (
                    <button
                      key={image.url}
                      type="button"
                      className="overflow-hidden rounded-lg border p-0"
                      style={{
                        borderColor: active
                          ? pageColorTokens.brandBlue
                          : pageColorTokens.border,
                      }}
                      onClick={() => picture.handleProductImageSelect(image)}
                    >
                      <img
                        src={image.url}
                        alt={image.altText ?? picture.selectedProduct?.title ?? ""}
                        className="h-20 w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="create-image-source-lang" style={pageFieldLabelStyle}>
              {t("createPage.image.sourceLanguage")}
            </label>
            <Select
              id="create-image-source-lang"
              className="w-full"
              value={picture.sourceLanguage}
              options={picture.sourceLanguageOptions}
              onChange={picture.setSourceLanguage}
            />
          </div>
          <div>
            <label htmlFor="create-image-target-lang" style={pageFieldLabelStyle}>
              {t("createPage.image.targetLanguage")}
            </label>
            <Select
              id="create-image-target-lang"
              className="w-full"
              value={picture.targetLanguage}
              options={picture.targetLanguageOptions}
              onChange={picture.setTargetLanguage}
            />
          </div>
        </div>

        {picture.formErrorText ? (
          <div style={formErrorBoxStyle}>{picture.formErrorText}</div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="primary"
            loading={picture.isSubmitting}
            onClick={handleRequestTranslate}
          >
            {picture.isSubmitting
              ? t("createPage.image.translating")
              : t("createPage.image.translateAction")}
          </Button>
          {poll.task ? (
            <Button disabled={picture.isSubmitting} onClick={poll.clear}>
              {t("createPage.image.newRound")}
            </Button>
          ) : null}
        </div>
      </div>
    </PageSurface>
  );

  const result = (
    <PageSurface
      title={t("createPage.image.resultTitle")}
      subtitle={t("createPage.image.translateResultHint")}
    >
      <CreateImageResult
        task={poll.task}
        pollFailed={poll.pollFailed}
        runningText={t("createPage.image.translating")}
      />
    </PageSurface>
  );

  return (
    <>
      <CreateOperationShell kind="generate" onBack={onBack} config={config} result={result} />
      <CreateConfirmDialog
        open={confirmOpen}
        title={t("createPage.image.translateConfirmTitle")}
        goal={t("createPage.image.translateConfirmGoal")}
        rows={[
          { label: t("createPage.image.confirmSource"), value: sourceSummary },
          {
            label: t("createPage.image.confirmLanguages"),
            value: `${picture.sourceLanguage} → ${picture.targetLanguage}`,
          },
          ...buildEstimationRows(estimations.pictureTranslate),
        ]}
        confirmLabel={t("createPage.image.translateAction")}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

export function CreateImageWorkspace({
  mode,
  onBack,
}: {
  mode: CreateImageMode;
  onBack: () => void;
}) {
  return mode === "generate" ? <GenerateView onBack={onBack} /> : <TranslateView onBack={onBack} />;
}
