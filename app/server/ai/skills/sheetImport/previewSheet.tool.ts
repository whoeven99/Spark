/**
 * 只读预览已上传表格的表头与前几行，帮助 AI 与用户确认列映射。
 *
 * 所有「按表格导入」能力共用（价目表导入、成本价导入）：读表这一步是一样的，
 * 差异只在后面挑哪些列、写哪个字段。因此这个工具只注册一次。
 *
 * 不碰 Shopify、不写任何东西。之所以不直接用聊天里的文件上下文：
 * 那份文本被截断到 2 万字符且列结构已拍平，用来推断列名不可靠。
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { loadOriginalFileBuffer } from "../../../fileContext/fileStore.server";
import { parseSheetBuffer, SheetParseError } from "../../../sheetImport/parseSheet.server";

export const PREVIEW_IMPORT_SHEET_TOOL_NAME = "preview_import_sheet";

/** 给模型看的样本行数：够它判断列语义即可，多了浪费上下文。 */
const SAMPLE_ROWS = 5;

export function createPreviewImportSheetTool(context: AgentContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: PREVIEW_IMPORT_SHEET_TOOL_NAME,
    description:
      "读取用户已上传的表格（CSV / Excel），返回真实表头与前几行样本，用于确认哪一列是 SKU、哪一列是价格或成本。只读，不修改任何数据。",
    schema: z.object({
      fileId: z.string().describe("文件 ID，从[附加文件上下文]里取"),
    }),
    func: async ({ fileId }) => {
      const shop = context.shop?.trim();
      if (!shop) {
        return JSON.stringify({ error: "当前会话缺少店铺信息，无法读取文件" });
      }

      const file = await loadOriginalFileBuffer(shop, fileId.trim());
      if (!file) {
        return JSON.stringify({ error: "找不到这个文件，请让用户重新上传" });
      }

      try {
        const sheet = parseSheetBuffer(file.buffer, file.name, { maxRows: SAMPLE_ROWS });
        return JSON.stringify({
          fileId: fileId.trim(),
          fileName: file.name,
          headers: sheet.headers,
          sampleRows: sheet.rows.map((row) => row.cells),
          note: "sampleRows 只是前几行样本，实际行数以导入时为准",
        });
      } catch (e) {
        if (e instanceof SheetParseError) {
          return JSON.stringify({ error: e.message });
        }
        throw e;
      }
    },
  });
}
