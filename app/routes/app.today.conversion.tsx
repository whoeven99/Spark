import { getTodayMetricDetail } from "../lib/todayMetricModules";
import { TodayMetricDetailPage } from "./page/TodayMetricDetailPage";

export default function TodayConversionPage() {
  return <TodayMetricDetailPage data={getTodayMetricDetail("conversion")} />;
}
