import type {
  NotificationEvent,
  NotificationLocale,
  RenderedNotificationEmail,
  RenderNotificationInput,
} from "./types";
import {
  createTemplateContext,
  renderHtmlEmail,
  renderTextEmail,
} from "./templates/sharedLayout";
import type { NotificationTemplate, NotificationTemplateRegistry } from "./templates/sharedLayout";
import { enTemplates } from "./templates/en";
import { zhCNTemplates } from "./templates/zh-CN";

const defaultLocale: NotificationLocale = "zh-CN";

const templateRegistries: Record<NotificationLocale, NotificationTemplateRegistry> = {
  "zh-CN": zhCNTemplates,
  en: enTemplates,
};

export function renderNotificationEmail<E extends NotificationEvent>(
  input: RenderNotificationInput<E>,
): RenderedNotificationEmail {
  const locale = input.locale ?? defaultLocale;
  const registry = templateRegistries[locale];
  const template = registry[input.event] as NotificationTemplate<E>;
  const context = createTemplateContext(locale, input.appConfig, input.variables);
  const content = template(context);

  return {
    subject: content.subject,
    html: renderHtmlEmail(locale, content, context.display),
    text: renderTextEmail(content, context.display),
  };
}
