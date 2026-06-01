import prisma from "../../db.server";

/**
 * 记录用户从外链（邮件 / 广告等）带 utm 参数进入 App 的入口来源。
 *
 * Shopify 只在「从带参链接首次进入」时把 query 透传给嵌入式 App；
 * 之后站内导航会丢掉 query，因此「URL 里有 utm 才记一条」天然只捕获外部入口，
 * 量小且无需额外去重。
 *
 * 调用方应 fire-and-forget（不 await、吞异常），避免拖慢页面加载。
 */
export async function recordVisitSource(params: {
  shop: string;
  appName: string;
  request: Request;
}): Promise<void> {
  const shop = params.shop.trim();
  const appName = params.appName.trim();
  if (!shop || !appName) return;

  const url = new URL(params.request.url);
  const utm = url.searchParams.get("utm")?.trim();
  if (!utm) return; // 没有 utm：站内跳转或直接访问，不记录

  await prisma.appVisitSource.create({
    data: {
      shop,
      appName,
      path: url.pathname,
      utm,
      query: url.search || null,
      referer: params.request.headers.get("referer") || null,
    },
  });

  console.info(
    `[VisitSource] recorded shop=${shop} appName=${appName} utm=${utm} path=${url.pathname}`,
  );
}
