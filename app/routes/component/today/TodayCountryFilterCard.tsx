import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { localizeCountryOptions } from "../../../lib/todayCopy";
import { DestinationFilterBar } from "../shared/DestinationPage";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

export type TodayCountryFilterOption = {
  key: string;
  label: string;
};

export function TodayCountryFilterCard({
  options,
  activeCountry,
  onChange,
  focusOptions,
  activeFocus,
  onFocusChange,
  notes = [],
}: {
  options: TodayCountryFilterOption[];
  activeCountry: string;
  onChange: (country: string) => void;
  focusOptions?: Array<{ key: string; label: string }>;
  activeFocus?: string;
  onFocusChange?: (focus: string) => void;
  notes?: string[];
}) {
  const { t } = useTranslation();
  const countryOptions = localizeCountryOptions(options, t);

  return (
    <div style={filterWrapStyle}>
      <div style={filterGridStyle}>
        <DestinationFilterBar label={t("today.filters.scope")} items={countryOptions} active={activeCountry} onChange={onChange} />
        {focusOptions && focusOptions.length > 0 && activeFocus && onFocusChange ? (
          <DestinationFilterBar
            label={t("today.analysis.currentFocus")}
            items={focusOptions}
            active={activeFocus}
            onChange={onFocusChange}
          />
        ) : null}
      </div>
      {notes.length > 0 ? (
        <div style={notesWrapStyle}>
          {notes.map((note) => (
            <div key={note} style={noteItemStyle}>
              {note}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const filterWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.6rem",
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "0.75rem",
  alignItems: "start",
};

const notesWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
};

const noteItemStyle: CSSProperties = {
  ...pageHintTextStyle,
  padding: "0.15rem 0",
  color: pageColorTokens.textSecondary,
};
