/** 生成标题最大长度（清洗后），对齐 Shopify 商品标题上限内的审核约束。 */
export const GENERATED_TITLE_MAX_LENGTH = 200;

/** 生成描述最大长度（清洗后），单一 description 字段上限。 */
export const GENERATED_DESCRIPTION_MAX_LENGTH = 50_000;

/** 默认采样温度（文档 5.2）。 */
export const DEFAULT_DESCRIPTION_TEMPERATURE = 0.4;

/** 文档建议可调区间。 */
export const MIN_DESCRIPTION_TEMPERATURE = 0.2;
export const MAX_DESCRIPTION_TEMPERATURE = 0.6;
