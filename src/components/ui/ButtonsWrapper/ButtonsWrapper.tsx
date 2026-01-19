import React from "react";
import { View } from "react-native";
import { ButtonsWrapperProps } from "./_types";
import { styles } from "./ButtonsWrapper.styles";
import ModeButton from "@/src/components/ui/ModeButton";

const ButtonsWrapper = ({ mode, setMode }: ButtonsWrapperProps) => {

  return (
    <View style={styles.wrapper}>
      <ModeButton value="day" label="Day" mode={mode} setMode={setMode}/>
      <ModeButton value="semantic" label="AI" mode={mode} setMode={setMode}/>
      <ModeButton value="location" label="Location" mode={mode} setMode={setMode}/>
      <ModeButton value="day_location" label="Day+Location" mode={mode} setMode={setMode}/>
      <ModeButton value="bursts" label="Bursts" mode={mode} setMode={setMode}/>
      <ModeButton value="albums" label="Albums" mode={mode} setMode={setMode}/>
    </View>
  );
};

export default ButtonsWrapper;
