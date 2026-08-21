import { useSearchParams } from "react-router";
import { getTodayMetricDetail } from "../lib/todayMetricModules";
import { TodayMetricDetailPage } from "./page/TodayMetricDetailPage";

export default function TodayConversionPage() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;

  return <TodayMetricDetailPage data={getTodayMetricDetail("conversion")} returnTo={returnTo} />;
}
