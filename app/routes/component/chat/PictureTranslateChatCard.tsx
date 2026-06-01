import { useAppBridge } from "@shopify/app-bridge-react";
import { PictureTranslateForm } from "../pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../pictureTranslate/pictureTranslateContext";
import { PictureTranslateShell } from "../pictureTranslate/PictureTranslateShell";

type PictureTranslateChatCardProps = {
  embedded?: boolean;
  onTaskCreated?: (taskId: string, batchId: string) => void;
};

export function PictureTranslateChatCard({
  embedded = false,
  onTaskCreated,
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
      onTaskCreated={onTaskCreated}
    >
      <PictureTranslateShell embedded={embedded}>
        <PictureTranslateForm variant="card" embedded={embedded} />
      </PictureTranslateShell>
    </PictureTranslateProvider>
  );
}
