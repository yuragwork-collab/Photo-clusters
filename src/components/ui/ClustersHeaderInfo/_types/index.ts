import { ClusterMode } from "@/src/flows/MainFlow/screens/ClustersScreen/_types";

export type ClustersHeaderInfoProps = {
  permissionGranted: boolean;
  photosCount: number;

  mode: ClusterMode;
  modelStatus: "idle" | "loading" | "ready" | "error";

  error?: string | null;
};
