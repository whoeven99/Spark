"use client";

import React, { useState, useEffect } from "react";
import {
  fetchScheduleLogsByTaskId,
  fetchScheduleLogsByShop,
  getEventTypeColor,
  getEventTypeLabel,
  type ScheduleLogRecord,
} from "../../server/translation/scheduleLogService.server";

export type ScheduleLogPanelProps = {
  taskId?: string;
  shopName?: string;
  compact?: boolean;
};

export function ScheduleLogPanel({ taskId, shopName, compact = false }: ScheduleLogPanelProps) {
  const [logs, setLogs] = useState<ScheduleLogRecord[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const data = taskId
          ? await fetchScheduleLogsByTaskId(taskId, 200)
          : await fetchScheduleLogsByShop(shopName || "", undefined, undefined, 100);

        if (data) {
          setLogs(data.logs || []);
          setSummary(data.summary || {});
        } else {
          setError("Failed to load schedule logs");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId, shopName]);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading schedule logs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
        {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No schedule logs found
      </div>
    );
  }

  return (
    <div className="schedule-log-panel space-y-4">
      {/* Event Summary Cards */}
      {Object.keys(summary).length > 0 && (
        <div className="summary-cards grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {Object.entries(summary).map(([eventType, count]) => (
            <div
              key={eventType}
              className={`p-3 rounded border-l-4 bg-gray-50`}
              style={{
                borderLeftColor: getEventTypeColorRGB(getEventTypeColor(eventType)),
              }}
            >
              <div className="text-xs font-semibold text-gray-600">
                {getEventTypeLabel(eventType)}
              </div>
              <div className="text-lg font-bold text-gray-800">{count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline View */}
      <div className="timeline space-y-2">
        {logs.map((log, idx) => (
          <ScheduleLogEntry
            key={log.id}
            log={log}
            compact={compact}
            isFirst={idx === 0}
            isLast={idx === logs.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function ScheduleLogEntry({
  log,
  compact,
  isFirst,
  isLast,
}: {
  log: ScheduleLogRecord;
  compact: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const timestamp = new Date(log.createdAt).toLocaleString("zh-CN");
  const color = getEventTypeColor(log.eventType);
  const colorRGB = getEventTypeColorRGB(color);

  return (
    <div className={`log-entry flex gap-3 ${!isLast ? "pb-2 border-b border-gray-200" : ""}`}>
      {/* Timeline dot and line */}
      <div className="flex flex-col items-center pt-1">
        <div
          className="w-3 h-3 rounded-full ring-2 ring-white"
          style={{ backgroundColor: colorRGB }}
        />
        {!isLast && (
          <div
            className="w-0.5 h-8 mt-1"
            style={{ backgroundColor: colorRGB + "40" }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="font-semibold text-sm text-gray-800">
              {getEventTypeLabel(log.eventType)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{timestamp}</div>
          </div>
          {!log.success && (
            <div className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
              Failed
            </div>
          )}
        </div>

        {!compact && (
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            {log.message && (
              <div>
                <span className="text-gray-600">Message:</span> {log.message}
              </div>
            )}
            {log.errorMsg && (
              <div className="text-red-600">
                <span className="text-gray-600">Error:</span> {log.errorMsg}
              </div>
            )}
            {log.statusBefore !== undefined && log.statusAfter !== undefined && (
              <div>
                <span className="text-gray-600">Status:</span> {log.statusBefore} → {log.statusAfter}
              </div>
            )}
            <div className="text-gray-500">
              <span className="text-gray-600">Task:</span> {log.taskId}
              {log.shopName && (
                <>
                  <span className="text-gray-600"> | Shop:</span> {log.shopName}
                </>
              )}
              {log.source && (
                <>
                  <span className="text-gray-600"> | Source:</span> {log.source}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getEventTypeColorRGB(color: string): string {
  const colors: Record<string, string> = {
    blue: "#3b82f6",
    purple: "#a855f7",
    orange: "#f97316",
    green: "#22c55e",
    red: "#ef4444",
    gray: "#9ca3af",
  };
  return colors[color] || colors.gray;
}
