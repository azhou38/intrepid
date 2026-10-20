import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Circle } from 'react-native-svg';

// What stands in for a place's photo when no suitable photo exists at all (src/data/imageOverrides.ts NO_PHOTO): a
// tinted field in the colour of the place's kind, a few faint contour rings (a hint of a map), and the place's own
// emoji at the centre. It reads as chosen rather than broken: a plain grey disc looks like a photo that failed to load.
//
//   <PhotoPlaceholder icon={spot.icon} category={spot.category} />          fills its parent (hero, card, header)
//   <PhotoPlaceholder icon="🏝️" category="island" size={28} />              a fixed square/disc (pins, thumbnails)
//
// Pins are style images snapshotted by Mapbox (SpotPhotoImages, DestPinImages) and the selected spot's MarkerView, so the
// `size` form uses plain views only.

// Top and bottom of the gradient, by the place's category (spot and destination categories share the palette).
const TINTS: Record<string, [string, string]> = {
  nature: ['#3F7D5C', '#255740'],
  park: ['#3F7D5C', '#255740'],
  beach: ['#3A8CAB', '#215F7A'],
  island: ['#3A8CAB', '#215F7A'],
  lake: ['#3A7FAF', '#235A83'],
  hike: ['#7A8A45', '#55632D'],
  mountain: ['#6F7F58', '#4A5A3A'],
  viewpoint: ['#5568B0', '#394A86'],
  historic: ['#B07D44', '#80592B'],
  ruin: ['#A9805A', '#7B5A3C'],
  museum: ['#667184', '#454E5F'],
  monument: ['#857F73', '#5E594F'],
  religious: ['#85548F', '#5F3768'],
  market: ['#BC6A43', '#8F4A2B'],
  entertainment: ['#9553B8', '#6D3589'],
  landmark: ['#B5546F', '#86374F'],
  city: ['#6C7A92', '#475268'],
  desert: ['#C49A56', '#946F35'],
};
const FALLBACK: [string, string] = ['#7A8494', '#566070'];
export const placeholderTints = (category?: string): [string, string] => TINTS[category ?? ''] ?? FALLBACK;

export const PhotoPlaceholder = memo(function PhotoPlaceholder({ icon, category, size, style }: {
  icon?: string; category?: string; size?: number; style?: StyleProp<ViewStyle>;
}) {
  const [top, bottom] = placeholderTints(category);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  // Fixed size (a pin's bubble, a small thumbnail): a solid mid-tone with the emoji, no gradient or rings to snapshot.
  if (size) {
    return (
      <View style={[{ width: size, height: size, backgroundColor: top, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.62), textAlign: 'center' }}>{icon ?? '📍'}</Text>
      </View>
    );
  }

  const glyph = box ? Math.round(Math.min(box.w, box.h) * 0.3) : 0;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: top }, style]}
      onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <SvgLinearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#phGrad)" />
        {/* contour rings, off-centre so the field reads as terrain and not a target */}
        {[14, 26, 38, 50, 62, 74].map(r => (
          <Circle key={r} cx="62" cy="40" r={r} fill="none" stroke="#FFFFFF" strokeOpacity={0.09} strokeWidth={0.6} />
        ))}
      </Svg>
      {glyph > 0 && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: glyph, lineHeight: Math.round(glyph * 1.2), opacity: 0.92, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } }}>
            {icon ?? '📍'}
          </Text>
        </View>
      )}
    </View>
  );
});

export default PhotoPlaceholder;
