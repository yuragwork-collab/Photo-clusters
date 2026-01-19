import { router } from "expo-router";

export const usePhotoViewFacade = () => {
  const handleBack = () => router.back()

  return { handleBack }
}
