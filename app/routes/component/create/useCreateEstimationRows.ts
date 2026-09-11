import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatEstimatedDuration } from "../../../lib/formatDuration";
import type { CreateEstimation } from "../../app.create";
import type { CreateConfirmRow } from "./CreateConfirmDialog";

/**
 * 把执行前预估拼成确认弹窗的行。冷启动没样本时展示「数据不足」，不编造数字。
 */
export function useCreateEstimationRows() {
  const { t } = useTranslation();

  return useCallback(
    (estimation: CreateEstimation): CreateConfirmRow[] => [
      {
        label: t("createPage.confirm.estimatedDuration"),
        value: formatEstimatedDuration(estimation.seconds, t),
      },
      {
        label: t("createPage.confirm.estimatedCredits"),
        value:
          estimation.credits > 0
            ? t("createPage.confirm.creditsValue", { value: estimation.credits })
            : t("createPage.confirm.creditsUnknown"),
      },
    ],
    [t],
  );
}
