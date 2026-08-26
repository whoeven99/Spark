import type { CSSProperties } from "react";
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
  return (
    <div style={filterWrapStyle}>
      <div style={filterGridStyle}>
        <DestinationFilterBar label="经营范围" items={options} active={activeCountry} onChange={onChange} />
        {focusOptions && focusOptions.length > 0 && activeFocus && onFocusChange ? (
          <DestinationFilterBar
            label="当前焦点"
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
