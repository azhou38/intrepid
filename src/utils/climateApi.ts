import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWeatherData, getRainyDaysData, getCrowdData, levelsToMonthCrowd,
  getWeatherDataFromNormals, getRainDataFromNormals,
} from './travelData';
import type { MonthWeather, MonthRain, MonthCrowd, CrowdMonthMeta } from './travelData';
import { fetchClimateNormals, type ClimateNormals } from './climateNormalsFetch';
import climateNormalsBundle from '../data/climateNormals.json';
import crowdNormalsBundle from '../data/crowdNormals.json';
import type { Destination } from '../types';

export type { ClimateNormals };

// Real monthly climate normals, resolved ahead of time by scripts/build-climate-normals.ts and
// bundled with the app — no network call, no cache miss.
//
// Replaces travelData's synthetic curves, which bucket latitude into four bands and so hand
// Porto, Lisbon, Rome, Edinburgh and Berlin byte-identical weather — Porto was showing −3°C
// January nights it has never recorded. The curves stay as the offline fallback.
//
// The bundle is sourced from real Meteostat ground stations (nearest usable station to each
// destination, see the build script), not reanalysis — a grid-cell model average can differ
// noticeably from what a traveler actually experiences, especially somewhere coastal or
// mountainous. The live path below still queries Open-Meteo's reanalysis archive; it only
// exists as a safety net for a destination added since the bundle was last generated, so it's
// never the source of truth for anything actually shown — re-run the build script instead of
// relying on it. Rainfall is reported as a monthly TOTAL rather than a count of rainy days:
// day-count thresholds were tried first, for the old reanalysis path, and were never trustworthy
// (they ran +19% to +99% high against published normals) — totals are what both sources agree on.

const BUNDLED_NORMALS: Record<string, ClimateNormals> =
  (climateNormalsBundle as { entries: Record<string, ClimateNormals> }).entries;

// Real (Tier 1/2) monthly crowd data, resolved ahead of time by scripts/build-crowd-normals.ts —
// see that script and utils/travelData.ts's crowd model for the full tiering. Missing entries
// (a destination added since the last build) fall through to travelData's live Tier 2/4 heuristic.
const BUNDLED_CROWDS: Record<string, { months: CrowdMonthMeta[] }> =
  (crowdNormalsBundle as { entries: Record<string, { months: CrowdMonthMeta[] }> }).entries;

/** The full internal record (score/confidence/tier/sources) behind a destination's crowd bars —
 *  not used by any UI yet, but exposed so a future surface (or debug view) can show data
 *  quality without re-deriving it. Null for a destination missing from the bundle. */
export function getCrowdMeta(destinationId: string): CrowdMonthMeta[] | null {
  return BUNDLED_CROWDS[destinationId]?.months ?? null;
}

// Live fallback samples fewer years than the build script (5 vs. 10): it runs on a user's
// device on demand, so it trades some accuracy for a faster first response.
const LIVE_YEARS_SAMPLED = 5;
// Bumped if the shape or derivation changes, so stale entries are ignored rather than
// reinterpreted under new assumptions.
const CACHE_PREFIX = 'climate_v1_';

// Two layers on purpose: AsyncStorage survives restarts, the Map avoids re-reading (and
// re-parsing) it every time a sheet reopens within a session.
const memCache = new Map<string, ClimateNormals>();
// Dedupes concurrent callers — a destination sheet and its climate modal both ask at once.
const inflight = new Map<string, Promise<ClimateNormals | null>>();

// ~1km precision. Rounding means the cache actually hits: spots within a destination share
// its climate, and there's no meaning in a separate entry per metre.
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

/** Cached live lookup, for a destination missing from the bundled manifest. Resolves null on
 *  any failure — callers fall back to the synthetic curves. */
export async function getClimateNormals(lat: number, lng: number): Promise<ClimateNormals | null> {
  const key = cacheKey(lat, lng);
  const hit = memCache.get(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (stored) {
        const parsed = JSON.parse(stored) as ClimateNormals;
        if (parsed?.tempC?.length === 12) { memCache.set(key, parsed); return parsed; }
      }
    } catch {}

    try {
      const fresh = await fetchClimateNormals(lat, lng, LIVE_YEARS_SAMPLED);
      if (fresh) {
        memCache.set(key, fresh);
        // Deliberately not awaited: a cache write failing must not delay or fail the lookup.
        AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(fresh)).catch(() => {});
        return fresh;
      }
    } catch {}

    return null;
  })().finally(() => { inflight.delete(key); });

  inflight.set(key, task);
  return task;
}

export interface DestinationClimate {
  weather: MonthWeather[];
  rain: MonthRain[];
  crowds: MonthCrowd[];
  /** False while loading or offline, i.e. the synthetic fallback is being shown. */
  isReal: boolean;
}

/**
 * All three month-by-month series for a destination, real where possible and synthetic
 * otherwise. Returns every series together so they can't disagree — crowd "best month" flags
 * are computed against whichever temperatures are actually on screen, which matters because
 * the two sources differ by as much as 10°C.
 */
export function useDestinationClimate(destination: Destination): DestinationClimate {
  const { latitude, longitude } = destination.coordinates;
  const bundled = BUNDLED_NORMALS[destination.id];
  // Seeded from the bundle (instant, no flash of synthetic values) or, failing that, the memory
  // cache so a revisit still renders real data on the FIRST frame.
  const [normals, setNormals] = useState<ClimateNormals | null>(
    () => bundled ?? memCache.get(cacheKey(latitude, longitude)) ?? null,
  );

  useEffect(() => {
    // Bundled destinations never hit the network — see the block comment above.
    if (bundled) { setNormals(bundled); return; }
    let cancelled = false;
    setNormals(memCache.get(cacheKey(latitude, longitude)) ?? null);
    getClimateNormals(latitude, longitude).then(n => { if (!cancelled && n) setNormals(n); });
    return () => { cancelled = true; };
  }, [destination.id, bundled, latitude, longitude]);

  const weather = normals
    ? getWeatherDataFromNormals(normals)
    : getWeatherData(latitude, destination.category);
  const rain = normals
    ? getRainDataFromNormals(normals)
    : getRainyDaysData(latitude, destination.category);
  const crowdBundle = BUNDLED_CROWDS[destination.id];
  const crowds = crowdBundle
    ? levelsToMonthCrowd(crowdBundle.months.map(m => m.level), weather)
    : getCrowdData(destination, weather);

  return { weather, rain, crowds, isReal: normals != null };
}
