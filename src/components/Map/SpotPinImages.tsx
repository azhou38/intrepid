import React, { memo, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';

// The collapsed form of a spot pin: the photo pin's exact teardrop (SpotMarker in MapScreen) made small and
// white with a faint dark outline and a black centre dot (green once visited). Drawn by a native symbol layer (no MarkerView per
// spot), so it needs style images; like DestPinImages, each is a small React Native view that rnmapbox snapshots into
// the map style. The image's bottom edge is the pin's tip, so the layer anchors it at the bottom on the coordinate.

export const SPOT_MINI_PIN_UNVISITED = 'spotmini:0';
export const SPOT_MINI_PIN_VISITED = 'spotmini:1';
// The selected spot's shadow: it makes the pin look lifted off the map. Two parts, drawn under the pin itself: a soft
// elliptical CONTACT shadow on the ground at its tip, and the pin's teardrop silhouette CAST down and to the right (light
// from the upper left) as a blurred dark shape, built from many thin translucent strokes so it falls off smoothly.
// The image's bottom edge hangs GLOW_MARGIN below the pin's own bottom edge (its tip is 2pt above that, padding), so the
// layer shifts the image down by it (iconOffset) to put the shadow's tip on the pin's tip.
export const SPOT_SELECTED_GLOW = 'spotselglow';
// The same shadow, stronger, for the satellite map, where a faint shadow is lost on dark imagery.
export const SPOT_SELECTED_GLOW_DARK = 'spotselglow:dark';
export const GLOW_MARGIN = 6;

// A little over a third of the photo pin's size (SpotMarker: a 28pt bubble, 10pt tail), same geometry, white
// (solid green once visited): the tail's two edges are
// the tangent lines from the tip to the bubble's circle, so the outline is one smooth teardrop.
const R = 5;                     // bubble radius
const TAIL_L = 4;                // how far the tip hangs below the bubble
const BORDER = 1;                // faint dark outline around the whole teardrop, so the white pin reads on the light map
const P = BORDER / 2 + 0.5;      // padding so the outline isn't clipped by the image edge
const W = R * 2 + P * 2, H = R * 2 + TAIL_L + P * 2;
const TIP_D = R + TAIL_L;
const TAN_Y = (R * R) / TIP_D;
const TAN_X = R * Math.sqrt(1 - (R * R) / (TIP_D * TIP_D));
const BODY = 'white';            // the whole pin
const OUTLINE = 'rgba(0,0,0,0.35)';
const DOT_R = 2;                 // the black dot at the bubble's centre
const DOT = '#111111';
const VISITED_COLOR = '#10B981';

const MiniPin = memo(function MiniPin({ name, visited }: { name: string; visited: boolean }) {
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  // The snapshot is taken from the view as drawn; re-take it shortly after mount in case the first ran just too early.
  useEffect(() => {
    const t1 = setTimeout(() => imageRef.current?.refresh(), 60);
    const t2 = setTimeout(() => imageRef.current?.refresh(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <MapboxGL.Image name={name} ref={imageRef as any}>
      <View collapsable={false} style={st.box}>
        <Svg width={W} height={H}>
          {/* One closed outline (tail edges, then the arc over the top) so the white border runs round the whole
              teardrop without a seam where the tail meets the bubble. */}
          <Path
            d={`M ${P + R - TAN_X} ${P + R + TAN_Y} L ${P + R} ${P + R + TIP_D} L ${P + R + TAN_X} ${P + R + TAN_Y} `
              + `A ${R} ${R} 0 1 0 ${P + R - TAN_X} ${P + R + TAN_Y} Z`}
            fill={visited ? VISITED_COLOR : BODY}
            stroke={OUTLINE}
            strokeWidth={BORDER}
            strokeLinejoin="round"
          />
          <Circle cx={P + R} cy={P + R} r={DOT_R} fill={DOT} />
        </Svg>
      </View>
    </MapboxGL.Image>
  );
});

// The photo pin's teardrop (SpotPhotoImages: a 28pt bubble, 10pt tail), centred in a canvas with room for the shadow.
const G_R = 14, G_TIP_D = G_R + 10;
const G_TAN_Y = (G_R * G_R) / G_TIP_D;
const G_TAN_X = G_R * Math.sqrt(1 - (G_R * G_R) / (G_TIP_D * G_TIP_D));
const G_W = 64, G_H = 56, G_CX = 32, G_CY = 24, G_TIPY = G_CY + G_TIP_D;   // the tip is 8pt above the image's bottom
const CAST_DX = 3.5, CAST_DY = 4.5;       // how far the cast shadow falls (right, down)
const teardrop = (dx: number, dy: number) =>
  `M ${G_CX + dx - G_TAN_X} ${G_CY + dy + G_TAN_Y} L ${G_CX + dx} ${G_CY + dy + G_TIP_D} L ${G_CX + dx + G_TAN_X} ${G_CY + dy + G_TAN_Y} `
  + `A ${G_R} ${G_R} 0 1 0 ${G_CX + dx - G_TAN_X} ${G_CY + dy + G_TAN_Y} Z`;
// Outermost first; fourteen thin strokes, each centred on the outline, so the edge fades like a blur rather than in bands.
const CAST_STEPS = 14;
const CAST_STROKES = Array.from({ length: CAST_STEPS }, (_, i) => ({ w: (10 * 1.6 * (CAST_STEPS - i)) / CAST_STEPS }));

const SelectedShadow = memo(function SelectedShadow({ name, strength }: { name: string; strength: number }) {
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  useEffect(() => {
    const t1 = setTimeout(() => imageRef.current?.refresh(), 60);
    const t2 = setTimeout(() => imageRef.current?.refresh(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const o = 0.026 * strength;
  return (
    <MapboxGL.Image name={name} ref={imageRef as any}>
      <View collapsable={false} style={{ width: G_W, height: G_H }}>
        <Svg width={G_W} height={G_H}>
          <Defs>
            <RadialGradient id={`${name}-wide`}>
              <Stop offset="0" stopColor="#000" stopOpacity={0.34 * strength} />
              <Stop offset="1" stopColor="#000" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${name}-core`}>
              <Stop offset="0" stopColor="#000" stopOpacity={0.55 * strength} />
              <Stop offset="1" stopColor="#000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {/* Contact shadow on the ground: a wide faint ellipse and a tight dark one at the tip. */}
          <Ellipse cx={G_CX + 2} cy={G_TIPY + 1} rx={19} ry={6.5} fill={`url(#${name}-wide)`} />
          <Ellipse cx={G_CX + 1} cy={G_TIPY + 0.5} rx={9} ry={3} fill={`url(#${name}-core)`} />
          {/* Cast shadow of the teardrop, offset down and to the right. */}
          {CAST_STROKES.map(({ w }) => (
            <Path key={w} d={teardrop(CAST_DX, CAST_DY)} fill="#000" fillOpacity={o} stroke="#000" strokeOpacity={o}
              strokeWidth={w} strokeLinejoin="round" />
          ))}
          <Path d={teardrop(CAST_DX - 0.5, CAST_DY - 0.5)} fill="#000" fillOpacity={0.16 * strength} />
        </Svg>
      </View>
    </MapboxGL.Image>
  );
});

export default memo(function SpotPinImages() {
  return (
    <MapboxGL.Images>
      <MiniPin name={SPOT_MINI_PIN_UNVISITED} visited={false} />
      <MiniPin name={SPOT_MINI_PIN_VISITED} visited />
      <SelectedShadow name={SPOT_SELECTED_GLOW} strength={1} />
      <SelectedShadow name={SPOT_SELECTED_GLOW_DARK} strength={1.5} />
    </MapboxGL.Images>
  );
});

const st = StyleSheet.create({
  box: { width: W, height: H },
});
