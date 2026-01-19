
export type PhotoViewRouteParams = {
  uri?: string;
  id?: string;
  w?: string;
  h?: string;
  t?: string;
  cat?: string;
  conf?: string;
  title?: string;
} & Record<string, string | string[]>;
