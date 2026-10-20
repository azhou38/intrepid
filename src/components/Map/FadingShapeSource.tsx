import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import MapboxGL from '@rnmapbox/maps';

// A ShapeSource whose features fade in when they join and fade out when they leave, instead of cutting.
//
// A native symbol vanishes the instant its feature leaves the source, and appears the instant it joins. This component
// diffs the features it is given by id: a new one is stepped up from opacity 0, a removed one is kept (its last copy) and
// stepped down to 0, then dropped. Each feature carries `o` (its opacity, read by the layers as a data-driven opacity),
// `fade` (1 while mid-fade) and `dir` (1 joining, -1 leaving, 0 steady). The stepping runs here, once per animation frame,
// and re-renders only this component, never the screen around it. A feature whose `nofade` property is truthy (a pin that
// is invisible anyway, e.g. behind its zoom gate) comes and goes at once. The first render never fades.
//
//   <FadingShapeSource id="spotPins" features={features} fadeInMs={160} fadeOutMs={130} onPress={…}>…layers…</FadingShapeSource>

type F = GeoJSON.Feature<GeoJSON.Point>;
type Entry = { f: F; dir: -1 | 0 | 1; start: number; from: number };

export const FadingShapeSource = memo(function FadingShapeSource({
  id, features, fadeInMs = 160, fadeOutMs = 130, hitbox, onPress, children,
}: {
  id: string;
  features: F[];
  fadeInMs?: number;
  fadeOutMs?: number;
  hitbox?: { width: number; height: number };
  onPress?: (e: any) => void;
  children: React.ReactElement | React.ReactElement[];
}) {
  const stRef = useRef<{ map: Map<string, Entry>; init: boolean; prev: F[] | null }>({ map: new Map(), init: false, prev: null });
  const [tick, setTick] = useState(0);
  const st = stRef.current;

  // Diff the incoming features against the last set (only when the prop changes, not on every animation frame).
  if (st.prev !== features) {
    const now = Date.now();
    const present = new Set<string>();
    for (const f of features) {
      const key = String(f.id ?? f.properties?.id);
      present.add(key);
      const e = st.map.get(key);
      const fades = st.init && !f.properties?.nofade;
      if (!e) st.map.set(key, { f, dir: fades ? 1 : 0, start: now, from: 0 });
      else {
        if (e.dir === -1) { e.from = fades ? cur(e, now, fadeInMs, fadeOutMs) : 1; e.start = now; e.dir = fades ? 1 : 0; }
        e.f = f;
      }
    }
    for (const [key, e] of st.map) {
      if (present.has(key) || e.dir === -1) continue;
      if (!st.init || e.f.properties?.nofade) { st.map.delete(key); continue; }
      e.from = cur(e, now, fadeInMs, fadeOutMs); e.start = now; e.dir = -1;
    }
    st.init = true;
    st.prev = features;
  }

  const now = Date.now();
  let active = false;
  const out: F[] = [];
  for (const [key, e] of st.map) {
    const o = cur(e, now, fadeInMs, fadeOutMs);
    if (e.dir === -1 && o <= 0) { st.map.delete(key); continue; }
    if (e.dir === 1 && o >= 1) e.dir = 0;
    if (e.dir !== 0) active = true;
    out.push(e.dir === 0 && (e.f.properties?.o ?? 1) === 1 && !e.f.properties?.fade ? e.f
      : { ...e.f, properties: { ...e.f.properties, o: Math.round(o * 1000) / 1000, fade: e.dir !== 0 ? 1 : 0, dir: e.dir } });
  }
  // The steady features are passed through unchanged, so a frame where nothing fades hands Mapbox the same objects.
  const shape = useMemo(() => ({ type: 'FeatureCollection' as const, features: out }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [features, tick]);

  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => setTick(t => t + 1));
    return () => cancelAnimationFrame(raf);
  });

  return (
    <MapboxGL.ShapeSource id={id} shape={shape} hitbox={hitbox} onPress={onPress}>
      {children}
    </MapboxGL.ShapeSource>
  );
});

function cur(e: Entry, now: number, inMs: number, outMs: number) {
  if (e.dir === 1) return Math.min(1, e.from + (now - e.start) / inMs);
  if (e.dir === -1) return Math.max(0, e.from - (now - e.start) / outMs);
  return 1;
}

export default FadingShapeSource;
