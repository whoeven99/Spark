import { Router } from "express";

export const capabilitiesRouter = Router();

const CAPABILITIES = {
  skills: [
    {
      name: "shopifyShopInfo",
      displayName: "Shopify 店铺数据",
      description: "查询店铺基础信息、销售数据、库存状态及 OAuth 授权范围",
      category: "店铺运营",
      conditional: false,
      tools: [
        {
          name: "get_shopify_shop_info",
          displayName: "获取店铺基础信息",
          description: "查询店铺名称、域名、邮箱、货币、时区、套餐等基础信息",
          params: [],
        },
        {
          name: "get_shopify_today_sales",
          displayName: "查询销售额",
          description: "查询指定天数内的总销售额",
          params: [{ name: "days", type: "number", desc: "1-90 天，默认 1 天" }],
        },
        {
          name: "get_shopify_today_order_count",
          displayName: "查询订单数",
          description: "查询指定天数内的订单数量",
          params: [{ name: "days", type: "number", desc: "1-90 天，默认 1 天" }],
        },
        {
          name: "get_shopify_today_conversion_rate",
          displayName: "查询转化率",
          description: "计算订单数与（订单数 + 弃单数）之比",
          params: [{ name: "days", type: "number", desc: "1-90 天，默认 1 天" }],
        },
        {
          name: "get_shopify_today_aov",
          displayName: "查询客单价",
          description: "计算平均订单金额（AOV）",
          params: [{ name: "days", type: "number", desc: "1-90 天，默认 1 天" }],
        },
        {
          name: "get_shopify_today_source_performance",
          displayName: "查询流量来源销售",
          description: "按流量来源（渠道）拆分销售数据",
          params: [{ name: "days", type: "number", desc: "1-90 天，默认 1 天" }],
        },
        {
          name: "get_shopify_today_abandonment_rate",
          displayName: "查询弃购率",
          description: "查询购物车放弃率",
          params: [{ name: "days", type: "number", desc: "1-90 天，默认 1 天" }],
        },
        {
          name: "get_shopify_today_refund_return_rate",
          displayName: "查询退款退货率",
          description: "查询退款率和退款总金额",
          params: [{ name: "days", type: "number", desc: "1-90 天，默认 1 天" }],
        },
        {
          name: "get_shopify_inventory_health",
          displayName: "查询库存健康状态",
          description: "检测低库存、缺货商品，输出库存预警",
          params: [],
        },
        {
          name: "get_shopify_app_scopes",
          displayName: "查询 OAuth 授权范围",
          description: "查询当前店铺已授权的 Shopify API 权限范围",
          params: [],
        },
        {
          name: "diagnose_shopify_order_access",
          displayName: "诊断订单访问权限",
          description: "诊断订单数据访问失败的原因",
          params: [],
        },
      ],
    },
    {
      name: "translationTaskForm",
      displayName: "翻译任务",
      description: "打开翻译任务表单，支持商品、合集、页面、文章等多模块批量翻译",
      category: "本地化",
      conditional: false,
      tools: [
        {
          name: "open_translation_task_form",
          displayName: "打开翻译任务表单",
          description: "在聊天界面弹出翻译任务配置卡片，用户可选择源语言、目标语言和翻译模块",
          params: [
            { name: "sourceLocale", type: "string", desc: "源语言 BCP47 代码，如 zh-CN，默认 zh-CN" },
            { name: "targetLocale", type: "string", desc: "目标语言代码，如 en、ja、fr" },
            { name: "limitPerType", type: "number", desc: "每类资源最多翻译数量，1-200，默认 20" },
            {
              name: "resourceTypes",
              type: "string[]",
              desc: "翻译模块：PRODUCT、COLLECTION、PAGE、ARTICLE、METAOBJECT、ONLINE_STORE_THEME",
            },
          ],
        },
      ],
    },
    {
      name: "generateProductDescription",
      displayName: "商品文案生成",
      description: "基于商品信息自动生成优化的商品标题和描述，支持多语言",
      category: "内容创作",
      conditional: false,
      tools: [
        {
          name: "generate_product_description",
          displayName: "生成商品描述",
          description: "输入商品 ID，AI 生成高质量商品标题与描述，可结合用户画像个性化",
          params: [
            { name: "productId", type: "string", desc: "Shopify 商品 ID（数字或 gid://shopify/Product/...）" },
            { name: "targetLanguage", type: "string", desc: "目标语言 BCP47 代码，不填则自动检测" },
          ],
        },
      ],
    },
    {
      name: "pictureTranslate",
      displayName: "图片翻译",
      description: "翻译图片中的文字并保持原始布局，支持多种语言对",
      category: "本地化",
      conditional: false,
      tools: [
        {
          name: "picture_translate",
          displayName: "翻译图片文字",
          description: "识别图片中的文字并翻译，返回翻译后图片 URL 和各文字块的对照",
          params: [
            { name: "imageUrl", type: "string", desc: "图片 HTTPS URL（与 imageBase64 二选一）" },
            { name: "imageBase64", type: "string", desc: "图片 Base64 编码（与 imageUrl 二选一）" },
            { name: "targetLanguage", type: "string", desc: "目标语言代码，如 en、ja、zh" },
            { name: "sourceLanguage", type: "string", desc: "源语言代码，默认 auto 自动识别" },
          ],
        },
      ],
    },
    {
      name: "imageGeneration",
      displayName: "图片生成",
      description: "根据提示词生成商品图或营销图，需开启 IMAGE_GENERATION_ENABLED",
      category: "内容创作",
      conditional: true,
      conditionalNote: "需要环境变量 IMAGE_GENERATION_ENABLED=true",
      tools: [
        {
          name: "generate_product_image",
          displayName: "文生图",
          description: "输入图片描述，AI 生成对应的商品或营销图片",
          params: [
            { name: "prompt", type: "string", desc: "图片描述（英文效果更佳）" },
          ],
        },
      ],
    },
    {
      name: "sendTemplateEmail",
      displayName: "模板邮件发送",
      description: "通过腾讯 SES 向指定收件人发送预设模板邮件，需邮件配置就绪",
      category: "通知",
      conditional: true,
      conditionalNote: "需要腾讯 SES 配置（TENCENT_CLOUD_KEY_ID 等）",
      tools: [
        {
          name: "send_template_email",
          displayName: "发送模板邮件",
          description: "发送翻译完成通知、套餐升级、积分预警等业务模板邮件",
          params: [
            { name: "to", type: "string", desc: "收件人邮箱地址" },
            { name: "subject", type: "string", desc: "邮件主题" },
            { name: "templateId", type: "number", desc: "模板 ID（须在白名单内）" },
            { name: "templateData", type: "object", desc: "模板变量键值对（可选）" },
          ],
        },
      ],
      emailTemplates: [
        "翻译成功通知", "翻译失败通知", "自动翻译成功", "字符包购买",
        "套餐试用", "套餐升级", "套餐升级备用", "积分即将耗尽",
        "积分已耗尽", "订阅成功", "APG 初始化", "APG 购买", "APG 任务中断", "积分报告",
      ],
    },
    {
      name: "system",
      displayName: "系统工具",
      description: "内置基础工具：查询当前时间和天气",
      category: "基础能力",
      conditional: false,
      tools: [
        {
          name: "get_current_time",
          displayName: "获取当前时间",
          description: "查询当前系统时间，中文格式输出",
          params: [],
        },
        {
          name: "get_weather",
          displayName: "查询天气",
          description: "根据城市名查询当前天气（温度、湿度、天气描述）",
          params: [{ name: "city", type: "string", desc: "城市名称" }],
        },
      ],
    },
  ],

  playbooks: [
    {
      name: "shopHealthCheck",
      displayName: "经营体检",
      description: "拉取店铺核心数据，自动检测异常，生成 KPI 健康报告与优先建议",
      category: "店铺运营",
      triggerDescription: "当用户询问店铺整体经营状况、KPI 概览、健康体检、异常分析、数据诊断等时触发",
      steps: ["数据拉取", "异常检测", "建议生成"],
      conditional: false,
      anomalyRules: [
        "退款率 > 10% 触发预警",
        "缺货商品比例 > 20% 触发预警",
        "低库存商品数量提示",
      ],
    },
    {
      name: "productLaunchPipeline",
      displayName: "上新流水线",
      description: "检查商品信息完整度、生成文案建议、翻译准备建议，输出结构化上架清单",
      category: "选品上新",
      triggerDescription: "当用户要上架新商品、检查商品信息是否完整、批量上新或请求上新指引时触发",
      steps: ["商品信息检查", "文案建议", "翻译准备", "上架清单"],
      conditional: false,
      completenessChecks: [
        "商品描述（建议 ≥50 字）",
        "商品图片（建议 ≥3 张）",
        "价格",
        "SKU 编号",
        "标签",
        "发布状态（ACTIVE）",
      ],
    },
  ],
} as const;

capabilitiesRouter.get("/", (_req, res) => {
  const totalTools = CAPABILITIES.skills.reduce(
    (sum, s) => sum + s.tools.length,
    0,
  );
  res.json({
    stats: {
      skillCount: CAPABILITIES.skills.length,
      toolCount: totalTools,
      playbookCount: CAPABILITIES.playbooks.length,
    },
    skills: CAPABILITIES.skills,
    playbooks: CAPABILITIES.playbooks,
  });
});
