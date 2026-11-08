import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Pattern, Polygon, Polyline, Rect, Stop } from 'react-native-svg';

// What fills a spot card in the carousel when the spot has no photo at all: a slate field (the colour of a photo-less spot's
// pin, see SpotPhotoImages) with a faint geometric tessellation and the spot's emoji in the upper part of the card, clear of
// the name and description at the bottom. Which pattern is fixed per spot (from its id), so neighbouring cards differ.
const TOP = '#475569';
const BOTTOM = '#273244';
const S = 26;   // pattern cell, in points
const H = S * Math.sqrt(3) / 2;   // a triangle's height in that cell
const INK = 'rgba(255,255,255,0.07)';
const LINE = 'rgba(255,255,255,0.11)';

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
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: TOP }]}>
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
      <View style={st.iconWrap}>
        <Text style={st.icon}>{icon ?? '📍'}</Text>
      </View>
    </View>
  );
});

const st = StyleSheet.create({
  // The upper part of the card: the name, time/cost and description sit over its lower half.
  iconWrap: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%', alignItems: 'center', justifyContent: 'center' },
  icon: {
    fontSize: 44, lineHeight: 54, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 },
  },
});

export default PatternPlaceholder;
