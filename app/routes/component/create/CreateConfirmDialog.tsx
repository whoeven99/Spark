import { Alert, Button } from "antd";
import { useTranslation } from "react-i18next";
import { DialogShell } from "../shared/DialogShell";
import { pageColorTokens } from "../../page/pageUiStyles";

export type CreateConfirmRow = {
  label: string;
  value: string;
};

/**
 * 创作页统一的二次确认弹窗（docs/INTERACTION_DESIGN.md §5.1）。
 *
 * 会消耗 Credit 或写店铺数据的操作都走这里：说明这次做什么、影响哪些对象、
 * 预计耗时与消耗，再给确认。执行前的预估只放在这个弹窗，不在配置页常驻。
 */
export function CreateConfirmDialog({
  open,
  title,
  goal,
  rows,
  confirmLabel,
  loading = false,
  errorText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  goal: string;
  rows: CreateConfirmRow[];
  confirmLabel: string;
  loading?: boolean;
  errorText?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      closeDisabled={loading}
      title={title}
      description={goal}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={loading} onClick={onCancel}>
            {t("createPage.confirm.cancel")}
          </Button>
          <Button type="primary" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {rows.length > 0 ? (
          <dl className="m-0 flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-4">
                <dt className="m-0 text-xs" style={{ color: pageColorTokens.textSecondary }}>
                  {row.label}
                </dt>
                <dd
                  className="m-0 max-w-[65%] break-words text-right text-xs font-semibold"
                  style={{ color: pageColorTokens.textPrimary }}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {errorText ? <Alert type="error" showIcon message={errorText} /> : null}
      </div>
    </DialogShell>
  );
}
