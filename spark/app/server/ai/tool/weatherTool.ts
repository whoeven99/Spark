import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const weatherToolSchema = z.object({
  city: z.string().min(1, "城市名不能为空"),
});

async function queryWeather(city: string) {
  try {
    const response = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
    );

    if (!response.ok) {
      throw new Error(`Weather API failed with status ${response.status}`);
    }

    const data = (await response.json()) as {
      current_condition?: Array<{
        temp_C?: string;
        weatherDesc?: Array<{ value?: string }>;
        humidity?: string;
      }>;
    };

    const current = data.current_condition?.[0];
    if (!current) {
      return `暂时无法获取 ${city} 的天气信息。`;
    }

    const desc = current.weatherDesc?.[0]?.value ?? "未知天气";
    const temp = current.temp_C ?? "未知";
    const humidity = current.humidity ?? "未知";

    return `${city} 当前天气：${desc}，温度 ${temp}°C，湿度 ${humidity}%。`;
  } catch {
    return `查询天气失败：暂时无法获取 ${city} 的天气，请稍后重试。`;
  }
}

export const weatherTool = new DynamicStructuredTool({
  name: "get_weather",
  description: "根据城市名查询天气信息。",
  schema: weatherToolSchema,
  func: async ({ city }) => {
    return queryWeather(city);
  },
});
