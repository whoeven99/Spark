export type ShopifyObjectKind = "product" | "article";

export type ShopifyObjectStatusFilter =
  | "all"
  | "active"
  | "draft"
  | "archived"
  | "published";

export type ShopifyObjectSort = "updated_desc" | "title_asc";

export type ShopifyObjectItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  imageUrl: string | null;
  statusLabel: string;
  statusTone: "positive" | "neutral" | "warning";
};

export type ShopifyObjectPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type ShopifyObjectListSuccessBody = {
  success: true;
  errorCode: 0;
  errorMsg: "";
  response: {
    items: ShopifyObjectItem[];
    pageInfo: ShopifyObjectPageInfo;
    /** withCount=1 时返回的条件匹配总数（计数失败时为 null） */
    count?: number | null;
  };
};

export type ShopifyObjectListErrorBody = {
  success: false;
  errorCode: number;
  errorMsg: string;
  response: null;
};

export type ShopifyObjectListApiResponse =
  | ShopifyObjectListSuccessBody
  | ShopifyObjectListErrorBody;

export type SelectedShopifyObject = {
  id: string;
  title: string;
  /** 商品/文章的主图 URL（选中时捕获，用于批量图片任务） */
  imageUrl?: string | null;
};
