/**
 * 凭据模块卡片（PR2）：广告/物流凭据的统一录入 UI。
 * 复用既有 headless 端点：GET 端点取「是否已配置 + 脱敏值」，POST 端点保存（服务端校验）。
 * 凭据为敏感信息，输入框不回填明文；如需更新整组重新填写即可。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";

export type CredentialField = {
  name: string;
  label: string;
  type?: "text" | "password";
  optional?: boolean;
};

type StatusResponse = {
  configured?: boolean;
  updatedAt?: string;
  [key: string]: unknown;
};

export function CredentialModuleCard({
  title,
  endpoint,
  fields,
  primaryMaskKey,
}: {
  title: string;
  endpoint: string;
  fields: CredentialField[];
  /** GET 响应里用于展示的脱敏字段名（如 clientIdMasked） */
  primaryMaskKey?: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const search = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}${search}`)
      .then((r) => r.json())
      .then((d: StatusResponse) => {
        if (!cancelled) setStatus(d);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, search]);

  const refreshStatus = () => {
    fetch(`${endpoint}${search}`)
      .then((r) => r.json())
      .then((d: StatusResponse) => setStatus(d))
      .catch(() => undefined);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`${endpoint}${search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setValues({});
        setResult({ ok: true, message: t("settingsShell.credSaved") });
        refreshStatus();
      } else {
        setResult({ ok: false, message: data.error ?? t("settingsShell.credSaveError") });
      }
    } catch {
      setResult({ ok: false, message: t("settingsShell.credSaveError") });
    } finally {
      setSaving(false);
    }
  };

  const configured = Boolean(status?.configured);
  const updatedAt = status?.updatedAt ? String(status.updatedAt) : "";
  const maskedPrimary =
    primaryMaskKey && status ? String((status[primaryMaskKey] as string) ?? "") : "";

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusControl,
        background: pageColorTokens.surface,
        padding: "1rem 1.1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: pageColorTokens.textPrimary }}>
          {title}
        </span>
        <span
          style={{
            fontSize: "0.72rem",
            padding: "0.1rem 0.5rem",
            borderRadius: 999,
            background: configured ? "rgba(0,128,96,0.1)" : "rgba(140,145,150,0.12)",
            color: configured ? "#008060" : pageColorTokens.textSecondary,
          }}
        >
          {configured ? t("settingsShell.credConfigured") : t("settingsShell.credNotConfigured")}
        </span>
        {configured && maskedPrimary ? (
          <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
            {maskedPrimary}
          </span>
        ) : null}
        {configured && updatedAt ? (
          <span style={{ fontSize: "0.72rem", color: pageColorTokens.textSecondary, marginLeft: "auto" }}>
            {t("settingsShell.credUpdatedAt")}：{new Date(updatedAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {fields.map((field) => (
          <label key={field.name} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              {field.label}
              {field.optional ? `（${t("settingsShell.credOptional")}）` : ""}
            </span>
            <input
              type={field.type === "password" ? "password" : "text"}
              value={values[field.name] ?? ""}
              autoComplete="off"
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }
              style={{
                padding: "0.5rem 0.7rem",
                borderRadius: pageColorTokens.radiusControl,
                border: `1px solid ${pageColorTokens.border}`,
                fontSize: "0.85rem",
                boxSizing: "border-box",
              }}
            />
          </label>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.85rem" }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{
            padding: "0.5rem 1.1rem",
            borderRadius: pageColorTokens.radiusControl,
            border: "none",
            background: saving ? "#9aa5b1" : "#008060",
            color: "#fff",
            fontSize: "0.85rem",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? t("settingsShell.credSaving") : t("settingsShell.credSave")}
        </button>
        {result ? (
          <span style={{ fontSize: "0.8rem", color: result.ok ? "#008060" : "#d72c0d" }}>
            {result.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
