import React, { memo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Pattern, Polygon, Polyline, Rect, Stop } from 'react-native-svg';

// What fills a spot card in the carousel when the spot has no photo at all: a slate field (the colour of a photo-less spot's
// pin, see SpotPhotoImages) with a faint geometric tessellation, and the spot's own emoji repeated over it as part of the
// pattern: small, faded and tilted alternately, in staggered rows like a printed wallpaper (a single large emoji in the
// middle of the card looked out of place). Which tessellation is fixed per spot (from its id), so neighbouring cards differ.
const TOP = '#475569';
const BOTTOM = '#273244';
const S = 26;   // pattern cell, in points
const H = S * Math.sqrt(3) / 2;   // a triangle's height in that cell
const INK = 'rgba(255,255,255,0.07)';
const LINE = 'rgba(255,255,255,0.11)';
// The emoji repeat: spacing between emoji in a row and between rows (each row offset by half a step), their size, opacity
// and the tilt that alternates between neighbours.
const EMOJI_STEP_X = 2 * S;
const EMOJI_STEP_Y = 44;
const EMOJI_SIZE = 17;
const EMOJI_OPACITY = 0.32;
const EMOJI_TILT = 12;

type Kind = 'triangles' | 'diamonds' | 'chevrons';
const KINDS: Kind[] = ['triangles', 'diamonds', 'chevrons'];
const kindFor = (seed: string): Kind => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return KINDS[Math.abs(h) % KINDS.length];
};

function Tile({ kind }: { kind: Kind }) {
  if (kind === 'triangles') {
    // Upward triangles filled, the downward ones between them left as the field: a tessellation of alternating tones.
    return (
      <>
        <Polygon points={`0,${H} ${S / 2},0 ${S},${H}`} fill={INK} />
        <Polygon points={`${-S / 2},${2 * H} 0,${H} ${S / 2},${2 * H}`} fill={INK} />
        <Polygon points={`${S / 2},${2 * H} ${S},${H} ${(3 * S) / 2},${2 * H}`} fill={INK} />
      </>
    );
  }
  if (kind === 'diamonds') return <Polygon points={`${S / 2},0 ${S},${S / 2} ${S / 2},${S} 0,${S / 2}`} fill={INK} />;
  return <Polyline points={`0,${S / 2} ${S / 2},0 ${S},${S / 2}`} fill="none" stroke={LINE} strokeWidth={2} />;
}

export const PatternPlaceholder = memo(function PatternPlaceholder({ seed, icon, idPrefix }: {
  seed: string; icon?: string;
  // Unique per rendered card: the looping carousel renders clones of a spot side by side, and SVG ids must not collide.
  idPrefix: string;
}) {
  const kind = kindFor(seed);
  const tileH = kind === 'triangles' ? 2 * H : kind === 'chevrons' ? S / 2 : S;
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const marks: { x: number; y: number; tilt: number }[] = [];
  if (box) {
    for (let row = 0, y = EMOJI_STEP_Y / 2; y < box.h + EMOJI_STEP_Y; row++, y += EMOJI_STEP_Y) {
      for (let col = 0, x = row % 2 ? 0 : EMOJI_STEP_X / 2; x < box.w + EMOJI_STEP_X; col++, x += EMOJI_STEP_X) {
        marks.push({ x, y, tilt: (row + col) % 2 ? EMOJI_TILT : -EMOJI_TILT });
      }
    }
  }
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: TOP, overflow: 'hidden' }]}
      onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`${idPrefix}-g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={TOP} />
            <Stop offset="1" stopColor={BOTTOM} />
          </SvgLinearGradient>
          <Pattern id={`${idPrefix}-p`} patternUnits="userSpaceOnUse" width={S} height={tileH}>
            <Tile kind={kind} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${idPrefix}-g)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${idPrefix}-p)`} />
      </Svg>
      {marks.map(m => (
        <Text
          key={`${m.x},${m.y}`}
          style={[st.mark, { left: m.x - EMOJI_SIZE, top: m.y - EMOJI_SIZE, transform: [{ rotate: `${m.tilt}deg` }] }]}
        >
          {icon ?? '📍'}
        </Text>
      ))}
    </View>
  );
});

const st = StyleSheet.create({
  // Centred on its point: a box twice the glyph's size, the glyph centred in it.
  mark: {
    position: 'absolute', width: EMOJI_SIZE * 2, height: EMOJI_SIZE * 2,
    fontSize: EMOJI_SIZE, lineHeight: EMOJI_SIZE * 2, textAlign: 'center', opacity: EMOJI_OPACITY,
  },
});

export default PatternPlaceholder;
