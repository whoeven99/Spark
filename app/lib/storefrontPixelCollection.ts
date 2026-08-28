/**
 * 店面广告/经营 Pixel 采集总闸。
 *
 * 当前版本默认关闭：不创建 Web Pixel、不写 ingest、不回传 CAPI/Events API。
 * 恢复采集需要同时：把 archives 里的扩展搬回 extensions/、加回 Pixel scopes、再把本函数改为 true。
 */
export function isStorefrontPixelCollectionEnabled(): boolean {
  return false;
}
