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
  streamingGenerateCard: boolean;
  streamingPictureTranslateCard?: boolean;
  streamingImageGenerationCard?: boolean;
  streamingQualityCard?: boolean;
  streamingTaskProposal?: unknown;
}): boolean {
  return Boolean(
    state.streamingText.trim() ||
      state.skillSteps.length > 0 ||
      state.streamingGenerateCard ||
      state.streamingPictureTranslateCard ||
      state.streamingImageGenerationCard ||
      state.streamingQualityCard ||
      state.streamingTaskProposal,
  );
}
