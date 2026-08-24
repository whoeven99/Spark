import type { CSSProperties } from "react";
import { DestinationFilterBar } from "../shared/DestinationPage";
import { PageSurface, pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

export type TodayCountryFilterOption = {
  key: string;
  label: string;
};

export function TodayCountryFilterCard({
  options,
  activeCountry,
  onChange,
  summary,
  notes = [],
}: {
  options: TodayCountryFilterOption[];
  activeCountry: string;
  onChange: (country: string) => void;
  summary: string;
  notes?: string[];
}) {
  return (
    <PageSurface title="地区视角" subtitle="先在这里切换总览或单地区，再往下看对应的数据结论。">
      <div style={filterWrapStyle}>
        <DestinationFilterBar label="经营范围" items={options} active={activeCountry} onChange={onChange} />
        <div style={summaryStyle}>{summary}</div>
        {notes.length > 0 ? (
          <div style={notesWrapStyle}>
            {notes.map((note) => (
              <div key={note} style={pageHintTextStyle}>
                {note}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </PageSurface>
  );
}

const filterWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

const summaryStyle: CSSProperties = {
  padding: "0.85rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  fontSize: "0.875rem",
  lineHeight: 1.55,
};

const notesWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};
