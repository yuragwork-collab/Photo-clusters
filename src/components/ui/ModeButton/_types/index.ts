import { ClusterMode } from "@/src/flows/MainFlow/screens/ClustersScreen/_types";

export type ModeButtonProps = {
  mode: ClusterMode;
  value: ClusterMode;
  label: string;
  setMode: (mode: ClusterMode) => void;
};
