import React from "react";
import { Text, ActivityIndicator } from "react-native";
import { LoaderProps } from "./_types";
import { styles } from "./Loader.styles";
import { SafeAreaView } from "react-native-safe-area-context";

const Loader = ({ modelStatus }: LoaderProps) => {

  return (
    <SafeAreaView style={styles.wrapper}>
      <ActivityIndicator/>
      <Text style={styles.text}>Loading photos…</Text>
      <Text style={styles.text}>Model: {modelStatus}</Text>
    </SafeAreaView>
  );
};

export default Loader;
