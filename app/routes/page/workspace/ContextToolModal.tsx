/**
 * 上下文工具选择弹窗（商品/文章/订单/文件/富媒体），从 WorkspaceAppShellPage 的 ChatPanel 拆出。
 * 弹窗内的临时表单状态（待上传文件、富媒体表单、订单筛选）随弹窗关闭而重置。
 */
import { useEffect, useRef, useState } from "react";
import { WorkspaceContextObjectPicker } from "../../component/chat/WorkspaceContextObjectPicker";
import { useContextResourceSearch } from "../../../hooks/useContextResourceSearch";
import type { ContextResourceSortDirection } from "../../../lib/contextResourceTypes";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import { ObjectQueryBuilder } from "./ObjectQueryBuilder";
import {
  fileRoleDescriptions,
  fileRoleLabels,
  isObjectType,
  isQueryableObjectType,
  objectTypeLabels,
  type FileRole,
  type OrderFilterKey,
  type RichMediaItem,
} from "./types";
import type { WorkspaceContextController } from "./useWorkspaceContext";
import {
  compactFieldStyle,
  filterChipRowStyle,
  filterChipStyle,
  ghostButtonStyle,
  inlineFieldRowStyle,
  mobileToolModalCardStyle,
  mockCreateBoxStyle,
  mutedMetaStyle,
  pickerInfoBoxStyle,
  primaryButtonStyle,
  resourceItemContentStyle,
  resourceItemTopRowStyle,
  resourcePaginationStyle,
  resourcePickerHintStyle,
  resourceStatusPillStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  selectFieldStyle,
  selectorItemContentStyle,
  selectorItemStyle,
  selectorListCompactStyle,
  selectorSearchInputStyle,
  toolModalBackdropStyle,
  toolModalCardStyle,
  toolModalCloseStyle,
  toolModalFooterStyle,
  toolModalHeaderStyle,
} from "./styles";

const orderFilterLabels: Array<{ key: OrderFilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "paid", label: "已付款" },
  { key: "unfulfilled", label: "待履约" },
  { key: "refunded", label: "退款中" },
];

const CONSTRAINT_PRESETS = [
  "不修改商品价格",
  "不改动已发布的内容，仅生成草稿",
  "保持品牌语气一致",
  "标题不超过 60 个字符",
  "不删除任何现有内容",
];

const FILE_ROLE_OPTIONS = (Object.keys(fileRoleLabels) as FileRole[]).map((role) => ({
  value: role,
  label: fileRoleLabels[role],
}));

function normalizeResourceStatus(status: string | null | undefined): string {
  if (!status) return "未知";
  return status.replace(/_/g, " ");
}

