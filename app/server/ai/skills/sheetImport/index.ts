import type { ToolDefinition } from "../../core/toolRegistry.server";
import { createPreviewImportSheetTool } from "./previewSheet.tool";

/**
 * 表格导入的公共读侧。
 *
 * 单独成一个 internal skill 而不是挂在某个导入能力下：读表工具被价目表导入和
 * 成本价导入共用，挂在其中一边会让另一边隐式依赖它的注册与启用条件，
 * 而同名工具注册两次会让模型拿到重复的 function 定义。
 */
export const sheetImportSkillDefinition: ToolDefinition = {
  name: "sheetImport",
  displayName: "表格读取",
  category: "商品目录",
  stage: "dataAlign",
  visibility: "internal",
  description: "读取商户上传的 CSV / Excel 的真实表头与样本行，用于确认导入的列映射",
  createTool: (context) => createPreviewImportSheetTool(context),
};

export { PREVIEW_IMPORT_SHEET_TOOL_NAME } from "./previewSheet.tool";
