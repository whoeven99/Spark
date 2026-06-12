/** 对话右侧"当前上下文 + 推荐下一步"侧栏（从 WorkspaceAppShellPage 的 ChatPanel 拆出，仅桌面端展示）。 */
import { describeObjectQuery, objectQueryKindLabel } from "../../../lib/objectQuerySpec";
import { fileRoleLabels, type QueryableObjectType } from "./types";
import type { WorkspaceContextController } from "./useWorkspaceContext";
import {
  bulletStyle,
  ctxFileIconStyle,
  ctxGroupLabelStyle,
  ctxGroupStyle,
  ctxItemRowStyle,
  ctxItemTitleStyle,
  ctxThumbPlaceholderStyle,
  ctxThumbStyle,
  listColumnStyle,
  sectionTextStyle,
  sectionTitleStyle,
  sidePanelStyle,
  suggestionItemStyle,
  surfaceCardStyle,
} from "./styles";

export function ChatContextSidebar({ context }: { context: WorkspaceContextController }) {
  const {
    selectedObjectsByType,
    objectQuerySelectionByType,
    constraints,
    fileRolesById,
    selectedFileIds,
    localFiles,
    totalSelectedObjects,
    totalQuerySelections,
    filledContextCount,
    clearContext,
  } = context;

  return (
    <section style={{ ...sidePanelStyle, alignSelf: "start" }}>
      <div style={surfaceCardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={sectionTitleStyle}>当前上下文</div>
          {filledContextCount > 0 ? (
            <button
              type="button"
              style={{ fontSize: 11, color: "#6d7175", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={clearContext}
            >
              清空
            </button>
          ) : null}
        </div>

        {/* 按条件圈定（执行时重新求值） */}
        {(["product", "article"] as QueryableObjectType[]).map((type) => {
          const query = objectQuerySelectionByType[type];
          if (!query) return null;
          return (
            <div key={type} style={ctxGroupStyle}>
              <div style={ctxGroupLabelStyle}>
                {objectQueryKindLabel(type)} · 按条件圈定
                {query.matchCount != null ? ` · 约 ${query.matchCount} 个` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#202223", lineHeight: 1.5 }}>
                {describeObjectQuery(query)}
              </div>
              <div style={{ fontSize: 11, color: "#8c9196", marginTop: 2 }}>
                执行时按条件重新求值，不固化 ID
              </div>
            </div>
          );
        })}

        {/* Products */}
        {selectedObjectsByType.product.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>商品 · {selectedObjectsByType.product.length} 个</div>
            {selectedObjectsByType.product.map((item) => (
              <div key={item.id} style={ctxItemRowStyle}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" style={ctxThumbStyle} />
                ) : (
                  <div style={ctxThumbPlaceholderStyle}>品</div>
                )}
                <span style={ctxItemTitleStyle}>{item.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Articles */}
        {selectedObjectsByType.article.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>文章 · {selectedObjectsByType.article.length} 篇</div>
            {selectedObjectsByType.article.map((item) => (
              <div key={item.id} style={ctxItemRowStyle}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" style={ctxThumbStyle} />
                ) : (
                  <div style={ctxThumbPlaceholderStyle}>文</div>
                )}
                <span style={ctxItemTitleStyle}>{item.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Files */}
        {selectedFileIds.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>文件 · {selectedFileIds.length} 个</div>
            {selectedFileIds.map((id) => {
              const file = localFiles.find((f) => f.id === id);
              if (!file) return null;
              return (
                <div key={id} style={ctxItemRowStyle}>
                  <div style={ctxFileIconStyle}>↑</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ctxItemTitleStyle}>{file.name}</div>
                    <div style={{ fontSize: 11, color: "#8c9196", marginTop: 1 }}>
                      {fileRoleLabels[fileRolesById[id] ?? "reference"]}
                      {file.note ? ` · ${file.note}` : ""}
                    </div>
                  </div>
                  {file.uploading ? (
                    <span style={{ fontSize: 10, color: "#6d7175", flexShrink: 0 }}>上传中…</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Constraints */}
        {constraints.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>约束 · {constraints.length} 条</div>
            {constraints.map((constraint) => (
              <div key={constraint} style={{ fontSize: 12, color: "#202223", lineHeight: 1.6 }}>
                ⚐ {constraint}
              </div>
            ))}
          </div>
        ) : null}

        {/* Empty state */}
        {totalSelectedObjects === 0 && totalQuerySelections === 0 && selectedFileIds.length === 0 && constraints.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8c9196", lineHeight: 1.6 }}>
            在下方选择商品、文章或上传文件，它们会出现在这里并随消息一起发给 AI。
          </div>
        ) : null}
      </div>

      <div style={surfaceCardStyle}>
        <div style={sectionTitleStyle}>推荐下一步</div>
        <div style={listColumnStyle}>
          {[
            "先生成任务确认卡片，再统一审核成本和影响范围。",
            "把这次规则保存为自动化，后续可定时执行。",
            "完成后将结果同步到任务列表和 Dashboard。",
          ].map((item) => (
            <div key={item} style={suggestionItemStyle}>
              <span style={bulletStyle} />
              <span style={sectionTextStyle}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
