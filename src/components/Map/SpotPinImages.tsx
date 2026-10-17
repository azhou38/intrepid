import React, { memo, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';

// The collapsed form of a spot pin: the photo pin's exact teardrop (SpotMarker in MapScreen) at half the size, with
// black where the photo would be. Drawn by a native symbol layer (no MarkerView per
// spot), so it needs style images; like DestPinImages, each is a small React Native view that rnmapbox snapshots into
// the map style. The image's bottom edge is the pin's tip, so the layer anchors it at the bottom on the coordinate.

export const SPOT_MINI_PIN_UNVISITED = 'spotmini:0';
export const SPOT_MINI_PIN_VISITED = 'spotmini:1';

// Half the photo pin's size (SpotMarker: a 28pt bubble, 10pt tail, 2pt ring), same geometry: the tail's two edges are
// the tangent lines from the tip to the bubble's circle, so the outline is one smooth teardrop.
const R = 7;                     // bubble radius
const TAIL_L = 5;                // how far the tip hangs below the bubble
const RING_W = 1.5;              // the white (or visited green) ring, as on the photo pin
const W = R * 2, H = R * 2 + TAIL_L;
const TIP_D = R + TAIL_L;
const TAN_Y = (R * R) / TIP_D;
const TAN_X = R * Math.sqrt(1 - (R * R) / (TIP_D * TIP_D));
const BODY = '#111111';          // where the photo would be
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
          <Path
            d={`M ${R} ${R} L ${R - TAN_X} ${R + TAN_Y} L ${R} ${R + TIP_D} L ${R + TAN_X} ${R + TAN_Y} Z`}
            fill={visited ? VISITED_COLOR : 'white'}
          />
          <Circle cx={R} cy={R} r={R} fill={visited ? VISITED_COLOR : 'white'} />
          <Circle cx={R} cy={R} r={R - RING_W} fill={BODY} />
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
