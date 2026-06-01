import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolDefinition } from "../../core/toolRegistry.server";

export const appNameTool = new DynamicStructuredTool({
  name: "get_app_name",
  description:
    "获取当前应用的名称（appName）。在发送含 {{appName}} 模板变量的邮件前，必须先调用此工具，再将返回值填入 templateData.appName。",
  schema: z.object({}),
  func: async () => {
    return process.env.NOTIFICATION_APP_NAME?.trim() || "";
  },
});

export const appNameToolDefinition: ToolDefinition = {
  name: "appName",
  description: "获取当前应用名称，供邮件模板 appName 变量使用",
  condition: () => true,
  systemPromptExtension:
    "当你即将调用 send_template_email 且模板中包含 {{appName}} 变量时，必须先调用 get_app_name 工具获取应用名称，并将返回值填入 templateData.appName。禁止猜测或硬编码应用名称。",
  createTool: () => appNameTool,
};
