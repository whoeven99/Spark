/**
 * @deprecated Import from `app/lib/translationV4/state` instead.
 * Kept as a re-export so existing import paths keep working; the canonical,
 * client-safe source of truth for V4 status/progress/stage/display now lives in
 * `./translationV4/state`.
 */
export {
  TRANSLATION_V4_UNIT_LABEL,
  resolveTranslateProgressCounts,
  translateProgressPercent,
  formatV4TaskDate,
  formatV4TaskElapsed,
  formatV4JobTimeLine,
  formatTranslationV4TranslateDetail,
  formatTranslationV4TranslateDetailLocalized,
} from "./translationV4/state";
