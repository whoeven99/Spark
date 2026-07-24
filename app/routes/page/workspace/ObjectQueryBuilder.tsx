/**
 * ObjectQueryBuilder — 「按条件圈定对象」构建器（阶段 2）。
 *
 * 与逐个勾选互补：用户设定筛选条件（关键词/状态/标签/库存上限），
 * 实时预览匹配数与首页结果，保存的是条件本身而非 ID 快照——
 * 执行（含后续 Playbook 定时执行）时按条件重新求值。
 */
import { useState } from "react";
import { useShopifyObjectList } from "../../../hooks/useShopifyObjectList";
import type { ObjectQuerySelection, ObjectQueryStatus } from "../../../lib/objectQuerySpec";
import { describeObjectQuery, objectQueryKindLabel } from "../../../lib/objectQuerySpec";
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

const PRODUCT_STATUS_CHIPS: Array<{ key: ObjectQueryStatus; label: string }> = [
  { key: "all", label: "全部" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

const ARTICLE_STATUS_CHIPS: Array<{ key: ObjectQueryStatus; label: string }> = [
  { key: "all", label: "全部" },
  { key: "published", label: "已发布" },
  { key: "draft", label: "草稿" },
];

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
  const kindLabel = objectQueryKindLabel(type);

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
        按条件圈定保存的是<strong>筛选条件</strong>而非固定 ID——任务执行（含定时自动化）时会按条件重新求值。
        例如「库存 ≤ 10 的 Active 商品」每次执行都会重新计算命中对象。
      </div>

      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder={`标题关键词（可留空圈定全部${kindLabel}）`}
        style={{ ...selectorSearchInputStyle, marginTop: 10 }}
      />

      <div style={filterChipRowStyle}>
        {statusChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            style={filterChipStyle(status === chip.key)}
            onClick={() => setStatus(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {type === "product" ? (
        <div style={{ ...inlineFieldRowStyle, marginTop: 10 }}>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="标签（如 summer）"
            style={compactFieldStyle}
          />
          <input
            value={maxInventoryText}
            onChange={(event) => setMaxInventoryText(event.target.value.replace(/[^\d]/g, ""))}
            placeholder="库存上限（如 10）"
            inputMode="numeric"
            style={compactFieldStyle}
          />
        </div>
      ) : null}

      <div style={resourcePickerHintStyle}>
        <span style={mutedMetaStyle}>{describeObjectQuery(currentSpec)}</span>
        <span style={{ ...mutedMetaStyle, fontWeight: 700, flexShrink: 0 }}>
          {isLoading ? "计算中…" : count != null ? `匹配 ${count} 个` : items.length > 0 ? `匹配 ${items.length}+ 个` : "无匹配"}
        </span>
      </div>

      <div style={{ ...selectorListCompactStyle, maxHeight: 220 }}>
        {errorText ? <div style={pickerInfoBoxStyle("critical")}>{errorText}</div> : null}
        {!errorText && isLoading && items.length === 0 ? (
          <div style={pickerInfoBoxStyle("neutral")}>正在加载匹配预览…</div>
        ) : null}
        {!errorText && !isLoading && items.length === 0 ? (
          <div style={pickerInfoBoxStyle("neutral")}>当前条件没有匹配的{kindLabel}，试试放宽条件。</div>
        ) : null}
        {!errorText &&
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
                <span style={sectionTitleSmallStyle}>{item.title}</span>
                <span style={mutedMetaStyle}>{item.meta}</span>
              </div>
            </div>
          ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12 }}>
        <span style={sectionTextStyle}>
          {selection ? `已圈定：${describeObjectQuery(selection)}` : "尚未保存圈定条件"}
        </span>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {selection ? (
            <button type="button" style={ghostButtonStyle} onClick={onClear}>
              取消圈定
            </button>
          ) : null}
          <button
            type="button"
            className="workspace-primary-btn"
            style={primaryButtonStyle}
            onClick={() => onSave(currentSpec)}
          >
            {count != null ? `按条件圈定（${count} 个）` : "按条件圈定"}
          </button>
        </div>
      </div>
    </div>
  );
}
