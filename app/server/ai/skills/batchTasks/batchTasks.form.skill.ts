import type { ToolDefinition } from "../../core/toolRegistry.server";
import { coerceBatchTasksFormPayload } from "../../../../lib/batchTasksFormPayload";
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
  systemPromptExtension: `当用户在[工作台上下文]中已选择了一个或多个商品，并明确表达要「批量」处理这些商品（优化/生成商品描述、翻译商品图片文字）时，必须调用 open_batch_tasks_form，从上下文中提取所有已选商品的 ID、标题和图片 URL（格式为 [ID: xxx] [图片: url]），填入 products 数组，然后打开确认卡片。
规则：
- 仅当用户上下文中有已选商品时才调用（有 [ID: gid://...] 格式的商品数据）
- product_improve：描述优化/生成，targetLanguage 从用户语意推断或默认 en
- picture_translate：图片文字翻译，需要有图片 URL 的商品才有效
- 调用后告知用户「已为 N 个商品准备好批量任务，请在卡片中确认」
- 禁止声称已创建任务；任务由用户在卡片内点击确认后才会创建`,
  createTool: () => batchTasksFormTool,
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event === "on_tool_start" &&
      ev.name === OPEN_BATCH_TASKS_FORM_TOOL_NAME
    ) {
      streamContext.emittedFlags.add("batchTasksForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coerceBatchTasksFormPayload(ev.input),
      });
    }
  },
};
