import {
  isFeishuEnabled,
  resolveFeishuWebhookUrl,
} from "./feishuConfig.server";
import type {
  FeishuChannel,
  FeishuTextPayload,
  SendFeishuResult,
} from "./feishuTypes.server";

const LOG = "[Feishu]";

export async function sendFeishuTextMessage(params: {
  channel: FeishuChannel;
  message: string;
}): Promise<SendFeishuResult> {
  const { channel, message } = params;

  try {
    if (!isFeishuEnabled()) {
      console.info(`${LOG} skipped channel=${channel} reason=disabled`);
      return { ok: false, channel, skipped: true, reason: "disabled" };
    }

    const webhookUrl = resolveFeishuWebhookUrl(channel);
    if (!webhookUrl) {
      console.info(`${LOG} skipped channel=${channel} reason=no_webhook_url`);
      return { ok: false, channel, skipped: true, reason: "no_webhook_url" };
    }

    console.info(
      `${LOG} start send channel=${channel} messageLength=${message.length}`,
    );

    const payload: FeishuTextPayload = {
      msg_type: "text",
      content: { text: message },
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let body: { code?: number; msg?: string; raw?: string };
    try {
      body = JSON.parse(text) as { code?: number; msg?: string };
    } catch {
      body = { raw: text };
    }

    if (!res.ok || (body.code !== undefined && body.code !== 0)) {
      console.error(
        `${LOG} failed channel=${channel} httpStatus=${res.status} body=${JSON.stringify(body).slice(0, 400)}`,
      );
      return { ok: false, channel, reason: "webhook_error" };
    }

    console.info(`${LOG} success channel=${channel}`);
    return { ok: true, channel };
  } catch (error) {
    console.error(`${LOG} failed channel=${channel}`, error);
    return { ok: false, channel, reason: "exception" };
  }
}
