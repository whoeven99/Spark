import type { ToolDefinition } from "../../core/toolRegistry.server";
import {
  coerceBatchTasksFormPayload,
  mergeBatchTasksPayloadWithContext,
} from "../../../../lib/batchTasksFormPayload";
import { parseWorkspaceProductsFromText } from "../../../../lib/workspaceContextProducts";
import { resolveBatchTasksFormPayload } from "./batchTasks.extract";
import {
  OPEN_BATCH_TASKS_FORM_TOOL_NAME,
  batchTasksFormTool,
} from "./batchTasks.form.tool";

export const batchTasksFormSkillDefinition: ToolDefinition = {
  name: "batchTasksForm",
  displayName: "批量任务卡片",
  category: "商品优化",
  stage: "execute",
  description: "当用户在上下文中选择了多个商品，并要求批量优化描述或翻译图片时，打开批量任务确认卡片",
  uiPayloadKey: "batchTasksCard",
  systemPromptExtension: `当用户在[工作台上下文]中已选择了商品（含「已选商品（共 N 个）」格式），且用户说要处理/优化/翻译这些商品时，必须调用 open_batch_tasks_form：
- 从上下文「已选商品」列表逐行提取每个商品的 ID（[ID: gid://...]）、标题（• 后面的文本）、图片 URL（[图片: url]），填入 products 数组。每个选中商品必须对应一个 products 条目，禁止传空数组。
- product_improve：描述生成/优化，targetLanguage 从用户意图推断（如"英文""中文"），默认 en
- picture_translate：图片文字翻译，仅对有图片 URL 的商品有效
- 调用后告知用户「已为 N 个商品准备好批量任务，请在卡片中确认」
- 禁止声称已创建任务；任务由用户点击确认卡片后才会创建
- 【优先级】只要上下文有 ≥ 1 个已选商品且用户意图涉及商品处理，本工具优先于 open_product_improve_form（单商品工具）`,
  createTool: () => batchTasksFormTool,
  extractUIPayload: (messages, lastUserText, assistantReplyRaw) =>
    resolveBatchTasksFormPayload(messages, lastUserText, assistantReplyRaw),
  onStreamEvent: (ev, enqueue, streamContext) => {
    // Use on_tool_end: ev.output = func() return value = JSON.stringify(payload).
    // This is the most reliable source because:
    //   - on_tool_start ev.input may arrive as a raw JSON string (before Zod parse),
    //     causing coerce to see a string → products[] gets lost.
    //   - on_tool_end ev.output is always the func() return value which we control.
    if (
      ev.event === "on_tool_end" &&
      ev.name === OPEN_BATCH_TASKS_FORM_TOOL_NAME &&
      !streamContext.emittedFlags.has("batchTasksForm")
    ) {
      streamContext.emittedFlags.add("batchTasksForm");
      // ev.output may be a string or an object depending on LangChain version
      const raw: unknown =
        typeof ev.output === "object" && ev.output !== null
          ? ev.output
          : String(ev.output ?? "");
      const payload = mergeBatchTasksPayloadWithContext(
        coerceBatchTasksFormPayload(raw),
        parseWorkspaceProductsFromText(streamContext.lastUserText ?? ""),
      );
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: payload,
      });
    }
  },
};
