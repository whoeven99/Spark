import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useMemo } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import type { ShopVisualJobHistoryItem } from "../../lib/shopVisualJobTypes";
import type { ImageStudioPageLoaderData } from "../../server/visualTools/imageStudioPageLoader.server";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
import { ImageGenerationResultPanel } from "../component/imageGeneration/ImageGenerationResultPanel";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { PictureTranslateResultPanel } from "../component/pictureTranslate/PictureTranslateResultPanel";
import { usePictureTranslateContext } from "../component/pictureTranslate/pictureTranslateContext";
import type { VisualToolsTab } from "../component/visualTools/VisualToolsTabBar";
import { VisualToolsTabBar } from "../component/visualTools/VisualToolsTabBar";
import { UnifiedVisualHistoryPanel } from "../component/visualTools/UnifiedVisualHistoryPanel";
import {
  PageSectionHeader,
  PageSurface,
  pageContentStyle,
  pageTrustFootnoteStyle,
  stickyAsideColumnStyle,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  twoColumnSideStyle,
} from "./pageUiStyles";

function parseTab(value: string | null): VisualToolsTab {
  return value === "translate" ? "translate" : "generate";
}

function ImageStudioPageInner() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<ImageStudioPageLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  const setActiveTab = useCallback(
    (tab: VisualToolsTab) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const toastShow = useCallback(
    (message: string) => {
      shopify.toast.show(message);
    },
    [shopify],
  );

  const imageGen = useImageGeneration({
    locationSearch,
    initialHistory: loaderData.imageHistory,
    toastShow,
  });

  const translate = usePictureTranslateContext();

  const unifiedHistory = useMemo(() => {
    const merged: ShopVisualJobHistoryItem[] = [
      ...imageGen.history,
      ...translate.history,
    ];
    return merged
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 16);
  }, [imageGen.history, translate.history]);

  const activeRequestId =
    activeTab === "translate" ? translate.requestId : imageGen.requestId;

  const handleHistorySelect = useCallback(
    (item: ShopVisualJobHistoryItem) => {
      if (item.kind === "picture_translate") {
        setActiveTab("translate");
        translate.selectHistoryItem(item);
        return;
      }
      setActiveTab("generate");
      imageGen.selectHistoryItem(item);
    },
    [imageGen, setActiveTab, translate],
  );

  const handleHistoryDelete = useCallback(
    (item: ShopVisualJobHistoryItem) => {
      if (item.kind === "picture_translate") {
        void translate.deleteHistoryItem(item);
        return;
      }
      void imageGen.deleteHistoryItem(item);
    },
    [imageGen, translate],
  );

  const deletingRequestId =
    imageGen.deletingRequestId ?? translate.deletingRequestId;

  const sectionSubtitle =
    activeTab === "translate"
      ? t("pictureTranslate.pageSubtitle")
      : t("imageGeneration.pageSubtitle");

  const resultTitle =
    activeTab === "translate"
      ? t("pictureTranslate.result")
      : t("imageGeneration.result");

  return (
    <s-page heading={t("imageStudio.pageTitle")}>
      <div style={pageContentStyle}>
        <PageSectionHeader
          title={t("imageStudio.sectionTitle")}
          subtitle={t("imageStudio.pageSubtitle")}
        />

        <VisualToolsTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        <div style={twoColumnLayoutStyle}>
          <div style={twoColumnMainStyle}>
            <PageSurface
              title={
                activeTab === "translate"
                  ? t("pictureTranslate.sectionConfig")
                  : t("imageGeneration.sectionConfig")
              }
              subtitle={sectionSubtitle}
            >
              {activeTab === "generate" ? (
                <ImageGenerationForm
                  description={imageGen.description}
                  onDescriptionChange={imageGen.setDescription}
                  descriptionErrorText={imageGen.descriptionErrorText}
                  busy={imageGen.busy}
                  isSubmitting={imageGen.isSubmitting || imageGen.isPolling}
                  onGenerateImage={() => void imageGen.submitGenerate()}
                />
              ) : (
                <PictureTranslateForm variant="page" />
              )}
            </PageSurface>

            <PageSurface title={t("imageStudio.historyTitle")}>
              <UnifiedVisualHistoryPanel
                items={unifiedHistory}
                activeRequestId={activeRequestId}
                activeTab={activeTab}
                onSelect={handleHistorySelect}
                onDelete={handleHistoryDelete}
                deletingRequestId={deletingRequestId}
              />
            </PageSurface>
          </div>

          <div style={{ ...twoColumnSideStyle, ...stickyAsideColumnStyle }}>
            <PageSurface title={resultTitle}>
              {activeTab === "generate" ? (
                <ImageGenerationResultPanel
                  isSubmitting={imageGen.isSubmitting}
                  isPolling={imageGen.isPolling}
                  hasSubmittedOnce={imageGen.hasSubmittedOnce}
                  resultErrorText={imageGen.resultErrorText}
                  generatedImageUrl={imageGen.generatedImageUrl}
                  onRetry={imageGen.resetResult}
                />
              ) : (
                <PictureTranslateResultPanel />
              )}
            </PageSurface>
          </div>
        </div>

        <p style={pageTrustFootnoteStyle}>
          {activeTab === "translate"
            ? t("pictureTranslate.pageFootnote")
            : t("imageGeneration.pageFootnote")}
        </p>
      </div>
    </s-page>
  );
}

export function ImageStudioPage() {
  const loaderData = useLoaderData<ImageStudioPageLoaderData>();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";
  const shopify = useAppBridge();

  return (
    <PictureTranslateProvider
      mode="page"
      locationSearch={locationSearch}
      initialHistory={loaderData.translateHistory}
      toastShow={(message) => {
        shopify.toast.show(message);
      }}
    >
      <ImageStudioPageInner />
    </PictureTranslateProvider>
  );
}
