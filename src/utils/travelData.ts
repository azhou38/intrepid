import type { Destination, SeasonalSignal, SeasonalTagKind } from '../types';

export const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface MonthWeather {
  month: string;
  icon: string;
  tempC: number;
  tempLowC: number;
}

export interface MonthRain {
  month: string;
  mm: number; // average TOTAL precipitation for the month, in mm
}

export interface MonthCrowd {
  month: string;
  level: number; // 1 (quiet) – 5 (packed)
  isBest: boolean;
}

// Richer per-month record the crowd bundle stores internally (see scripts/build-crowd-normals.ts)
// — not consumed by any UI today, but kept alongside the score/level so a future surface can
// distinguish "real tourism data" from "a geographic guess" without re-deriving it.
export interface CrowdMonthMeta {
  score: number;             // 0–100, relative to this destination's own months
  level: number;             // same 1–5 scale as MonthCrowd.level
  confidence: 'high' | 'medium' | 'low';
  tier: 1 | 2 | 4;            // 1 = real tourism data, 2 = seasonal signals, 4 = geographic fallback
  sources: string[];
}

export interface MonthDaylight {
  month: string;
  hours: number; // average hours of daylight (sunrise to sunset) for that month
}

// ── Daylight hours ─────────────────────────────────────────────────────────
//
// Deliberately NOT sourced from a weather API: day length is pure astronomy — a fixed function
// of latitude and calendar date, unrelated to weather or climate — so computing it exactly here
// is strictly more accurate than fetching it (no API rounds this any better), and needs no
// network call, no bundle, no build step. The formula is the standard one used by NOAA's own
// solar calculator: a Cooper's-equation approximation of solar declination, then the sunrise
// hour-angle from latitude and declination.
const DAY_OF_YEAR_MID_MONTH = [17, 47, 75, 105, 135, 162, 198, 228, 259, 289, 319, 345];

function daylightHoursForDay(latitude: number, dayOfYear: number): number {
  const rad = Math.PI / 180;
  // Solar declination, degrees (Cooper's approximation).
  const declDeg = 23.44 * Math.sin(rad * (360 / 365) * (dayOfYear - 81));
  const latRad = latitude * rad;
  const declRad = declDeg * rad;
  // Clamp for polar day/night, where the sun never sets or never rises and the raw cosine
  // would fall outside [-1, 1] (no valid sunrise hour-angle to solve for).
  const cosHourAngle = Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(declRad)));
  const hourAngleDeg = Math.acos(cosHourAngle) / rad;
  return (2 * hourAngleDeg) / 15; // 15° of hour-angle per hour of daylight
}

/** 12 monthly average daylight hours (sunrise to sunset) for a latitude — exact, not estimated,
 *  and the same for every destination at that latitude regardless of local weather. */
export function getDaylightHours(latitude: number): MonthDaylight[] {
  return MONTHS_SHORT.map((month, i) => ({
    month,
    hours: Math.round(daylightHoursForDay(latitude, DAY_OF_YEAR_MID_MONTH[i]) * 10) / 10,
  }));
}

// ── Temperature profiles — Northern hemisphere baseline (°C, Jan→Dec) ─────────
const T: Record<string, number[]> = {
  tropical:    [29,29,30,31,31,30,29,29,29,29,29,29],
  subtropical: [14,15,18,22,26,30,33,33,30,25,19,15],
  desert:      [16,18,23,29,35,40,42,41,37,29,22,17],
  temperate:   [4,  5, 9,14,18,22,25,24,19,13, 8, 5],
  cold:        [-5,-4, 1, 7,13,18,21,20,14, 7, 1,-4],
  mountain:    [-3,-2, 2, 7,12,16,19,18,13, 7, 1,-3],
};

// ── Rain probability (0–1) — N hemisphere ────────────────────────────────────
const R: Record<string, number[]> = {
  tropical:    [0.35,0.30,0.40,0.55,0.70,0.80,0.80,0.80,0.70,0.60,0.45,0.35],
  subtropical: [0.55,0.45,0.30,0.15,0.08,0.04,0.03,0.08,0.12,0.22,0.40,0.52],
  desert:      [0.05,0.05,0.04,0.04,0.03,0.02,0.02,0.02,0.03,0.04,0.05,0.05],
  temperate:   [0.45,0.35,0.35,0.30,0.30,0.20,0.15,0.15,0.25,0.35,0.40,0.45],
  cold:        [0.40,0.35,0.30,0.30,0.30,0.25,0.20,0.20,0.25,0.35,0.40,0.45],
  mountain:    [0.38,0.32,0.30,0.28,0.28,0.22,0.18,0.18,0.22,0.28,0.36,0.40],
};

