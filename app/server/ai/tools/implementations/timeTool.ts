import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const timeTool = new DynamicStructuredTool({
  name: "get_current_time",
  description: "查询当前时间。可用于用户询问现在几点、当前日期时间。",
  schema: z.object({}),
  func: async () => {
    return `当前时间是 ${new Date().toLocaleString("zh-CN", {
      hour12: false,
    })}`;
  },
});
