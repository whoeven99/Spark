import { useAppBridge } from "@shopify/app-bridge-react";
import type { PictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import { PictureTranslateForm } from "../pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../pictureTranslate/pictureTranslateContext";
import { PictureTranslateShell } from "../pictureTranslate/PictureTranslateShell";

type PictureTranslateChatCardProps = {
  embedded?: boolean;
  initialFormPayload?: PictureTranslateFormPayload;
  onTaskCreated?: (taskId: string, batchId: string) => void;
};

export function PictureTranslateChatCard({
  embedded = false,
  initialFormPayload,
  onTaskCreated,
}: PictureTranslateChatCardProps) {
  const shopify = useAppBridge();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  return (
    <PictureTranslateProvider
      mode="card"
      locationSearch={locationSearch}
      initialFormPayload={initialFormPayload}
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
