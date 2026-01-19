import React from "react";
import { View, Image, Text, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PhotoViewRouteParams } from "./_types";
import { styles } from "./PhotoViewScreen.styles";
import { usePhotoViewFacade } from "@/src/flows/MainFlow/_facades/usePhotoViewFacade";

const PhotoViewScreen = () => {
  const params = useLocalSearchParams<PhotoViewRouteParams>();
  const { handleBack } = usePhotoViewFacade()


  if (!params.uri) {
    return (
      <SafeAreaView style={styles.safeAreaEmpty}>
        <Pressable onPress={handleBack} style={styles.emptyBackButton}>
          <Text style={styles.emptyBackButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>{params.title ?? "Photo"}</Text>

        <Pressable onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>

        {params.cat || params.conf ? (
          <Text style={styles.meta}>
            {params.cat ? `Category: ${params.cat}` : ""}
            {params.conf ? `  (${Number(params.conf).toFixed(2)})` : ""}
          </Text>
        ) : null}
      </View>

      <View style={styles.imageWrap}>
        <Image source={{ uri: params.uri }} style={styles.image} resizeMode="contain"/>
      </View>
    </SafeAreaView>
  );
};

export default PhotoViewScreen;
