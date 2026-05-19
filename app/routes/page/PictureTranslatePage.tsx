import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { PictureTranslateResultPanel } from "../component/pictureTranslate/PictureTranslateResultPanel";

export function PictureTranslatePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    console.info("[PictureTranslatePage] mount");
  }, []);

  return (
    <PictureTranslateProvider
      mode="page"
      locationSearch={locationSearch}
      toastShow={(message) => {
        shopify.toast.show(message);
      }}
    >
      <s-page heading={t("pictureTranslate.pageTitle")}>
        <div
          style={{
            fontSize: "0.875rem",
            color: "#6d7175",
            lineHeight: 1.5,
            padding: "1rem 1.25rem",
            background: "linear-gradient(to right, rgba(138, 5, 255, 0.03), rgba(0, 158, 122, 0.03))",
            borderLeft: "3px solid #8a05ff",
            borderRadius: "0 8px 8px 0",
            marginBottom: "1.5rem"
          }}
        >
          {t("pictureTranslate.pageSubtitle")}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1.5rem",
            alignItems: "flex-start",
          }}
        >
        <div style={{ flex: "2 1 360px", minWidth: 0 }}>
          <div style={{
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderRadius: "12px",
            padding: "1.5rem",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)"
          }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0d0d0d" }}>
                {t("pictureTranslate.sectionConfig")}
              </div>
            </div>
            <PictureTranslateForm variant="page" />
          </div>
        </div>

        <div style={{ flex: "3 1 480px", minWidth: 0 }}>
          <div style={{
            background: "#ffffff",
            border: "1px solid #e3e3e3",
            borderRadius: "12px",
            padding: "1.5rem",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)"
          }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0d0d0d" }}>
                {t("pictureTranslate.result")}
              </div>
            </div>
            <PictureTranslateResultPanel />
          </div>
        </div>
        </div>
      </s-page>
    </PictureTranslateProvider>
  );
}
