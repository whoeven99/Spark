"use client";

import React, { useState, useEffect } from "react";

export type ScheduleLogRecord = {
  id: string;
  taskId: string;
  shopName: string;
  taskName?: string;
  eventType: string;
  statusBefore?: number;
  statusAfter?: number;
  queueStage?: string;
  enqueuedAt?: number;
  dequeuedAt?: number;
  processedAt?: number;
  message: string;
  errorMsg?: string;
  success: boolean;
  createdAt: number;
  source: string;
};

export type ScheduleLogPanelProps = {
  taskId?: string;
  shopName?: string;
  compact?: boolean;
};

/**
 * 获取事件类型的中文标签
 */
function getEventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    ENQUEUED_INIT: "入队 (初始化)",
    ENQUEUED_TRANSLATE: "入队 (翻译)",
    DEQUEUED_INIT: "出队 (初始化)",
    DEQUEUED_TRANSLATE: "出队 (翻译)",
    PROCESS_INIT_START: "开始处理 (初始化)",
    PROCESS_INIT_END: "完成处理 (初始化)",
    PROCESS_TRANSLATE_START: "开始处理 (翻译)",
    PROCESS_TRANSLATE_END: "完成处理 (翻译)",
    PROCESS_INIT_ERROR: "处理失败 (初始化)",
    PROCESS_TRANSLATE_ERROR: "处理失败 (翻译)",
  };
  return labels[eventType] || eventType;
}

/**
 * 获取事件类型的颜色
 */
function getEventTypeColor(eventType: string): string {
  if (eventType.includes("ENQUEUED")) return "blue";
  if (eventType.includes("DEQUEUED")) return "purple";
  if (eventType.includes("START")) return "orange";
  if (eventType.includes("END")) return "green";
  if (eventType.includes("ERROR")) return "red";
  return "gray";
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

        const queryType = taskId ? "task" : "shop";
        const url = new URL("/api/translate/v3/json-schedule-logs", window.location.origin);
        url.searchParams.set("queryType", queryType);
        if (taskId) {
          url.searchParams.set("taskId", taskId);
        } else if (shopName) {
          url.searchParams.set("shopName", shopName);
        }
        url.searchParams.set("limit", "200");

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.success && data.response) {
          setLogs(data.response.logs || []);
          setSummary(data.response.summary || {});
        } else {
          setError(data.errorMsg || "Failed to load schedule logs");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schedule logs");
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
