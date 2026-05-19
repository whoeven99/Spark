import { useAppBridge } from "@shopify/app-bridge-react";
import { PictureTranslateForm } from "../pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../pictureTranslate/pictureTranslateContext";
import { PictureTranslateShell } from "../pictureTranslate/PictureTranslateShell";

type PictureTranslateChatCardProps = {
  embedded?: boolean;
  onSuccess: (detail: { translatedImage: string; message: string }) => void;
};

export function PictureTranslateChatCard({
  embedded = false,
  onSuccess,
}: PictureTranslateChatCardProps) {
  const shopify = useAppBridge();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  return (
    <PictureTranslateProvider
      mode="card"
      locationSearch={locationSearch}
      toastShow={(message) => {
        shopify.toast.show(message);
      }}
      onSuccess={onSuccess}
    >
      <PictureTranslateShell embedded={embedded}>
        <PictureTranslateForm variant="card" embedded={embedded} />
      </PictureTranslateShell>
    </PictureTranslateProvider>
  );
}
