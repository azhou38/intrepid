import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import MapboxGL from '@rnmapbox/maps';

// The spot pins' native layers (small pins, and photo pins with their names) and their fades. Its own component so the
// fade bookkeeping (a re-render as each batch starts and settles) re-renders only these layers, never the map screen.
// `shape` is MapScreen's planned spot pins (nativeSpotPins); which pins show is decided there, only the switch is animated.

// Same fade as the destination pins' tier layers (MapScreen's DEST_GATE_FADE_MS).
const DEST_GATE_FADE_MS = 250;
// Fade layers per spot pin kind (photo, small) for spot pins starting or stopping to show.
const SPOT_FADE_SLOTS = 6;

type Props = {
  shape: GeoJSON.FeatureCollection<GeoJSON.Point>;
  satellite: boolean;
  onPressSpot: (id: string) => void;
};

function SpotPinLayers({ shape, satellite, onPressSpot }: Props) {
  // Spot pin fades. Which spots show a photo pin and which a small pin is planned above and drawn without collision, so
  // Mapbox has nothing to fade: a pin added to or removed from the data just appears or vanishes. A pin that starts or
  // stops showing (a photo pin, or a small pin, separately) therefore passes through one of a few fade layers whose
  // constant opacity Mapbox animates (as the destination pins' tier layers do): newcomers join a layer resting at 0 that
  // then fades to 1, leavers move to one resting at 1 that then fades to 0. Once its fade has finished a newcomer moves to
  // the steady layer and a leaver is dropped; the layer keeps its final opacity, ready for the opposite fade next. With no
  // free layer (a fast zoom changes pins every frame or two), pins join the latest fade going their way, part-way through,
  // rather than switching at once. What shows is exactly the plan's; only the switch is animated.
  type SpotFadeSlot = { mode: 'free' | 'in' | 'out'; keys: Set<string>; on: boolean; started: boolean; readyAt: number; startedAt: number };
  const spotFadeRef = useRef<{ steady: Set<string>; feats: Map<string, GeoJSON.Feature<GeoJSON.Point>>; slots: Record<'p' | 'm', SpotFadeSlot[]> } | null>(null);
  if (!spotFadeRef.current) {
    const mk = () => Array.from({ length: SPOT_FADE_SLOTS }, (_, i): SpotFadeSlot => ({ mode: 'free', keys: new Set(), on: i % 2 === 1, started: false, readyAt: 0, startedAt: 0 }));
    spotFadeRef.current = { steady: new Set(), feats: new Map(), slots: { p: mk(), m: mk() } };
  }
  const [spotFadeTick, setSpotFadeTick] = useState(0);
  const lastSpotFadeShapeRef = useRef<{ sig: string; shape: GeoJSON.FeatureCollection<GeoJSON.Point> } | null>(null);
  const spotPinShape = useMemo(() => {
    const st = spotFadeRef.current!;
    const desired = new Map<string, GeoJSON.Feature<GeoJSON.Point>>();
    for (const f of shape.features) {
      const kind = f.properties!.img ? 'p' : 'm';
      desired.set(`${f.properties!.id}:${kind}`, { ...f, properties: { ...f.properties, k: kind } });
    }
    const kindOf = (key: string) => (key.endsWith(':p') ? 'p' : 'm') as 'p' | 'm';
    const now = Date.now();
    const slotOf = new Map<string, SpotFadeSlot>();
    for (const kind of ['p', 'm'] as const) for (const sl of st.slots[kind]) for (const key of sl.keys) slotOf.set(key, sl);
    const entering: Record<'p' | 'm', string[]> = { p: [], m: [] };
    const leaving: Record<'p' | 'm', string[]> = { p: [], m: [] };
    for (const key of st.steady) if (!desired.has(key)) leaving[kindOf(key)].push(key);
    // A pin still fading in that is no longer wanted fades out from where it is.
    for (const [key, sl] of slotOf) if (sl.mode === 'in' && !desired.has(key)) { sl.keys.delete(key); leaving[kindOf(key)].push(key); }
    for (const key of desired.keys()) {
      if (st.steady.has(key)) continue;
      const sl = slotOf.get(key);
      if (sl?.mode === 'in') continue;
      if (sl) sl.keys.delete(key);   // was fading out: fades back in with the newcomers
      entering[kindOf(key)].push(key);
    }
    for (const kind of ['p', 'm'] as const) {
      // The newest fade going this way: an unstarted batch first, else the one that started last.
      const latest = (mode: 'in' | 'out') => st.slots[kind].filter(x => x.mode === mode)
        .sort((a, b) => (a.started ? a.startedAt : Infinity) - (b.started ? b.startedAt : Infinity)).pop();
      if (entering[kind].length) {
        const sl = st.slots[kind].find(x => x.mode === 'free' && !x.on && x.readyAt <= now);
        const join = sl ? null : latest('in');
        if (sl) { sl.mode = 'in'; sl.keys = new Set(entering[kind]); sl.started = false; }
        else if (join) for (const key of entering[kind]) join.keys.add(key);
        else for (const key of entering[kind]) st.steady.add(key);
      }
      if (leaving[kind].length) {
        for (const key of leaving[kind]) st.steady.delete(key);
        const sl = st.slots[kind].find(x => x.mode === 'free' && x.on && x.readyAt <= now);
        const join = sl ? null : latest('out');
        if (sl) { sl.mode = 'out'; sl.keys = new Set(leaving[kind]); sl.started = false; }
        else if (join) for (const key of leaving[kind]) join.keys.add(key);
      }
    }
    for (const [key, f] of desired) st.feats.set(key, f);
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    const add = (key: string, layer: string) => {
      const f = st.feats.get(key);
      if (f) features.push({ ...f, id: key, properties: { ...f.properties, L: layer } });
    };
    for (const key of st.steady) add(key, 's');
    for (const kind of ['p', 'm'] as const) st.slots[kind].forEach((sl, i) => { for (const key of sl.keys) add(key, String(i)); });
    const live = new Set(features.map(f => String(f.id)));
    for (const key of [...st.feats.keys()]) if (!live.has(key)) st.feats.delete(key);
    const sig = features.map(f => `${f.id}|${f.properties!.L}|${f.properties!.img}|${f.properties!.mini}|${f.properties!.sort}`).join(',');
    const last = lastSpotFadeShapeRef.current;
    if (last && last.sig === sig) return last.shape;
    const next = { type: 'FeatureCollection' as const, features };
    lastSpotFadeShapeRef.current = { sig, shape: next };
    return next;
  }, [shape, spotFadeTick]);
  // A batch that has just joined its fade layer starts fading on the next render (so it is drawn at the layer's resting
  // opacity first), and settles once the fade has run.
  useEffect(() => {
    const st = spotFadeRef.current!;
    let start = false;
    for (const kind of ['p', 'm'] as const) for (const sl of st.slots[kind]) {
      if (sl.mode === 'free' || sl.started) continue;
      sl.started = true; sl.startedAt = Date.now(); start = true;
      const batch = sl.keys;
      setTimeout(() => {
        if (sl.keys !== batch) return;
        if (sl.mode === 'in') for (const key of sl.keys) st.steady.add(key);
        sl.on = sl.mode === 'in';
        sl.mode = 'free';
        sl.keys = new Set();
        // Keep free layers ready for both directions: an empty layer can change its resting opacity unseen, so after many
        // fades one way there are still layers to fade the other way. That change animates like any other (the layers'
        // transition never changes: a fade that also switched the transition did not animate on the phone), so
        // the layer takes no pins until it has finished.
        const free = st.slots[kind].filter(x => x.mode === 'free');
        const offs = free.filter(x => !x.on), ons = free.filter(x => x.on);
        const flip = offs.length < 2 && ons.length > 2 ? ons[0] : ons.length < 2 && offs.length > 2 ? offs[0] : null;
        if (flip) { flip.on = !flip.on; flip.readyAt = Date.now() + DEST_GATE_FADE_MS + 50; }
        setSpotFadeTick(t => t + 1);
      }, DEST_GATE_FADE_MS + 50);
    }
    if (start) setSpotFadeTick(t => t + 1);
  }, [spotPinShape]);
  // Each fade layer's opacity: its resting one while free or before its batch starts, then the fade's target.
  const spotFadeLayers = (['m', 'p'] as const).map(kind => ({
    kind,
    slots: spotFadeRef.current!.slots[kind].map(sl => (sl.mode === 'free' || !sl.started ? sl.on : sl.mode === 'in')),
  }));

  // The spot pin layers' styles: the small pin, or the photo pin and its name, at a constant opacity Mapbox animates.
  const spotPinStyles = useMemo(() => {
    const fade = { duration: DEST_GATE_FADE_MS, delay: 0 };
    const mini = {
      iconImage: ['get', 'mini'] as any,
      iconAnchor: 'bottom' as const,
      // Small pins never block anything, each other included, so they show at the same zooms as before; a spot without a
      // photo pin (see MapScreen's plan (nativeSpotPins)) always shows its small pin.
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconPadding: 0,
      symbolSortKey: ['get', 'sort'] as any,
      iconOpacityTransition: fade,
    };
    const photo = {
      iconImage: ['get', 'img'] as any,
      iconAnchor: 'bottom' as const,
      // The plan in nativeSpotPins already spaced the photo pins: draw every one (a spot whose photo Mapbox hid would
      // have no pin at all, since its small pin is not drawn), still recording it so names avoid it.
      iconAllowOverlap: true,
      iconIgnorePlacement: false,
      iconPadding: 2,
      symbolSortKey: ['get', 'sort'] as any,
      textField: ['get', 'label'] as any,
      textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      textSize: 12,
      textMaxWidth: 10,
      textVariableAnchor: ['right', 'left'] as any,
      // 'auto': a name to the right of its pin is left-aligned, one to the left right-aligned (never centred).
      textJustify: 'auto' as const,
      textRadialOffset: 1.5,
      textTranslate: [0, -23],
      textOptional: true,
      textAllowOverlap: false,
      textPadding: 2,
      textColor: satellite ? '#FFFFFF' : '#111827',
      textHaloColor: satellite ? '#000000' : '#FFFFFF',
      textHaloWidth: 1.5,
      iconOpacityTransition: fade,
      textOpacityTransition: fade,
    };
    const out: Record<string, any> = {};
    for (const on of [false, true]) {
      out[`m${on}`] = { ...mini, iconOpacity: on ? 1 : 0 };
      out[`p${on}`] = { ...photo, iconOpacity: on ? 1 : 0, textOpacity: on ? 1 : 0 };
    }
    return out;
  }, [satellite]);
  const spotPinStyle = (kind: 'p' | 'm', on: boolean) => spotPinStyles[`${kind}${on}`];


  return (
    <MapboxGL.ShapeSource
      id="spotPins"
      shape={spotPinShape}
      hitbox={{ width: 32, height: 40 }}
      onPress={(e) => {
        const id = e.features[0]?.properties?.id as string | undefined;
        if (id) onPressSpot(id);
      }}
    >
      {/* Small pins, then photo pins with their names, each as a steady layer plus fade layers (see spotPinShape).
          Bottom to top: the fade layers under their steady layer, so steady pins and names are placed first. */}
      {spotFadeLayers.flatMap(({ kind, slots }) => [
        ...slots.map((on, i) => (
          <MapboxGL.SymbolLayer
            key={`spotPins-${kind}-${i}`}
            id={`spotPins-${kind}-${i}`}
            belowLayerID="destStampCircles"
            filter={['all', ['==', ['get', 'k'], kind], ['==', ['get', 'L'], String(i)]] as any}
            style={spotPinStyle(kind, on)}
          />
        )),
        <MapboxGL.SymbolLayer
          key={`spotPins-${kind}-s`}
          id={kind === 'p' ? 'spotPhotos' : 'spotMiniPins'}
          belowLayerID="destStampCircles"
          filter={['all', ['==', ['get', 'k'], kind], ['==', ['get', 'L'], 's']] as any}
          style={spotPinStyle(kind, true)}
        />,
      ])}
    </MapboxGL.ShapeSource>
  );
}

export default memo(SpotPinLayers);
