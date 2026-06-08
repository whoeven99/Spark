import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useShopifyObjectList } from "../../../hooks/useShopifyObjectList";
import type {
  SelectedShopifyObject,
  ShopifyObjectKind,
  ShopifyObjectSort,
  ShopifyObjectStatusFilter,
} from "../../../lib/shopifyObjectTypes";

type ProductFilter = Extract<ShopifyObjectStatusFilter, "all" | "active" | "draft" | "archived">;
type ArticleFilter = Extract<ShopifyObjectStatusFilter, "all" | "published" | "draft">;

const PRODUCT_FILTERS: Array<{ key: ProductFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

const ARTICLE_FILTERS: Array<{ key: ArticleFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "published", label: "已发布" },
  { key: "draft", label: "草稿" },
];

const SORT_OPTIONS: Array<{ key: ShopifyObjectSort; label: string }> = [
  { key: "updated_desc", label: "最近更新" },
  { key: "title_asc", label: "标题 A-Z" },
];

type Props = {
  kind: ShopifyObjectKind;
  label: string;
  query: string;
  onQueryChange: (value: string) => void;
  selected: SelectedShopifyObject[];
  onToggle: (item: SelectedShopifyObject) => void;
  locationSearch: string;
};

export function WorkspaceContextObjectPicker({
  kind,
  label,
  query,
  onQueryChange,
  selected,
  onToggle,
  locationSearch,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<ShopifyObjectStatusFilter>("all");
  const [sort, setSort] = useState<ShopifyObjectSort>("updated_desc");
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);

  const after = cursors[pageIndex] ?? null;
  const { items, pageInfo, isLoading, errorText } = useShopifyObjectList({
    kind,
    query,
    statusFilter,
    sort,
    after,
    locationSearch,
    enabled: true,
  });

  useEffect(() => {
    setPageIndex(0);
    setCursors([null]);
  }, [kind, query, statusFilter, sort]);

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);
  const filters = kind === "product" ? PRODUCT_FILTERS : ARTICLE_FILTERS;

  const goNext = () => {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return;
    setCursors((current) => {
      const next = current.slice(0, pageIndex + 1);
      next[pageIndex + 1] = pageInfo.endCursor;
      return next;
    });
    setPageIndex((current) => current + 1);
  };

  const goPrev = () => {
    if (pageIndex <= 0) return;
    setPageIndex((current) => current - 1);
  };

  return (
    <div>
      <div style={searchSortRowStyle}>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`搜索${label}`}
          style={searchInputStyle}
        />
        <label style={sortLabelStyle}>
          <span style={sortCaptionStyle}>排序</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ShopifyObjectSort)}
            style={sortSelectStyle}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={filterChipRowStyle}>
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            style={filterChipStyle(statusFilter === filter.key)}
            onClick={() => setStatusFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div style={statusRowStyle}>
        <span style={hintTextStyle}>已连接 Shopify 实时数据，可搜索、筛选并将目标对象直接传给 AI</span>
        <span style={countTextStyle}>已选 {selected.length} 个</span>
      </div>

      {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}

      <div style={listStyle}>
        {isLoading && items.length === 0 ? (
          <div style={loadingStyle}>正在加载{label}…</div>
        ) : null}
        {!isLoading && items.length === 0 ? (
          <div style={emptyStyle}>暂无匹配的{label}</div>
        ) : null}
        {items.map((item) => {
          const checked = selectedIds.has(item.id);
          return (
            <label key={item.id} style={itemCardStyle(checked)}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle({ id: item.id, title: item.title, imageUrl: item.imageUrl ?? null })}
              />
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" style={thumbStyle} />
              ) : (
                <div style={thumbPlaceholderStyle}>{label.slice(0, 1)}</div>
              )}
              <div style={itemContentStyle}>
                <div style={itemTitleRowStyle}>
                  <span style={itemTitleStyle}>{item.title}</span>
                  <span style={statusBadgeStyle(item.statusTone)}>{item.statusLabel}</span>
                </div>
                <span style={itemSubtitleStyle}>{item.subtitle}</span>
                <span style={itemMetaStyle}>{item.meta}</span>
              </div>
            </label>
          );
        })}
      </div>

      <div style={paginationRowStyle}>
        <button type="button" style={ghostButtonStyle} onClick={goPrev} disabled={pageIndex <= 0 || isLoading}>
          上一页
        </button>
        <span style={pageIndicatorStyle}>第 {pageIndex + 1} 页</span>
        <button
          type="button"
          style={ghostButtonStyle}
          onClick={goNext}
          disabled={!pageInfo.hasNextPage || isLoading}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

const searchSortRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 150px",
  gap: 10,
  alignItems: "end",
};
const searchInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "#202223",
  background: "#ffffff",
};
const sortLabelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const sortCaptionStyle: CSSProperties = { fontSize: 12, color: "#6d7175" };
const sortSelectStyle: CSSProperties = {
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "#202223",
  background: "#ffffff",
};
const filterChipRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const filterChipStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? "#c9cccf" : "#c9cdd2"}`,
  borderRadius: 999,
  background: active ? "#202223" : "#ffffff",
  color: active ? "#ffffff" : "#202223",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});
const statusRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 12,
};
const hintTextStyle: CSSProperties = { fontSize: 12, color: "#6d7175", lineHeight: 1.5, flex: 1 };
const countTextStyle: CSSProperties = { fontSize: 12, color: "#202223", fontWeight: 600, flexShrink: 0 };
const errorBoxStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#fff0ee",
  border: "1px solid #f2b8ae",
  color: "#8f2f1f",
  fontSize: 13,
};
const listStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
  maxHeight: 320,
  overflowY: "auto",
};
const loadingStyle: CSSProperties = { padding: "24px 12px", textAlign: "center", color: "#6d7175", fontSize: 13 };
const emptyStyle: CSSProperties = { padding: "24px 12px", textAlign: "center", color: "#6d7175", fontSize: 13 };
const itemCardStyle = (checked: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "auto 44px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${checked ? "#c9cccf" : "#e1e3e5"}`,
  background: checked ? "#ffffff" : "#f6f6f7",
  cursor: "pointer",
});
const thumbStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 8,
  objectFit: "cover",
  background: "#eceff3",
};
const thumbPlaceholderStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "#eceff3",
  color: "#6d7175",
  fontSize: 14,
  fontWeight: 700,
};
const itemContentStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
const itemTitleRowStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 8 };
const itemTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#202223",
  lineHeight: 1.45,
  flex: 1,
};
const statusBadgeStyle = (tone: "positive" | "neutral" | "warning"): CSSProperties => ({
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  flexShrink: 0,
  color: tone === "positive" ? "#0f5132" : tone === "warning" ? "#9a5b00" : "#475467",
  background: tone === "positive" ? "#e9f7ef" : tone === "warning" ? "#fff7e0" : "#f1f2f4",
});
const itemSubtitleStyle: CSSProperties = { fontSize: 12, color: "#6d7175", lineHeight: 1.4 };
const itemMetaStyle: CSSProperties = { fontSize: 12, color: "#8c9196" };
const paginationRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 10,
  marginTop: 14,
};
const pageIndicatorStyle: CSSProperties = { fontSize: 12, color: "#6d7175" };
const ghostButtonStyle: CSSProperties = {
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  background: "#ffffff",
  color: "#202223",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
