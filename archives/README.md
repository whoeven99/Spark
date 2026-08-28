# 暂不部署的 Pixel 扩展

AiAssistant-Test 本轮停店面事件采集（App Store 5.1.5）。下列目录/文件已移出 `extensions/`，`shopify app deploy` 不会带上它们。

- `ciwi-spark-web-pixel/`：Shopify Web Pixel 扩展
- `spark-pixel-embeds/`：Theme 包里的 TikTok / Google / Meta Pixel App Embed

Theme 扩展 `extensions/spark-tiktok-pixel/` 仍部署，且只保留 Ciwi Image Switcher。

恢复采集时：把上述内容搬回 `extensions/`，并在 `shopify.app.test.toml` 加回 `write_pixels,read_pixels,read_customer_events,read_themes`。
