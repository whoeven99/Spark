import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  coerceProductImportSheetPreview,
  isProductImportSheetPreviewBlocked,
  type ProductImportSheetPreview,
} from "../../../lib/productImportSheetPreview";
import type { ProductImportOperation } from "../../../lib/productImport";
import {
  ProductImportSheetPreviewView,
  type ProductImportSheetPreviewDensity,
} from "./ProductImportSheetPreviewView";

export type ProductImportPreviewGate = {
  loading: boolean;
  blocked: boolean;
  reasonKey?: string;
};

const IDLE_GATE: ProductImportPreviewGate = { loading: false, blocked: false };
const LOADING_GATE: ProductImportPreviewGate = { loading: true, blocked: true };

type Props = {
  fileId: string;
  operations: string;
  density?: ProductImportSheetPreviewDensity;
  onGateChange: (gate: ProductImportPreviewGate) => void;
  onPreviewChange?: (preview: ProductImportSheetPreview | null) => void;
  onDetectedOperations?: (operations: ProductImportOperation[]) => void;
};

export function ProductImportProposalPreview({
  fileId,
  operations,
  density = "compact",
  onGateChange,
  onPreviewChange,
  onDetectedOperations,
}: Props) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<ProductImportSheetPreview | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const gateRef = useRef<ProductImportPreviewGate>(IDLE_GATE);

  useEffect(() => {
    const emit = (next: ProductImportPreviewGate) => {
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
          if (operations.trim()) params.set("operations", operations.trim());
          const response = await fetch(`/api/product-import/preview?${params.toString()}`, {
            cache: "no-store",
          });
          const body = (await response.json()) as {
            ok?: boolean;
            error?: string;
            preview?: unknown;
          };
          if (cancelled) return;
          if (!response.ok || !body.ok) {
            const reasonKey = `productImport.sheetPreview.error.${body.error ?? "parse_failed"}`;
            setPreview(null);
            setErrorKey(reasonKey);
            emit({ loading: false, blocked: true, reasonKey });
            return;
          }
          const next = coerceProductImportSheetPreview(body.preview);
          if (!next) {
            const reasonKey = "productImport.sheetPreview.error.parse_failed";
            setPreview(null);
            setErrorKey(reasonKey);
            emit({ loading: false, blocked: true, reasonKey });
            return;
          }
          setPreview(next);
          setErrorKey(null);
          if (isProductImportSheetPreviewBlocked(next) && next.blockedReason) {
            emit({
              loading: false,
              blocked: true,
              reasonKey: `productImport.sheetPreview.block.${next.blockedReason}`,
            });
            return;
          }
          if (!operations.trim() && next.detectedOperations.length > 0) {
            onDetectedOperations?.(next.detectedOperations);
          }
          emit({ loading: false, blocked: false });
        } catch {
          if (cancelled) return;
          const reasonKey = "productImport.sheetPreview.error.parse_failed";
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
  }, [fileId, operations, onGateChange, onDetectedOperations]);

  useEffect(() => {
    if (!fileId.trim()) {
      onPreviewChange?.(null);
      return;
    }
    onPreviewChange?.(preview);
  }, [fileId, preview, onPreviewChange]);

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
        {t("productImport.sheetPreview.loading")}
      </div>
    );
  }
  if (errorKey) {
    return (
      <div style={{ fontSize: 12, color: pageColorTokens.criticalText }}>{t(errorKey)}</div>
    );
  }
  if (!preview) return null;
  return <ProductImportSheetPreviewView preview={preview} density={density} />;
}
