export type ResolveBackDestinationParams = {
  fallbackPath: string;
  locationSearch?: string;
  preserveSearch?: boolean;
  returnTo?: string;
};

export type BackDestination = {
  to: string;
  replace: boolean;
};

function joinPathAndSearch(path: string, search: string): string {
  const extra = search.startsWith("?") ? search.slice(1) : search;
  if (!extra) return path;
  return path.includes("?") ? `${path}&${extra}` : `${path}?${extra}`;
}

/**
 * 页头返回按钮只做语义跳转，不用浏览器后退。
 * 有 returnTo 时 replace，避免中间页留在历史栈里，父页再返回时弹回详情。
 */
export function resolveBackDestination(params: ResolveBackDestinationParams): BackDestination {
  const returnTo = params.returnTo?.trim();
  if (returnTo) {
    return { to: returnTo, replace: true };
  }

  const search = params.preserveSearch ? (params.locationSearch ?? "") : "";
  return {
    to: joinPathAndSearch(params.fallbackPath, search),
    replace: false,
  };
}
