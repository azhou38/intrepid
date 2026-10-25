import React, { memo, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';

// The collapsed form of a spot pin: the photo pin's exact teardrop (SpotMarker in MapScreen) made small and
// white with a faint dark outline and a black centre dot (green once visited). Drawn by a native symbol layer (no MarkerView per
// spot), so it needs style images; like DestPinImages, each is a small React Native view that rnmapbox snapshots into
// the map style. The image's bottom edge is the pin's tip, so the layer anchors it at the bottom on the coordinate.

export const SPOT_MINI_PIN_UNVISITED = 'spotmini:0';
export const SPOT_MINI_PIN_VISITED = 'spotmini:1';
// The selected spot's glow: the photo pin's own teardrop outline (SpotPhotoImages: a 28pt bubble, 10pt tail, 2pt padding)
// traced in soft blue strokes, wider and fainter outward, so the shading runs evenly round the whole pin, tail included,
// rather than a disc behind the bubble. GLOW_MARGIN is how far it reaches past the pin; the layer shifts the image down by
// it so its tip sits on the pin's tip (iconOffset).
export const SPOT_SELECTED_GLOW = 'spotselglow';
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

const G_R = 14, G_TIP_D = G_R + 10, G_PAD = 2;
const G_TAN_Y = (G_R * G_R) / G_TIP_D;
const G_TAN_X = G_R * Math.sqrt(1 - (G_R * G_R) / (G_TIP_D * G_TIP_D));
const G_W = G_R * 2 + G_PAD * 2 + GLOW_MARGIN * 2, G_H = G_R * 2 + 10 + G_PAD * 2 + GLOW_MARGIN * 2;
const G_CX = GLOW_MARGIN + G_PAD + G_R, G_CY = GLOW_MARGIN + G_PAD + G_R;
const GLOW_PATH = `M ${G_CX - G_TAN_X} ${G_CY + G_TAN_Y} L ${G_CX} ${G_CY + G_TIP_D} L ${G_CX + G_TAN_X} ${G_CY + G_TAN_Y} `
  + `A ${G_R} ${G_R} 0 1 0 ${G_CX - G_TAN_X} ${G_CY + G_TAN_Y} Z`;
const GLOW_COLOR = '#1D4ED8';
// Outermost first; each stroke is centred on the outline, so it reaches half its width past the pin.
// Nine thin steps rather than a few wide ones, so the falloff reads as a soft blur, not bands; together they reach about the
// old disc glow's 0.6 next to the pin.
// Widths up to twice the margin, so the outermost reaches the image's edge.
const GLOW_STROKES = [9, 8, 7, 6, 5, 4, 3, 2, 1].map(k => ({ w: (GLOW_MARGIN * 2 * k) / 9, o: 0.09 }));

const SelectedGlow = memo(function SelectedGlow() {
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  useEffect(() => {
    const t1 = setTimeout(() => imageRef.current?.refresh(), 60);
    const t2 = setTimeout(() => imageRef.current?.refresh(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <MapboxGL.Image name={SPOT_SELECTED_GLOW} ref={imageRef as any}>
      <View collapsable={false} style={{ width: G_W, height: G_H }}>
        <Svg width={G_W} height={G_H}>
          {GLOW_STROKES.map(({ w, o }) => (
            <Path key={w} d={GLOW_PATH} fill={GLOW_COLOR} fillOpacity={o} stroke={GLOW_COLOR} strokeOpacity={o}
              strokeWidth={w} strokeLinejoin="round" />
          ))}
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
      <SelectedGlow />
    </MapboxGL.Images>
  );
});

const st = StyleSheet.create({
  box: { width: W, height: H },
});
