import { StyleSheet, Platform } from "react-native";

export const styles = StyleSheet.create({
  safeAreaEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBackButton: {
    marginTop: 12,
    padding: 12,
  },
  emptyBackButtonText: {
    fontWeight: "700",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "black",
  },
  header: {
    padding: 16,
    paddingTop: Platform.OS === "android" ? 24 : 16,
  },
  title: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  backButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  backButtonText: {
    color: "white",
    fontWeight: "700",
  },
  meta: {
    marginTop: 10,
    color: "rgba(255,255,255,0.75)",
  },
  imageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
