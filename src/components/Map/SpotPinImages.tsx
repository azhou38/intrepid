import React, { memo, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapboxGL from '@rnmapbox/maps';

// The collapsed form of a spot pin: the same teardrop silhouette and white bubble as the photo pin (SpotMarker in
// MapScreen), made small, with the photo collapsed to a coloured core. Drawn by a native symbol layer (no MarkerView per
// spot), so it needs style images; like DestPinImages, each is a small React Native view that rnmapbox snapshots into
// the map style. The image's bottom edge is the pin's tip, so the layer anchors it at the bottom on the coordinate.

export const SPOT_MINI_PIN_UNVISITED = 'spotmini:0';
export const SPOT_MINI_PIN_VISITED = 'spotmini:1';

const W = 20, H = 26;            // the image box; its bottom-centre is the tip
const BUBBLE = 16;               // the white bubble
const CORE = 7;                  // the coloured core standing in for the photo
const TAIL = 9;                  // the square rotated 45° into the tail (diagonal ≈ 12.7)
const RING = 'rgba(15,23,42,0.35)';
const CORE_COLOR = '#1E293B';
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
        <View collapsable={false} style={st.tail} />
        <View collapsable={false} style={st.bubble}>
          <View collapsable={false} style={[st.core, { backgroundColor: visited ? VISITED_COLOR : CORE_COLOR }]} />
        </View>
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

const tailCentreY = H - (TAIL * Math.SQRT2) / 2;
const st = StyleSheet.create({
  box: { width: W, height: H },
  tail: {
    position: 'absolute', left: (W - TAIL) / 2, top: tailCentreY - TAIL / 2, width: TAIL, height: TAIL,
    backgroundColor: 'white', borderWidth: 1, borderColor: RING, transform: [{ rotate: '45deg' }],
  },
  bubble: {
    position: 'absolute', left: (W - BUBBLE) / 2, top: 1, width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
    backgroundColor: 'white', borderWidth: 1, borderColor: RING, alignItems: 'center', justifyContent: 'center',
  },
  core: { width: CORE, height: CORE, borderRadius: CORE / 2 },
});
