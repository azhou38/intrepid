import type { Destination } from '../types';

export type Coords = { latitude: number; longitude: number };

export function distanceKm(a: Coords, b: Coords) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Which destinations "Near You" shows. Built to stay meaningful however dense the catalogue gets
// (e.g. every destination a country guidebook covers), where any fixed radius holds far too many
// places in some regions and none in others:
//   • Radius widens until the area has enough to show: NEAR_YOU_RADII_KM in turn, stopping at the
//     first with at least NEAR_YOU_TARGET notable destinations (rank ≤ NEAR_YOU_NOTABLE_RANK) — only
//     notable ones count, or a cluster of minor towns next door would stop it widening before it
//     reached any highlight. If even the widest radius has fewer than NEAR_YOU_MIN destinations in
//     all, the row is hidden (a row of one place says nothing).
//   • Within that radius, importance and closeness are weighed together — a famous place 250 km
//     away beats a minor one 40 km away — rather than pure distance, which in a dense area would
//     fill the row with the nearest small towns. Distance breaks ties.
//   • The destination the user is in (within NEAR_YOU_HERE_KM) is left out: it isn't "near" them.
const NEAR_YOU_RADII_KM = [150, 300, 600];
const NEAR_YOU_TARGET = 6;
const NEAR_YOU_NOTABLE_RANK = 3;
const NEAR_YOU_MIN = 2;
const NEAR_YOU_MAX = 10;
const NEAR_YOU_HERE_KM = 20;
// Importance by rank tier (see Destination.rank): 1 world-famous … 5 local.
const RANK_WEIGHT: Record<number, number> = { 1: 1, 2: 0.75, 3: 0.55, 4: 0.4, 5: 0.3 };

export function nearYouDestinations(user: Coords, all: Destination[]): Destination[] {
  const candidates = all
    .map(d => ({ d, km: distanceKm(user, d.coordinates) }))
    .filter(x => x.km > NEAR_YOU_HERE_KM);
  let radius = NEAR_YOU_RADII_KM[NEAR_YOU_RADII_KM.length - 1];
  for (const r of NEAR_YOU_RADII_KM) {
    const notable = candidates.filter(x => x.km <= r && x.d.rank <= NEAR_YOU_NOTABLE_RANK).length;
    if (notable >= NEAR_YOU_TARGET) { radius = r; break; }
  }
  const inRadius = candidates.filter(x => x.km <= radius);
  if (inRadius.length < NEAR_YOU_MIN) return [];
  // Closeness counts for half the score at most: a place at the radius's edge keeps half its
  // importance, one right next door keeps all of it.
  const score = (x: { d: Destination; km: number }) =>
    (RANK_WEIGHT[x.d.rank] ?? 0.25) * (1 - 0.5 * (x.km / radius));
  return inRadius
    .sort((a, b) => score(b) - score(a) || a.km - b.km)
    .slice(0, NEAR_YOU_MAX)
    .map(x => x.d);
}

