import { useEffect, useRef, useState } from "react";
import styles from "./billingPage.module.css";

const DEFAULT_DURATION_MS = 1200;

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return prefersReducedMotion;
}

type AnimatedCreditBalanceProps = {
  value: number;
  animateFrom?: number | null;
  locale: string;
  className?: string;
  durationMs?: number;
  onAnimationComplete?: () => void;
};

export function AnimatedCreditBalance({
  value,
  animateFrom,
  locale,
  className,
  durationMs = DEFAULT_DURATION_MS,
  onAnimationComplete,
}: AnimatedCreditBalanceProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate =
    animateFrom != null &&
    animateFrom !== value &&
    value > animateFrom &&
    !prefersReducedMotion;
  const [displayValue, setDisplayValue] = useState(
    shouldAnimate ? animateFrom : value,
  );
  const [isAnimating, setIsAnimating] = useState(shouldAnimate);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayValue(value);
      setIsAnimating(false);
      return;
    }

    setDisplayValue(animateFrom);
    setIsAnimating(true);
    completedRef.current = false;

    let frameId = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const nextValue = Math.round(
        animateFrom + (value - animateFrom) * easeOutCubic(progress),
      );
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
        return;
      }

      setDisplayValue(value);
      setIsAnimating(false);
      if (!completedRef.current) {
        completedRef.current = true;
        onAnimationComplete?.();
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [animateFrom, durationMs, onAnimationComplete, shouldAnimate, value]);

  return (
    <span
      className={`${className ?? ""} ${isAnimating ? styles.creditBalanceAnimating : ""}`.trim()}
      aria-live={isAnimating ? "polite" : undefined}
    >
      {displayValue.toLocaleString(locale)}
    </span>
  );
}
