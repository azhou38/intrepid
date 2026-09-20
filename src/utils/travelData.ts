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

// ── Crowd profiles (1=quiet … 5=packed) — N hemisphere ───────────────────────
const C: Record<string, number[]> = {
  summer:    [2,2,3,3,3,4,5,5,4,3,2,2],
  winter:    [5,4,3,2,2,1,1,1,2,2,4,5],
  shoulder:  [2,2,4,4,3,3,3,3,4,4,2,2],
  yearround: [3,3,3,4,4,3,4,4,4,3,3,3],
};

function crowdProfileKey(continent: string, latitude: number): string {
  if (continent === 'Europe' || continent === 'North America') return 'summer';
  if (continent === 'South America') return 'shoulder';
  if (continent === 'Oceania')       return 'summer'; // shifted for S hemisphere
  if (continent === 'Africa')        return latitude > 10 ? 'winter' : 'yearround';
  if (continent === 'Asia')          return latitude < 35 ? 'winter' : 'summer';
  return 'yearround';
}

// Dampens the seasonal profile toward a destination's actual overall popularity (rank 1 =
// most iconic/crowded, 5 = least) so crowd levels are absolute rather than purely relative
// shape — a quiet, low-rank destination shows low bars year-round instead of the same
// 1–5 seasonal swing every other place in its region gets.
const RANK_CROWD_SCALE: Record<number, number> = { 1: 1, 2: 0.82, 3: 0.66, 4: 0.52, 5: 0.4 };

/** `weatherOverride` lets callers pass REAL observed temperatures (see climateApi) so the
 *  "best month" flags agree with the temperatures actually shown to the user. Without it this
 *  falls back to the synthetic curves, which can disagree by 10°C — enough to flag a month as
 *  pleasant that the chart right beside it shows as freezing. */
export function getCrowdData(
  continent: string, category: string, latitude: number, rank: number = 3,
  weatherOverride?: MonthWeather[],
): MonthCrowd[] {
  const key    = crowdProfileKey(continent, latitude);
  let   levels = C[key] ?? C.yearround;
  if (latitude < -5) levels = shiftHalf(levels);

  const scale  = RANK_CROWD_SCALE[rank] ?? RANK_CROWD_SCALE[3];
  const scaled = levels.map(l => Math.max(1, Math.min(5, Math.round(l * scale))));

  const weather = weatherOverride ?? getWeatherData(latitude, category);
  const minL    = Math.min(...scaled);

  return MONTHS_SHORT.map((month, i) => {
    const goodTemp = weather[i].tempC >= 10 && weather[i].tempC <= 36;
    const isBest   = scaled[i] <= minL + 1 && goodTemp;
    return { month, level: scaled[i], isBest };
  });
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
