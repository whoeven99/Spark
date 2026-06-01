import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolDefinition } from "../../core/toolRegistry.server";

export const appNameTool = new DynamicStructuredTool({
  name: "get_app_name",
  description:
    "获取当前应用的名称（APP_Name）。在发送含 {{ APP_Name }} 模板变量的邮件前，必须先调用此工具，再将返回值填入 templateData.APP_Name。",
  schema: z.object({}),
  func: async () => {
    return process.env.NOTIFICATION_APP_NAME?.trim() || "";
  },
});

export const appNameToolDefinition: ToolDefinition = {
  name: "appName",
  description: "获取当前应用名称，供邮件模板 APP_Name 变量使用",
  condition: () => true,
  systemPromptExtension:
    "当你即将调用 send_template_email 且模板中包含 {{ APP_Name }} 变量时，必须先调用 get_app_name 工具获取应用名称，并将返回值填入 templateData.APP_Name。禁止猜测或硬编码应用名称。",
  createTool: () => appNameTool,
};
