import { getGeneratedImageJobForShop } from "./imageGenerationJobStore.server";
import type { ImageGenerationStatusHttpResponse } from "./types";

export async function getImageGenerationStatusResponse(params: {
  requestId: string;
  sessionShop: string;
}): Promise<{ status: number; body: ImageGenerationStatusHttpResponse }> {
  const job = await getGeneratedImageJobForShop({
    requestId: params.requestId,
    shop: params.sessionShop,
  });

  if (!job) {
    return {
      status: 404,
      body: {
        success: false,
        errorCode: 40400,
        errorMsg: "未找到该生成任务",
        requestId: params.requestId,
      },
    };
  }

  if (job.status === "pending") {
    return {
      status: 200,
      body: {
        success: true,
        requestId: job.requestId,
        status: "pending",
      },
    };
  }

  if (job.status === "failed") {
    return {
      status: 200,
      body: {
        success: true,
        requestId: job.requestId,
        status: "failed",
        errorMsg: job.errorMsg || "图片生成失败",
      },
    };
  }

  if (!job.imageUrl) {
    return {
      status: 200,
      body: {
        success: true,
        requestId: job.requestId,
        status: "failed",
        errorMsg: "图片已生成但无法读取存储地址",
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      requestId: job.requestId,
      status: "succeeded",
      imageUrl: job.imageUrl,
    },
  };
}
