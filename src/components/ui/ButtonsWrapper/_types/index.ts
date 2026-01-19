import { ClusterMode } from "@/src/flows/MainFlow/screens/ClustersScreen/_types";

export type ButtonsWrapperProps = {
  mode: ClusterMode;
  setMode: (mode: ClusterMode) => void;
};
