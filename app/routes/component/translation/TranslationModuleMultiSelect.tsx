import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getTranslationModuleOptions } from "../../../lib/translationModuleLabels";
import { TranslationMultiSelect } from "./TranslationMultiSelect";

export type TranslationModuleMultiSelectProps = {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  label?: string;
};

export function TranslationModuleMultiSelect({
  id,
  values,
  onChange,
  disabled = false,
  label,
}: TranslationModuleMultiSelectProps) {
  const { t } = useTranslation();
  const options = useMemo(() => getTranslationModuleOptions(t), [t]);

  return (
    <TranslationMultiSelect
      id={id}
      label={label ?? t("translationRuntime.moduleTitle")}
      options={options}
      values={values}
      onChange={onChange}
      disabled={disabled}
      summaryMode="count"
    />
  );
}
