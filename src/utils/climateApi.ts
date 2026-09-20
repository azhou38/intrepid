import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWeatherData, getRainyDaysData, getCrowdData,
  getWeatherDataFromNormals, getRainDataFromNormals,
} from './travelData';
import type { ClimateNormals, MonthWeather, MonthRain, MonthCrowd } from './travelData';
import type { Destination } from '../types';

// Real monthly climate normals from Open-Meteo's historical archive (free, no API key).
//
// Replaces travelData's synthetic curves, which bucket latitude into four bands and so hand
// Porto, Lisbon, Rome, Edinburgh and Berlin byte-identical weather — Porto was showing −3°C
// January nights it has never recorded. The curves stay as the offline fallback.
//
// Open-Meteo exposes daily records rather than pre-computed normals, so this averages
// YEARS_SAMPLED whole years down to twelve monthly figures itself.

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const YEARS_SAMPLED = 5;
// era5_seamless blends in 9km ERA5-Land over land instead of ERA5's ~31km cells alone, which
// measurably tightens rainfall totals: checked against published annual figures it moved Porto
// 1.21x -> 1.08x, Rome 1.16x -> 1.01x, Barcelona 1.24x -> 0.90x.
const MODEL = 'era5_seamless';
// Bumped if the shape or derivation changes, so stale entries are ignored rather than
// reinterpreted under new assumptions.
const CACHE_PREFIX = 'climate_v1_';
// Rainfall is reported as a monthly TOTAL rather than a count of rainy days. Day counts were
// tried first and are not trustworthy from reanalysis: measured against published normals they
// ran +19% (London) to +99% (Bali), because ERA5 reports a grid-cell area average and models
// drizzle far too often — so any threshold catches days the gauge never recorded. No threshold
// fixed it either; at >=2.5mm Rome came right but Porto and London fell ~25% short. Totals are
// the quantity this source actually gets close on.

// Two layers on purpose: AsyncStorage survives restarts, the Map avoids re-reading (and
// re-parsing) it every time a sheet reopens within a session.
const memCache = new Map<string, ClimateNormals>();
// Dedupes concurrent callers — a destination sheet and its climate modal both ask at once.
const inflight = new Map<string, Promise<ClimateNormals | null>>();

// ~1km precision. Rounding means the cache actually hits: spots within a destination share
// its climate, and there's no meaning in a separate entry per metre.
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

function aggregate(daily: {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
}): ClimateNormals | null {
  const highs: number[][] = Array.from({ length: 12 }, () => []);
  const lows:  number[][] = Array.from({ length: 12 }, () => []);
  const rain:  number[]   = Array(12).fill(0);
  const years = new Set<string>();

  daily.time.forEach((iso, i) => {
    const m = Number(iso.slice(5, 7)) - 1;
    if (m < 0 || m > 11) return;
    years.add(iso.slice(0, 4));
    const hi = daily.temperature_2m_max[i];
    const lo = daily.temperature_2m_min[i];
    const pr = daily.precipitation_sum[i];
    if (hi != null) highs[m].push(hi);
    if (lo != null) lows[m].push(lo);
    rain[m] += pr ?? 0;
  });

  // A month with no readings at all means the response was partial — fall back rather than
  // publish a hole as 0°C.
  if (highs.some(h => h.length === 0) || lows.some(l => l.length === 0)) return null;

  const nYears = Math.max(1, years.size);
  const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
  return {
    tempC:    highs.map(mean),
    tempLowC: lows.map(mean),
    rainMm:   rain.map(total => total / nYears),
  };
}

async function fetchNormals(lat: number, lng: number): Promise<ClimateNormals | null> {
  // Ends at the last COMPLETE calendar year: the archive lags a few days behind real time,
  // and a partial year would skew whichever months it happens to cover.
  const lastFullYear = new Date().getFullYear() - 1;
  // Built by hand rather than with URLSearchParams: RN's polyfill for it is inconsistent
  // across engines, and every value here is already URL-safe (numbers and fixed keywords).
  const query = [
    `latitude=${lat}`,
    `longitude=${lng}`,
    `start_date=${lastFullYear - YEARS_SAMPLED + 1}-01-01`,
    `end_date=${lastFullYear}-12-31`,
    'daily=temperature_2m_max,temperature_2m_min,precipitation_sum',
    'timezone=UTC',
    `models=${MODEL}`,
  ].join('&');
  const res = await fetch(`${ARCHIVE_URL}?${query}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.daily?.time?.length ? aggregate(json.daily) : null;
}

/** Cached lookup. Resolves null on any failure — callers fall back to the synthetic curves. */
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
      const fresh = await fetchNormals(lat, lng);
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
  // Seeded from the memory cache so a revisit renders real data on the FIRST frame, with no
  // flash of synthetic values.
  const [normals, setNormals] = useState<ClimateNormals | null>(
    () => memCache.get(cacheKey(latitude, longitude)) ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    setNormals(memCache.get(cacheKey(latitude, longitude)) ?? null);
    getClimateNormals(latitude, longitude).then(n => { if (!cancelled && n) setNormals(n); });
    return () => { cancelled = true; };
  }, [latitude, longitude]);

  const weather = normals
    ? getWeatherDataFromNormals(normals)
    : getWeatherData(latitude, destination.category);
  const rain = normals
    ? getRainDataFromNormals(normals)
    : getRainyDaysData(latitude, destination.category);
  const crowds = getCrowdData(
    destination.continent, destination.category, latitude, destination.rank, weather,
  );

  return { weather, rain, crowds, isReal: normals != null };
}