export function ContextToolModal({ context }: { context: WorkspaceContextController }) {
  const { isMobile } = useResponsiveLayout();
  const {
    activeContextTool,
    closeContextTool,
    objectQueryByType,
    setObjectQuery,
    selectedObjectsByType,
    toggleObjectSelection,
    objectQuerySelectionByType,
    setObjectQuerySelection,
    fileRolesById,
    setFileRole,
    constraints,
    addConstraint,
    removeConstraint,
    localFiles,
    workspaceFilesLoading,
    workspaceFilesError,
    loadWorkspaceFiles,
    richMediaItems,
    addRichMediaItem,
    selectedFileIds,
    toggleFileSelection,
    addLocalFile,
    deleteLocalFile,
    selectedMediaIds,
    toggleMediaSelection,
  } = context;

  const [orderFilter, setOrderFilter] = useState<OrderFilterKey>("all");
  const orderSort = "created_at:desc";
  const [selectionMode, setSelectionMode] = useState<"manual" | "query">("manual");
  const [newConstraintText, setNewConstraintText] = useState("");
  const [newFileObj, setNewFileObj] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [newMediaTitle, setNewMediaTitle] = useState("");
  const [newMediaValue, setNewMediaValue] = useState("");
  const [newMediaNote, setNewMediaNote] = useState("");
  const [newMediaKind, setNewMediaKind] = useState<RichMediaItem["kind"]>("url");

  const [orderSortKey, orderSortDirection] = orderSort.split(":") as [string, ContextResourceSortDirection];
  const {
    items: orderSearchResults,
    pageInfo: orderPageInfo,
    isLoading: isOrderLoading,
    errorText: orderErrorText,
    goToNextPage: goToNextOrderPage,
    goToPreviousPage: goToPreviousOrderPage,
  } = useContextResourceSearch({
    enabled: activeContextTool === "order",
    type: "order",
    query: objectQueryByType.order,
    filter: orderFilter,
    sort: orderSortKey,
    direction: orderSortDirection,
    locationSearch: typeof window !== "undefined" ? window.location.search : "",
  });
  const selectedOrderIds = new Set(selectedObjectsByType.order.map((item) => item.id));

  const activeContextSelectionCount =
    activeContextTool === "product"
      ? selectedObjectsByType.product.length ||
        (objectQuerySelectionByType.product ? (objectQuerySelectionByType.product.matchCount ?? 1) : 0)
      : activeContextTool === "article"
        ? selectedObjectsByType.article.length ||
          (objectQuerySelectionByType.article ? (objectQuerySelectionByType.article.matchCount ?? 1) : 0)
        : activeContextTool === "order"
          ? selectedObjectsByType.order.length
          : activeContextTool === "file"
            ? selectedFileIds.length + (newFileObj ? 1 : 0)
            : activeContextTool === "media"
              ? selectedMediaIds.length
              : activeContextTool === "constraint"
                ? constraints.length
                : 0;

  // 打开商品/文章弹窗时：已有圈定条件则默认进入「按条件」模式
  useEffect(() => {
    if (isQueryableObjectType(activeContextTool)) {
      setSelectionMode(objectQuerySelectionByType[activeContextTool] ? "query" : "manual");
    }
    setNewConstraintText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContextTool]);

  const resetPendingFileSelection = () => {
    setNewFileObj(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDismiss = () => {
    resetPendingFileSelection();
    closeContextTool();
  };

  const handleConfirm = () => {
    if (activeContextTool === "file" && newFileObj) {
      void addLocalFile({ file: newFileObj });
      resetPendingFileSelection();
    }
    closeContextTool();
  };

  useEffect(() => {
    if (!activeContextTool) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContextTool, closeContextTool]);

  if (!activeContextTool) return null;

  return (
    <div style={toolModalBackdropStyle} onClick={handleDismiss}>
      <div style={isMobile ? mobileToolModalCardStyle : toolModalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={toolModalHeaderStyle}>
          <div>
            <div style={sectionTitleSmallStyle}>
              {isObjectType(activeContextTool)
                ? `${objectTypeLabels[activeContextTool]}选择器`
                : activeContextTool === "file"
                  ? "文件选择"
                  : activeContextTool === "constraint"
                    ? "约束条件"
                    : "富媒体选择"}
            </div>
            <div style={sectionTextStyle}>
              {isObjectType(activeContextTool)
                ? "逐个勾选，或按条件圈定（执行时重新求值）。"
                : activeContextTool === "file"
                  ? "选择附加文件，并标注其角色（参考/数据/风格）。"
                  : activeContextTool === "constraint"
                    ? "设定 AI 执行任务时必须遵守的边界。"
                    : "选择需要附加到这次对话的 URL、图片或视频。"}
            </div>
          </div>
          <button type="button" style={toolModalCloseStyle} onClick={handleDismiss} aria-label="关闭">
            ✕
          </button>
        </div>

        {activeContextTool === "product" || activeContextTool === "article" ? (
          <>
            <div style={filterChipRowStyle}>
              <button
                type="button"
                style={filterChipStyle(selectionMode === "manual")}
                onClick={() => setSelectionMode("manual")}
              >
                逐个勾选
              </button>
              <button
                type="button"
                style={filterChipStyle(selectionMode === "query")}
                onClick={() => setSelectionMode("query")}
              >
                按条件圈定
                {objectQuerySelectionByType[activeContextTool] ? " ✓" : ""}
              </button>
            </div>
            {selectionMode === "manual" ? (
              <WorkspaceContextObjectPicker
                kind={activeContextTool}
                label={objectTypeLabels[activeContextTool]}
                query={objectQueryByType[activeContextTool]}
                onQueryChange={(value) => setObjectQuery(activeContextTool, value)}
                selected={selectedObjectsByType[activeContextTool]}
                onToggle={(item) => toggleObjectSelection(activeContextTool, item)}
                locationSearch={typeof window !== "undefined" ? window.location.search : ""}
              />
            ) : (
              <ObjectQueryBuilder
                key={activeContextTool}
                type={activeContextTool}
                selection={objectQuerySelectionByType[activeContextTool]}
                onSave={(selection) => {
                  setObjectQuerySelection(activeContextTool, selection);
                  closeContextTool();
                }}
                onClear={() => setObjectQuerySelection(activeContextTool, null)}
                locationSearch={typeof window !== "undefined" ? window.location.search : ""}
              />
            )}
          </>
        ) : null}

        {activeContextTool === "order" ? (
          <>
            <input
              value={objectQueryByType.order}
              onChange={(event) => setObjectQuery("order", event.target.value)}
              placeholder="搜索订单号、站点或状态"
              style={selectorSearchInputStyle}
            />
            <div style={filterChipRowStyle}>
              {orderFilterLabels.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  style={filterChipStyle(orderFilter === filter.key)}
                  onClick={() => setOrderFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div style={resourcePickerHintStyle}>
              <span style={mutedMetaStyle}>已连接 Shopify 实时数据，可搜索、筛选并将目标订单直接传给 AI。</span>
              <span style={mutedMetaStyle}>已选 {selectedObjectsByType.order.length} 个</span>
            </div>
            <div style={selectorListCompactStyle}>
              {orderErrorText ? (
                <div style={pickerInfoBoxStyle("critical")}>{orderErrorText}</div>
              ) : null}
              {!orderErrorText && isOrderLoading ? (
                <div style={pickerInfoBoxStyle("neutral")}>正在加载 Shopify 订单...</div>
              ) : null}
              {!orderErrorText && !isOrderLoading && orderSearchResults.length === 0 ? (
                <div style={pickerInfoBoxStyle("neutral")}>暂无匹配结果，试试调整关键词、筛选器或排序。</div>
              ) : null}
              {!orderErrorText &&
                orderSearchResults.map((item) => {
                  const checked = selectedOrderIds.has(item.id);
                  return (
                    <label key={item.id} style={selectorItemStyle(checked)}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleObjectSelection("order", { id: item.id, title: item.title })
                        }
                      />
                      <div style={resourceItemContentStyle}>
                        <div style={resourceItemTopRowStyle}>
                          <span style={sectionTitleSmallStyle}>{item.title}</span>
                          {item.status ? (
                            <span style={resourceStatusPillStyle}>{normalizeResourceStatus(item.status)}</span>
                          ) : null}
                        </div>
                        <span style={sectionTextStyle}>{item.subtitle}</span>
                        <span style={mutedMetaStyle}>{item.meta}</span>
                      </div>
                    </label>
                  );
                })}
            </div>
            <div style={resourcePaginationStyle}>
              <button
                type="button"
                style={ghostButtonStyle}
                onClick={goToPreviousOrderPage}
                disabled={!orderPageInfo.hasPreviousPage || isOrderLoading}
              >
                上一页
              </button>
              <button
                type="button"
                style={ghostButtonStyle}
                onClick={goToNextOrderPage}
                disabled={!orderPageInfo.hasNextPage || isOrderLoading}
              >
                下一页
              </button>
            </div>
          </>
        ) : null}

        {activeContextTool === "file" ? (
          <>
            <div style={mockCreateBoxStyle}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json"
                style={selectorSearchInputStyle}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setNewFileObj(file);
                }}
              />
              {newFileObj ? (
                <div style={{ fontSize: 12, color: "#202223", marginTop: 6 }}>
                  已选择：{newFileObj.name}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                支持：TXT、MD、CSV、JSON，最大 10 MB。选好后点确认即可上传并附加。
              </div>
            </div>
            <div style={selectorListCompactStyle}>
              {workspaceFilesLoading && localFiles.length === 0 ? (
                <div style={sectionTextStyle}>正在加载历史上传…</div>
              ) : null}
              {workspaceFilesError ? (
                <div style={{ ...sectionTextStyle, color: "#d72c0d" }}>
                  {workspaceFilesError}
                  <button
                    type="button"
                    style={{ ...ghostButtonStyle, marginLeft: 8, padding: "2px 8px", fontSize: 12 }}
                    onClick={() => void loadWorkspaceFiles()}
                  >
                    重试
                  </button>
                </div>
              ) : null}
              {!workspaceFilesLoading && !workspaceFilesError && localFiles.length === 0 ? (
                <div style={sectionTextStyle}>暂无历史上传文件，可在上方选择文件后点确认上传。</div>
              ) : null}
              {localFiles.map((file) => {
                const checked = selectedFileIds.includes(file.id);
                const authQuery = typeof window !== "undefined" ? window.location.search : "";
                return (
                  <label key={file.id} style={selectorItemStyle(checked)}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={Boolean(file.uploading)}
                      onChange={() => toggleFileSelection(file.id)}
                    />
                    <div style={selectorItemContentStyle}>
                      <span style={sectionTitleSmallStyle}>{file.name}</span>
                      {file.note ? <span style={sectionTextStyle}>{file.note}</span> : null}
                      <span style={mutedMetaStyle}>
                        {file.size}
                        {file.uploading ? " · 上传中…" : ""}
                        {file.uploadError ? ` · ⚠ ${file.uploadError}` : ""}
                        {!file.uploading && !file.uploadError && file.serverId && file.charCount
                          ? ` · 已解析 (${(file.charCount / 1000).toFixed(0)}k 字符)`
                          : ""}
                      </span>
                      {checked && !file.uploading ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "#6d7175", flexShrink: 0 }}>角色</span>
                          <select
                            value={fileRolesById[file.id] ?? "reference"}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setFileRole(file.id, e.target.value as FileRole)}
                            style={{ ...selectFieldStyle, padding: "2px 6px", fontSize: 11 }}
                            title={fileRoleDescriptions[fileRolesById[file.id] ?? "reference"]}
                          >
                            {FILE_ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>
                            {fileRoleDescriptions[fileRolesById[file.id] ?? "reference"]}
                          </span>
                        </div>
                      ) : null}
                      {file.serverId && !file.uploading ? (
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <a
                            href={`/api/files/${file.serverId}${authQuery}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: "rgba(44,110,203,0.8)" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            下载原始文件
                          </a>
                          <button
                            type="button"
                            style={{ fontSize: 11, color: "#d72c0d", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void deleteLocalFile(file.id, file.serverId);
                            }}
                          >
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        ) : null}

        {activeContextTool === "media" ? (
          <>
            <div style={mockCreateBoxStyle}>
              <div style={inlineFieldRowStyle}>
                <select value={newMediaKind} onChange={(event) => setNewMediaKind(event.target.value as RichMediaItem["kind"])} style={selectFieldStyle}>
                  <option value="url">URL</option>
                  <option value="image">图片</option>
                  <option value="video">视频</option>
                </select>
                <input
                  value={newMediaTitle}
                  onChange={(event) => setNewMediaTitle(event.target.value)}
                  placeholder="输入标题"
                  style={compactFieldStyle}
                />
              </div>
              <input
                value={newMediaValue}
                onChange={(event) => setNewMediaValue(event.target.value)}
                placeholder="输入 URL 或资源地址"
                style={selectorSearchInputStyle}
              />
              <div style={inlineFieldRowStyle}>
                <input
                  value={newMediaNote}
                  onChange={(event) => setNewMediaNote(event.target.value)}
                  placeholder="补充备注"
                  style={compactFieldStyle}
                />
                <button
                  type="button"
                  style={ghostButtonStyle}
                  onClick={() => {
                    const title = newMediaTitle.trim();
                    const value = newMediaValue.trim();
                    if (!title || !value) return;
                    addRichMediaItem({
                      title,
                      value,
                      kind: newMediaKind,
                      note: newMediaNote.trim() || "新添加的富媒体资源",
                    });
                    setNewMediaTitle("");
                    setNewMediaValue("");
                    setNewMediaNote("");
                    setNewMediaKind("url");
                  }}
                >
                  添加资源
                </button>
              </div>
            </div>
            <div style={selectorListCompactStyle}>
              {richMediaItems.map((item) => {
                const checked = selectedMediaIds.includes(item.id);
                return (
                  <label key={item.id} style={selectorItemStyle(checked)}>
                    <input type="checkbox" checked={checked} onChange={() => toggleMediaSelection(item.id)} />
                    <div style={selectorItemContentStyle}>
                      <span style={sectionTitleSmallStyle}>{item.title}</span>
                      <span style={sectionTextStyle}>{item.note}</span>
                      <span style={mutedMetaStyle}>{item.kind} · {item.value}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        ) : null}

        {activeContextTool === "constraint" ? (
          <>
            <div style={pickerInfoBoxStyle("neutral")}>
              约束会随每条消息发给 AI，作为执行任务时必须遵守的边界。点击预设或输入自定义约束。
            </div>
            <div style={filterChipRowStyle}>
              {CONSTRAINT_PRESETS.map((preset) => {
                const active = constraints.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    style={filterChipStyle(active)}
                    onClick={() => (active ? removeConstraint(preset) : addConstraint(preset))}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <div style={{ ...inlineFieldRowStyle, marginTop: 12 }}>
              <input
                value={newConstraintText}
                onChange={(event) => setNewConstraintText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  addConstraint(newConstraintText);
                  setNewConstraintText("");
                }}
                placeholder="自定义约束，如：描述不超过 200 字"
                style={compactFieldStyle}
              />
              <button
                type="button"
                style={ghostButtonStyle}
                onClick={() => {
                  addConstraint(newConstraintText);
                  setNewConstraintText("");
                }}
              >
                添加
              </button>
            </div>
            <div style={selectorListCompactStyle}>
              {constraints.length === 0 ? (
                <div style={sectionTextStyle}>尚未添加约束。</div>
              ) : (
                constraints.map((constraint) => (
                  <div
                    key={constraint}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #e1e3e5",
                      background: "#ffffff",
                    }}
                  >
                    <span style={{ ...sectionTextStyle, flex: 1 }}>{constraint}</span>
                    <button
                      type="button"
                      style={{
                        fontSize: 12,
                        color: "#d72c0d",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        flexShrink: 0,
                      }}
                      onClick={() => removeConstraint(constraint)}
                    >
                      移除
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}

        <div style={toolModalFooterStyle}>
          <span style={mutedMetaStyle}>
            {activeContextSelectionCount > 0
              ? `已选择 ${activeContextSelectionCount} 项，确认后将附加到本次对话`
              : "勾选后点击确认附加到对话"}
          </span>
          <button type="button" className="workspace-primary-btn" style={primaryButtonStyle} onClick={handleConfirm}>
            {activeContextSelectionCount > 0 ? `确认（${activeContextSelectionCount}）` : "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}
