
export type ContentCategory = "nature" | "food" | "pets" | "people" | "other";
export type ClusterMode = "semantic" | "location" | "day" | "day_location" | "bursts" | "albums";

export type PhotoItem = {
  id: string;
  uri: string;
  width: number;
  height: number;
  creationTime?: number;
  category?: ContentCategory;
  confidence?: number;
  top?: { index: number; score: number }[];
  debugLabelTop1?: string;
};

export type Group = {
  key: string;
  title: string;
  items: PhotoItem[];
};
