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
  streamingPictureTranslateCard?: boolean;
  streamingImageGenerationCard?: boolean;
  streamingBatchTasksCard?: boolean;
}): boolean {
  return Boolean(
    state.streamingText.trim() ||
      state.skillSteps.length > 0 ||
      state.streamingTranslationForm ||
      state.streamingGenerateCard ||
      state.streamingPictureTranslateCard ||
      state.streamingImageGenerationCard ||
      state.streamingBatchTasksCard,
  );
}