function shiftHalf<T>(arr: T[]): T[] {
  return [...arr.slice(6), ...arr.slice(0, 6)];
}

function weatherEmoji(temp: number, rain: number): string {
  if (temp <= -2)  return '❄️';
  if (temp < 4)    return rain > 0.30 ? '🌨️' : '🌥️';
  if (rain > 0.65) return '⛈️';
  if (rain > 0.42) return '🌧️';
  if (rain > 0.27) return '🌦️';
  if (temp > 30)   return '☀️';
  if (temp > 22)   return '🌤️';
  if (temp > 12)   return '⛅';
  return '🌥️';
}

function climateProfile(latitude: number, category: string): string {
  if (category === 'desert')   return 'desert';
  if (category === 'mountain') return 'mountain';
  const a = Math.abs(latitude);
  if (a < 15) return 'tropical';
  if (a < 38) return 'subtropical';
  if (a < 60) return 'temperate';
  return 'cold';
}

// Approximate average diurnal (day/night) temperature swing per climate profile, purely for
// deriving an illustrative "low" temperature alongside the existing single average reading.
const DIURNAL_SPREAD: Record<string, number> = {
  tropical: 5, subtropical: 9, desert: 14, temperate: 7, cold: 6, mountain: 9,
};

export function getWeatherData(latitude: number, category: string): MonthWeather[] {
  const profile = climateProfile(latitude, category);
  let temps = T[profile];
  let rains = R[profile];
  if (latitude < -5) { temps = shiftHalf(temps); rains = shiftHalf(rains); }
  const spread = DIURNAL_SPREAD[profile] ?? 7;
  return MONTHS_SHORT.map((month, i) => ({
    month,
    icon: weatherEmoji(temps[i], rains[i]),
    tempC: Math.round(temps[i]),
    tempLowC: Math.round(temps[i] - spread),
  }));
}

// ── Crowd model — tiered, destination-relative seasonality ───────────────────
//
// Tier 1 (real country-level tourism data, e.g. Eurostat nights-spent statistics) only runs at
// BUILD time — see scripts/build-crowd-normals.ts, which bakes it into src/data/crowdNormals.json.
// Everything below is Tier 2 (destination-specific seasonal signals) and Tier 4 (geographic/
// hemisphere fallback), used live only for a destination the bundle doesn't cover yet — re-run
// the build script instead of relying on this for anything meant to ship. Tier 3 (search/travel
// demand) is deliberately not implemented: every free option depends on an unofficial, fragile
// scraper rather than a real API, which is exactly the kind of dependency to avoid here.

// Tier 4 — geographic/hemisphere shape when nothing more specific is known. Purely a RELATIVE
// low-season-vs-high-season shape, not an absolute crowd count.
const GEO_BASE_CURVES: Record<string, number[]> = {
  summer:    [2,2,3,3,3,4,5,5,4,3,2,2],
  winter:    [5,4,3,2,2,1,1,1,2,2,4,5],
  shoulder:  [2,2,4,4,3,3,3,3,4,4,2,2],
  yearround: [3,3,3,4,4,3,4,4,4,3,3,3],
};

function geoBaseCurveKey(continent: string, latitude: number): keyof typeof GEO_BASE_CURVES {
  if (continent === 'Europe' || continent === 'North America') return 'summer';
  if (continent === 'South America') return 'shoulder';
  if (continent === 'Oceania')       return 'summer'; // shifted below for S hemisphere
  if (continent === 'Africa')        return latitude > 10 ? 'winter' : 'yearround';
  if (continent === 'Asia')          return latitude < 35 ? 'winter' : 'summer';
  return 'yearround';
}

/** Tier 4: a plain 12-value relative-demand curve from continent/hemisphere/latitude alone. */
export function geographicCrowdCurve(continent: string, latitude: number): number[] {
  const curve = GEO_BASE_CURVES[geoBaseCurveKey(continent, latitude)];
  return latitude < -5 ? shiftHalf(curve) : curve;
}

