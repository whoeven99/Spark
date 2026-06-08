export type SkillStepProgress = {
  skill: string;
  stepId: string;
  label: string;
  status: "running" | "completed" | "skipped" | "error";
  detail?: string;
};

export function hasStreamingVisualContent(state: {
  streamingText: string;
  skillSteps: SkillStepProgress[];
  streamingTranslationForm?: unknown;
  streamingGenerateCard: boolean;
}): boolean {
  return Boolean(
    state.streamingText.trim() ||
      state.skillSteps.length > 0 ||
      state.streamingTranslationForm ||
      state.streamingGenerateCard,
  );
}
