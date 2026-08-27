-- TokenBillingRule 种子（turso:migrate 执行）
-- feature: chat | product_copy | product_quality | image_prompt | image_generate | picture_translate
DELETE FROM "TokenBillingRule"
WHERE "ruleKey" LIKE 'gd:%';

INSERT OR IGNORE INTO "TokenBillingRule" (
    "ruleKey",
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
        'pi:chat:deepseek-chat',
        'chat',
        'deepseek-chat',
        'Ask 聊天 · deepseek-chat',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:chat:deepseek-v4-flash',
        'chat',
        'deepseek-v4-flash',
        'Ask 聊天 · deepseek-v4-flash',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:chat:deepseek-v4-pro',
        'chat',
        'deepseek-v4-pro',
        'Ask 聊天 · deepseek-v4-pro',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:chat:_default',
        'chat',
        '_default',
        'Ask 聊天 · 默认',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:product_copy:deepseek-chat',
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
        'pi:product_quality:deepseek-chat',
        'product_quality',
        'deepseek-chat',
        '商品质量评分 · deepseek-chat',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:product_quality:deepseek-v4-flash',
        'product_quality',
        'deepseek-v4-flash',
        '商品质量评分 · deepseek-v4-flash',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:product_quality:deepseek-v4-pro',
        'product_quality',
        'deepseek-v4-pro',
        '商品质量评分 · deepseek-v4-pro',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:product_quality:deepseek-v4-flash-vision-exp',
        'product_quality',
        'deepseek-v4-flash-vision-exp',
        '商品质量评分 · Vision',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:product_quality:_default',
        'product_quality',
        '_default',
        '商品质量评分 · 默认',
        1.0,
        NULL,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'pi:image_prompt:deepseek-chat',
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
        'picture_translate',
        'aidge-translate',
        '整图翻译 · Aidge',
        1.0,
        2000,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
