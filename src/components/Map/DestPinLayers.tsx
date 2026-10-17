import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MapboxGL from '@rnmapbox/maps';

// The destination photo pins' native symbol layers, with fades for the pins the plan adds and drops. Mapbox fades a pin
// in and out itself when it wins or loses an overlap with a neighbour, but a pin added to or removed from the layer's DATA
// appears or vanishes in a single frame — so as the zoom crossed a rank gate (Whanganui, Wairarapa, Kāpiti Coast) those
// pins popped while their neighbours faded. Here a pin the plan just added is drawn on a fade-in layer first, then joins
// the main layer; a pin the plan just dropped is drawn on a fade-out layer. Each batch gets its own short-lived layer
// (SLOTS of each kind, since a layer has one opacity); if more overlap than that, the oldest finishes at once.
// - The fade-in layers sit BELOW the main layer and take part in Mapbox's overlap rules exactly like it, so a pin fading
//   in never pushes an existing pin aside (Mapbox places the upper layer first) and is hidden, with Mapbox's own fade,
//   wherever it overlaps one.
// - Only pins Mapbox actually had on screen fade out (a pin it was hiding for overlap must not reappear to fade): the
//   main layer's rendered pins are sampled every RENDERED_SAMPLE_MS.

type F = GeoJSON.Feature<GeoJSON.Point>;
const FADE_MS = 220;
const SLOTS = 4;
const RENDERED_SAMPLE_MS = 200;
const idOf = (f: F) => f.properties?.id as string;

type Slot = { key: number; features: F[]; run: boolean };

