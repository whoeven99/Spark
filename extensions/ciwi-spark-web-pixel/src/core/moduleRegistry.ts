import type { PixelExtensionSettings } from "./config";
import type { EventBus } from "./eventBus";
import type { BaseContext } from "./schema";
import type { Sink } from "./sink";

/**
 * 模块上下文：每个 PixelModule 在 `init(ctx)` 里拿到这套能力做事。
 * 想新增一类业务（图片替换追踪、翻译效果追踪等）= 新增一个 module 文件，
 * 在 `index.ts` 里注册即可，不需要动 core 层。
 */
export type ModuleContext = {
  settings: PixelExtensionSettings;
  base: BaseContext;
  sink: Sink;
  bus: EventBus;
  /** 仅 debug 模式下输出，避免污染商家 console。 */
  log: (...args: unknown[]) => void;
};

export type PixelModule = {
  /** 用于日志识别。 */
  name: string;
  /**
   * 注册业务订阅 / 副作用。可选返回一个 dispose 函数（当前未调用，预留）。
   */
  init: (ctx: ModuleContext) => void | (() => void);
};

/** 模块注册的扩展点 —— 入口 `index.ts` 通过它装配所有 module。 */
export function registerModule(ctx: ModuleContext, mod: PixelModule): void {
  try {
    mod.init(ctx);
    ctx.log(`module "${mod.name}" registered`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ciwi-spark-web-pixel] module "${mod.name}" init failed`, err);
  }
}
