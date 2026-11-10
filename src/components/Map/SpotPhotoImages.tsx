import React, { memo, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
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
// (PatternPlaceholder), rather than its category's tint, so photo-less spots read as one kind. No emoji on it: the motif alone marks a spot without a photo.
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
// The selected spot's highlight: drawn over its photo pin (MapScreen's spotSelectedRing layer), the same size and anchor, an
// near-black border over the pin's white (or green) rim and along its tail's edges, and a soft dark halo round it (rings
// fading outward, outside the bubble only, as this image sits over the photo). Near-black is the app's selection colour
// (the breadcrumb's active segment, the Profile's level pill); green already means visited. It replaced a slate outline
// with a solid slate tail, which read as a grey fill. One image for every spot, so selecting one registers nothing new.
export const SPOT_SELECTED_RING = 'spotselring';
// The same for a visited spot, with a small green tick badge on the bubble's top right (the tick of the app's "Visited" tags),
// as its own green rim is covered by the outline.
export const SPOT_SELECTED_RING_VISITED = 'spotselring:visited';
const SELECTED_RING_COLOR = '#111827';
const SELECTED_RING_W = 2.5;
// The halo: rings outside the bubble, fading as they go out (radius beyond the bubble's edge, opacity).
const HALO: [number, number][] = [[1.6, 0.26], [3.0, 0.14], [4.4, 0.06]];
// Room round the pin for the badge, left, right and above (none below, so the image's bottom edge is still the pin's tip
// and centred on it, as the layer anchors it at the bottom). A multiple of 4: rnmapbox rounds a snapshot's width and height
// up to a multiple of 4 pt, adding the space at the right and bottom, so the outline must round exactly as the pin's own
// image does (32 x 42 -> 32 x 44) or it sits a point off it, with the pin's rim showing at its edge: 40 x 46 -> 40 x 48.
const RING_M = 4;
const BADGE_R = 5.5;
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
        {/* A soft shadow under the pin, as under a destination pin: the teardrop again in faint black, set a little low,
            inside the image (its size, which the selected outline is matched to, stays as it was). */}
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Circle cx={cx} cy={cy + 1.5} r={R + 1.5} fill="rgba(0,0,0,0.10)" />
          <Path d={tail} fill="rgba(0,0,0,0.10)" stroke="rgba(0,0,0,0.10)" strokeWidth={3} strokeLinejoin="round" transform="translate(0 1.5)" />
          <Circle cx={cx} cy={cy + 1} r={R + 0.5} fill="rgba(0,0,0,0.10)" />
        </Svg>
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
              </View>
            )}
            {url && <PinPhoto instant subject={photoSubject(spotPhotoTitle(spot))} source={{ uri: url }} style={StyleSheet.absoluteFill as any} onLoad={() => { loadedRef.current = true; snap(); }} onShown={() => { if (loadedRef.current) snapReady(); }} resizeMode="cover" />}
          </View>
        </View>
      </View>
    </MapboxGL.Image>
  );
});

const SelectedRing = memo(function SelectedRing({ name, visited }: { name: string; visited: boolean }) {
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  useEffect(() => {
    const t1 = setTimeout(() => imageRef.current?.refresh(), 60);
    const t2 = setTimeout(() => imageRef.current?.refresh(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const cx = RING_M + PAD + R, cy = RING_M + PAD + R;
  // The tail's two edges (not its fill: the pin's own white tail shows between them).
  const tailEdges = `M ${cx + TAN_X} ${cy + TAN_Y} L ${cx} ${cy + TIP_D} L ${cx - TAN_X} ${cy + TAN_Y}`;
  const bx = cx + R * 0.72, by = cy - R * 0.72;
  return (
    <MapboxGL.Image name={name} ref={imageRef as any}>
      <View collapsable={false} style={{ width: W + RING_M * 2, height: H + RING_M }}>
        <Svg width={W + RING_M * 2} height={H + RING_M}>
          {/* The halo, round the bubble and along the tail. */}
          {HALO.map(([d, o]) => (
            <Circle key={d} cx={cx} cy={cy} r={R + d} fill="none" stroke={SELECTED_RING_COLOR} strokeOpacity={o} strokeWidth={1.6} />
          ))}
          <Path d={tailEdges} fill="none" stroke={SELECTED_RING_COLOR} strokeOpacity={0.12} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
          {/* The border: over the bubble's 2 pt rim (radius R-2 to R), a little wider so no white shows at its edges, and
              along the tail's edges. */}
          <Path d={tailEdges} fill="none" stroke={SELECTED_RING_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={cx} cy={cy} r={R - 1} fill="none" stroke={SELECTED_RING_COLOR} strokeWidth={SELECTED_RING_W} />
          {visited && (
            <>
              <Circle cx={bx} cy={by} r={BADGE_R} fill={VISITED_COLOR} stroke="white" strokeWidth={1.5} />
              <Path d={`M ${bx - 2.4} ${by + 0.2} l 1.7 1.7 l 3.2 -3.4`} fill="none" stroke="white" strokeWidth={1.6}
                strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
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
      <SelectedRing name={SPOT_SELECTED_RING} visited={false} />
      <SelectedRing name={SPOT_SELECTED_RING_VISITED} visited />
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
  noPhoto: { width: SPOT_PHOTO_BUBBLE - 4, height: SPOT_PHOTO_BUBBLE - 4 },
});
