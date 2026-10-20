import React, { memo, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';
import PinPhoto from './PinPhoto';
import { photoSubject } from '../../utils/subjectCrop';
import { spotPhotoTitle, type Spot } from '../../data/spots';
import { thumbCache, fetchWikiThumbnail } from '../../utils/photoCache';

// A spot's photo pin drawn by a native symbol layer (MapScreen's spotPhotos), so Mapbox decides on the render thread,
// every frame, which pins fit and fades them in and out with the camera, the way Google Maps does. Each pin's look
// (teardrop, ring, round photo) is a small React Native view that rnmapbox snapshots into a style image, exactly as
// DestPinImages does for destinations; its bottom edge is the tip, so the layer anchors it at the bottom.

export const SPOT_PHOTO_BUBBLE = 28;
const TAIL = 10;
const RIM = 'rgba(0,0,0,0.22)';
const VISITED_COLOR = '#10B981';
const PLACEHOLDER = '#E5E7EB';
const PAD = 2;
const R = SPOT_PHOTO_BUBBLE / 2;
const TIP_D = R + TAIL;
const TAN_Y = (R * R) / TIP_D;
const TAN_X = R * Math.sqrt(1 - (R * R) / (TIP_D * TIP_D));
const W = SPOT_PHOTO_BUBBLE + PAD * 2;
const H = SPOT_PHOTO_BUBBLE + TAIL + PAD * 2;

export type SpotPhotoImageSpec = { name: string; spot: Spot; visited: boolean };
export const spotPhotoImageName = (id: string, visited: boolean) => `sp:${id}:${visited ? 1 : 0}`;

const SpotPhotoImage = memo(function SpotPhotoImage({ spec }: { spec: SpotPhotoImageSpec }) {
  const { spot, name, visited } = spec;
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  const cacheKey = `spotpin_${spot.id}`;
  const [url, setUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setUrl(thumbCache.get(cacheKey)!); return; }
    let live = true;
    fetchWikiThumbnail(spotPhotoTitle(spot), 120).then(u => {
      if (u) { thumbCache.set(cacheKey, u); if (live) setUrl(u); }
    });
    return () => { live = false; };
  }, [spot.id]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const snap = () => {
    timers.current.push(setTimeout(() => imageRef.current?.refresh(), 60));
    timers.current.push(setTimeout(() => imageRef.current?.refresh(), 500));
  };
  const ring = visited ? VISITED_COLOR : 'white';
  const cx = PAD + R, cy = PAD + R;
  const tail = `M ${cx} ${cy} L ${cx - TAN_X} ${cy + TAN_Y} L ${cx} ${cy + TIP_D} L ${cx + TAN_X} ${cy + TAN_Y} Z`;
  return (
    <MapboxGL.Image name={name} ref={imageRef as any}>
      <View collapsable={false} style={st.box}>
        <View style={[st.rim, { left: PAD - 1, top: PAD - 1 }]} />
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Path d={tail} fill={RIM} stroke={RIM} strokeWidth={2} strokeLinejoin="round" />
          <Path d={tail} fill={ring} />
        </Svg>
        <View collapsable={false} style={[st.bubble, { borderColor: ring }]}>
          <View collapsable={false} style={st.clip}>
            {url && <PinPhoto instant subject={photoSubject(spotPhotoTitle(spot))} source={{ uri: url }} style={StyleSheet.absoluteFill as any} onLoad={snap} resizeMode="cover" />}
          </View>
        </View>
      </View>
    </MapboxGL.Image>
  );
});

// Every image a pin feature may reference. Grow-only (see MapScreen): an image is never unmounted while a symbol could
// still be fading out with it.
export default memo(function SpotPhotoImages({ specs }: { specs: SpotPhotoImageSpec[] }) {
  return (
    <MapboxGL.Images>
      {specs.map(s => <SpotPhotoImage key={s.name} spec={s} />)}
    </MapboxGL.Images>
  );
});

const st = StyleSheet.create({
  box: { width: W, height: H },
  rim: { position: 'absolute', width: SPOT_PHOTO_BUBBLE + 2, height: SPOT_PHOTO_BUBBLE + 2, borderRadius: (SPOT_PHOTO_BUBBLE + 2) / 2, backgroundColor: RIM },
  bubble: {
    position: 'absolute', left: PAD, top: PAD, width: SPOT_PHOTO_BUBBLE, height: SPOT_PHOTO_BUBBLE,
    borderRadius: SPOT_PHOTO_BUBBLE / 2, borderWidth: 2, backgroundColor: PLACEHOLDER, overflow: 'hidden',
  },
  clip: { flex: 1, borderRadius: SPOT_PHOTO_BUBBLE / 2, overflow: 'hidden' },
});
