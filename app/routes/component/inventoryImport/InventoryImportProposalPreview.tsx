import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  coerceInventoryImportSheetPreview,
  isInventoryImportSheetPreviewBlocked,
  type InventoryImportSheetPreview,
} from "../../../lib/inventoryImportSheetPreview";
import { InventoryImportSheetPreviewView } from "./InventoryImportSheetPreviewView";

export type InventoryImportPreviewGate = {
  loading: boolean;
  blocked: boolean;
  reasonKey?: string;
};

const IDLE_GATE: InventoryImportPreviewGate = { loading: false, blocked: false };
const LOADING_GATE: InventoryImportPreviewGate = { loading: true, blocked: true };

type Props = {
  fileId: string;
  onGateChange: (gate: InventoryImportPreviewGate) => void;
};

export function InventoryImportProposalPreview({ fileId, onGateChange }: Props) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<InventoryImportSheetPreview | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const gateRef = useRef<InventoryImportPreviewGate>(IDLE_GATE);

  useEffect(() => {
    const emit = (next: InventoryImportPreviewGate) => {
      gateRef.current = next;
      onGateChange(next);
    };
    if (!fileId.trim()) {
      setPreview(null);
      setErrorKey(null);
      emit(IDLE_GATE);
      return;
    }
    let cancelled = false;
    emit(LOADING_GATE);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams(
            typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "",
          );
          params.set("fileId", fileId.trim());
          const response = await fetch(`/api/inventory-import/preview?${params.toString()}`, {
            cache: "no-store",
          });
          const body = (await response.json()) as {
            ok?: boolean;
            error?: string;
            preview?: unknown;
          };
          if (cancelled) return;
          if (!response.ok || !body.ok) {
            const reasonKey = `inventoryImport.sheetPreview.error.${body.error ?? "parse_failed"}`;
            setPreview(null);
            setErrorKey(reasonKey);
            emit({ loading: false, blocked: true, reasonKey });
            return;
          }
          const next = coerceInventoryImportSheetPreview(body.preview);
          if (!next) {
            const reasonKey = "inventoryImport.sheetPreview.error.parse_failed";
            setPreview(null);
            setErrorKey(reasonKey);
            emit({ loading: false, blocked: true, reasonKey });
            return;
          }
          setPreview(next);
          setErrorKey(null);
          if (isInventoryImportSheetPreviewBlocked(next) && next.blockedReason) {
            emit({
              loading: false,
              blocked: true,
              reasonKey: `inventoryImport.sheetPreview.block.${next.blockedReason}`,
            });
            return;
          }
          emit({ loading: false, blocked: false });
        } catch {
          if (cancelled) return;
          const reasonKey = "inventoryImport.sheetPreview.error.parse_failed";
          setPreview(null);
          setErrorKey(reasonKey);
          emit({ loading: false, blocked: true, reasonKey });
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fileId, onGateChange]);

  useEffect(
    () => () => {
      if (gateRef.current !== IDLE_GATE) onGateChange(IDLE_GATE);
    },
    [onGateChange],
  );

  if (!fileId.trim()) return null;
  if (!preview && !errorKey) {
    return (
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
        {t("inventoryImport.sheetPreview.loading")}
      </div>
    );
  }
  if (errorKey) {
    return (
      <div style={{ fontSize: 12, color: pageColorTokens.criticalText }}>{t(errorKey)}</div>
    );
  }
  if (!preview) return null;
  return <InventoryImportSheetPreviewView preview={preview} />;
}