export default memo(function DestPinLayers({ shape, style, onPress, mapRef }: {
  shape: GeoJSON.FeatureCollection<GeoJSON.Point>;
  style: any;
  onPress: (e: any) => void;
  mapRef: React.RefObject<MapboxGL.MapView | null>;
}) {
  const [settled, setSettled] = useState<F[]>(() => shape.features);
  const [enter, setEnter] = useState<(Slot | null)[]>(() => Array(SLOTS).fill(null));
  const [exit, setExit] = useState<(Slot | null)[]>(() => Array(SLOTS).fill(null));
  // Mirrors of the state, so the shape effect works from what is on screen right now.
  const settledRef = useRef(settled), enterRef = useRef(enter), exitRef = useRef(exit);
  settledRef.current = settled; enterRef.current = enter; exitRef.current = exit;
  const keyRef = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const firstRef = useRef(true);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Which main-layer pins Mapbox has on screen right now (sampled; see the header).
  const renderedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    const sample = () => {
      mapRef.current?.queryRenderedFeaturesInRect([], [], ['destPhotoSymbols'])
        .then(fc => {
          if (!live || !fc) return;
          const ids = new Set<string>();
          for (const f of fc.features) { const id = f.properties?.id; if (typeof id === 'string') ids.add(id); }
          renderedRef.current = ids;
        })
        .catch(() => {});
    };
    sample();
    const t = setInterval(sample, RENDERED_SAMPLE_MS);
    return () => { live = false; clearInterval(t); };
  }, [mapRef]);

  // Puts `features` in a free slot of `kind` (finishing the oldest one if none is free), starts its fade on the next
  // frame, and retires it when the fade ends.
  const startSlot = (kind: 'enter' | 'exit', features: F[]) => {
    const key = ++keyRef.current;
    const cur = (kind === 'enter' ? enterRef : exitRef).current.slice();
    let i = cur.findIndex(s => s === null);
    if (i < 0) {
      i = cur.reduce((best, s, j) => (s!.key < cur[best]!.key ? j : best), 0);
      if (kind === 'enter') finishEnter(cur[i]!);
    }
    cur[i] = { key, features, run: false };
    (kind === 'enter' ? enterRef : exitRef).current = cur;
    (kind === 'enter' ? setEnter : setExit)(cur);
    requestAnimationFrame(() => {
      const set = kind === 'enter' ? setEnter : setExit;
      set(prev => prev.map(s => (s && s.key === key ? { ...s, run: true } : s)));
    });
    const t = setTimeout(() => {
      timers.current.delete(t);
      const list = (kind === 'enter' ? enterRef : exitRef).current;
      const slot = list.find(s => s && s.key === key);
      if (!slot) return;
      if (kind === 'enter') finishEnter(slot);
      const set = kind === 'enter' ? setEnter : setExit;
      set(prev => {
        const next = prev.map(s => (s && s.key === key ? null : s));
        (kind === 'enter' ? enterRef : exitRef).current = next;
        return next;
      });
    }, FADE_MS + 60);
    timers.current.add(t);
  };
  // A finished fade-in: its pins join the main layer.
  const finishEnter = (slot: Slot) => {
    const have = new Set(settledRef.current.map(idOf));
    const add = slot.features.filter(f => !have.has(idOf(f)));
    if (!add.length) return;
    const next = [...settledRef.current, ...add];
    settledRef.current = next;
    setSettled(next);
  };

  useLayoutEffect(() => {
    const live = new Map<string, F>();
    for (const f of shape.features) live.set(idOf(f), f);
    if (firstRef.current) { firstRef.current = false; settledRef.current = shape.features; setSettled(shape.features); return; }

    const settledNow = settledRef.current;
    const enteringIds = new Set<string>();
    for (const s of enterRef.current) if (s) for (const f of s.features) enteringIds.add(idOf(f));
    const shown = new Map<string, F>();
    for (const f of settledNow) shown.set(idOf(f), f);
    for (const s of enterRef.current) if (s) for (const f of s.features) shown.set(idOf(f), f);

    const added: F[] = [];
    for (const [id, f] of live) if (!shown.has(id)) added.push(f);
    const removed: F[] = [];
    for (const [id, f] of shown) if (!live.has(id)) removed.push(f);

    // Settled pins take the live version (an image can change, e.g. a visited badge), minus the ones that left.
    const nextSettled = settledNow.filter(f => live.has(idOf(f))).map(f => live.get(idOf(f))!);
    const changed = nextSettled.length !== settledNow.length || nextSettled.some((f, i) => f !== settledNow[i]);
    if (changed) { settledRef.current = nextSettled; setSettled(nextSettled); }
    // Pins that left mid fade-in stop fading in; pins that came back mid fade-out stop fading out.
    if (removed.length) {
      const gone = new Set(removed.map(idOf));
      const next = enterRef.current.map(s => (s ? { ...s, features: s.features.filter(f => !gone.has(idOf(f))) } : s));
      enterRef.current = next; setEnter(next);
    }
    if (added.length) {
      const back = new Set(added.map(idOf));
      const next = exitRef.current.map(s => (s ? { ...s, features: s.features.filter(f => !back.has(idOf(f))) } : s));
      exitRef.current = next; setExit(next);
    }
    // Pins still mid fade-in were never on the main layer; only pins Mapbox was showing get a fade-out.
    const fadeOut = removed.filter(f => renderedRef.current.has(idOf(f)) && !enteringIds.has(idOf(f)));
    if (fadeOut.length) startSlot('exit', fadeOut);
    if (added.length) startSlot('enter', added);
  }, [shape]);

  const settledShape = useMemo(() => ({ type: 'FeatureCollection' as const, features: settled }), [settled]);
  const fadeStyle = (kind: 'enter' | 'exit', slot: Slot | null) => {
    const from = kind === 'enter' ? 0 : 1, to = kind === 'enter' ? 1 : 0;
    const opacity = slot && slot.run ? to : from;
    const transition = { duration: slot && slot.run ? FADE_MS : 0, delay: 0 };
    return {
      ...style,
      // A fading-out pin was on screen and stays put while it fades, out of everyone's way. A fading-in pin keeps the
      // main layer's overlap rules (see the header).
      ...(kind === 'exit' ? { iconAllowOverlap: true, iconIgnorePlacement: true, textAllowOverlap: true, textIgnorePlacement: true } : null),
      iconOpacity: opacity, textOpacity: opacity,
      iconOpacityTransition: transition, textOpacityTransition: transition,
    };
  };

  const enterShapes = useMemo(() => enter.map(sl => ({ type: 'FeatureCollection' as const, features: sl ? sl.features : [] })), [enter]);
  const exitShapes = useMemo(() => exit.map(sl => ({ type: 'FeatureCollection' as const, features: sl ? sl.features : [] })), [exit]);
  const enterStyles = useMemo(() => enter.map(sl => fadeStyle('enter', sl)), [enter, style]);
  const exitStyles = useMemo(() => exit.map(sl => fadeStyle('exit', sl)), [exit, style]);

  return (
    <>
      <MapboxGL.ShapeSource id="destPhotos" shape={settledShape} onPress={onPress}>
        <MapboxGL.SymbolLayer id="destPhotoSymbols" aboveLayerID="destStampCircles" style={style} />
      </MapboxGL.ShapeSource>
      {enter.map((_, i) => (
        <MapboxGL.ShapeSource key={`in${i}`} id={`destPhotosIn${i}`} shape={enterShapes[i]}>
          <MapboxGL.SymbolLayer id={`destPhotoSymbolsIn${i}`} belowLayerID="destPhotoSymbols" style={enterStyles[i]} />
        </MapboxGL.ShapeSource>
      ))}
      {exit.map((_, i) => (
        <MapboxGL.ShapeSource key={`out${i}`} id={`destPhotosOut${i}`} shape={exitShapes[i]}>
          <MapboxGL.SymbolLayer id={`destPhotoSymbolsOut${i}`} belowLayerID="destPhotoSymbols" style={exitStyles[i]} />
        </MapboxGL.ShapeSource>
      ))}
    </>
  );
});
