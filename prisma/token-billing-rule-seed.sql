-- TokenBillingRule 种子（product-improve；turso:migrate 执行）
-- feature: product_copy | image_prompt | image_generate | picture_translate
DELETE FROM "TokenBillingRule"
WHERE "appName" = 'generate-description' OR "ruleKey" LIKE 'gd:%';

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
        'pi:product_copy:deepseek-chat',
        'product-improve',
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
        'pi:image_prompt:deepseek-chat',
        'product-improve',
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
        'pi:image_generate:gpt-image-2',
        'product-improve',
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
        'pi:picture_translate:volc-translate',
        'product-improve',
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
        'pi:picture_translate:aidge-translate',
        'product-improve',
        'picture_translate',
        'aidge-translate',
        '整图翻译 · Aidge',
        1.0,
        2000,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
