export type ProductQualityDimension = {
  score: number;
  suggestion: string;
};

export type ProductQualityScoreData = {
  score: number;
  dimensions: {
    title: ProductQualityDimension;
    images: ProductQualityDimension;
    description: ProductQualityDimension;
    variants: ProductQualityDimension;
    tags: ProductQualityDimension;
  };
  overallSuggestions: string[];
};

export type ProductQualityScoreSuccess = {
  ok: true;
  productId: string;
  title: string;
} & ProductQualityScoreData;

export type ProductQualityScoreFailure = {
  ok: false;
  errorCode: string;
  errorMsg: string;
};

export type ProductQualityScoreOutcome = ProductQualityScoreSuccess | ProductQualityScoreFailure;

export type ProductQualityScoreApiResponse =
  | {
      success: true;
      errorCode: 0;
      errorMsg: "";
      response: { productId: string; title: string } & ProductQualityScoreData;
    }
  | {
      success: false;
      errorCode: number | string;
      errorMsg: string;
      response: null;
    };
