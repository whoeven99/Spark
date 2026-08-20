import { getTodayMetricDetail } from "../lib/todayMetricModules";
import { TodayMetricDetailPage } from "./page/TodayMetricDetailPage";

export default function TodayTrafficPage() {
  return <TodayMetricDetailPage data={getTodayMetricDetail("traffic")} />;
}
