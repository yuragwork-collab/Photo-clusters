import React, { useCallback } from "react";
import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Loader from "@/src/components/ui/Loader";
import ButtonsWrapper from "@/src/components/ui/ButtonsWrapper";
import ClustersHeaderInfo from "@/src/components/ui/ClustersHeaderInfo";
import { styles } from "./ClustersScreen.styles";
import { useClustersFacade } from "@/src/flows/MainFlow/_facades/useClustersFacade";
import ClusterGroupRow from "@/src/components/ui/ClusterGroupRow";
import { Group } from "@/src/flows/MainFlow/screens/ClustersScreen/_types";

const ClustersScreen = () => {
  const {
    photos,
    groups,
    mode,
    error,
    loadingPhotos,
    modelStatus,
    permission,
    setMode,
  } = useClustersFacade()


  const keyExtractor = useCallback((g: Group) => g.key, []);

  const renderItem = useCallback(
    ({ item }: { item: Group }) => <ClusterGroupRow group={item}/>,
    []
  );

  if (loadingPhotos) {
    return <Loader modelStatus={modelStatus}/>
  }

  return (
    <SafeAreaView style={styles.safeAreaEmpty}>
      <View style={styles.header}>
        <ClustersHeaderInfo
          permissionGranted={!!permission?.granted}
          photosCount={photos.length}
          mode={mode}
          modelStatus={modelStatus}
          error={error}
        />

        <ButtonsWrapper mode={mode} setMode={setMode}/>
      </View>

      <FlatList
        data={groups}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
      />
    </SafeAreaView>
  );
}

export default ClustersScreen
