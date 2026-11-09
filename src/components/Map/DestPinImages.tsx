import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PinPhoto from './PinPhoto';
import { photoSubject } from '../../utils/subjectCrop';
import MapboxGL from '@rnmapbox/maps';
import type { Destination } from '../../types';
import { destPinPhotoUri, loadDestPinPhoto } from '../../utils/pinPhotoCache';
import { NO_PHOTO } from '../../data/imageOverrides';
import PhotoPlaceholder from './PhotoPlaceholder';

// Destination photo pins are drawn by a native Mapbox SymbolLayer (see MapScreen's destPhotoSymbols), so Mapbox
// itself decides — every frame, on the render thread — which pins and names collide and fades them in and out, the
// way Google/Apple Maps POIs behave. A symbol layer can only draw style images, so each pin's look (round photo,
// white or green ring, visited-spot badge) is rendered here as a small React Native view and registered as a style
// image: rnmapbox's <Image> snapshots its child view into the map style, and refresh() re-snapshots it once the
// photo has loaded (until then the snapshot is the plain placeholder disc).

export const DEST_PIN_SIZE = 41;
const BORDER = 2;
// Transparent margin around the disc: room for the badge to overhang the ring. Kept small, because the whole image
// is the pin's collision box — a wide margin would push neighbouring pins further apart than they need to be.
const PAD = 3;
export const DEST_PIN_BOX = DEST_PIN_SIZE + PAD * 2;
const BADGE = 16;
const VISITED_COLOR = '#10B981';
const PLACEHOLDER = '#E5E7EB';

export type DestPinImageSpec = { name: string; dest: Destination; visited: boolean; badge: number; selected: boolean };

export const destPinImageName = (id: string, visited: boolean, badge: number, selected: boolean) =>
  `dp:${id}:${visited ? 1 : 0}:${badge}:${selected ? 1 : 0}`;

const DestPinImage = memo(function DestPinImage({ spec }: { spec: DestPinImageSpec }) {
  const { dest, name, visited, badge, selected } = spec;
  const imageRef = useRef<{ refresh: () => void } | null>(null);
  // The photo from the disk cache when it is there (instant), else downloaded once into it (pinPhotoCache).
  const [url, setUrl] = useState<string | null>(() => destPinPhotoUri(dest));
  useEffect(() => {
    if (url) return;
    let live = true;
    loadDestPinPhoto(dest).then(u => { if (u && live) setUrl(u); });
    return () => { live = false; };
  }, [dest.id]);

  // The snapshot is taken from the view as drawn, so give the photo a moment to land in the view first, and take a
  // second one a little later in case the first ran just before it did.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // A photo the server refused (a burst of thumbnail requests at start-up can be throttled) is never retried by the image
  // itself, so the pin would stay a grey disc until the app restarts: try again a few times, a little later each time.
  const [tries, setTries] = useState(0);
  const retry = () => {
    if (tries >= 4) return;
    timers.current.push(setTimeout(() => setTries(t => t + 1), 1500 * (tries + 1)));
  };
  const snap = () => {
    timers.current.push(setTimeout(() => imageRef.current?.refresh(), 60));
    timers.current.push(setTimeout(() => imageRef.current?.refresh(), 500));
  };
  // Once the photo is actually showing (PinPhoto's onShown): the timed snapshots after the load could all land before the
  // render that shows a cropped photo, busy at start-up, and the pin kept its grey disc.
  const snapShown = () => {
    timers.current.push(setTimeout(() => imageRef.current?.refresh(), 30));
    timers.current.push(setTimeout(() => imageRef.current?.refresh(), 400));
  };

  const ring = visited ? VISITED_COLOR : 'white';
  return (
    <MapboxGL.Image name={name} ref={imageRef as any}>
      <View collapsable={false} style={st.box}>
        {/* A soft shadow under the pin, so it stands off the map (drawn into the image: two faint discs set a little low). */}
        <View style={[st.shadow, st.shadowWide]} />
        <View style={[st.shadow, st.shadowNear]} />
        <View collapsable={false} style={st.outline}>
        <View collapsable={false} style={[st.disc, { borderColor: ring }, selected && st.discSelected]}>
          {!url && NO_PHOTO.has(dest.name) && <PhotoPlaceholder icon={dest.icon} category={dest.category} size={DEST_PIN_SIZE - BORDER * 2} />}
          {url && <PinPhoto key={tries} instant subject={photoSubject(dest.name)} source={{ uri: url }} style={st.photo} onLoad={snap} onShown={snapShown} onError={retry} resizeMode="cover" />}
        </View>
        </View>
        {badge > 0 && (
          <View collapsable={false} style={st.badge}>
            <Text style={st.badgeTxt}>{badge}</Text>
          </View>
        )}
      </View>
    </MapboxGL.Image>
  );
});

// Every image a pin feature may reference. Grow-only (see MapScreen): an image is never unmounted while a symbol could
// still be fading out with it.
export default memo(function DestPinImages({ specs }: { specs: DestPinImageSpec[] }) {
  return (
    <MapboxGL.Images>
      {specs.map(s => <DestPinImage key={s.name} spec={s} />)}
    </MapboxGL.Images>
  );
});

const st = StyleSheet.create({
  box: { width: DEST_PIN_BOX, height: DEST_PIN_BOX, alignItems: 'center', justifyContent: 'center' },
  // The shadow's discs, centred on the pin and shifted down, within the image's margin (PAD) so the pin's collision box
  // stays as it was.
  shadow: { position: 'absolute', left: '50%', top: '50%' },
  shadowWide: {
    width: DEST_PIN_SIZE + 3, height: DEST_PIN_SIZE + 3, borderRadius: (DEST_PIN_SIZE + 3) / 2,
    marginLeft: -(DEST_PIN_SIZE + 3) / 2, marginTop: -(DEST_PIN_SIZE + 3) / 2 + 1.5, backgroundColor: 'rgba(0,0,0,0.10)',
  },
  shadowNear: {
    width: DEST_PIN_SIZE + 2, height: DEST_PIN_SIZE + 2, borderRadius: (DEST_PIN_SIZE + 2) / 2,
    marginLeft: -(DEST_PIN_SIZE + 2) / 2, marginTop: -(DEST_PIN_SIZE + 2) / 2 + 1, backgroundColor: 'rgba(0,0,0,0.14)',
  },
  // Room round the white or green ring where a faint grey hairline used to be (the shadow now sets the pin off the map);
  // kept as an empty frame so the pin's size and centre are unchanged.
  outline: {
    width: DEST_PIN_SIZE + 2, height: DEST_PIN_SIZE + 2, borderRadius: (DEST_PIN_SIZE + 2) / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  disc: {
    width: DEST_PIN_SIZE, height: DEST_PIN_SIZE, borderRadius: DEST_PIN_SIZE / 2,
    borderWidth: BORDER, backgroundColor: PLACEHOLDER, overflow: 'hidden',
  },
  // Selected: a heavier ring, so the chosen destination reads as picked out from its neighbours.
  discSelected: { borderWidth: BORDER + 1 },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  badge: {
    position: 'absolute', right: 0, bottom: 0,
    width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: VISITED_COLOR,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: 'white', textAlign: 'center' },
});
