import React, { memo, useEffect, useRef } from 'react';
import { perfCount } from '../../utils/perfProbe';   // TEMPORARY
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';

// The collapsed form of a spot pin: the photo pin's exact teardrop (SpotMarker in MapScreen) made small and
// white with a faint dark outline and a black centre dot (green once visited). Drawn by a native symbol layer (no MarkerView per
// spot), so it needs style images; like DestPinImages, each is a small React Native view that rnmapbox snapshots into
// the map style. The image's bottom edge is the pin's tip, so the layer anchors it at the bottom on the coordinate.

export const SPOT_MINI_PIN_UNVISITED = 'spotmini:0';
export const SPOT_MINI_PIN_VISITED = 'spotmini:1';

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
    const t1 = setTimeout(() => (perfCount('spot mini snapshot'), imageRef.current?.refresh()), 60);
    const t2 = setTimeout(() => (perfCount('spot mini snapshot'), imageRef.current?.refresh()), 500);
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

export default memo(function SpotPinImages() {
  return (
    <MapboxGL.Images>
      <MiniPin name={SPOT_MINI_PIN_UNVISITED} visited={false} />
      <MiniPin name={SPOT_MINI_PIN_VISITED} visited />
    </MapboxGL.Images>
  );
});

const st = StyleSheet.create({
  box: { width: W, height: H },
});
