import React, { memo, useEffect, useMemo, useReducer, useRef } from 'react';
import MapboxGL from '@rnmapbox/maps';
import { cameraStore } from './cameraStore';

// A ShapeSource whose pins follow the camera's live zoom and fade in and out natively.
//
// Two problems this solves. (1) Which pins show at a zoom threshold (a destination's own default view, where its photo
// pin gives way to its spot pins) used to be decided only when the whole map screen re-rendered, which during a pinch runs
// well behind the camera: pins swapped once the gesture had more or less ended. Here a feature may carry `zmin` (shown
// from this zoom) and `zmax` (hidden from this zoom); the screen hands over features a little beyond the threshold, and
// this component, subscribed to the live camera zoom (cameraStore), shows or hides them the moment the camera crosses.
// (2) Fades stepped through the source data (a per-feature opacity re-sent every frame) never drew on a large source: the
// map applies data updates asynchronously, so only the end state showed. Instead a feature that joins is put on an
// "in" slot layer whose constant opacity is then switched 0 → 1, and one that leaves is moved to an "out" slot layer
// switched 1 → 0; the map animates a constant opacity change itself (the layer's opacity transition), on the render
// thread, at frame rate. When the fade has finished the joined feature moves to the main layers and the slot resets.
//
// `layers(slot, opacity, ms)` renders the layers for one slot: slot '' is the main set (opacity 1, collision as usual);
// the slot layers must filter on ['==', ['get', 'slot'], slot], take the given constant opacity with a transition of
// `ms`, and allow overlap (a pin mid-fade must neither push nor be pushed). A feature with `nofade` set (a pin that is
// invisible anyway, e.g. behind its zoom gate) never fades. The first render never fades.

type F = GeoJSON.Feature<GeoJSON.Point>;

// The live placement plan (optional): which candidate pins get their full (photo) form at the live zoom, decided here on
// every camera event so it never lags the camera. A feature with `cand` set is a candidate; `pri` orders them (lower is more
// prominent), `force` always places one, `gz` is the zoom from which it is visible at all (before that it is placed last
// and never blocks a visible pin). PERSISTENCE: candidates placed last time are placed first (by prominence), then the rest
// (by prominence), each only where it does not overlap one already placed. Zooming in only moves pins apart, so a pin that
// shows keeps showing; zooming out, two showing pins that come to overlap are settled by prominence. A candidate not placed
// is drawn with `demote` merged into its properties (a spot's small pin) under its own key, or not drawn at all when
// there is no `demote` (a destination: its dot, drawn elsewhere, remains). Changes go through the same fades as joining
// and leaving pins.
export type PinPlan = { w: number; h: number; demote?: Record<string, any> };
const worldPx = (lng: number, lat: number, z: number) => {
  const scale = 512 * Math.pow(2, z);
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
};
const IN_SLOTS = ['in0', 'in1'];
const OUT_SLOTS = ['out0', 'out1'];
type SlotPhase = 'idle' | 'arming' | 'running' | 'resetting';
type Slot = { phase: SlotPhase; opacity: number; timers: any[] };

const shownAt = (f: F, z: number) => {
  const p = f.properties ?? {};
  return (p.zmin === undefined || p.zmin === null || z >= p.zmin) && (p.zmax === undefined || p.zmax === null || z < p.zmax);
};

