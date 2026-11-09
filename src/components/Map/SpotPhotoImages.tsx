import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';
import PinPhoto from './PinPhoto';
import { photoSubject } from '../../utils/subjectCrop';
import { spotPhotoTitle, type Spot } from '../../data/spots';
import { pinPhotoUri, loadPinPhoto } from '../../utils/pinPhotoCache';
import { pumpedTimeout } from '../../utils/pumpedTimeout';
import { NO_PHOTO } from '../../data/imageOverrides';
import PatternPlaceholder from './PatternPlaceholder';

// A spot's photo pin drawn by a native symbol layer (MapScreen's spotPhotos), so Mapbox decides on the render thread,
// every frame, which pins fit and fades them in and out with the camera, the way Google Maps does. Each pin's look
// (teardrop, ring, round photo) is a small React Native view that rnmapbox snapshots into a style image, exactly as
// DestPinImages does for destinations; its bottom edge is the tip, so the layer anchors it at the bottom.
//
// An image is registered before its photo has loaded, and its first snapshot is an empty grey disc. So onReady reports when
// a snapshot holds the photo (or the placeholder of a spot with none), and until then MapScreen keeps the spot's small pin.

export const SPOT_PHOTO_BUBBLE = 28;
const TAIL = 10;
const RIM = 'rgba(0,0,0,0.22)';
const VISITED_COLOR = '#10B981';
const PLACEHOLDER = '#E5E7EB';
// The bubble of a spot with no photo at all (NO_PHOTO): the same slate and contour motif as its card and sheet
// (PatternPlaceholder), rather than its category's tint, so photo-less spots read as one kind; the spot's emoji sits on it.
// Fewer, brighter lines than the card, at this size.
const NO_PHOTO_LEVELS = 5;
const NO_PHOTO_LINE_OPACITY = 0.18;
const PAD = 2;
const R = SPOT_PHOTO_BUBBLE / 2;
const TIP_D = R + TAIL;
const TAN_Y = (R * R) / TIP_D;
const TAN_X = R * Math.sqrt(1 - (R * R) / (TIP_D * TIP_D));
const W = SPOT_PHOTO_BUBBLE + PAD * 2;
const H = SPOT_PHOTO_BUBBLE + TAIL + PAD * 2;
const SNAP_AFTER_MS = 60;    // the snapshot after the photo shows
const READY_AFTER_MS = 120;  // when that snapshot has reached the map

export type SpotPhotoImageSpec = { name: string; spot: Spot; visited: boolean };
// The selected spot's outline: drawn over its photo pin (MapScreen's spotSelectedRing layer), the same size and anchor, it
// recolours the pin's white (or green) rim and tail in slate, the colour of the photo-less spot motif (PatternPlaceholder),
// so the selected pin stands out from the rest. One image for every spot, so selecting one registers nothing new.
export const SPOT_SELECTED_RING = 'spotselring';
const SELECTED_RING_COLOR = '#475569';
const SELECTED_RING_W = 2.5;
export const spotPhotoImageName = (id: string, visited: boolean) => `sp:${id}:${visited ? 1 : 0}`;

const SpotPhotoImage = memo(function SpotPhotoImage({ spec, onReady }: { spec: SpotPhotoImageSpec; onReady: (name: string) => void }) {
  const { spot, name, visited } = spec;
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  // The photo from the disk cache when it is there (instant), else downloaded once into it.
  const [url, setUrl] = useState<string | null>(() => pinPhotoUri(spot));
  useEffect(() => {
    if (url) return;
    let live = true;
    loadPinPhoto(spot).then(u => { if (u && live) setUrl(u); });
    return () => { live = false; };
  }, [spot.id]);
  const timers = useRef<(() => void)[]>([]);
  useEffect(() => () => timers.current.forEach(cancel => cancel()), []);
  const snap = () => {
    timers.current.push(pumpedTimeout(() => imageRef.current?.refresh(), SNAP_AFTER_MS));
    timers.current.push(pumpedTimeout(() => imageRef.current?.refresh(), 500));
  };
  const snapReady = () => {
    snap();
    timers.current.push(pumpedTimeout(() => onReady(name), READY_AFTER_MS));
  };
  // PinPhoto's failsafe can report a photo as shown when it never loaded: that snapshot is still grey, so it doesn't count.
  const loadedRef = useRef(false);
  const noPhoto = !url && NO_PHOTO.has(spotPhotoTitle(spot));
  useEffect(() => { if (noPhoto) snapReady(); }, []);
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
            {noPhoto && (
              <View style={st.noPhoto}>
                <PatternPlaceholder seed={spot.id} idPrefix={`pinPat-${name}`} size={SPOT_PHOTO_BUBBLE - 4} levels={NO_PHOTO_LEVELS} lineOpacity={NO_PHOTO_LINE_OPACITY} />
                <Text style={st.noPhotoIcon}>{spot.icon ?? '📍'}</Text>
              </View>
            )}
            {url && <PinPhoto instant subject={photoSubject(spotPhotoTitle(spot))} source={{ uri: url }} style={StyleSheet.absoluteFill as any} onLoad={() => { loadedRef.current = true; snap(); }} onShown={() => { if (loadedRef.current) snapReady(); }} resizeMode="cover" />}
          </View>
        </View>
      </View>
    </MapboxGL.Image>
  );
});

const SelectedRing = memo(function SelectedRing() {
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  useEffect(() => {
    const t1 = setTimeout(() => imageRef.current?.refresh(), 60);
    const t2 = setTimeout(() => imageRef.current?.refresh(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const cx = PAD + R, cy = PAD + R;
  // The tail outside the bubble only (its two tangent edges, closed by the bubble's bottom arc), so it doesn't cover the photo.
  const tail = `M ${cx + TAN_X} ${cy + TAN_Y} L ${cx} ${cy + TIP_D} L ${cx - TAN_X} ${cy + TAN_Y} A ${R} ${R} 0 0 0 ${cx + TAN_X} ${cy + TAN_Y} Z`;
  return (
    <MapboxGL.Image name={SPOT_SELECTED_RING} ref={imageRef as any}>
      <View collapsable={false} style={st.box}>
        <Svg width={W} height={H}>
          <Path d={tail} fill={SELECTED_RING_COLOR} />
          {/* Over the bubble's 2 pt rim (radius R-2 to R), a little wider so no white shows at its edges. */}
          <Circle cx={cx} cy={cy} r={R - 1} fill="none" stroke={SELECTED_RING_COLOR} strokeWidth={SELECTED_RING_W} />
        </Svg>
      </View>
    </MapboxGL.Image>
  );
});

// Every image a pin feature may reference. Grow-only (see MapScreen): an image is never unmounted while a symbol could
// still be fading out with it.
export default memo(function SpotPhotoImages({ specs, onReady }: { specs: SpotPhotoImageSpec[]; onReady: (name: string) => void }) {
  return (
    <MapboxGL.Images>
      <SelectedRing />
      {specs.map(s => <SpotPhotoImage key={s.name} spec={s} onReady={onReady} />)}
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
  noPhoto: { width: SPOT_PHOTO_BUBBLE - 4, height: SPOT_PHOTO_BUBBLE - 4, alignItems: 'center', justifyContent: 'center' },
  // The same glyph size the category placeholder used (52% of the bubble).
  noPhotoIcon: {
    position: 'absolute', fontSize: Math.round((SPOT_PHOTO_BUBBLE - 4) * 0.52), lineHeight: Math.round((SPOT_PHOTO_BUBBLE - 4) * 0.62), textAlign: 'center',
  },
});