// Tier 2 — destination-specific seasonal signals (SeasonalTagKind, in types/index.ts). Each tag
// is one generic monthly weight curve, shared by every destination that carries it — a
// destination only says WHICH signals apply (and, for event-like tags, WHEN); it never supplies
// its own curve, which is what keeps this reusable instead of a per-destination lookup table.
// Hemisphere-relative tags (ski/beach/blossom/foliage/lights) default to Northern Hemisphere
// timing and flip automatically south of the equator; explicit-month tags (a specific festival,
// a migration, a pilgrimage) don't, since their timing is already a real calendar fact rather
// than a hemisphere inference.
const HEMISPHERE_RELATIVE: Partial<Record<SeasonalTagKind, number[]>> = {
  ski:               [12, 1, 2, 3],
  'cherry-blossom':  [3, 4],
  'autumn-foliage':  [10, 11],
  'beach-peak':      [6, 7, 8],
  'northern-lights': [10, 11, 12, 1, 2, 3],
};

// How much force each tag carries at full (strength: 1) — not every signal is the same size of
// crowd event. A religious pilgrimage (e.g. Hajj, which brings millions to a single city in one
// week) or a named festival is a near-deterministic, concentrated spike and should be able to
// override a merely-coincidental geographic guess; a diffuse regional pattern like aurora tourism
// or a general ski season is real but proportionally smaller and shouldn't overpower everything
// else on its own.
const TAG_WEIGHT: Record<SeasonalTagKind, number> = {
  'religious-pilgrimage': 6,
  'major-festival': 4,
  'wildlife-migration': 4,
  'monsoon-dry-season': 3.5,
  ski: 3,
  'cherry-blossom': 3,
  'beach-peak': 3,
  'autumn-foliage': 2.5,
  'northern-lights': 2.5,
};

// A signal's peak months get full weight; the calendar months immediately either side get a
// partial "shoulder" weight, so the resulting curve is a bump rather than a knife-edge step.
function monthWeights(months: number[]): number[] {
  const w = Array(12).fill(0);
  for (const m of months) {
    const i = ((m - 1) % 12 + 12) % 12;
    w[i] = 1;
    w[(i + 11) % 12] = Math.max(w[(i + 11) % 12], 0.4);
    w[(i + 1) % 12]  = Math.max(w[(i + 1) % 12], 0.4);
  }
  return w;
}

const flipToSouthernHemisphere = (months: number[]) => months.map(m => ((m - 1 + 6) % 12) + 1);

// Rescales any raw curve to a mean of `targetMean` — needed before adding a Tier 2 boost onto a
// Tier 1 curve, since real tourism figures (tens of millions of nights) and the small synthetic
// Tier 4 curves (roughly 1–5) live on completely different scales. Without this, SEASONAL_BOOST_
// SCALE's units are negligible against real numbers and a tagged signal (e.g. Munich's
// Oktoberfest) has no visible effect once real data is available — exactly the bug this fixes.
export function normalizeToMean(raw: number[], targetMean = 3): number[] {
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  if (mean === 0) return raw.map(() => targetMean);
  return raw.map(v => (v / mean) * targetMean);
}

/** Tier 2: combines a destination's seasonal signals into one relative weight curve, or null if
 *  it has none (or none resolve to any months, e.g. an event-like tag given with no `months`). */
export function seasonalSignalCurve(signals: SeasonalSignal[] | undefined, latitude: number): number[] | null {
  if (!signals?.length) return null;
  let curve = Array(12).fill(0);
  let any = false;
  for (const { tag, months: explicitMonths, strength = 1 } of signals) {
    let months = explicitMonths ?? HEMISPHERE_RELATIVE[tag];
    if (!months) continue;
    if (!explicitMonths && latitude < -5) months = flipToSouthernHemisphere(months);
    const w = monthWeights(months);
    const weight = TAG_WEIGHT[tag] * strength;
    curve = curve.map((v, i) => v + w[i] * weight);
    any = true;
  }
  return any ? curve : null;
}

