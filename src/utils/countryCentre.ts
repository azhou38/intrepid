import WORLD_COUNTRIES from '../data/worldCountries.json';

// Where a country sits, for marking it on a map: the centre (area centroid) of its largest piece of land (France's
// mainland, not the box round it and its overseas departments), from the world outlines (worldCountries.json, in the
// Profile map's units: x = longitude + 180, y = MILLER_TOP - miller(latitude)).

// Every outline of a country joined into one path: some countries come as more than one entry (Australia's mainland, then
// the Ashmore and Coral Sea reefs), and keeping only the last had Australia's mark on a reef off its north-west coast.
const COUNTRY_D = new Map<string, string>();
for (const { c, d } of WORLD_COUNTRIES as { c: string; d: string }[]) COUNTRY_D.set(c, (COUNTRY_D.get(c) ?? '') + d);

const cache = new Map<string, { x: number; y: number } | null>();

// In the outlines' map units (x from 0 to 360; the caller wraps it to its own map's start).
export function countryCentreMapUnits(code: string): { x: number; y: number } | null {
  if (cache.has(code)) return cache.get(code)!;
  const d = COUNTRY_D.get(code);
  let best: { area: number; cx: number; cy: number } | null = null;
  for (const part of d ? d.split('M').filter(Boolean) : []) {
    const n = part.replace(/Z/g, ' ').trim().split(/[\s,]+/).map(Number);
    if (n.length < 2) continue;
    let a2 = 0, sx = 0, sy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < n.length; i += 2) {
      const x = n[i], y = n[i + 1], nx = n[(i + 2) % n.length], ny = n[(i + 3) % n.length];
      const cross = x * ny - nx * y;
      a2 += cross; sx += (x + nx) * cross; sy += (y + ny) * cross;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const area = Math.abs(a2) / 2;
    // A sliver with next to no area (a dot-sized island) has no usable centroid: its box's middle instead.
    const flat = area < 1e-6;
    const cx = flat ? (x0 + x1) / 2 : sx / (3 * a2), cy = flat ? (y0 + y1) / 2 : sy / (3 * a2);
    if (!best || area > best.area) best = { area, cx, cy };
  }
  const out = best ? { x: best.cx, y: best.cy } : null;
  cache.set(code, out);
  return out;
}

// The same place as longitude and latitude, undoing the outlines' Miller projection.
const MILLER_TOP = (1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * (84 * Math.PI) / 180)) * 180) / Math.PI;
export function countryCentreLngLat(code: string): [number, number] | null {
  const p = countryCentreMapUnits(code);
  if (!p) return null;
  const m = ((MILLER_TOP - p.y) * Math.PI) / 180 / 1.25;
  const lat = ((Math.atan(Math.exp(m)) - Math.PI / 4) / 0.4) * (180 / Math.PI);
  const lng = p.x - 180;
  return [lng > 180 ? lng - 360 : lng, lat];
}
