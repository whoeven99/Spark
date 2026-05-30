import { useMemo, useState } from "react";
import { Alert, Checkbox, Empty, Input, Spin } from "antd";
import { useTranslation } from "react-i18next";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import { useProductSearch } from "../../../hooks/useProductSearch";

type BaseProps = {
  locationSearch: string;
  /** 嵌套在聊天卡片内时收紧列表高度与间距 */
  embedded?: boolean;
};

type SingleModeProps = BaseProps & {
  selectionMode?: "single" | undefined;
  selected: ProductSelectorSelection | null;
  onSelectedChange: (next: ProductSelectorSelection | null) => void;
};

type MultipleModeProps = BaseProps & {
  selectionMode: "multiple";
  selectedMultiple: ProductSelectorSelection[];
  onSelectedMultipleChange: (next: ProductSelectorSelection[]) => void;
};

export type ProductSelectorProps = SingleModeProps | MultipleModeProps;

function isMultipleProps(p: ProductSelectorProps): p is MultipleModeProps {
  return p.selectionMode === "multiple";
}

export function ProductSelector(props: ProductSelectorProps) {
  const { t } = useTranslation();
  const { locationSearch, embedded = false } = props;
  const [keyword, setKeyword] = useState("");
  const { items, isLoading, errorText: searchError } = useProductSearch({
    input: keyword,
    locationSearch,
  });

  const selectedIds = useMemo(() => {
    if (isMultipleProps(props)) {
      return new Set(props.selectedMultiple.map((p) => p.id));
    }
    const s = props.selected;
    return s ? new Set([s.id]) : new Set<string>();
  }, [props]);

  const toggleSingle = (row: ProductSelectorSelection) => {
    if (isMultipleProps(props)) return;
    const cur = props.selected;
    if (cur?.id === row.id) props.onSelectedChange(null);
    else props.onSelectedChange(row);
  };

  const toggleMultiple = (row: ProductSelectorSelection) => {
    if (!isMultipleProps(props)) return;
    const cur = props.selectedMultiple;
    const exists = cur.some((p) => p.id === row.id);
    if (exists) {
      props.onSelectedMultipleChange(cur.filter((p) => p.id !== row.id));
    } else {
      props.onSelectedMultipleChange([...cur, row]);
    }
  };

  const onRowActivate = (row: ProductSelectorSelection) => {
    if (isMultipleProps(props)) toggleMultiple(row);
    else toggleSingle(row);
  };

  const listMaxHeight = embedded ? 200 : 280;
  const kw = keyword.trim();

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="product-selector-search"
          className="mb-2 block text-xs font-semibold tracking-[0.01em] text-app-text-secondary"
        >
          {t("productSelector.searchLabel")}
        </label>
        <Input
          id="product-selector-search"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        autoComplete="off"
        placeholder={t("productSelector.searchPlaceholder")}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-1 py-1 text-sm text-app-text-secondary">
          <Spin size="small" />
          {t("productSelector.searching")}
        </div>
      ) : null}

      {searchError ? <Alert type="error" showIcon message={searchError} /> : null}

      {!isLoading && !searchError && kw && items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          className="spark-ant-empty rounded-app-control border border-dashed border-app-subtle bg-app-subtle py-6"
          description={t("productSelector.empty")}
        />
      ) : null}

      {items.length > 0 ? (
        <ul
          className="overflow-y-auto rounded-app-control border border-app-subtle bg-app-card"
          style={{ maxHeight: listMaxHeight }}
        >
          {items.map((row) => {
            const active = selectedIds.has(row.id);
            return (
              <li key={row.id} className="m-0 list-none p-0">
                <button
                  type="button"
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 border-b border-app-divider text-left transition-colors last:border-b-0 ${
                    embedded ? "px-3 py-2" : "px-3.5 py-2.5"
                  } ${active ? "border-l-4 border-l-app-primary bg-app-primary-subtle" : "border-l-4 border-l-transparent bg-app-card hover:bg-app-subtle"}`}
                  onClick={() => onRowActivate(row)}
                >
                  <Checkbox
                    checked={active}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onRowActivate(row)}
                    aria-label={t("productSelector.selectAria", { title: row.title })}
                  />

                  {row.featuredImageUrl ? (
                    <img
                      src={row.featuredImageUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-md bg-app-muted" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-app-text-primary">
                      {row.title}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-app-text-secondary">
                      {row.id}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
