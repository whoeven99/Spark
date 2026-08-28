/**
 * ObjectQueryBuilder — 「按条件圈定对象」构建器（阶段 2）。
 *
 * 与逐个勾选互补：用户设定筛选条件（关键词/状态/标签/库存上限），
 * 实时预览匹配数与首页结果，保存的是条件本身而非 ID 快照——
 * 执行（含后续 Playbook 定时执行）时按条件重新求值。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShopifyObjectList } from "../../../hooks/useShopifyObjectList";
import type { ObjectQuerySelection, ObjectQueryStatus } from "../../../lib/objectQuerySpec";
import { describeObjectQueryI18n } from "../../../lib/objectQuerySpec";
import {
  shopifyObjectMetaText,
  shopifyObjectTitle,
  translatePickerError,
} from "../../../lib/shopifyObjectDisplay";
import type { QueryableObjectType } from "./types";
import {
  compactFieldStyle,
  filterChipRowStyle,
  filterChipStyle,
  ghostButtonStyle,
  inlineFieldRowStyle,
  mutedMetaStyle,
  pickerInfoBoxStyle,
  primaryButtonStyle,
  resourcePickerHintStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  selectorItemContentStyle,
  selectorListCompactStyle,
  selectorSearchInputStyle,
} from "./styles";

const PRODUCT_STATUS_CHIPS: ObjectQueryStatus[] = ["all", "active", "draft", "archived"];
const ARTICLE_STATUS_CHIPS: ObjectQueryStatus[] = ["all", "published", "draft"];
const PICKER = "workspace.shell.contextPicker";

export function ObjectQueryBuilder({
  type,
  selection,
  onSave,
  onClear,
  locationSearch,
}: {
  type: QueryableObjectType;
  /** 已保存的圈定条件（编辑时回填） */
  selection: ObjectQuerySelection | null;
  onSave: (selection: ObjectQuerySelection) => void;
  onClear: () => void;
  locationSearch: string;
}) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState(selection?.keyword ?? "");
  const [status, setStatus] = useState<ObjectQueryStatus>(selection?.status ?? "all");
  const [tag, setTag] = useState(selection?.tag ?? "");
  const [maxInventoryText, setMaxInventoryText] = useState(
    selection?.maxInventory != null ? String(selection.maxInventory) : "",
  );

  const maxInventory =
    type === "product" && /^\d+$/.test(maxInventoryText.trim())
      ? Number(maxInventoryText.trim())
      : null;

  const { items, isLoading, errorText, count } = useShopifyObjectList({
    kind: type,
    query: keyword,
    statusFilter: status === "all" ? "all" : status,
    sort: "updated_desc",
    after: null,
    locationSearch,
    enabled: true,
    tag: type === "product" ? tag : undefined,
    maxInventory,
    withCount: true,
  });

  const statusChips = type === "product" ? PRODUCT_STATUS_CHIPS : ARTICLE_STATUS_CHIPS;
  const kindLabel =
    type === "product" ? t(`${PICKER}.kindProduct`) : t(`${PICKER}.kindArticle`);
  const listError = translatePickerError(errorText, t);
  const chipLabel = (key: ObjectQueryStatus) =>
    key === "all" ? t(`${PICKER}.filterAll`) : t(`${PICKER}.status.${key}`);
  const matchLabel = isLoading
    ? t(`${PICKER}.computing`)
    : count != null
      ? t(`${PICKER}.matchCount`, { count })
      : items.length > 0
        ? t(`${PICKER}.matchCountPlus`, { count: items.length })
        : t(`${PICKER}.noMatch`);

  const currentSpec: ObjectQuerySelection = {
    kind: type,
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(type === "product" && tag.trim() ? { tag: tag.trim() } : {}),
    ...(type === "product" && maxInventory != null ? { maxInventory } : {}),
    matchCount: count,
  };

  return (
    <div>
      <div style={pickerInfoBoxStyle("neutral")}>
        {t(`${PICKER}.queryHint`)}
      </div>

      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder={t(`${PICKER}.keywordPlaceholder`, { kind: kindLabel })}
        style={{ ...selectorSearchInputStyle, marginTop: 10 }}
      />

      <div style={filterChipRowStyle}>
        {statusChips.map((chip) => (
          <button
            key={chip}
            type="button"
            style={filterChipStyle(status === chip)}
            onClick={() => setStatus(chip)}
          >
            {chipLabel(chip)}
          </button>
        ))}
      </div>

      {type === "product" ? (
        <div style={{ ...inlineFieldRowStyle, marginTop: 10 }}>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder={t(`${PICKER}.tagPlaceholder`)}
            style={compactFieldStyle}
          />
          <input
            value={maxInventoryText}
            onChange={(event) => setMaxInventoryText(event.target.value.replace(/[^\d]/g, ""))}
            placeholder={t(`${PICKER}.maxInventoryPlaceholder`)}
            inputMode="numeric"
            style={compactFieldStyle}
          />
        </div>
      ) : null}

      <div style={resourcePickerHintStyle}>
        <span style={mutedMetaStyle}>{describeObjectQueryI18n(currentSpec, t)}</span>
        <span style={{ ...mutedMetaStyle, fontWeight: 700, flexShrink: 0 }}>
          {matchLabel}
        </span>
      </div>

      <div style={{ ...selectorListCompactStyle, maxHeight: 220 }}>
        {listError ? <div style={pickerInfoBoxStyle("critical")}>{listError}</div> : null}
        {!listError && isLoading && items.length === 0 ? (
          <div style={pickerInfoBoxStyle("neutral")}>{t(`${PICKER}.loadingPreview`)}</div>
        ) : null}
        {!listError && !isLoading && items.length === 0 ? (
          <div style={pickerInfoBoxStyle("neutral")}>
            {t(`${PICKER}.emptyQuery`, { kind: kindLabel })}
          </div>
        ) : null}
        {!listError &&
          items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid #e1e3e5",
                background: "#f6f6f7",
              }}
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                />
              ) : null}
              <div style={selectorItemContentStyle}>
                <span style={sectionTitleSmallStyle}>{shopifyObjectTitle(item, type, t)}</span>
                <span style={mutedMetaStyle}>{shopifyObjectMetaText(item, t)}</span>
              </div>
            </div>
          ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12 }}>
        <span style={sectionTextStyle}>
          {selection
            ? t(`${PICKER}.savedQuery`, { description: describeObjectQueryI18n(selection, t) })
            : t(`${PICKER}.unsavedQuery`)}
        </span>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {selection ? (
            <button type="button" style={ghostButtonStyle} onClick={onClear}>
              {t(`${PICKER}.clearQuery`)}
            </button>
          ) : null}
          <button
            type="button"
            className="workspace-primary-btn"
            style={primaryButtonStyle}
            onClick={() => onSave(currentSpec)}
          >
            {count != null
              ? t(`${PICKER}.saveQueryCount`, { count })
              : t(`${PICKER}.saveQuery`)}
          </button>
        </div>
      </div>
    </div>
  );
}
