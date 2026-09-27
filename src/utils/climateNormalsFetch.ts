// Pure fetch/aggregation logic for Open-Meteo's historical archive, shared by climateApi.ts
// (the live, per-destination runtime fallback) and scripts/build-climate-normals.ts (the
// build-time precompute). Deliberately has no React Native imports — this file needs to run
// under plain Node (via tsx) for the script, not just inside the app.

export interface ClimateNormals {
  tempC: number[];     // 12 monthly average daily highs, °C
  tempLowC: number[];  // 12 monthly average daily lows, °C
  rainMm: number[];    // 12 monthly average TOTAL precipitation, mm
}

// The lookback window scripts/build-climate-normals.ts samples from each station's history.
// Exported so the UI can state the real window instead of a hardcoded, driftable copy of it.
export const CLIMATE_WINDOW_YEARS = 15;

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
// era5_seamless blends in 9km ERA5-Land over land instead of ERA5's ~31km cells alone, which
// measurably tightens rainfall totals: checked against published annual figures it moved Porto
// 1.21x -> 1.08x, Rome 1.16x -> 1.01x, Barcelona 1.24x -> 0.90x.
const MODEL = 'era5_seamless';

function aggregate(daily: {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
}): ClimateNormals | null {
  const highs: number[][] = Array.from({ length: 12 }, () => []);
  const lows:  number[][] = Array.from({ length: 12 }, () => []);
  // Per-year monthly totals (not a running sum) so rainfall can be MEDIANED across years below —
  // a plain mean lets one freak month (a stalled storm, a typhoon) drag a "typical" figure well
  // above what a normal year actually looks like, since rainfall has no symmetric dry-side
  // outlier to balance it out.
  const rainByYear = new Map<string, number[]>();

  daily.time.forEach((iso, i) => {
    const m = Number(iso.slice(5, 7)) - 1;
    if (m < 0 || m > 11) return;
    const year = iso.slice(0, 4);
    const hi = daily.temperature_2m_max[i];
    const lo = daily.temperature_2m_min[i];
    const pr = daily.precipitation_sum[i];
    if (hi != null) highs[m].push(hi);
    if (lo != null) lows[m].push(lo);
    if (!rainByYear.has(year)) rainByYear.set(year, Array(12).fill(0));
    rainByYear.get(year)![m] += pr ?? 0;
  });

  // A month with no readings at all means the response was partial — fall back rather than
  // publish a hole as 0°C.
  if (highs.some(h => h.length === 0) || lows.some(l => l.length === 0)) return null;

  const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
  const median = (ns: number[]) => {
    const s = [...ns].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const rainYears = [...rainByYear.values()];
  return {
    tempC:    highs.map(mean),
    tempLowC: lows.map(mean),
    rainMm:   Array.from({ length: 12 }, (_, m) => median(rainYears.map(y => y[m]))),
  };
}

/** Fetches and aggregates `yearsSampled` whole years of daily records into 12 monthly figures.
 *  Resolves null on any failure or partial response — callers fall back to synthetic curves. */
export async function fetchClimateNormals(
  lat: number, lng: number, yearsSampled: number,
): Promise<ClimateNormals | null> {
  // Ends at the last COMPLETE calendar year: the archive lags a few days behind real time,
  // and a partial year would skew whichever months it happens to cover.
  const lastFullYear = new Date().getFullYear() - 1;
  // Built by hand rather than with URLSearchParams: RN's polyfill for it is inconsistent
  // across engines, and every value here is already URL-safe (numbers and fixed keywords).
  const query = [
    `latitude=${lat}`,
    `longitude=${lng}`,
    `start_date=${lastFullYear - yearsSampled + 1}-01-01`,
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
