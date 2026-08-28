/** 订单回补 API 响应（聊天卡 / Settings 共用类型）。 */

export type OrderBackfillApiResponse =
  | {
      success: true;
      response: {
        synced: number;
        skipped: number;
        errors: number;
        daysBack: number;
      };
    }
  | {
      success: false;
      errorCode: number;
      errorMsg: string;
      response: null;
    };
