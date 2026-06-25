export const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface MonthWeather {
  month: string;
  icon: string;
  tempC: number;
}

export interface MonthCrowd {
  month: string;
  level: number; // 1 (quiet) – 5 (packed)
  isBest: boolean;
}

// ── Deterministic hash ────────────────────────────────────────────────────────
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

export function getCommunityRating(destId: string): { rating: number; count: string } {
  const h = djb2(destId);
  const rating = 3.9 + (h % 11) / 10;        // 3.9 – 4.9
  const countK = 1.1 + (h % 49) / 10;        // 1.1K – 6.0K
  return { rating: Math.round(rating * 10) / 10, count: countK.toFixed(1) + 'K' };
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

export function getWeatherData(latitude: number, category: string): MonthWeather[] {
  const profile = climateProfile(latitude, category);
  let temps = T[profile];
  let rains = R[profile];
  if (latitude < -5) { temps = shiftHalf(temps); rains = shiftHalf(rains); }
  return MONTHS_SHORT.map((month, i) => ({
    month,
    icon: weatherEmoji(temps[i], rains[i]),
    tempC: Math.round(temps[i]),
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

export function getCrowdData(continent: string, category: string, latitude: number): MonthCrowd[] {
  const key    = crowdProfileKey(continent, latitude);
  let   levels = C[key] ?? C.yearround;
  if (latitude < -5) levels = shiftHalf(levels);

  const weather = getWeatherData(latitude, category);
  const minL    = Math.min(...levels);

  return MONTHS_SHORT.map((month, i) => {
    const goodTemp = weather[i].tempC >= 10 && weather[i].tempC <= 36;
    const isBest   = levels[i] <= minL + 1 && goodTemp;
    return { month, level: levels[i], isBest };
  });
}

export function crowdColor(level: number): string {
  return ['', '#10B981','#34D399','#FBBF24','#F97316','#EF4444'][level] ?? '#9CA3AF';
}

export function crowdLabel(level: number): string {
  return ['', 'Very Quiet','Quiet','Moderate','Busy','Peak Season'][level] ?? '';
}
