import { useEffect, useState } from "react";

const DEFAULT_MOBILE_BREAKPOINT = 768;
const DEFAULT_NARROW_BREAKPOINT = 420;

type Options = {
  mobileBreakpoint?: number;
  narrowBreakpoint?: number;
};

type ResponsiveLayoutState = {
  width: number;
  isMobile: boolean;
  isNarrowMobile: boolean;
};

function readLayoutState(options?: Options): ResponsiveLayoutState {
  if (typeof window === "undefined") {
    return {
      width: 1280,
      isMobile: false,
      isNarrowMobile: false,
    };
  }

  const width = window.innerWidth;
  const mobileBreakpoint = options?.mobileBreakpoint ?? DEFAULT_MOBILE_BREAKPOINT;
  const narrowBreakpoint = options?.narrowBreakpoint ?? DEFAULT_NARROW_BREAKPOINT;

  return {
    width,
    isMobile: width <= mobileBreakpoint,
    isNarrowMobile: width <= narrowBreakpoint,
  };
}

export function useResponsiveLayout(options?: Options): ResponsiveLayoutState {
  const [state, setState] = useState<ResponsiveLayoutState>(() => readLayoutState(options));

  useEffect(() => {
    const update = () => setState(readLayoutState(options));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [options?.mobileBreakpoint, options?.narrowBreakpoint]);

  return state;
}
