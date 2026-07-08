import React from 'react';
import { View, Image, StyleProp, ViewStyle } from 'react-native';

interface Props {
  countryCode: string;
  /** Diameter of the flag circle in px. */
  size?: number;
  /** Wrap in a padded ring (useful over photos/colored backgrounds). */
  ring?: boolean;
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** Circular country flag image (flagcdn), used anywhere a flag icon appears in the app. */
export default function CircleFlag({ countryCode, size = 20, ring = false, ringColor = '#fff', style }: Props) {
  const img = (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#E5E7EB' }}>
      <Image
        source={{ uri: `https://flagcdn.com/w160/${countryCode.toLowerCase()}.png` }}
        style={{ width: size, height: size }}
        resizeMode="cover"
      />
    </View>
  );
  if (!ring) return <View style={style}>{img}</View>;
  const ringSize = size + 4;
  return (
    <View style={[{
      width: ringSize, height: ringSize, borderRadius: ringSize / 2,
      backgroundColor: ringColor, alignItems: 'center', justifyContent: 'center',
    }, style]}>
      {img}
    </View>
  );
}
