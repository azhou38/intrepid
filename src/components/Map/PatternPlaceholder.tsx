import React, { memo, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';

// What fills a spot card in the carousel when the spot has no photo at all: a slate field (the colour of a photo-less spot's
// pin, see SpotPhotoImages) with faint topographic contour lines, like the height lines of a map, so the card reads as a
// place and not as a photo that failed to load. The terrain is generated from the spot's id: every card differs, and a
// spot's card is always the same. (A repeated emoji over geometric tiles looked too playful.)
const TOP = '#475569';
const BOTTOM = '#273244';
const LINE = 'rgba(255,255,255,0.10)';
const LEVELS = 13;   // contour lines across the card's range of heights
const CELL = 5;      // points between the height samples the lines are traced on (a card costs a few ms to trace)

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
function contourPath(seed: string, w: number, h: number): string {
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
  for (let L = 1; L <= LEVELS; L++) {
    const t = lo + ((hi - lo) * L) / (LEVELS + 1);
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

export const PatternPlaceholder = memo(function PatternPlaceholder({ seed, idPrefix }: {
  seed: string;
  // Unique per rendered card: the looping carousel renders clones of a spot side by side, and SVG ids must not collide.
  idPrefix: string;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const lines = useMemo(() => (box ? contourPath(seed, box.w, box.h) : ''), [seed, box]);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: TOP, overflow: 'hidden' }]}
      onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`${idPrefix}-g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={TOP} />
            <Stop offset="1" stopColor={BOTTOM} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${idPrefix}-g)`} />
        {!!lines && <Path d={lines} fill="none" stroke={LINE} strokeWidth={1} />}
      </Svg>
    </View>
  );
});

export default PatternPlaceholder;
