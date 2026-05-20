import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import { useProductSearch } from "../../../hooks/useProductSearch";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CriticalErrorBox } from "../shared/CriticalErrorBox";

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

function isMultipleProps(
  p: ProductSelectorProps,
): p is MultipleModeProps {
  return p.selectionMode === "multiple";
}

const emptyBoxStyle: CSSProperties = {
  padding: "0.75rem 0.65rem",
  borderRadius: "8px",
  background: pageColorTokens.mutedBg,
  color: pageColorTokens.textSecondary,
  fontSize: "0.8125rem",
  lineHeight: 1.45,
  textAlign: "center",
};

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

  const listMaxHeight = embedded ? "200px" : "280px";
  const kw = keyword.trim();

  return (
    <s-stack direction="block" gap="small">
      <s-text-field
        label={t("productSelector.searchLabel")}
        value={keyword}
        onChange={(e) => setKeyword(e.currentTarget.value)}
        autocomplete="off"
        placeholder={t("productSelector.searchPlaceholder")}
      />

      {isLoading ? (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "#6d7175",
            padding: "0.25rem 0",
          }}
        >
          {t("productSelector.searching")}
        </div>
      ) : null}

      {searchError ? <CriticalErrorBox>{searchError}</CriticalErrorBox> : null}

      {!isLoading && !searchError && kw && items.length === 0 ? (
        <div style={emptyBoxStyle}>{t("productSelector.empty")}</div>
      ) : null}

      {items.length > 0 ? (
        <ul
          style={{
            maxHeight: listMaxHeight,
            overflowY: "auto",
            borderRadius: "10px",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            background: "#fff",
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {items.map((row) => {
            const active = selectedIds.has(row.id);
            return (
              <li key={row.id} style={{ margin: 0, padding: 0 }}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    width: "100%",
                    margin: 0,
                    padding: embedded ? "0.45rem 0.55rem" : "0.55rem 0.65rem",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
                    borderLeft: active
                      ? "3px solid #2c6ecb"
                      : "3px solid transparent",
                    background: active
                      ? "rgba(44, 110, 203, 0.08)"
                      : "transparent",
                    boxSizing: "border-box",
                  }}
                  onClick={() => onRowActivate(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowActivate(row);
                    }
                  }}
                >
                {isMultipleProps(props) ? (
                  <input
                    type="checkbox"
                    checked={active}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleMultiple(row)}
                    aria-label={t("productSelector.selectAria", { title: row.title })}
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={active}
                    readOnly
                    tabIndex={-1}
                    aria-label={t("productSelector.selectAria", { title: row.title })}
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {row.featuredImageUrl ? (
                  <img
                    src={row.featuredImageUrl}
                    alt=""
                    width={40}
                    height={40}
                    style={{
                      borderRadius: "6px",
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "6px",
                      background: "rgba(109, 113, 117, 0.12)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div
                  style={{
                    minWidth: 0,
                    flex: 1,
                    fontSize: "0.875rem",
                    color: "#202223",
                    lineHeight: 1.35,
                  }}
                >
                  <div>{row.title}</div>
                  <div
                    style={{
                      marginTop: "0.1rem",
                      fontSize: "0.75rem",
                      color: "#6d7175",
                    }}
                  >
                    {row.id}
                  </div>
                </div>
              </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </s-stack>
  );
}