// ── Turning a raw relative-demand curve into 0–100 scores ────────────────────
//
// Scores are relative to the destination's OWN months, not a universal scale — a place that's
// merely a little busier in summer should get a small spread around the middle, not be stretched
// to fill the full 0–100 range just because it has a highest and lowest month. `spread` measures
// how much the raw curve actually varies (its coefficient of variation) and dampens the z-score
// mapping when that variation is small, so a nearly flat curve stays clustered near 50 instead of
// manufacturing a Low-to-Very-High swing the underlying data doesn't support.
export function relativeCrowdScores(raw: number[]): number[] {
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  if (mean === 0) return raw.map(() => 50);
  const variance = raw.reduce((a, v) => a + (v - mean) ** 2, 0) / raw.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;
  // A coefficient of variation of ~0.25 (a clearly seasonal destination) maps to the full
  // spread; below that the spread shrinks proportionally, with a floor so two genuinely
  // different months never render as perfectly identical.
  const spread = Math.max(0.15, Math.min(1, cv / 0.25));
  return raw.map(v => {
    const z = std === 0 ? 0 : (v - mean) / std;
    return Math.max(0, Math.min(100, 50 + z * spread * 25));
  });
}

/** 0–24 Low · 25–49 Moderate · 50–74 High · 75–100 Very high, mapped onto the existing 1–5
 *  `MonthCrowd.level` scale so every current consumer (the crowd chart and its Low/Moderate/
 *  High/Very High legend, the "best months" grid) keeps working unmodified — crowdLabel/
 *  crowdColor already treat 1/3/4/5 as those four buckets, so level 2 is deliberately unused. */
export function scoreToCrowdLevel(score: number): number {
  if (score < 25) return 1;
  if (score < 50) return 3;
  if (score < 75) return 4;
  return 5;
}

// A "best time to visit" that covers 6+ months isn't a recommendation any more, and one that
// covers fewer than 2 reads as a single lucky month rather than an actual window — keep it
// between these two bounds regardless of how many months genuinely qualify.
const MIN_BEST_MONTHS = 2;
const MAX_BEST_MONTHS = 5;

/** Turns final per-month levels (from either the precomputed bundle or the live fallback below)
 *  into the MonthCrowd[] shape every consumer expects, including the "best month" flag.
 *
 *  `consensusMonths` (1–12, from Destination.bestMonths) takes over entirely when given: "best
 *  time to visit" is meant to reflect actual travel-guide consensus, not this app's own crowd/
 *  temperature model, so a destination with curated months uses exactly those rather than
 *  anything derived below. The quietest-month computation remains only as the fallback for a
 *  destination with no curated months yet. */
export function levelsToMonthCrowd(
  levels: number[], weather: MonthWeather[], consensusMonths?: number[],
): MonthCrowd[] {
  if (consensusMonths?.length) {
    const bestSet = new Set(consensusMonths.map(m => m - 1));
    return MONTHS_SHORT.map((month, i) => ({ month, level: levels[i], isBest: bestSet.has(i) }));
  }

  const minLevel = Math.min(...levels);
  const qualifies = (level: number, tempC: number) =>
    level <= minLevel + 1 && tempC >= 10 && tempC <= 36;

  // Every month, ranked quietest-first (then closest to a mild ~20°C as the tiebreaker) —
  // the top MIN_BEST_MONTHS are always included even if none of them individually clears the
  // "quiet enough and comfortable" bar, so a destination with a harsh climate still gets a real
  // (if modest) recommendation instead of none at all.
  const ranked = levels
    .map((level, i) => ({ i, level, tempC: weather[i].tempC }))
    .sort((a, b) => a.level - b.level || Math.abs(a.tempC - 20) - Math.abs(b.tempC - 20));

  const bestSet = new Set<number>();
  for (const c of ranked) {
    if (bestSet.size >= MAX_BEST_MONTHS) break;
    if (bestSet.size < MIN_BEST_MONTHS || qualifies(c.level, c.tempC)) bestSet.add(c.i);
  }

  return MONTHS_SHORT.map((month, i) => ({ month, level: levels[i], isBest: bestSet.has(i) }));
}

/** Live Tier 2/4 fallback for any destination the precomputed bundle (crowdNormals.json, built
 *  by scripts/build-crowd-normals.ts from real country-level tourism data) doesn't cover yet —
 *  e.g. one added since the last build. `weatherOverride` lets callers pass REAL observed
 *  temperatures (see climateApi) so the "best month" flag agrees with the temperatures actually
 *  shown to the user, rather than the synthetic curves, which can disagree by 10°C. */
