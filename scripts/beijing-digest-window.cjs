/**
 * 北京时间日历日窗口（Asia/Shanghai，无夏令时）
 */

function formatBeijingYmd(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDaysYmd(ymd, deltaDays) {
  const [y, m, d] = ymd.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

/**
 * 以 referenceDate 为「当前时刻」，取北京时区 **昨日** 00:00:00（含）至 **今日** 00:00:00（不含）。
 * @returns {{ start: Date, end: Date, windowLabel: string, reportDate: string }}
 */
function getBeijingYesterdayWindow(referenceDate = new Date()) {
  const todayBj = formatBeijingYmd(referenceDate);
  const yesterdayBj = addCalendarDaysYmd(todayBj, -1);
  const start = new Date(`${yesterdayBj}T00:00:00+08:00`);
  const end = new Date(`${todayBj}T00:00:00+08:00`);
  const windowLabel = `${yesterdayBj} 北京时间 00:00–24:00`;
  return { start, end, windowLabel, reportDate: yesterdayBj };
}

function getLookbackWindow(hours, referenceDate = new Date()) {
  const end = referenceDate;
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const windowLabel = `过去 ${hours} 小时（截至 ${formatBeijingYmd(end)} 北京日历日）`;
  return {
    start,
    end,
    windowLabel,
    reportDate: formatBeijingYmd(end),
  };
}

module.exports = {
  formatBeijingYmd,
  addCalendarDaysYmd,
  getBeijingYesterdayWindow,
  getLookbackWindow,
};
