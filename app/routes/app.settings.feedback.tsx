import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./page/pageUiStyles";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "done"; ok: boolean; message: string };

export default function SettingsFeedback() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [value, setValue] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const submit = async () => {
    const suggestion = value.trim();
    if (!suggestion || state.status === "submitting") return;
    setState({ status: "submitting" });
    try {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const res = await fetch(`/app/feedback/suggestion${search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        setValue("");
        setState({
          status: "done",
          ok: true,
          message: data.message ?? t("settingsShell.feedbackDone"),
        });
      } else {
        setState({
          status: "done",
          ok: false,
          message: data.error ?? t("settingsShell.feedbackError"),
        });
      }
    } catch {
      setState({ status: "done", ok: false, message: t("settingsShell.feedbackError") });
    }
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.navFeedback")}
        subtitle={t("settingsShell.feedbackSubtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />
      <PageSurface>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={2000}
          placeholder={t("settingsShell.feedbackPlaceholder")}
          style={{
            width: "100%",
            minHeight: 140,
            padding: "0.75rem 0.9rem",
            borderRadius: pageColorTokens.radiusControl,
            border: `1px solid ${pageColorTokens.border}`,
            fontSize: "0.9rem",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!value.trim() || state.status === "submitting"}
            style={{
              padding: "0.55rem 1.2rem",
              borderRadius: pageColorTokens.radiusControl,
              border: "none",
              background: !value.trim() || state.status === "submitting" ? "#9aa5b1" : "#008060",
              color: "#fff",
              fontSize: "0.9rem",
              cursor: !value.trim() || state.status === "submitting" ? "not-allowed" : "pointer",
            }}
          >
            {state.status === "submitting"
              ? t("settingsShell.feedbackSubmitting")
              : t("settingsShell.feedbackSubmit")}
          </button>
          {state.status === "done" ? (
            <span
              style={{
                fontSize: "0.85rem",
                color: state.ok ? "#008060" : "#d72c0d",
              }}
            >
              {state.message}
            </span>
          ) : null}
        </div>
      </PageSurface>
    </div>
  );
}
