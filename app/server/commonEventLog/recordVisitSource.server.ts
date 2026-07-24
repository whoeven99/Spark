import prisma from "../../db.server";

/**
 * 记录用户从外链（邮件 / 广告等）带 utm 参数进入 App 的入口来源。
 *
 * 调用方应 fire-and-forget（不 await、吞异常），避免拖慢页面加载。
 */
export async function recordVisitSource(params: {
  shop: string;
  request: Request;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const url = new URL(params.request.url);
  const utm = url.searchParams.get("utm")?.trim();
  if (!utm) return;

  await prisma.appVisitSource.create({
    data: {
      shop,
      path: url.pathname,
      utm,
      query: url.search || null,
      referer: params.request.headers.get("referer") || null,
    },
  });

  console.info(
    `[VisitSource] recorded shop=${shop} utm=${utm} path=${url.pathname}`,
  );
}
