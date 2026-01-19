import React from "react";
import { View, Pressable, Image } from "react-native";
import { router } from "expo-router";
import { styles } from "./PhotoThumbnail.styles";
import { PhotoThumbnailProps } from "./_types";

const PhotoThumbnail = ({ item, title }: PhotoThumbnailProps) => {
  const onPress = () => {
    const params = {
      uri: item.uri,
      id: item.id,
      w: String(item.width),
      h: String(item.height),
      t: item.creationTime ? String(item.creationTime) : "",
      cat: item.category ?? "",
      conf: typeof item.confidence === "number" ? String(item.confidence) : "",
      title,
    }

    router.navigate({
      pathname: "/photo",
      params,
    });
  };

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={onPress}>
        <Image source={{ uri: item.uri }} style={styles.image}/>
      </Pressable>
    </View>
  );
};

export default PhotoThumbnail;
