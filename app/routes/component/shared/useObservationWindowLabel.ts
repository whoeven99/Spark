import { useTranslation } from "react-i18next";
import {
  formatCompleteUtcWindowParts,
  type ObservationWindowView,
} from "../../../lib/observationWindow";

export function useObservationWindowLabel(
  window: ObservationWindowView | null | undefined,
  kind: "7d" | "30d" = "7d",
): string | null {
  const { t, i18n } = useTranslation();
  if (!window) return null;
  const parts = formatCompleteUtcWindowParts(window, i18n.language);
  return t(kind === "30d" ? "observationWindow.range30d" : "observationWindow.range7d", parts);
}
