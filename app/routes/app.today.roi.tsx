import { getTodayMetricDetail } from "../lib/todayMetricModules";
import { TodayMetricDetailPage } from "./page/TodayMetricDetailPage";

export default function TodayRoiPage() {
  return <TodayMetricDetailPage data={getTodayMetricDetail("roi")} />;
}
