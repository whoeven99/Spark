export type ContextResourceType = "product" | "article" | "order";

export type ProductResourceItem = {
  id: string;
  type: "product";
  title: string;
  subtitle: string;
  meta: string;
  status: string | null;
  imageUrl: string | null;
  promptSummary: {
    id: string;
    title: string;
    handle: string | null;
    status: string | null;
    vendor: string | null;
    productType: string | null;
    tags: string[];
    featuredImageUrl: string | null;
    priceRange: string | null;
    totalInventory: number | null;
  };
};

export type ArticleResourceItem = {
  id: string;
  type: "article";
  title: string;
  subtitle: string;
  meta: string;
  status: string | null;
  imageUrl: string | null;
  promptSummary: {
    id: string;
    title: string;
    handle: string | null;
    blogTitle: string | null;
    author: string | null;
    isPublished: boolean | null;
    publishedAt: string | null;
    tags: string[];
    excerpt: string | null;
  };
};

export type OrderResourceItem = {
  id: string;
  type: "order";
  title: string;
  subtitle: string;
  meta: string;
  status: string | null;
  imageUrl: string | null;
  promptSummary: {
    id: string;
    name: string;
    createdAt: string | null;
    customerName: string | null;
    totalPrice: string | null;
    currencyCode: string | null;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    tags: string[];
    lineItemsSummary: Array<{
      title: string;
      quantity: number;
      variantTitle: string | null;
    }>;
  };
};

export type ContextResourceItem =
  | ProductResourceItem
  | ArticleResourceItem
  | OrderResourceItem;

export type ContextResourceSelectionMap = {
  product: ProductResourceItem[];
  article: ArticleResourceItem[];
  order: OrderResourceItem[];
};

export type ContextResourceSortDirection = "asc" | "desc";

export type ContextResourcePageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

export type ContextResourceListResponse = {
  success: boolean;
  errorMsg: string;
  response: {
    items: ContextResourceItem[];
    pageInfo: ContextResourcePageInfo;
  } | null;
};