export const FadingShapeSource = memo(function FadingShapeSource({
  id, features, fadeInMs = 160, fadeOutMs = 130, hitbox, onPress, layers, plan,
}: {
  id: string;
  features: F[];
  fadeInMs?: number;
  fadeOutMs?: number;
  hitbox?: { width: number; height: number };
  onPress?: (e: any) => void;
  layers: (slot: string, opacity: number, ms: number) => React.ReactElement[];
  plan?: PinPlan;
}) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const st = useRef({
    init: false,
    // key -> the feature as last given, and the slot it is drawn on ('' = main)
    entries: new Map<string, { f: F; slot: string }>(),
    slots: new Map<string, Slot>([...IN_SLOTS.map(s => [s, { phase: 'idle' as SlotPhase, opacity: 0, timers: [] as any[] }] as const),
      ...OUT_SLOTS.map(s => [s, { phase: 'idle' as SlotPhase, opacity: 1, timers: [] as any[] }] as const)]),
    visibleSig: '',
    features,
    placed: new Set<string>(),   // candidates placed in the last plan (persistence)
    plan,
  }).current;
  st.features = features;
  st.plan = plan;

  // Which features are shown at the live zoom, and a cheap signature of that set.
  const visibleAt = (z: number, commit = false) => {
    const vis: F[] = [];
    for (const f of st.features) if (shownAt(f, z)) vis.push(f);
    const pl = st.plan;
    if (!pl) return vis;
    const keyOf = (f: F) => String(f.id ?? f.properties?.id);
    const cands = vis.filter(f => f.properties?.cand);
    const visibleNow = (f: F) => f.properties?.gz === undefined || z >= f.properties.gz;
    const group = (f: F) => f.properties?.force ? 0 : !visibleNow(f) ? 3 : st.placed.has(keyOf(f)) ? 1 : 2;
    cands.sort((a, b) => group(a) - group(b) || (a.properties!.pri ?? 0) - (b.properties!.pri ?? 0));
    const boxes: { x: number; y: number }[] = [];
    const placed = new Set<string>();
    for (const f of cands) {
      const [lng, lat] = f.geometry.coordinates;
      const p = worldPx(lng, lat, z);
      if (!f.properties?.force && boxes.some(o => Math.abs(o.x - p.x) < pl.w && Math.abs(o.y - p.y) < pl.h)) continue;
      boxes.push(p); placed.add(keyOf(f));
    }
    if (commit) st.placed = new Set([...placed].filter(k => { const f = cands.find(c => keyOf(c) === k); return !!f && visibleNow(f); }));
    const out: F[] = [];
    for (const f of vis) {
      if (!f.properties?.cand || placed.has(keyOf(f))) { out.push(f); continue; }
      if (pl.demote) out.push({ ...f, id: `${keyOf(f)}#d`, properties: { ...f.properties, ...pl.demote, id: f.properties?.id, cand: 0 } });
    }
    return out;
  };
  const sigOf = (vis: F[]) => vis.map(f => String(f.id ?? f.properties?.id)).join('|');
  // NB: a demoted feature's key is `<id>#d`, so a pin turning from its full form into its small form (or back) fades
  // like a pin leaving and another joining.

  // Follow the camera: re-render only when the shown set changes.
  useEffect(() => cameraStore.subscribe(z => {
    const s = sigOf(visibleAt(z));
    if (s !== st.visibleSig) bump();
  }), []);   // eslint-disable-line react-hooks/exhaustive-deps

  const later = (slot: Slot, fn: () => void, ms: number) => { slot.timers.push(setTimeout(fn, ms)); };
  const afterFrames = (slot: Slot, fn: () => void) => {
    // Two frames: the data update that moved the features onto the slot reaches the map before the opacity switch.
    slot.timers.push(requestAnimationFrame(() => slot.timers.push(requestAnimationFrame(fn))));
  };

  // Diff the shown set against what is drawn, assigning joiners and leavers to slots.
  const vis = visibleAt(cameraStore.zoom, true);
  st.visibleSig = sigOf(vis);
  const present = new Set<string>();
  const freeSlot = (names: string[]) => names.find(n => st.slots.get(n)!.phase === 'idle' || st.slots.get(n)!.phase === 'arming');
  for (const f of vis) {
    const key = String(f.id ?? f.properties?.id);
    present.add(key);
    const e = st.entries.get(key);
    if (!e) {
      const s = st.init && !f.properties?.nofade ? freeSlot(IN_SLOTS) : undefined;
      st.entries.set(key, { f, slot: s ?? '' });
      if (s) st.slots.get(s)!.phase = 'arming';
    } else {
      e.f = f;
      if (OUT_SLOTS.includes(e.slot)) e.slot = '';   // came back while fading out: shown again at once
    }
  }
  for (const [key, e] of st.entries) {
    if (present.has(key) || OUT_SLOTS.includes(e.slot)) continue;
    const s = st.init && !e.f.properties?.nofade ? freeSlot(OUT_SLOTS) : undefined;
    if (!s) { st.entries.delete(key); continue; }
    e.slot = s;
    st.slots.get(s)!.phase = 'arming';
  }
  st.init = true;

  // Start the fade of any slot that just received features.
  useEffect(() => {
    for (const [name, slot] of st.slots) {
      if (slot.phase !== 'arming') continue;
      slot.phase = 'running';
      const isIn = IN_SLOTS.includes(name), ms = isIn ? fadeInMs : fadeOutMs;
      afterFrames(slot, () => {
        slot.opacity = isIn ? 1 : 0; bump();
        later(slot, () => {
          // Done: joiners move to the main layers, leavers are dropped; then the empty slot resets to its rest opacity.
          for (const [key, e] of st.entries) if (e.slot === name) { if (isIn) e.slot = ''; else st.entries.delete(key); }
          bump();
          afterFrames(slot, () => {
            slot.phase = 'resetting'; slot.opacity = isIn ? 0 : 1; bump();
            later(slot, () => { slot.phase = 'idle'; slot.timers = []; }, ms + 20);
          });
        }, ms + 20);
      });
    }
  });
  useEffect(() => () => { for (const s of st.slots.values()) for (const t of s.timers) { clearTimeout(t); cancelAnimationFrame(t); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const drawn: F[] = [];
  for (const e of st.entries.values()) drawn.push(e.slot === (e.f.properties?.slot ?? '') ? e.f : { ...e.f, properties: { ...e.f.properties, slot: e.slot } });
  const sig = drawn.map(f => `${f.id ?? f.properties?.id}:${f.properties?.slot}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shape = useMemo(() => ({ type: 'FeatureCollection' as const, features: drawn }), [features, sig]);

  const children: React.ReactElement[] = [...layers('', 1, 0)];
  for (const name of [...IN_SLOTS, ...OUT_SLOTS]) {
    const slot = st.slots.get(name)!;
    children.push(...layers(name, slot.opacity, IN_SLOTS.includes(name) ? fadeInMs : fadeOutMs));
  }
  return (
    <MapboxGL.ShapeSource id={id} shape={shape} hitbox={hitbox} onPress={onPress}>
      {children}
    </MapboxGL.ShapeSource>
  );
});

export default FadingShapeSource;
