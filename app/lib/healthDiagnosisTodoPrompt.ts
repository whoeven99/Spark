import type { HealthDiagnosisCardTask } from "./healthDiagnosisCardPayload";

export function formatHealthDiagnosisTodoPrompt(
  template: string,
  task: Pick<HealthDiagnosisCardTask, "title" | "triggerReason" | "suggestedActions" | "relatedLines">,
  emptyActions: string,
  emptyRelated: string,
): string {
  return template
    .replaceAll("{{title}}", task.title.trim() || "—")
    .replaceAll("{{reason}}", task.triggerReason.trim() || "—")
    .replaceAll(
      "{{actions}}",
      task.suggestedActions.map((item) => item.trim()).filter(Boolean).join("；") || emptyActions,
    )
    .replaceAll(
      "{{related}}",
      task.relatedLines.map((item) => item.trim()).filter(Boolean).join("\n") || emptyRelated,
    );
}