export function getCrowdData(destination: Destination, weatherOverride?: MonthWeather[]): MonthCrowd[] {
  const { latitude } = destination.coordinates;
  const base = geographicCrowdCurve(destination.continent, latitude);
  const tier2 = seasonalSignalCurve(destination.seasonalTags, latitude);
  // Seasonal signals ADD emphasis on top of the geographic shape rather than replacing it (each
  // tag's own TAG_WEIGHT already sets how hard it pushes) — a destination with no tags keeps the
  // plain Tier 4 curve untouched, and one with a real but secondary pattern (a niche winter
  // aurora season on top of a summer-dominant place) gets a real bump without its true peak
  // being overwritten.
  const raw = tier2 ? base.map((v, i) => v + tier2[i]) : base;
  const levels = relativeCrowdScores(raw).map(scoreToCrowdLevel);
  const weather = weatherOverride ?? getWeatherData(latitude, destination.category);
  return levelsToMonthCrowd(levels, weather, destination.bestMonths);
}

// Typical millimetres per wet day, by climate. Only used to turn the synthetic rain
// PROBABILITY curves into a millimetre figure for the offline fallback — a tropical downpour
// delivers several times what temperate drizzle does, so a single constant would make wet
// climates look far too dry.
const MM_PER_WET_DAY: Record<string, number> = {
  tropical: 13, subtropical: 8, desert: 5, temperate: 6, cold: 5, mountain: 7,
};

/** Rough average monthly rainfall for the offline fallback: rain probability × ~30 days ×
 *  typical wet-day intensity. Real observed totals come from climateApi instead; this only
 *  fills in while loading or offline. */
export function getRainyDaysData(latitude: number, category: string): MonthRain[] {
  const profile = climateProfile(latitude, category);
  let rains = R[profile];
  if (latitude < -5) rains = shiftHalf(rains);
  const intensity = MM_PER_WET_DAY[profile] ?? 6;
  return MONTHS_SHORT.map((month, i) => ({
    month,
    mm: Math.round(rains[i] * 30 * intensity),
  }));
}

// Groups month indices (0=Jan…11=Dec) into consecutive runs, folding a Dec→Jan wrap into a
// single run — shared by every "best months" label so they can never disagree on groupings.
export function groupMonthRuns(idx: number[]): number[][] {
  const runs: number[][] = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else runs.push([i]);
  }
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].slice(-1)[0] === 11) {
    runs[0] = [...runs.pop()!, ...runs[0]];
  }
  return runs;
}

// Compact "Jun-Jul" / "Oct-Jan, Jul" label for space-tight surfaces like the Explore cards —
// same month groupings as the When To Visit sentence, joined with commas instead of "and".
export function formatBestMonthsShort(idx: number[]): string {
  if (idx.length === 0) return '';
  if (idx.length === 12) return 'Year-round';
  const label = (r: number[]) => r.length === 1
    ? MONTHS_SHORT[r[0]]
    : `${MONTHS_SHORT[r[0]]}-${MONTHS_SHORT[r[r.length - 1]]}`;
  return groupMonthRuns(idx).map(label).join(', ');
}

export function crowdColor(level: number): string {
  return ['', '#10B981','#34D399','#FBBF24','#F97316','#EF4444'][level] ?? '#9CA3AF';
}

export function crowdLabel(level: number): string {
  return ['', 'Very Quiet','Quiet','Moderate','Busy','Peak Season'][level] ?? '';
}

// ── Real observed normals ────────────────────────────────────────────────────
// Monthly averages derived from actual recorded weather (see climateApi.ts), used in place
// of the synthetic curves above whenever they're available. The curves remain the offline
// fallback: they're keyed off a 4-band latitude bucket, so every destination between 38° and
// 60° — Porto, Lisbon, Rome, Edinburgh, Berlin — otherwise shares one identical climate.

export interface ClimateNormals {
  tempC: number[];     // 12 monthly average daily highs, °C
  tempLowC: number[];  // 12 monthly average daily lows, °C
  rainMm: number[];    // 12 monthly average TOTAL precipitation, mm
}

export function getWeatherDataFromNormals(n: ClimateNormals): MonthWeather[] {
  return MONTHS_SHORT.map((month, i) => ({
    month,
    // weatherEmoji wants a 0–1 rain probability. Derived from the monthly total against a
    // nominally "very wet" 200mm, which is about where a month reads as persistently rainy.
    icon: weatherEmoji(n.tempC[i], Math.min(1, n.rainMm[i] / 200)),
    tempC: Math.round(n.tempC[i]),
    tempLowC: Math.round(n.tempLowC[i]),
  }));
}

export function getRainDataFromNormals(n: ClimateNormals): MonthRain[] {
  return MONTHS_SHORT.map((month, i) => ({ month, mm: Math.round(n.rainMm[i]) }));
}
