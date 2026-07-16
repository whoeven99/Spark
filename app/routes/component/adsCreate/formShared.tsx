import type { CSSProperties, ReactNode } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";

// ─── 共享样式常量 ─────────────────────────────────────────────────────────────

export const formStyles = {
  formWrap: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  } satisfies CSSProperties,

  card: {
    background: pageColorTokens.surface,
    border: `1px solid ${pageColorTokens.border}`,
    borderRadius: pageColorTokens.radiusCard,
    padding: 20,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    boxShadow: pageColorTokens.shadowCard,
  } satisfies CSSProperties,

  sectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } satisfies CSSProperties,

  label: {
    fontSize: 13,
    fontWeight: 600,
    color: pageColorTokens.textPrimary,
    display: "block",
    marginBottom: 4,
  } satisfies CSSProperties,

  hint: {
    fontSize: 12,
    color: pageColorTokens.textSecondary,
    marginTop: 4,
    display: "block",
  } satisfies CSSProperties,

  input: {
    width: "100%",
    padding: "9px 11px",
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.borderInput}`,
    fontSize: 13,
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
    outline: "none",
  } satisfies CSSProperties,

  select: {
    width: "100%",
    padding: "9px 11px",
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.borderInput}`,
    fontSize: 13,
    fontFamily: "inherit",
    background: pageColorTokens.surface,
    boxSizing: "border-box" as const,
  } satisfies CSSProperties,

  textarea: {
    width: "100%",
    padding: "9px 11px",
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.borderInput}`,
    fontSize: 13,
    fontFamily: "inherit",
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
    outline: "none",
  } satisfies CSSProperties,

  radioGroup: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,

  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    cursor: "pointer",
    color: pageColorTokens.textPrimary,
  } satisfies CSSProperties,

  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,

  btnRow: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
    paddingTop: 4,
  } satisfies CSSProperties,

  btnPrimary: {
    padding: "10px 18px",
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.brandGreen,
    color: "#fff",
    border: "none",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  } satisfies CSSProperties,

  btnSecondary: {
    padding: "10px 18px",
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surface,
    color: pageColorTokens.textPrimary,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  } satisfies CSSProperties,

  charCount: {
    fontSize: 11,
    color: pageColorTokens.textSecondary,
    display: "block",
    textAlign: "right" as const,
    marginTop: 2,
  } satisfies CSSProperties,

  successBox: {
    background: pageColorTokens.brandGreenLight,
    color: pageColorTokens.brandGreenDeep,
    padding: "10px 12px",
    borderRadius: pageColorTokens.radiusControl,
    fontSize: 13,
  } satisfies CSSProperties,

  errorBox: {
    background: pageColorTokens.criticalBg,
    color: pageColorTokens.criticalText,
    padding: "10px 12px",
    borderRadius: pageColorTokens.radiusControl,
    fontSize: 13,
  } satisfies CSSProperties,
};

// ─── 共享组件 ─────────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, hint, required, children }: FormFieldProps) {
  return (
    <div style={{ flex: "1 1 200px" }}>
      <label style={formStyles.label}>
        {label}
        {required && <span style={{ color: pageColorTokens.criticalText, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <span style={formStyles.hint}>{hint}</span>}
    </div>
  );
}

interface StepIndicatorProps {
  steps: string[];
  current: number;
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const active = stepNum === current;
        const done = stepNum < current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: pageColorTokens.radiusControl,
                background: active
                  ? pageColorTokens.brandGreen
                  : done
                    ? pageColorTokens.brandGreenLight
                    : pageColorTokens.surfaceMuted,
                flex: 1,
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: active ? "#fff" : done ? pageColorTokens.brandGreenDeep : pageColorTokens.borderSubtle,
                  color: active ? pageColorTokens.brandGreen : done ? "#fff" : pageColorTokens.textSecondary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : stepNum}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#fff" : done ? pageColorTokens.brandGreenDeep : pageColorTokens.textSecondary,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 8, height: 1, background: pageColorTokens.border, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface SubmitResultProps {
  ok: boolean;
  msg: string;
}

export function SubmitResult({ ok, msg }: SubmitResultProps) {
  return <div style={ok ? formStyles.successBox : formStyles.errorBox}>{msg}</div>;
}
