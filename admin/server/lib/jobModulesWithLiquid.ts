/** Virtual Turso LiquidRule module. Not a Shopify resource; never persist into job.modules. */
export const CUSTOM_LIQUID_MODULE = "CUSTOM_LIQUID";

/** Align with TSF Worker `jobModulesWithLiquid`: includeLiquid → append CUSTOM_LIQUID. */
export function jobModulesWithLiquid(job: {
  modules?: string[] | null;
  includeLiquid?: boolean | null;
}): string[] {
  const modules = Array.isArray(job.modules) ? [...job.modules] : [];
  if (job.includeLiquid && !modules.includes(CUSTOM_LIQUID_MODULE)) {
    modules.push(CUSTOM_LIQUID_MODULE);
  }
  return modules;
}
