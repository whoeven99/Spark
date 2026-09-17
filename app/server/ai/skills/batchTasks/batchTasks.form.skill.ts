import type { ToolDefinition } from "../../core/toolRegistry.server";
import {
  coerceBatchTasksFormPayload,
  mergeBatchTasksPayloadWithContext,
  normalizeBatchTasksPayloadWithUserIntent,
  shouldSuppressBatchTasksCardForUserIntent,
} from "../../../../lib/batchTasksFormPayload";
import { parseWorkspaceProductsFromText } from "../../../../lib/workspaceContextProducts";
import { resolveBatchTasksFormPayload } from "./batchTasks.extract";
import {
  OPEN_BATCH_TASKS_FORM_TOOL_NAME,
  batchTasksFormTool,
} from "./batchTasks.form.tool";
import { taskProposalFromBatchTasksPayload } from "../../../../lib/taskProposalPayload";

export const batchTasksFormSkillDefinition: ToolDefinition = {
  name: "batchTasksForm",
  displayName: "批量任务卡片",
  category: "商品优化",
  stage: "execute",
  description: "当用户在上下文中选择了多个商品，并要求批量优化描述或翻译图片时，打开批量任务确认卡片",
  uiPayloadKey: "batchTasksCard",
  systemPromptExtension: `当用户在[工作台上下文]中已选择了商品（含「已选商品（共 N 个）」格式），且明确要优化商品描述/文案或翻译图片文字时，必须调用 open_batch_tasks_form：
- 从上下文「已选商品」列表逐行提取每个商品的 ID（[ID: gid://...]）、标题（• 后面的文本）、图片 URL（[图片: url]），填入 products 数组。每个选中商品必须对应一个 products 条目，禁止传空数组。
- 【taskType 必须与用户意图一致】用户说「翻译图片/翻译商品图/翻译图片里的文字/图片本地化」→ 必须传 taskType=picture_translate，禁止传 product_improve；用户说「生成/撰写/优化商品描述、文案、标题」→ 才传 product_improve。二者不可混淆。
- 【严禁用于改价/打标/上下架/导入导出】用户要改价格、标签、上下架、导入或导出时，禁止调用本工具；改走对应的 open_bulk_*_form / open_product_import_form / open_product_export_form。
- product_improve：描述生成/优化，targetLanguage 从用户意图推断（如"英文""中文"），默认 en
- picture_translate：图片文字翻译，仅对有图片 URL 的商品有效；targetLanguage 从用户意图推断（简体中文=zh-CN、繁体=zh-TW），sourceLanguage 默认 auto
- 调用后用与用户消息相同的语言告知已为 N 个商品准备好批量任务，并引导其在卡片中确认；不要固定使用中文
- 禁止声称已创建任务；任务由用户点击确认卡片后才会创建
- 【优先级】已选商品且意图是文案或图片翻译时，本工具优先于 open_product_improve_form（单商品描述工具）；这只改变入口，不改变任务类型：翻译图片仍须 taskType=picture_translate。不要把「处理商品/改价」理解成本工具`,
  createTool: () => batchTasksFormTool,
  extractUIPayload: (messages, lastUserText, assistantReplyRaw) =>
    resolveBatchTasksFormPayload(messages, lastUserText),
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
      const lastUserText = streamContext.lastUserText ?? "";
      if (shouldSuppressBatchTasksCardForUserIntent(lastUserText)) {
        return;
      }
      streamContext.emittedFlags.add("batchTasksForm");
      // ev.output may be a string or an object depending on LangChain version
      const raw: unknown =
        typeof ev.output === "object" && ev.output !== null
          ? ev.output
          : String(ev.output ?? "");
      const payload = normalizeBatchTasksPayloadWithUserIntent(
        mergeBatchTasksPayloadWithContext(
          coerceBatchTasksFormPayload(raw),
          parseWorkspaceProductsFromText(lastUserText),
        ),
        lastUserText,
      );
      // 两种批量任务（product_improve / picture_translate）均走通用 TaskProposal 协议。
      const proposal = taskProposalFromBatchTasksPayload(payload);
      if (proposal) {
        enqueue({ type: "task_proposal", payload: proposal });
      } else {
        enqueue({
          type: "tool_call",
          name: ev.name,
          args: payload,
        });
      }
    }
  },
};
