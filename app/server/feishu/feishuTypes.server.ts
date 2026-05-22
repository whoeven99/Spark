export type FeishuChannel = "ops_uninstall" | "ops_subscription";

export type SendFeishuResult =
  | { ok: true; channel: FeishuChannel }
  | {
      ok: false;
      channel: FeishuChannel;
      skipped?: true;
      reason?: string;
    };

export type FeishuTextPayload = {
  msg_type: "text";
  content: { text: string };
};
