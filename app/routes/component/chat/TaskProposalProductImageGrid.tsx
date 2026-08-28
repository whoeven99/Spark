/**
 * TaskProposal 图片翻译：商品下行内嵌缩略图多选网格。
 * - 右上角圆圈：勾选 / 取消
 * - 点击图片：弹窗预览大图
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { DialogShell } from "../shared/DialogShell";

export type ProductImageOption = {
  url: string;
  altText: string | null;
};

type ProductImagesCacheEntry =
  | { status: "loading" }
  | { status: "ready"; images: ProductImageOption[]; featuredImageUrl: string | null }
  | { status: "error"; message: string };

type Props = {
  productId: string;
  /** 商品主图（缺省勾选） */
  fallbackImageUrl?: string | null;
  selectedUrls: string[];
  cache: ProductImagesCacheEntry | undefined;
  onCacheUpdate: (productId: string, entry: ProductImagesCacheEntry) => void;
  onChangeSelected: (productId: string, urls: string[]) => void;
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
  gap: 6,
  marginTop: 8,
  marginLeft: 28,
} as const;

const cellStyle = (active: boolean) =>
  ({
    position: "relative" as const,
    width: "100%",
    aspectRatio: "1",
    borderRadius: 8,
    overflow: "hidden",
    border: `2px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
    background: pageColorTokens.surfaceMuted,
  }) as const;

const imageButtonStyle = {
  display: "block",
  width: "100%",
  height: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "zoom-in",
} as const;

const checkButtonStyle = (active: boolean) =>
  ({
    position: "absolute" as const,
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 999,
    border: active ? `1.5px solid ${pageColorTokens.brandGreen}` : "1.5px solid #ffffff",
    background: active ? pageColorTokens.brandGreen : "rgba(15, 23, 42, 0.28)",
    boxShadow: active ? "none" : "0 0 0 1px rgba(15, 23, 42, 0.18)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    lineHeight: 1,
    padding: 0,
    cursor: "pointer",
    zIndex: 1,
  }) as const;

export function TaskProposalProductImageGrid({
  productId,
  fallbackImageUrl,
  selectedUrls,
  cache,
  onCacheUpdate,
  onChangeSelected,
}: Props) {
  const { t } = useTranslation();
  const requestedRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (cache?.status === "ready" || cache?.status === "error") return;
    if (requestedRef.current === productId) return;
    requestedRef.current = productId;
    onCacheUpdate(productId, { status: "loading" });

    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search.slice(1) : "",
    );
    params.set("id", productId);
    const ac = new AbortController();

    void (async () => {
      try {
        const res = await fetch(`/api/product-images?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        const json = (await res.json().catch(() => null)) as
          | {
              success: true;
              response: {
                images: ProductImageOption[];
                featuredImageUrl: string | null;
              };
            }
          | { success: false; errorMsg?: string }
          | null;
        if (ac.signal.aborted) return;
        if (!res.ok || !json || json.success !== true) {
          onCacheUpdate(productId, {
            status: "error",
            message:
              json && json.success === false && json.errorMsg
                ? json.errorMsg
                : t("workspace.taskProposal.card.imagesLoadFailed"),
          });
          return;
        }
        const images = json.response.images ?? [];
        const featuredImageUrl =
          json.response.featuredImageUrl ?? fallbackImageUrl ?? images[0]?.url ?? null;
        onCacheUpdate(productId, {
          status: "ready",
          images,
          featuredImageUrl,
        });
        // 首次加载且尚未勾选任何图：默认勾主图
        if (selectedUrls.length === 0 && featuredImageUrl) {
          onChangeSelected(productId, [featuredImageUrl]);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        onCacheUpdate(productId, {
          status: "error",
          message: t("workspace.taskProposal.card.imagesLoadFailed"),
        });
      }
    })();

    return () => {
      ac.abort();
      if (requestedRef.current === productId) requestedRef.current = null;
    };
    // 仅在商品首次展开时拉图；selectedUrls 变化不重拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (!cache || cache.status === "loading") {
    return (
      <div style={{ ...gridStyle, color: pageColorTokens.textFootnote, fontSize: 11 }}>
        {t("workspace.taskProposal.card.imagesLoading")}
      </div>
    );
  }

  if (cache.status === "error") {
    return (
      <div style={{ ...gridStyle, color: "#92400e", fontSize: 11 }}>{cache.message}</div>
    );
  }

  if (cache.images.length === 0) {
    return (
      <div style={{ ...gridStyle, color: pageColorTokens.textFootnote, fontSize: 11 }}>
        {t("workspace.taskProposal.card.imagesEmpty")}
      </div>
    );
  }

  const selectedSet = new Set(selectedUrls);
  const toggleUrl = (url: string) => {
    const next = new Set(selectedUrls);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    onChangeSelected(productId, Array.from(next));
  };

  return (
    <>
      <div style={gridStyle} role="group" aria-label={t("workspace.taskProposal.card.selectImages")}>
        {cache.images.map((image) => {
          const active = selectedSet.has(image.url);
          return (
            <div key={image.url} style={cellStyle(active)}>
              <button
                type="button"
                style={imageButtonStyle}
                title={t("workspace.taskProposal.card.imagePreviewHint")}
                aria-label={t("workspace.taskProposal.card.imagePreviewAria", {
                  alt: image.altText?.trim() || t("workspace.taskProposal.card.imageUntitled"),
                })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPreviewUrl(image.url);
                }}
              >
                <img
                  src={image.url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </button>
              <button
                type="button"
                role="checkbox"
                aria-checked={active}
                aria-label={
                  active
                    ? t("workspace.taskProposal.card.imageDeselectAria")
                    : t("workspace.taskProposal.card.imageSelectAria")
                }
                style={checkButtonStyle(active)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleUrl(image.url);
                }}
              >
                {active ? "✓" : null}
              </button>
            </div>
          );
        })}
      </div>

      <DialogShell
        open={Boolean(previewUrl)}
        onClose={() => setPreviewUrl(null)}
        width={720}
        title={t("workspace.taskProposal.card.imagePreviewTitle")}
        destroyOnHidden
      >
        {previewUrl ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              background: pageColorTokens.surfaceMuted,
              borderRadius: 8,
              overflow: "hidden",
              minHeight: 240,
            }}
          >
            <img
              src={previewUrl}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "min(70vh, 560px)",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>
        ) : null}
      </DialogShell>
    </>
  );
}

export type { ProductImagesCacheEntry };
