import React from "react";
import { Text } from "react-native";
import { styles } from "./ClustersHeaderInfo.styles";
import { ClustersHeaderInfoProps } from "@/src/components/ui/ClustersHeaderInfo/_types";

const ClustersHeaderInfo = (
  {
    permissionGranted,
    photosCount,
    mode,
    modelStatus,
    error,
  }: ClustersHeaderInfoProps) => {
  return (
    <>
      <Text style={styles.title}>Photo Clusters</Text>

      <Text style={styles.lineFirst}>
        {permissionGranted ? `Loaded ${photosCount} photos.` : "No permission to access photos."}
      </Text>

      <Text style={styles.line}>
        Mode: {mode} • Model: {modelStatus}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
};

export default ClustersHeaderInfo;
