import React from "react";
import { Text, View, FlatList } from "react-native";
import { ClusterGroupRowProps } from "./_types";
import { styles } from "./ClusterGroupRow.styles";
import PhotoThumbnail from "@/src/components/ui/PhotoThumbnail";

const ClusterGroupRow = ({ group }: ClusterGroupRowProps) => {
  return (
    <View style={styles.wrapper}>
      <View style={styles.textWrapper}>
        <Text style={styles.text}>
          {group.title}
        </Text>
      </View>

      <FlatList
        data={group.items}
        keyExtractor={(x) => x.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainerStyle}
        renderItem={({ item }) => (<PhotoThumbnail item={item} title={group.title}/>)}
      />
    </View>
  );
};

export default ClusterGroupRow;
