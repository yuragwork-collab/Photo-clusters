import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { FaceDetectionProvider, RNMLKitFaceDetectorOptions } from "@infinitered/react-native-mlkit-face-detection";
import React from "react";


const RootLayout = () => {
  const FACE_MIN_SIZE = 0.12;

  const FACE_OPTIONS: RNMLKitFaceDetectorOptions = {
    performanceMode: "fast",
    landmarkMode: null,
    contourMode: null,
    classificationMode: null,
    minFaceSize: FACE_MIN_SIZE,
  };

  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark"/>
      <FaceDetectionProvider options={FACE_OPTIONS}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }}/>
          <Stack.Screen name="photo" options={{ headerShown: false }}/>
        </Stack>
      </FaceDetectionProvider>
    </ThemeProvider>
  );
}

export default RootLayout
