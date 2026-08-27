export type RoiFocus = "overview" | "channels" | "loss";

export function mapLegacyRoiValueTab(valueTab: string | null | undefined): {
  focus?: "channels";
  settings?: "cost";
} {
  if (valueTab === "channels") return { focus: "channels" };
  if (valueTab === "cost") return { settings: "cost" };
  return {};
}

export function resolveRoiFocus(searchParams: URLSearchParams): RoiFocus {
  const rawFocus = searchParams.get("focus");
  if (rawFocus === "channels" || rawFocus === "loss") return rawFocus;
  if (searchParams.get("valueTab") === "channels") return "channels";
  return "overview";
}

export function shouldOpenRoiCostSettings(searchParams: URLSearchParams): boolean {
  return searchParams.get("settings") === "cost" || searchParams.get("valueTab") === "cost";
}

export function stripConsumedRoiDeepLinkParams(
  searchParams: URLSearchParams,
): URLSearchParams | null {
  const valueTab = searchParams.get("valueTab");
  if (!valueTab) return null;

  const next = new URLSearchParams(searchParams);
  next.delete("valueTab");
  if (valueTab === "channels") {
    const currentFocus = next.get("focus");
    if (currentFocus !== "channels" && currentFocus !== "loss") {
      next.set("focus", "channels");
    }
  }
  if (valueTab === "cost") {
    next.set("settings", "cost");
  }
  return next;
}
