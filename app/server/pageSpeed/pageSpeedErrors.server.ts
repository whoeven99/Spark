import type { PageSpeedErrorCode } from "../../lib/pageSpeedTypes";

export class PageSpeedRequestError extends Error {
  constructor(
    message: string,
    readonly errorCode: PageSpeedErrorCode,
    readonly status = 502,
  ) {
    super(message);
    this.name = "PageSpeedRequestError";
  }
}
