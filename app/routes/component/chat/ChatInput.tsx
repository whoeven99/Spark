import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ChatInputProps = {
  onMessageSend: (message: string) => void;
  isSending: boolean;
  onAbort?: () => void;
};

const CHAT_INPUT_ID = "spark-chat-input";

export function ChatInput({ onMessageSend, isSending, onAbort }: ChatInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || isSending) return;

    onMessageSend(content);
    setInput("");

    // 保持输入框活跃状态
    setTimeout(() => {
      document.getElementById(CHAT_INPUT_ID)?.focus();
    }, 0);
  }, [input, isSending, onMessageSend]);

  // s-text-field 是 Web Component，内部输入框按 Enter 不会走外层 <form> 的 submit，需单独监听
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const path = event.composedPath();
      const inThisField = path.some(
        (node) =>
          node instanceof HTMLElement && node.id === CHAT_INPUT_ID,
      );
      if (!inThisField) return;
      event.preventDefault();
      handleSend();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [handleSend]);

  return (
    <form
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        handleSend();
      }}
    >
      <s-stack direction="inline" gap="base" alignItems="end">
        <div style={{ flex: 1 }}>
          <s-text-field
            id={CHAT_INPUT_ID}
            label={t("chat.inputLabel")}
            value={input}
            onInput={(event) => {
              const target = event.target as HTMLInputElement;
              setInput(target.value);
            }}
            placeholder={t("chat.inputPlaceholder")}
            autocomplete="off"
          />
        </div>
        {isSending && onAbort ? (
          <s-button type="button" variant="secondary" onClick={() => onAbort()}>
            {t("chat.stopGenerating")}
          </s-button>
        ) : null}
        <s-button
          type="submit"
          variant="primary"
          {...(isSending ? { loading: true } : {})}
        >
          {t("common.send")}
        </s-button>
      </s-stack>
    </form>
  );
}
