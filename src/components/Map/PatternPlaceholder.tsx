import React, { memo, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';

// What stands in for a spot's photo when it has none at all: a slate field with faint topographic contour lines, like the
// height lines of a map, so it reads as a place and not as a photo that failed to load. Used wherever the spot's photo
// would be: its carousel card, its map pin's bubble (see SpotPhotoImages), the full-screen
// hero and the bottom strip. The terrain is generated from the spot's id, so every spot differs and a spot always looks the
// same. (A repeated emoji over geometric tiles looked too playful.)
const TOP = '#475569';
const BOTTOM = '#273244';
const LINE = 'rgba(255,255,255,0.10)';
const LEVELS = 13;   // contour lines across the field's range of heights
const CELL = 7;      // points between the height samples the lines are traced on (5 made a card's path ~34,000 characters)
// Finer samples for a small field (a pin's bubble), so its few lines stay smooth.
const cellFor = (w: number, h: number) => Math.max(1, Math.min(CELL, Math.max(w, h) / 45));
// A field that fills its parent traces its lines this long after it is laid out, not in the render that lays it out: a card
// or a sheet's hero appears as a spot sheet slides up and the camera zooms to the spot, and three or four of them tracing at
// once (and their long paths reaching the screen) held the sheet and the camera back by a few hundred ms. The slate shows at
// once and the lines follow.
const TRACE_DELAY_MS = 450;
// Traced paths, by seed, size and levels: a spot's card or hero shown again draws its lines at once.
const traced = new Map<string, string>();
function tracedPath(seed: string, w: number, h: number, levels: number): string {
  const key = `${seed}|${Math.round(w)}|${Math.round(h)}|${levels}`;
  let d = traced.get(key);
  if (d === undefined) {
    d = contourPath(seed, w, h, levels);
    traced.set(key, d);
    if (traced.size > 80) traced.delete(traced.keys().next().value!);
  }
  return d;
}
const isTraced = (seed: string, w: number, h: number, levels: number) => traced.has(`${seed}|${Math.round(w)}|${Math.round(h)}|${levels}`);

// A small deterministic random sequence from the spot's id (mulberry32).
function rng(seed: string) {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One height field over the card (two hills, a hollow and some gentle waves), traced at LEVELS even heights by marching
// squares into a single path. Lines of one field never cross, as on a real contour map (rings drawn round separate summits
// overlapped into a mesh).
function contourPath(seed: string, w: number, h: number, levels: number): string {
  const CELL = cellFor(w, h);
  const r = rng(seed);
  const hills = [1, 1, -0.6].map(a => ({ x: w * (0.1 + 0.8 * r()), y: h * (0.05 + 0.7 * r()), s: (0.25 + 0.3 * r()) * Math.max(w, h), a }));
  const waves = [0, 1, 2].map(() => ({ kx: (r() * 2 - 1) * 0.03, ky: (r() * 2 - 1) * 0.03, p: r() * Math.PI * 2, a: 0.12 + 0.1 * r() }));
  const f = (x: number, y: number) =>
    hills.reduce((s, q) => s + q.a * Math.exp(-((x - q.x) ** 2 + (y - q.y) ** 2) / (2 * q.s * q.s)), 0)
    + waves.reduce((s, v) => s + v.a * Math.sin(v.kx * x + v.ky * y + v.p), 0);
  const nx = Math.ceil(w / CELL) + 1, ny = Math.ceil(h / CELL) + 1, g = new Float32Array(nx * ny);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = f(i * CELL, j * CELL);
    g[j * nx + i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  let d = '';
  for (let L = 1; L <= levels; L++) {
    const t = lo + ((hi - lo) * L) / (levels + 1);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i + 1], e = g[(j + 1) * nx + i];
      const x0 = i * CELL, y0 = j * CELL, pts: number[] = [];
      const cross = (va: number, vb: number, xa: number, ya: number, xb: number, yb: number) => {
        if ((va < t) === (vb < t)) return;
        const k = (t - va) / (vb - va);
        pts.push(xa + (xb - xa) * k, ya + (yb - ya) * k);
      };
      cross(a, b, x0, y0, x0 + CELL, y0);
      cross(b, c, x0 + CELL, y0, x0 + CELL, y0 + CELL);
      cross(e, c, x0, y0 + CELL, x0 + CELL, y0 + CELL);
      cross(a, e, x0, y0, x0, y0 + CELL);
      for (let k = 0; k + 3 < pts.length; k += 4) {
        d += `M${pts[k].toFixed(1)},${pts[k + 1].toFixed(1)}L${pts[k + 2].toFixed(1)},${pts[k + 3].toFixed(1)}`;
      }
    }
  }
  return d;
}

export const PatternPlaceholder = memo(function PatternPlaceholder({ seed, idPrefix, size, levels = LEVELS, lineOpacity }: {
  seed: string;
  // Unique per rendered instance: the looping carousel renders clones of a spot side by side, and SVG ids must not collide.
  idPrefix: string;
  // A fixed square (a pin's bubble, snapshotted into a map image: it must draw on its first frame, not after a layout pass);
  // otherwise it fills its parent.
  size?: number;
  levels?: number;
  lineOpacity?: number;
}) {
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const box = size ? { w: size, h: size } : measured;
  // A fixed size (a pin's bubble, small and snapshotted) traces at once; a field filling its parent waits (TRACE_DELAY_MS),
  // unless its lines are already traced.
  const [due, setDue] = useState(!!size);
  const ready = !!box && (due || isTraced(seed, box.w, box.h, levels));
  useEffect(() => {
    if (!box || ready) return;
    const t = setTimeout(() => setDue(true), TRACE_DELAY_MS);
    return () => clearTimeout(t);
  }, [box?.w, box?.h, ready]);
  const lines = useMemo(() => (box && ready ? tracedPath(seed, box.w, box.h, levels) : ''), [seed, box?.w, box?.h, levels, ready]);
  return (
    <View
      pointerEvents="none"
      style={[size ? { width: size, height: size } : StyleSheet.absoluteFill, { backgroundColor: TOP, overflow: 'hidden' }]}
      onLayout={size ? undefined : e => setMeasured({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`${idPrefix}-g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={TOP} />
            <Stop offset="1" stopColor={BOTTOM} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${idPrefix}-g)`} />
        {!!lines && <Path d={lines} fill="none" stroke={lineOpacity === undefined ? LINE : `rgba(255,255,255,${lineOpacity})`} strokeWidth={size ? 0.75 : 1} />}
      </Svg>
    </View>
  );
});

export default PatternPlaceholder;
