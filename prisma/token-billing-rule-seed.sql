-- TokenBillingRule 种子（与 .env 对齐；INSERT OR IGNORE 可重复执行）
-- feature: product_copy | image_prompt | image_generate | picture_translate

INSERT OR IGNORE INTO "TokenBillingRule" (
    "ruleKey",
    "appName",
    "feature",
    "modelKey",
    "displayName",
    "multiplier",
    "baseTokenCost",
    "enabled",
    "createdAt",
    "updatedAt"
) VALUES
    (
        'gd:product_copy:deepseek-chat',
        'generate-description',
        'product_copy',
        'deepseek-chat',
        '商品文案 · deepseek-chat',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd:image_prompt:deepseek-chat',
        'generate-description',
        'image_prompt',
        'deepseek-chat',
        '画面扩写 · deepseek-chat',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd:image_generate:gpt-image-2',
        'generate-description',
        'image_generate',
        'gpt-image-2',
        '文生图 · gpt-image-2',
        1.0,
        5000,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd:picture_translate:volc-translate',
        'generate-description',
        'picture_translate',
        'volc-translate',
        '整图翻译 · 火山',
        1.0,
        2000,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd:picture_translate:aidge-translate',
        'generate-description',
        'picture_translate',
        'aidge-translate',
        '整图翻译 · Aidge',
        1.0,
        2000,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
