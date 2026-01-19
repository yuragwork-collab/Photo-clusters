import React from "react";
import { Text, Pressable } from "react-native";
import { ModeButtonProps } from "./_types";
import { styles } from "./ModeButton.styles";

const ModeButton = (
  {
    mode,
    value,
    setMode,
    label,
  }: ModeButtonProps) => {
  const active = mode === value;

  const handleSetMode = () => setMode(value)

  return (
    <Pressable
      onPress={handleSetMode}
      style={[
        styles.button,
        active ? styles.buttonActive : styles.buttonInactive,
      ]}
    >
      <Text
        style={[
          styles.text,
          active ? styles.textActive : styles.textInactive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

export default ModeButton;
