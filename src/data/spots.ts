import type { Continent, Destination, SpotCategory } from '../types';
import { DESTINATIONS } from './destinations';

export interface Spot {
  id: string;
  // The destination this spot belongs to — OMITTED for a STANDALONE spot: one with no appropriate destination to
  // sit under, or too few neighbouring spots to make one (see DESTINATIONS.md). A standalone spot instead carries
  // the place context a destination would have supplied (country, countryCode, continent, timezone), all required
  // when destinationId is absent. Read these through spotCountryCode / spotCountry / spotTimezone / spotDestination,
  // never through destinationId directly.
  destinationId?: string;
  country?: string;
  countryCode?: string;
  continent?: Continent;
  timezone?: string;       // IANA, e.g. "Pacific/Auckland" — opening hours are read in it
  name: string;
  icon: string;
  coordinates: { latitude: number; longitude: number };
  category: SpotCategory;
  bio: string;
  hours: string;       // e.g. "9:00 AM – 6:00 PM" or "Open 24 hours" — the regular daily hours,
                        // unless overridden by `closedDays` below.
  // Approximate time to visit, always a range (not a single estimate — visit length varies
  // too much person to person for one number to read as anything but false precision).
  visitHoursMin: number;
  visitHoursMax: number;
  // Which weekdays this spot is fully closed on (0 = Sunday … 6 = Saturday). Every other day
  // uses `hours` above. Omitted entirely for spots open every day.
  closedDays?: number[];
  // Entry cost in the spot's own local currency (approximate — sourced from general
  // knowledge, not a live pricing feed, so treat as a starting point rather than gospel;
  // venues change prices often). `free: true` takes priority and always renders as "Free".
  // Otherwise costMin/costMax render as a single value when equal, or a range when they
  // differ, formatted per `currency` (ISO 4217 code; omitted = USD).
  free?: boolean;
  costMin?: number;
  costMax?: number;
  currency?: string;
  // The spot's official site, when one genuinely exists (a single canonical operator/steward —
  // not a general city/tourism-board page) — whether or not the spot charges admission. Omitted
  // for spots with no single official site: open public squares/districts/streets with no one
  // steward, and attractions booked through many different third-party operators with no
  // canonical site of their own (e.g. scenic flights).
  ticketUrl?: string;
  // Fixed-date (month/day, recurs every year) closures for a well-documented public holiday or
  // special occasion — e.g. the Louvre's Jan 1/May 1/Dec 25 closures. Deliberately NOT a
  // general holiday calendar: only populated where a specific closure is confidently known for
  // that venue, not derived from the destination's country. Most spots have none.
  specialClosures?: { month: number; day: number; reason: string }[];
}

// Sunday-first, matching Date#getDay() (0 = Sunday … 6 = Saturday).
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function hoursForDay(spot: Spot, dayIndex: number): string {
  if (spot.closedDays?.includes(dayIndex)) return 'Closed';
  return spot.hours;
}

/** A special closure active on this exact calendar date, or null. */
export function specialClosureOn(spot: Spot, date: Date): string | null {
  const hit = spot.specialClosures?.find(c => c.month === date.getMonth() + 1 && c.day === date.getDate());
  return hit?.reason ?? null;
}

// ── Live open/closed status ───────────────────────────────────────────────────
//
// `hours` is a free-text field ("9:00 AM – 6:00 PM", "Open 24 hours", "Daytime tours", …), not
// a structured time range, so this only computes a live status for the common "H:MM AM/PM –
// H:MM AM/PM" pattern (optionally followed by a parenthetical like "(summer)", which is
// stripped) and the always-open phrasings — anything else (e.g. "Daytime tours") falls back to
// 'unknown' rather than guessing. Times are compared against the SPOT'S destination timezone
// (via Destination.timezone, looked up below), not the device's — so a traveler checking a
// Tokyo spot from a phone set to New York time still sees Tokyo's actual open/closed state.
const SOON_WINDOW_MIN = 60;

const DESTINATION_BY_ID = new Map(DESTINATIONS.map(d => [d.id, d]));

// ── A spot's parent, country and timezone — absent parent tolerated ───────────
// Every consumer goes through these rather than reading destinationId, so a standalone spot (no parent) works
// everywhere a parented one does.

export const isStandaloneSpot = (spot: Spot) => !spot.destinationId;

/** The spot's destination, or undefined for a standalone spot (or an id no longer in DESTINATIONS). */
export function spotDestination(spot: Spot): Destination | undefined {
  return spot.destinationId ? DESTINATION_BY_ID.get(spot.destinationId) : undefined;
}
export function spotCountryCode(spot: Spot): string | undefined {
  return spot.countryCode ?? spotDestination(spot)?.countryCode;
}
export function spotCountry(spot: Spot): string | undefined {
  return spot.country ?? spotDestination(spot)?.country;
}
export function spotContinent(spot: Spot): Continent | undefined {
  return spot.continent ?? spotDestination(spot)?.continent;
}
export function spotTimezone(spot: Spot): string | undefined {
  return spot.timezone ?? spotDestination(spot)?.timezone;
}

// How wide a view frames a standalone spot (it has no destination to supply a default zoom): the span its pin
// appears at on the map, and where closing it returns the camera to.
export const STANDALONE_SPOT_SPAN_KM = 40;

/** `date`'s wall-clock date/time as observed in `timeZone`, expressed as a Date whose OWN local
 *  getters (getHours/getDay/setDate/…) read out those wall-clock values — so existing device-
 *  local-clock logic keeps working unmodified, just fed the destination's time instead. Falls
 *  back to `date` itself if `timeZone` is invalid or Intl can't resolve it. */
function zonedNow(date: Date, timeZone: string | undefined): Date {
  if (!timeZone) return date;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? NaN);
    const year = get('year'), month = get('month'), day = get('day');
    const hour = get('hour'), minute = get('minute'), second = get('second');
    if ([year, month, day, hour, minute, second].some(Number.isNaN)) return date;
    return new Date(year, month - 1, day, hour, minute, second);
  } catch {
    return date;
  }
}

/** `now`, expressed in the spot's own destination timezone — for callers (e.g. the "today" row
 *  highlight in the hours dropdown) that need to agree with what `getSpotOpenStatus` itself is
 *  treating as "today", rather than the device's own calendar date. */
export function zonedNowForSpot(spot: Spot, deviceNow: Date = new Date()): Date {
  return zonedNow(deviceNow, spotTimezone(spot));
}

interface TimeRange { openMin: number; closeMin: number } // minutes since local midnight; closeMin may exceed 1440 (crosses midnight)

function parseHoursRange(hours: string): TimeRange | 'always' | null {
  if (/open 24 hours|anytime/i.test(hours)) return 'always';
  const m = hours.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const toMin = (h: string, mm: string, ap: string) => {
    const hh = (Number(h) % 12) + (ap.toUpperCase() === 'PM' ? 12 : 0);
    return hh * 60 + Number(mm);
  };
  const openMin = toMin(m[1], m[2], m[3]);
  let closeMin = toMin(m[4], m[5], m[6]);
  if (closeMin <= openMin) closeMin += 24 * 60;
  return { openMin, closeMin };
}

const formatMin = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

// `label` is the short status word/phrase (colored, bold); `detail`, when present, is what used
// to follow a colon (e.g. "Closes 6:00 PM") — rendered as its own plain black, unbolded segment
// by the UI, with a "·" between the two instead of a colon. Kept as separate fields rather than
// one pre-joined string so the UI never has to parse a colon back out of it.
export type SpotOpenStatus =
  | { kind: 'open';         label: string; detail?: string; color: 'green' }
  | { kind: 'closing-soon'; label: string; detail: string;  color: 'orange' }
  | { kind: 'opening-soon'; label: string; detail: string;  color: 'orange' }
  | { kind: 'closed';       label: string; detail?: string; color: 'orange' }
  | { kind: 'unknown';      label: string; detail: string };

/** Live "Open · Closes 6:00 PM" / "Closed · Opens 9:00 AM Mon" / "Closes soon · …" /
 *  "Opens soon · …" / "Closed (Reason)" status for right now (in the spot's OWN destination
 *  timezone, not the device's — see `zonedNow`), or 'unknown' when `hours` isn't a parseable
 *  time range (falls back to just showing the raw string). */
export function getSpotOpenStatus(spot: Spot, deviceNow: Date = new Date()): SpotOpenStatus {
  const now = zonedNow(deviceNow, spotTimezone(spot));

  const todayReason = specialClosureOn(spot, now);
  if (todayReason) return { kind: 'closed', label: `Closed (${todayReason})`, color: 'orange' };

  const range = parseHoursRange(spot.hours);
  if (range === 'always') return { kind: 'open', label: 'Open 24 hours', color: 'green' };
  if (!range) return { kind: 'unknown', label: 'Today', detail: spot.hours };

  const todayIdx = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayClosed = spot.closedDays?.includes(todayIdx) ?? false;
  const yestClosed = spot.closedDays?.includes((todayIdx + 6) % 7) ?? false;

  // Two candidate sessions: today's own (may run past midnight into tomorrow) and yesterday's
  // (shifted into today's 0–1439 frame), for the case "now" is in the small hours still
  // covered by a session that opened yesterday evening.
  const inToday = !todayClosed && nowMin >= range.openMin && nowMin < range.closeMin;
  const inYesterday = !yestClosed && nowMin + 1440 >= range.openMin && nowMin + 1440 < range.closeMin;

  if (inToday || inYesterday) {
    const closesAtMin = inToday ? range.closeMin : range.closeMin - 1440;
    const minsLeft = closesAtMin - nowMin;
    return minsLeft <= SOON_WINDOW_MIN
      ? { kind: 'closing-soon', label: 'Closes soon', detail: formatMin(closesAtMin), color: 'orange' }
      : { kind: 'open', label: 'Open', detail: `Closes ${formatMin(closesAtMin)}`, color: 'green' };
  }

  // Closed right now — find when it next opens: later today, or the next non-closed,
  // non-specially-closed day (checked up to a week out).
  if (!todayClosed && nowMin < range.openMin) {
    const minsUntil = range.openMin - nowMin;
    return minsUntil <= SOON_WINDOW_MIN
      ? { kind: 'opening-soon', label: 'Opens soon', detail: formatMin(range.openMin), color: 'orange' }
      : { kind: 'closed', label: 'Closed', detail: `Opens ${formatMin(range.openMin)}`, color: 'orange' };
  }
  for (let add = 1; add <= 7; add++) {
    const d = new Date(now); d.setDate(d.getDate() + add);
    const dayIdx = d.getDay();
    if (spot.closedDays?.includes(dayIdx)) continue;
    if (specialClosureOn(spot, d)) continue;
    return { kind: 'closed', label: 'Closed', detail: `Opens ${formatMin(range.openMin)} ${DAY_NAMES_SHORT[dayIdx]}`, color: 'orange' };
  }
  return { kind: 'closed', label: 'Closed', color: 'orange' };
}

// Prefix (symbol before the number) or suffix (code after it, for currencies whose symbol
// is ambiguous on its own — "kr" alone doesn't say which Nordic krona/krone).
const CURRENCY_FORMAT: Record<string, { prefix?: string; suffix?: string }> = {
  USD: { prefix: '$' },
  EUR: { prefix: '€' },
  GBP: { prefix: '£' },
  JPY: { prefix: '¥' },
  AUD: { prefix: 'A$' },
  CHF: { prefix: 'CHF ' },
  CZK: { suffix: ' Kč' },
  SEK: { suffix: ' SEK' },
  NOK: { suffix: ' NOK' },
  DKK: { suffix: ' DKK' },
  ISK: { suffix: ' ISK' },
};

// "1–1.5 hr" / "30–60 min" / "45 min – 1 hr" — always a range (see visitHoursMin/Max), matching
// the "single value when equal, range when it differs" precedent formatSpotCost below already
// sets for costMin/costMax, except a visit range is never authored equal so it always spells
// out both ends.
const oneVisitTime = (hours: number): string =>
  hours < 1 ? `${Math.round(hours * 60)} min` : `${hours % 1 === 0 ? hours : hours.toFixed(1)} hr`;

export function formatVisitTime(min: number, max: number): string {
  if (max === min) return oneVisitTime(min);
  // Both ends the same unit (both under an hour, or both an hour+) — one shared suffix rather
  // than repeating "hr"/"min" on each side.
  if (min < 1 && max < 1) return `${Math.round(min * 60)} – ${Math.round(max * 60)} min`;
  if (min >= 1 && max >= 1) {
    const fmt = (h: number) => (h % 1 === 0 ? h : h.toFixed(1));
    return `${fmt(min)} – ${fmt(max)} hr`;
  }
  return `${oneVisitTime(min)} – ${oneVisitTime(max)}`;
}

export function formatSpotCost(spot: Spot): string {
  if (spot.free || spot.costMin == null) return 'Free';
  const fmt = CURRENCY_FORMAT[spot.currency ?? 'USD'] ?? CURRENCY_FORMAT.USD;
  const one = (n: number) => `${fmt.prefix ?? ''}${n}${fmt.suffix ?? ''}`;
  if (spot.costMax == null || spot.costMax === spot.costMin) return one(spot.costMin);
  // One currency marker for the whole range, not one per value — "NOK 140 – 160" / "$13 –
  // 35", never "140 NOK – 160 NOK" / "$13 – $35". A suffix-style currency (the Nordic kr-
  // based codes, placed after the number on a single value to disambiguate which krona/krone
  // it is) moves to the front here instead of repeating at both ends of the range.
  if (fmt.suffix) return `${fmt.suffix.trim()} ${spot.costMin} – ${spot.costMax}`;
  return `${fmt.prefix ?? ''}${spot.costMin} – ${spot.costMax}`;
}

export const SPOTS: Spot[] = [
  // NYC
  { id: 'nyc-1', destinationId: 'nyc', name: 'Times Square', icon: '🎭', coordinates: { latitude: 40.7580, longitude: -73.9855 }, category: 'landmark', bio: 'The dazzling neon heart of Manhattan, where Broadway meets a million lights and the crowds never thin.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://www.timessquarenyc.org' },
  { id: 'nyc-2', destinationId: 'nyc', name: 'Central Park', icon: '🌳', coordinates: { latitude: 40.7851, longitude: -73.9683 }, category: 'nature', bio: '843 acres of meadows, lakes, and wooded paths carved into the middle of the city grid.', hours: '6:00 AM – 1:00 AM', visitHoursMin: 2, visitHoursMax: 3, free: true, ticketUrl: 'https://www.centralparknyc.org' },
  { id: 'nyc-3', destinationId: 'nyc', name: 'Empire State Building', icon: '🏙️', coordinates: { latitude: 40.7484, longitude: -73.9967 }, category: 'viewpoint', bio: 'The Art Deco icon whose 86th-floor deck offers the definitive Manhattan panorama.', hours: '10:00 AM – 10:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 44, costMax: 79, ticketUrl: 'https://www.esbnyc.com' },
  // Los Angeles
  { id: 'la-1', destinationId: 'la', name: 'Hollywood Sign', icon: '🎬', coordinates: { latitude: 34.1341, longitude: -118.3215 }, category: 'landmark', bio: 'The 45-foot white letters on Mount Lee that have symbolized movie-making dreams since 1923.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true, ticketUrl: 'https://www.hollywoodsign.org' },
  { id: 'la-2', destinationId: 'la', name: 'Santa Monica Pier', icon: '🎡', coordinates: { latitude: 34.0081, longitude: -118.4960 }, category: 'entertainment', bio: 'A century-old pier with a solar-powered Ferris wheel, arcade, and the end of Route 66.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true, ticketUrl: 'https://www.santamonicapier.org' },
  { id: 'la-3', destinationId: 'la', name: 'Griffith Observatory', icon: '🔭', coordinates: { latitude: 34.1184, longitude: -118.3004 }, category: 'viewpoint', bio: 'A gleaming Art Deco observatory with telescopes, science halls, and sweeping views of the LA basin.', hours: '12:00 PM – 10:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, closedDays: [1], free: true, ticketUrl: 'https://griffithobservatory.org' },
  // Grand Canyon
  { id: 'grand-canyon-1', destinationId: 'grand-canyon', name: 'Mather Point', icon: '👁️', coordinates: { latitude: 36.0572, longitude: -112.1069 }, category: 'viewpoint', bio: 'The classic first look at the canyon, with a railed overlook reaching out over a mile of layered rock.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://www.nps.gov/grca' },
  { id: 'grand-canyon-2', destinationId: 'grand-canyon', name: 'Bright Angel Trail', icon: '🥾', coordinates: { latitude: 36.0561, longitude: -112.1428 }, category: 'hike', bio: 'The most famous trail into the canyon, switchbacking down past rest houses toward the Colorado River.', hours: 'Open 24 hours', visitHoursMin: 3, visitHoursMax: 5, free: true, ticketUrl: 'https://www.nps.gov/grca' },
  { id: 'grand-canyon-3', destinationId: 'grand-canyon', name: 'Yavapai Point', icon: '🌅', coordinates: { latitude: 36.0660, longitude: -112.1019 }, category: 'viewpoint', bio: 'A panoramic overlook and geology museum with some of the finest sunset views on the South Rim.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://www.nps.gov/grca' },
  // Paris
  { id: 'paris-1', destinationId: 'paris', name: 'Eiffel Tower', icon: '🗼', coordinates: { latitude: 48.8584, longitude: 2.2945 }, category: 'monument', bio: "Gustave Eiffel's 330-metre iron lattice tower, the enduring symbol of Paris and its most visited monument.", hours: '9:30 AM – 11:45 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 13, costMax: 35, currency: 'EUR', ticketUrl: 'https://www.toureiffel.paris' },
  { id: 'paris-2', destinationId: 'paris', name: 'The Louvre', icon: '🎨', coordinates: { latitude: 48.8606, longitude: 2.3376 }, category: 'museum', bio: "The world's largest art museum, home to the Mona Lisa, Venus de Milo, and 35,000 works across former royal palaces.", hours: '9:00 AM – 6:00 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, closedDays: [2], costMin: 22, costMax: 22, currency: 'EUR', ticketUrl: 'https://www.louvre.fr',
    specialClosures: [{ month: 1, day: 1, reason: "New Year's Day" }, { month: 5, day: 1, reason: 'Labour Day' }, { month: 12, day: 25, reason: 'Christmas Day' }] },
  { id: 'paris-3', destinationId: 'paris', name: 'Notre-Dame', icon: '⛪', coordinates: { latitude: 48.8530, longitude: 2.3499 }, category: 'religious', bio: 'The masterpiece of French Gothic architecture on the Île de la Cité, famed for its rose windows and flying buttresses.', hours: '8:00 AM – 6:45 PM', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://www.notredamedeparis.fr' },
  // London
  { id: 'london-1', destinationId: 'london', name: 'Big Ben', icon: '🕰️', coordinates: { latitude: 51.5007, longitude: -0.1246 }, category: 'landmark', bio: 'The great clock tower of the Palace of Westminster, whose chimes have marked London time since 1859.', hours: 'Exterior viewing anytime', visitHoursMin: 0.5, visitHoursMax: 1, free: true, ticketUrl: 'https://www.parliament.uk/bigben' },
  { id: 'london-2', destinationId: 'london', name: 'Tower of London', icon: '🏰', coordinates: { latitude: 51.5081, longitude: -0.0759 }, category: 'historic', bio: 'A 1,000-year-old fortress, palace, and prison on the Thames, guarding the Crown Jewels and its famous ravens.', hours: '9:00 AM – 5:30 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, costMin: 34, costMax: 40, currency: 'GBP', ticketUrl: 'https://www.hrp.org.uk/tower-of-london' },
  { id: 'london-3', destinationId: 'london', name: 'Buckingham Palace', icon: '👑', coordinates: { latitude: 51.5014, longitude: -0.1419 }, category: 'landmark', bio: 'The London residence of the British monarch, famed for its balcony and the Changing of the Guard ceremony.', hours: '9:30 AM – 7:30 PM (summer)', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 32, costMax: 37, currency: 'GBP', ticketUrl: 'https://www.rct.uk' },
  // Rome
  { id: 'rome-1', destinationId: 'rome', name: 'Colosseum', icon: '🏟️', coordinates: { latitude: 41.8902, longitude: 12.4922 }, category: 'historic', bio: 'The largest amphitheatre ever built, where 50,000 Romans once watched gladiatorial games nearly 2,000 years ago.', hours: '9:00 AM – 7:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 18, costMax: 24, currency: 'EUR', ticketUrl: 'https://parcocolosseo.it' },
  { id: 'rome-2', destinationId: 'rome', name: 'Trevi Fountain', icon: '⛲', coordinates: { latitude: 41.9009, longitude: 12.4833 }, category: 'monument', bio: 'The grandest Baroque fountain in Rome, where tradition says a coin tossed over the shoulder ensures your return.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'rome-3', destinationId: 'rome', name: 'Vatican', icon: '✝️', coordinates: { latitude: 41.9022, longitude: 12.4539 }, category: 'religious', bio: "The seat of the Catholic Church, home to St. Peter's Basilica, the Sistine Chapel, and the Vatican Museums.", hours: '9:00 AM – 6:00 PM', visitHoursMin: 3, visitHoursMax: 4, closedDays: [0], costMin: 20, costMax: 28, currency: 'EUR', ticketUrl: 'https://www.museivaticani.va' },
  // Barcelona
  { id: 'barcelona-1', destinationId: 'barcelona', name: 'Sagrada Família', icon: '⛪', coordinates: { latitude: 41.4036, longitude: 2.1744 }, category: 'religious', bio: "Gaudí's unfinished basilica, a soaring forest of stone columns under construction since 1882.", hours: '9:00 AM – 8:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 26, costMax: 40, currency: 'EUR', ticketUrl: 'https://sagradafamilia.org' },
  { id: 'barcelona-2', destinationId: 'barcelona', name: 'Park Güell', icon: '🦎', coordinates: { latitude: 41.4145, longitude: 2.1527 }, category: 'landmark', bio: "Gaudí's whimsical hillside park of mosaic serpents, gingerbread pavilions, and city views.", hours: '9:30 AM – 7:30 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 10, costMax: 13, currency: 'EUR', ticketUrl: 'https://parkguell.barcelona' },
  { id: 'barcelona-3', destinationId: 'barcelona', name: 'La Boqueria', icon: '🍅', coordinates: { latitude: 41.3817, longitude: 2.1718 }, category: 'market', bio: "Barcelona's legendary public market off La Rambla, bursting with jamón, seafood, and fruit stalls.", hours: '8:00 AM – 8:30 PM', visitHoursMin: 1, visitHoursMax: 1.5, closedDays: [0], free: true, ticketUrl: 'https://www.boqueria.barcelona' },
  // Amsterdam
  { id: 'amsterdam-1', destinationId: 'amsterdam', name: 'Rijksmuseum', icon: '🎨', coordinates: { latitude: 52.3600, longitude: 4.8852 }, category: 'museum', bio: 'The Dutch national museum, home to Rembrandt\'s Night Watch and centuries of Golden Age masterpieces.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, costMin: 24, costMax: 24, currency: 'EUR', ticketUrl: 'https://www.rijksmuseum.nl' },
  { id: 'amsterdam-2', destinationId: 'amsterdam', name: "Anne Frank's House", icon: '📖', coordinates: { latitude: 52.3752, longitude: 4.8840 }, category: 'historic', bio: 'The canal-house annex where Anne Frank hid and wrote her diary, now a deeply moving museum.', hours: '9:00 AM – 10:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 18, costMax: 18, currency: 'EUR', ticketUrl: 'https://www.annefrank.org' },
  { id: 'amsterdam-3', destinationId: 'amsterdam', name: 'Van Gogh Museum', icon: '🌻', coordinates: { latitude: 52.3584, longitude: 4.8811 }, category: 'museum', bio: "The world's largest collection of Van Gogh's paintings and letters, tracing his turbulent life and work.", hours: '9:00 AM – 6:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 22, costMax: 22, currency: 'EUR', ticketUrl: 'https://www.vangoghmuseum.nl' },
  // Prague
  { id: 'prague-1', destinationId: 'prague', name: 'Prague Castle', icon: '🏰', coordinates: { latitude: 50.0904, longitude: 14.4013 }, category: 'historic', bio: 'The largest ancient castle complex in the world, crowning the city with St. Vitus Cathedral at its heart.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, costMin: 250, costMax: 350, currency: 'CZK', ticketUrl: 'https://www.hrad.cz' },
  { id: 'prague-2', destinationId: 'prague', name: 'Charles Bridge', icon: '🌉', coordinates: { latitude: 50.0866, longitude: 14.4114 }, category: 'monument', bio: 'A 14th-century stone bridge lined with Baroque statues, linking the Old Town to the castle across the Vltava.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'prague-3', destinationId: 'prague', name: 'Old Town Square', icon: '⏰', coordinates: { latitude: 50.0870, longitude: 14.4201 }, category: 'landmark', bio: 'The medieval heart of Prague, home to the Astronomical Clock and its hourly parade of apostles.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Santorini
  { id: 'santorini-1', destinationId: 'santorini', name: 'Oia Village', icon: '🌅', coordinates: { latitude: 36.4618, longitude: 25.3753 }, category: 'viewpoint', bio: 'The cliffside village of white-and-blue houses famed for the most celebrated sunset in the Aegean.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true },
  { id: 'santorini-2', destinationId: 'santorini', name: 'Akrotiri', icon: '🏛️', coordinates: { latitude: 36.3519, longitude: 25.4044 }, category: 'historic', bio: 'A Bronze Age Minoan town preserved under volcanic ash, often called the "Pompeii of the Aegean".', hours: '8:00 AM – 8:00 PM', visitHoursMin: 1, visitHoursMax: 2, closedDays: [1], costMin: 12, costMax: 12, currency: 'EUR', ticketUrl: 'https://odysseus.culture.gr' },
  { id: 'santorini-3', destinationId: 'santorini', name: 'Red Beach', icon: '🏖️', coordinates: { latitude: 36.3478, longitude: 25.3939 }, category: 'beach', bio: 'A dramatic cove of red-black volcanic sand framed by towering rust-coloured cliffs.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  // Nice
  { id: 'nice-1', destinationId: 'nice', name: 'Promenade des Anglais', icon: '🌊', coordinates: { latitude: 43.6955, longitude: 7.2648 }, category: 'landmark', bio: 'The grand seaside boulevard curving along the Baie des Anges, lined with palms and Belle Époque hotels.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'nice-2', destinationId: 'nice', name: 'Vieux-Nice Old Town', icon: '🏠', coordinates: { latitude: 43.6961, longitude: 7.2757 }, category: 'historic', bio: 'A maze of ochre lanes, Baroque churches, and market squares that form the soul of old Nice.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  // Lyon
  { id: 'lyon-1', destinationId: 'lyon', name: 'Basilica of Fourvière', icon: '⛪', coordinates: { latitude: 45.7624, longitude: 4.8222 }, category: 'religious', bio: 'An ornate 19th-century basilica crowning Fourvière hill, with mosaics inside and city panoramas outside.', hours: '8:00 AM – 7:00 PM', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://www.fourviere.org' },
  { id: 'lyon-2', destinationId: 'lyon', name: 'Les Halles Paul Bocuse', icon: '🥩', coordinates: { latitude: 45.7651, longitude: 4.8586 }, category: 'market', bio: "Lyon's temple of gastronomy, an indoor market of celebrated cheesemongers, charcutiers, and traiteurs.", hours: '7:00 AM – 7:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, closedDays: [1], free: true, ticketUrl: 'https://www.halles-de-lyon-paulbocuse.com' },
  // Edinburgh
  { id: 'edinburgh-1', destinationId: 'edinburgh', name: 'Edinburgh Castle', icon: '🏰', coordinates: { latitude: 55.9486, longitude: -3.1999 }, category: 'historic', bio: 'An ancient fortress atop volcanic Castle Rock, guarding the Scottish Crown Jewels and the Stone of Destiny.', hours: '9:30 AM – 6:00 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 19, costMax: 26, currency: 'GBP', ticketUrl: 'https://www.edinburghcastle.scot' },
  { id: 'edinburgh-2', destinationId: 'edinburgh', name: "Arthur's Seat", icon: '⛰️', coordinates: { latitude: 55.9444, longitude: -3.1617 }, category: 'hike', bio: 'An extinct volcano rising 251 metres above the city, offering the finest walk-up view in Edinburgh.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true },
  // Florence
  { id: 'florence-1', destinationId: 'florence', name: 'Uffizi Gallery', icon: '🎨', coordinates: { latitude: 43.7678, longitude: 11.2553 }, category: 'museum', bio: "One of the world's greatest art museums, holding Botticelli's Birth of Venus and Renaissance masterpieces.", hours: '8:15 AM – 6:30 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, closedDays: [1], costMin: 20, costMax: 27, currency: 'EUR', ticketUrl: 'https://www.uffizi.it' },
  { id: 'florence-2', destinationId: 'florence', name: 'Florence Cathedral', icon: '⛪', coordinates: { latitude: 43.7731, longitude: 11.2560 }, category: 'religious', bio: "The Duomo crowned by Brunelleschi's revolutionary red-tiled dome, a marvel of Renaissance engineering.", hours: '10:15 AM – 4:45 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true, ticketUrl: 'https://duomo.firenze.it' },
  // Venice
  { id: 'venice-1', destinationId: 'venice', name: "St. Mark's Square", icon: '🕊️', coordinates: { latitude: 45.4341, longitude: 12.3388 }, category: 'landmark', bio: "Venice's grand social heart, ringed by the Basilica, Campanile, and centuries-old cafés.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'venice-2', destinationId: 'venice', name: 'Grand Canal', icon: '🚤', coordinates: { latitude: 45.4380, longitude: 12.3186 }, category: 'landmark', bio: "The city's watery main street, best seen by vaporetto or gondola past palazzos and the Rialto Bridge.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Madrid
  { id: 'madrid-1', destinationId: 'madrid', name: 'Prado Museum', icon: '🖼️', coordinates: { latitude: 40.4138, longitude: -3.6921 }, category: 'museum', bio: "Spain's greatest art museum, rich with Velázquez, Goya, and the European old masters.", hours: '10:00 AM – 8:00 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, costMin: 15, costMax: 15, currency: 'EUR', ticketUrl: 'https://www.museodelprado.es' },
  { id: 'madrid-2', destinationId: 'madrid', name: 'Retiro Park', icon: '🌳', coordinates: { latitude: 40.4153, longitude: -3.6844 }, category: 'nature', bio: 'A former royal garden of 350 acres, with a boating lake, rose gardens, and the glass Crystal Palace.', hours: '6:00 AM – 12:00 AM', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  // Athens
  { id: 'athens-1', destinationId: 'athens', name: 'Acropolis & Parthenon', icon: '🏛️', coordinates: { latitude: 37.9715, longitude: 23.7267 }, category: 'historic', bio: 'The citadel of ancient Athens crowned by the Parthenon, the enduring symbol of classical civilization.', hours: '8:00 AM – 8:00 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 20, costMax: 20, currency: 'EUR', ticketUrl: 'https://odysseus.culture.gr' },
  { id: 'athens-2', destinationId: 'athens', name: 'Ancient Agora', icon: '🏺', coordinates: { latitude: 37.9754, longitude: 23.7218 }, category: 'historic', bio: 'The marketplace and civic heart of ancient Athens, where Socrates once taught among the ruins and temples.', hours: '8:00 AM – 7:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 10, costMax: 10, currency: 'EUR', ticketUrl: 'https://odysseus.culture.gr' },
  // Mykonos
  { id: 'mykonos-1', destinationId: 'mykonos', name: 'Mykonos Town (Chora)', icon: '🏘️', coordinates: { latitude: 37.4453, longitude: 25.3285 }, category: 'historic', bio: 'A dazzling maze of whitewashed Cycladic lanes, bougainvillea, boutiques, and hidden chapels.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true },
  { id: 'mykonos-2', destinationId: 'mykonos', name: 'Little Venice', icon: '🌊', coordinates: { latitude: 37.4456, longitude: 25.3261 }, category: 'viewpoint', bio: 'A row of colourful merchant houses perched at the water\'s edge, famous for cocktails at sunset.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  // Berlin
  { id: 'berlin-1', destinationId: 'berlin', name: 'Brandenburg Gate', icon: '🏛️', coordinates: { latitude: 52.5163, longitude: 13.3777 }, category: 'monument', bio: 'The neoclassical 18th-century gate that became the symbol of a divided — then reunited — Germany.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'berlin-2', destinationId: 'berlin', name: 'Berlin Wall Memorial', icon: '🧱', coordinates: { latitude: 52.5352, longitude: 13.3902 }, category: 'historic', bio: 'A preserved stretch of the Wall with a documentation centre, memorializing the city\'s Cold War division.', hours: '8:00 AM – 10:00 PM', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://www.stiftung-berliner-mauer.de' },
  // Munich
  { id: 'munich-1', destinationId: 'munich', name: 'Marienplatz', icon: '🏙️', coordinates: { latitude: 48.1374, longitude: 11.5755 }, category: 'landmark', bio: "Munich's central square since 1158, dominated by the New Town Hall and its famous Glockenspiel.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'munich-2', destinationId: 'munich', name: 'English Garden', icon: '🌳', coordinates: { latitude: 48.1642, longitude: 11.6050 }, category: 'nature', bio: 'One of the world\'s largest urban parks, with beer gardens, a Chinese tower, and a river-surfing wave.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  // Lisbon
  { id: 'lisbon-1', destinationId: 'lisbon', name: 'Belém Tower', icon: '🗼', coordinates: { latitude: 38.6916, longitude: -9.2160 }, category: 'monument', bio: 'A 16th-century Manueline fortress on the Tagus, launch point of Portugal\'s Age of Discovery.', hours: '10:00 AM – 5:30 PM', visitHoursMin: 1, visitHoursMax: 2, closedDays: [1], costMin: 7, costMax: 7, currency: 'EUR', ticketUrl: 'https://www.torrebelem.gov.pt' },
  { id: 'lisbon-2', destinationId: 'lisbon', name: 'Alfama District', icon: '🎵', coordinates: { latitude: 38.7139, longitude: -9.1301 }, category: 'historic', bio: 'Lisbon\'s oldest quarter, a tangle of Moorish-era lanes echoing with fado music and tram bells.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  // Porto
  { id: 'porto-1', destinationId: 'porto', name: 'Ribeira Quarter', icon: '🏘️', coordinates: { latitude: 41.1408, longitude: -8.6145 }, category: 'historic', bio: 'A UNESCO-listed riverside warren of medieval houses tumbling down to the Douro waterfront.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  { id: 'porto-2', destinationId: 'porto', name: 'Dom Luís I Bridge', icon: '🌉', coordinates: { latitude: 41.1401, longitude: -8.6093 }, category: 'viewpoint', bio: 'A double-deck iron arch bridge by a Eiffel disciple, with sweeping views over Porto and the port cellars.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Zurich
  { id: 'zurich-1', destinationId: 'zurich', name: 'Old Town (Altstadt)', icon: '🏘️', coordinates: { latitude: 47.3726, longitude: 8.5432 }, category: 'historic', bio: 'Medieval lanes climbing both banks of the Limmat, dotted with guildhalls and Romanesque churches.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  { id: 'zurich-2', destinationId: 'zurich', name: 'Lake Zurich', icon: '💧', coordinates: { latitude: 47.3558, longitude: 8.5475 }, category: 'nature', bio: 'A crescent lake fringed by promenades and, on clear days, a shimmering backdrop of the Alps.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  // Interlaken
  { id: 'interlaken-1', destinationId: 'interlaken', name: 'Harder Kulm', icon: '⛰️', coordinates: { latitude: 46.7007, longitude: 7.8544 }, category: 'viewpoint', bio: 'Interlaken\'s "top of the town" at 1,322m, reached by funicular for views of Eiger, Mönch, and Jungfrau.', hours: '9:00 AM – 9:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 36, costMax: 36, currency: 'CHF', ticketUrl: 'https://www.jungfrau.ch' },
  { id: 'interlaken-2', destinationId: 'interlaken', name: 'Jungfraujoch', icon: '🏔️', coordinates: { latitude: 46.5474, longitude: 7.9854 }, category: 'viewpoint', bio: 'The "Top of Europe" at 3,454m, home to the continent\'s highest railway station and an eternal ice palace.', hours: '8:00 AM – 6:00 PM', visitHoursMin: 3, visitHoursMax: 5, costMin: 210, costMax: 230, currency: 'CHF', ticketUrl: 'https://www.jungfrau.ch' },
  // Vienna
  { id: 'vienna-1', destinationId: 'vienna', name: 'Schönbrunn Palace', icon: '🏰', coordinates: { latitude: 48.1845, longitude: 16.3122 }, category: 'historic', bio: 'The 1,441-room Habsburg summer palace, with Baroque state rooms and vast formal gardens.', hours: '8:30 AM – 5:30 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, costMin: 26, costMax: 32, currency: 'EUR', ticketUrl: 'https://www.schoenbrunn.at' },
  { id: 'vienna-2', destinationId: 'vienna', name: 'Kunsthistorisches Museum', icon: '🎨', coordinates: { latitude: 48.2037, longitude: 16.3614 }, category: 'museum', bio: 'The imperial art collection under a grand domed palace, rich with Bruegel, Vermeer, and Rubens.', hours: '10:00 AM – 6:00 PM', visitHoursMin: 2, visitHoursMax: 3, closedDays: [1], costMin: 18, costMax: 18, currency: 'EUR', ticketUrl: 'https://www.khm.at' },
  // Salzburg
  { id: 'salzburg-1', destinationId: 'salzburg', name: 'Hohensalzburg Fortress', icon: '🏰', coordinates: { latitude: 47.7948, longitude: 13.0472 }, category: 'historic', bio: 'One of Europe\'s largest fully preserved medieval castles, crowning the city with alpine views.', hours: '9:30 AM – 5:00 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 13, costMax: 17, currency: 'EUR', ticketUrl: 'https://www.salzburg-burgen.at' },
  { id: 'salzburg-2', destinationId: 'salzburg', name: 'Mirabell Palace', icon: '🌷', coordinates: { latitude: 47.8046, longitude: 13.0433 }, category: 'landmark', bio: 'A Baroque palace whose manicured gardens starred in The Sound of Music and frame the fortress beyond.', hours: '8:00 AM – 6:00 PM (gardens)', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Bruges
  { id: 'bruges-1', destinationId: 'bruges', name: 'Bruges Belfry', icon: '🔔', coordinates: { latitude: 51.2088, longitude: 3.2246 }, category: 'monument', bio: 'A 13th-century medieval bell tower rising 83m over the market, rewarding 366 steps with rooftop views.', hours: '9:30 AM – 6:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 14, costMax: 14, currency: 'EUR', ticketUrl: 'https://www.visitbruges.be' },
  { id: 'bruges-2', destinationId: 'bruges', name: 'Markt Square', icon: '🏛️', coordinates: { latitude: 51.2091, longitude: 3.2239 }, category: 'landmark', bio: 'The colourful gabled heart of Bruges, ringed by guildhalls, cafés, and horse-drawn carriages.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Brussels
  { id: 'brussels-1', destinationId: 'brussels', name: 'Grand-Place', icon: '🏛️', coordinates: { latitude: 50.8467, longitude: 4.3525 }, category: 'landmark', bio: 'A UNESCO World Heritage square ringed by opulent gilded guildhalls and the Gothic Town Hall.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'brussels-2', destinationId: 'brussels', name: 'Atomium', icon: '⚛️', coordinates: { latitude: 50.8948, longitude: 4.3412 }, category: 'landmark', bio: 'A 102m model of an iron crystal built for Expo 58, with exhibition spheres and a panoramic top.', hours: '10:00 AM – 6:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 17, costMax: 17, currency: 'EUR', ticketUrl: 'https://atomium.be' },
  // Dublin
  { id: 'dublin-1', destinationId: 'dublin', name: 'Trinity College', icon: '📚', coordinates: { latitude: 53.3439, longitude: -6.2546 }, category: 'historic', bio: "Ireland's oldest university, home to the illuminated Book of Kells and the breathtaking Long Room library.", hours: '8:30 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 22, costMax: 28, currency: 'EUR', ticketUrl: 'https://www.tcd.ie/visit' },
  { id: 'dublin-2', destinationId: 'dublin', name: 'Guinness Storehouse', icon: '🍺', coordinates: { latitude: 53.3419, longitude: -6.2868 }, category: 'entertainment', bio: 'A seven-storey pint-shaped museum of Ireland\'s most famous stout, topped by the panoramic Gravity Bar.', hours: '9:30 AM – 7:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 28, costMax: 35, currency: 'EUR', ticketUrl: 'https://www.guinness-storehouse.com' },
  // Cliffs of Moher
  { id: 'cliffs-of-moher-1', destinationId: 'cliffs-of-moher', name: "O'Brien's Tower", icon: '🗼', coordinates: { latitude: 52.9722, longitude: -9.4272 }, category: 'viewpoint', bio: 'A 19th-century stone tower at the cliffs\' highest point, with views to the Aran Islands and Galway Bay.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 10, costMax: 10, currency: 'EUR', ticketUrl: 'https://www.cliffsofmoher.ie' },
  { id: 'cliffs-of-moher-2', destinationId: 'cliffs-of-moher', name: "Hag's Head", icon: '🌊', coordinates: { latitude: 52.9421, longitude: -9.4608 }, category: 'hike', bio: 'The dramatic southern promontory of the cliffs, reached by a wild coastal trail away from the crowds.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true, ticketUrl: 'https://www.cliffsofmoher.ie' },
  // Stockholm
  { id: 'stockholm-1', destinationId: 'stockholm', name: 'Gamla Stan', icon: '🏘️', coordinates: { latitude: 59.3230, longitude: 18.0710 }, category: 'historic', bio: 'One of Europe\'s best-preserved medieval old towns, an island of cobbled lanes and ochre merchant houses.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  { id: 'stockholm-2', destinationId: 'stockholm', name: 'Vasa Museum', icon: '⛵', coordinates: { latitude: 59.3280, longitude: 18.0914 }, category: 'museum', bio: 'Home to a fully intact 17th-century warship salvaged after 333 years on the harbour floor.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 190, costMax: 190, currency: 'SEK', ticketUrl: 'https://www.vasamuseet.se' },
  // Gothenburg
  { id: 'gothenburg-1', destinationId: 'gothenburg', name: 'Feskekörka', icon: '🐟', coordinates: { latitude: 57.7021, longitude: 11.9585 }, category: 'market', bio: 'The "Fish Church", a striking neo-Gothic hall serving Gothenburg\'s freshest seafood since 1874.', hours: '10:00 AM – 6:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, closedDays: [0, 1], free: true },
  { id: 'gothenburg-2', destinationId: 'gothenburg', name: 'Liseberg', icon: '🎡', coordinates: { latitude: 57.6960, longitude: 12.0014 }, category: 'entertainment', bio: 'Scandinavia\'s most beloved amusement park, with wooden coasters, gardens, and seasonal festivities.', hours: '11:00 AM – 10:00 PM (seasonal)', visitHoursMin: 3, visitHoursMax: 5, costMin: 150, costMax: 170, currency: 'SEK', ticketUrl: 'https://www.liseberg.com' },
  // Bergen
  { id: 'bergen-1', destinationId: 'bergen', name: 'Bryggen Wharf', icon: '🏘️', coordinates: { latitude: 60.3976, longitude: 5.3237 }, category: 'historic', bio: 'A UNESCO row of crooked wooden Hanseatic trading houses, painted in reds and ochres along the harbour.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'bergen-2', destinationId: 'bergen', name: 'Fløibanen Funicular', icon: '🚡', coordinates: { latitude: 60.3961, longitude: 5.3269 }, category: 'viewpoint', bio: 'A funicular climbing Mount Fløyen for sweeping views over Bergen, its fjords, and surrounding peaks.', hours: '7:30 AM – 11:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 160, costMax: 190, currency: 'NOK', ticketUrl: 'https://www.floyen.no' },
  // Norwegian Fjords
  { id: 'norwegian-fjords-1', destinationId: 'norwegian-fjords', name: 'Geirangerfjord', icon: '⛰️', coordinates: { latitude: 62.1046, longitude: 7.2058 }, category: 'nature', bio: 'A UNESCO fjord of sheer cliffs and cascading waterfalls, among the most beautiful in the world.', hours: 'Open 24 hours', visitHoursMin: 2.5, visitHoursMax: 3.5, free: true },
  { id: 'norwegian-fjords-2', destinationId: 'norwegian-fjords', name: 'Preikestolen', icon: '🪨', coordinates: { latitude: 58.9868, longitude: 6.1894 }, category: 'hike', bio: 'The Pulpit Rock, a flat cliff plateau towering 604m above Lysefjord — Norway\'s most iconic hike.', hours: 'Open 24 hours', visitHoursMin: 3, visitHoursMax: 5, free: true, ticketUrl: 'https://www.preikestolen.no' },
  // Copenhagen
  { id: 'copenhagen-1', destinationId: 'copenhagen', name: 'Nyhavn', icon: '⛵', coordinates: { latitude: 55.6796, longitude: 12.5910 }, category: 'landmark', bio: 'The postcard-perfect 17th-century canal lined with candy-coloured townhouses and wooden ships.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'copenhagen-2', destinationId: 'copenhagen', name: 'Tivoli Gardens', icon: '🎡', coordinates: { latitude: 55.6736, longitude: 12.5681 }, category: 'entertainment', bio: 'The world\'s second-oldest amusement park, an 1843 wonderland of gardens, rides, and evening lights.', hours: '11:00 AM – 11:00 PM (seasonal)', visitHoursMin: 2.5, visitHoursMax: 3.5, costMin: 195, costMax: 235, currency: 'DKK', ticketUrl: 'https://www.tivoli.dk' },
  // Aarhus
  { id: 'aarhus-1', destinationId: 'aarhus', name: 'ARoS Art Museum', icon: '🌈', coordinates: { latitude: 56.1543, longitude: 10.2005 }, category: 'museum', bio: 'A landmark museum crowned by Your Rainbow Panorama, a circular walkway of coloured glass over the city.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, closedDays: [1], costMin: 140, costMax: 140, currency: 'DKK', ticketUrl: 'https://www.aros.dk' },
  { id: 'aarhus-2', destinationId: 'aarhus', name: 'Aarhus Cathedral', icon: '⛪', coordinates: { latitude: 56.1575, longitude: 10.2113 }, category: 'religious', bio: 'Denmark\'s longest and tallest cathedral, a Gothic landmark with medieval frescoes and a soaring nave.', hours: '10:00 AM – 4:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://www.aarhusdomkirke.dk' },
  // Helsinki
  { id: 'helsinki-1', destinationId: 'helsinki', name: 'Helsinki Cathedral', icon: '⛪', coordinates: { latitude: 60.1699, longitude: 24.9523 }, category: 'religious', bio: 'A dazzling white neoclassical cathedral presiding over Senate Square, the symbol of Helsinki.', hours: '9:00 AM – 6:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'helsinki-2', destinationId: 'helsinki', name: 'Suomenlinna Fortress', icon: '🏰', coordinates: { latitude: 60.1454, longitude: 24.9881 }, category: 'historic', bio: 'A UNESCO sea fortress spread across islands, reached by ferry and dotted with tunnels and ramparts.', hours: 'Open 24 hours', visitHoursMin: 2.5, visitHoursMax: 3.5, free: true, ticketUrl: 'https://www.suomenlinna.fi' },
  // Rovaniemi
  { id: 'rovaniemi-1', destinationId: 'rovaniemi', name: 'Santa Claus Village', icon: '🎅', coordinates: { latitude: 66.5436, longitude: 25.8468 }, category: 'entertainment', bio: 'A festive village straddling the Arctic Circle, home to Santa\'s office and the main post office year-round.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 2, visitHoursMax: 3, free: true, ticketUrl: 'https://santaclausvillage.info' },
  { id: 'rovaniemi-2', destinationId: 'rovaniemi', name: 'Arktikum Museum', icon: '🌌', coordinates: { latitude: 66.5089, longitude: 25.7246 }, category: 'museum', bio: 'A striking glass-tunnel museum exploring Arctic nature, Lapland culture, and the science of the aurora.', hours: '10:00 AM – 6:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 16, costMax: 16, currency: 'EUR', ticketUrl: 'https://www.arktikum.fi' },
  // Reykjavik
  { id: 'reykjavik-1', destinationId: 'reykjavik', name: 'Hallgrímskirkja Church', icon: '⛪', coordinates: { latitude: 64.1418, longitude: -21.9268 }, category: 'religious', bio: 'A 74m expressionist church evoking basalt columns, with a tower lift for the best views over Reykjavik.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 1500, costMax: 1500, currency: 'ISK', ticketUrl: 'https://hallgrimskirkja.is' },
  { id: 'reykjavik-2', destinationId: 'reykjavik', name: 'Blue Lagoon', icon: '♨️', coordinates: { latitude: 63.8804, longitude: -22.4495 }, category: 'nature', bio: 'A milky-blue geothermal spa set in a black lava field, Iceland\'s most famous soaking experience.', hours: '8:00 AM – 10:00 PM', visitHoursMin: 2.5, visitHoursMax: 3.5, costMin: 12990, costMax: 16990, currency: 'ISK', ticketUrl: 'https://www.bluelagoon.com' },
  // Golden Circle
  { id: 'golden-circle-1', destinationId: 'golden-circle', name: 'Geysir Hot Spring', icon: '💨', coordinates: { latitude: 64.3121, longitude: -20.3020 }, category: 'nature', bio: 'The geothermal field that gave geysers their name, where Strokkur erupts skyward every few minutes.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'golden-circle-2', destinationId: 'golden-circle', name: 'Gullfoss Waterfall', icon: '💧', coordinates: { latitude: 64.3270, longitude: -20.1200 }, category: 'nature', bio: 'The "Golden Falls", a thunderous two-tier cascade plunging into a rugged glacial canyon.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Tokyo
  { id: 'tokyo-1', destinationId: 'tokyo', name: 'Senso-ji Temple', icon: '⛩️', coordinates: { latitude: 35.7148, longitude: 139.7967 }, category: 'religious', bio: "Tokyo's oldest temple, approached through the lantern-hung Thunder Gate and a lively market street.", hours: '6:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://www.senso-ji.jp' },
  { id: 'tokyo-2', destinationId: 'tokyo', name: 'Shibuya Crossing', icon: '🚦', coordinates: { latitude: 35.6595, longitude: 139.7004 }, category: 'landmark', bio: 'The world\'s busiest pedestrian scramble, a mesmerizing surge of thousands beneath giant screens.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'tokyo-3', destinationId: 'tokyo', name: 'Tokyo Tower', icon: '📡', coordinates: { latitude: 35.6586, longitude: 139.7454 }, category: 'viewpoint', bio: 'A 333m red-and-white broadcasting tower inspired by the Eiffel, with observation decks over the city.', hours: '9:00 AM – 11:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 1200, costMax: 3000, currency: 'JPY', ticketUrl: 'https://www.tokyotower.co.jp' },
  // Kyoto
  { id: 'kyoto-1', destinationId: 'kyoto', name: 'Fushimi Inari Shrine', icon: '⛩️', coordinates: { latitude: 34.9671, longitude: 135.7727 }, category: 'religious', bio: 'A mountainside shrine famed for thousands of vermilion torii gates forming tunnels up the hillside.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true, ticketUrl: 'https://inari.jp' },
  { id: 'kyoto-2', destinationId: 'kyoto', name: 'Arashiyama Bamboo', icon: '🎋', coordinates: { latitude: 35.0094, longitude: 135.6706 }, category: 'nature', bio: 'A dreamlike grove where towering bamboo stalks sway and creak, filtering the light to a green glow.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'kyoto-3', destinationId: 'kyoto', name: 'Kinkaku-ji', icon: '🥇', coordinates: { latitude: 35.0394, longitude: 135.7292 }, category: 'religious', bio: 'The Golden Pavilion, a Zen temple sheathed in gold leaf and mirrored in its tranquil reflecting pond.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 500, costMax: 500, currency: 'JPY', ticketUrl: 'https://www.shokoku-ji.jp' },
  // Osaka
  { id: 'osaka-1', destinationId: 'osaka', name: 'Osaka Castle', icon: '🏯', coordinates: { latitude: 34.6873, longitude: 135.5259 }, category: 'historic', bio: 'A grand five-storey castle amid moats and cherry trees, a symbol of Japan\'s 16th-century unification.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 600, costMax: 600, currency: 'JPY', ticketUrl: 'https://www.osakacastle.net' },
  { id: 'osaka-2', destinationId: 'osaka', name: 'Dotonbori', icon: '🎡', coordinates: { latitude: 34.6687, longitude: 135.5013 }, category: 'entertainment', bio: 'A neon-drenched canal district of giant signboards, street food, and the famous Glico running man.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  // Sydney
  { id: 'sydney-1', destinationId: 'sydney', name: 'Opera House', icon: '🎭', coordinates: { latitude: -33.8568, longitude: 151.2153 }, category: 'landmark', bio: 'The sail-shelled performing arts centre on the harbour, one of the 20th century\'s great buildings.', hours: '9:00 AM – 5:00 PM (tours)', visitHoursMin: 1, visitHoursMax: 2, costMin: 45, costMax: 45, currency: 'AUD', ticketUrl: 'https://www.sydneyoperahouse.com' },
  { id: 'sydney-2', destinationId: 'sydney', name: 'Harbour Bridge', icon: '🌉', coordinates: { latitude: -33.8523, longitude: 151.2108 }, category: 'landmark', bio: 'The "Coathanger", a colossal steel arch you can climb for unrivalled views across Sydney Harbour.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  { id: 'sydney-3', destinationId: 'sydney', name: 'Bondi Beach', icon: '🏄', coordinates: { latitude: -33.8908, longitude: 151.2743 }, category: 'beach', bio: 'Australia\'s most famous beach, a golden crescent of surf, sand, and a scenic clifftop coastal walk.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true },
  // Great Barrier Reef
  { id: 'great-barrier-reef-1', destinationId: 'great-barrier-reef', name: 'Heart Reef', icon: '❤️', coordinates: { latitude: -20.0000, longitude: 149.0000 }, category: 'nature', bio: 'A naturally heart-shaped coral formation in the Whitsundays, best admired on a scenic flight.', hours: 'Scenic flights daytime', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 300, costMax: 600, currency: 'AUD' },
  { id: 'great-barrier-reef-2', destinationId: 'great-barrier-reef', name: 'Whitehaven Beach', icon: '🏖️', coordinates: { latitude: -20.2739, longitude: 149.0366 }, category: 'beach', bio: '7km of pure silica sand so white it barely warms, swirling with turquoise tides at Hill Inlet.', hours: 'Open 24 hours', visitHoursMin: 2.5, visitHoursMax: 3.5, free: true },
  { id: 'great-barrier-reef-3', destinationId: 'great-barrier-reef', name: 'Coral Gardens', icon: '🐠', coordinates: { latitude: -18.2871, longitude: 147.6992 }, category: 'nature', bio: 'Vibrant snorkelling and dive sites teeming with tropical fish across the world\'s largest reef system.', hours: 'Daytime tours', visitHoursMin: 2.5, visitHoursMax: 3.5, free: true },
  // ── New Zealand — South Island ─────────────────────────────────────────────
  // Christchurch
  { id: 'christchurch-1', destinationId: 'christchurch', name: 'Christchurch Botanic Gardens', icon: '🌳', coordinates: { latitude: -43.5307, longitude: 172.6206 }, category: 'nature', bio: 'Twenty-one hectares of heritage trees, rose gardens and glasshouses wrapped in a loop of the Avon River.', hours: '7:00 AM – 8:30 PM', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://ccc.govt.nz/parks-and-gardens/christchurch-botanic-gardens' },
  { id: 'christchurch-2', destinationId: 'christchurch', name: 'Avon River / Ōtākaro', icon: '🛶', coordinates: { latitude: -43.5361, longitude: 172.6250 }, category: 'entertainment', bio: 'Glide past willows and the Botanic Gardens in a flat-bottomed punt, poled by a boater in Edwardian dress.', hours: '9:00 AM – 6:00 PM', visitHoursMin: 0.5, visitHoursMax: 1, costMin: 40, costMax: 40, currency: 'NZD', ticketUrl: 'https://www.christchurchattractions.nz' },
  { id: 'christchurch-3', destinationId: 'christchurch', name: 'Christchurch Art Gallery', icon: '🖼️', coordinates: { latitude: -43.5308, longitude: 172.6312 }, category: 'museum', bio: "Te Puna o Waiwhetū, a striking glass-fronted gallery holding the region's finest New Zealand and international art.", hours: '10:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://christchurchartgallery.org.nz' },
  { id: 'christchurch-4', destinationId: 'christchurch', name: 'The Arts Centre, Christchurch', icon: '🏛️', coordinates: { latitude: -43.5310, longitude: 172.6262 }, category: 'historic', bio: 'A Gothic Revival former university campus, painstakingly restored after the earthquakes and now home to galleries, cafés and markets.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://www.artscentre.org.nz' },
  { id: 'christchurch-5', destinationId: 'christchurch', name: 'Cardboard Cathedral', icon: '⛪', coordinates: { latitude: -43.5339, longitude: 172.6430 }, category: 'religious', bio: "Shigeru Ban's A-frame 'transitional' cathedral, built from giant cardboard tubes after the 2011 earthquake.", hours: '9:00 AM – 5:00 PM', visitHoursMin: 0.5, visitHoursMax: 1, free: true, ticketUrl: 'https://www.cardboardcathedral.org.nz' },
  { id: 'christchurch-6', destinationId: 'christchurch', name: 'New Regent Street', icon: '🏘️', coordinates: { latitude: -43.5300, longitude: 172.6370 }, category: 'historic', bio: 'A pastel-painted 1930s Spanish Mission street of cafés and boutiques, with the heritage tram running down the middle.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'christchurch-7', destinationId: 'christchurch', name: 'Riverside Market', icon: '🛍️', coordinates: { latitude: -43.5335, longitude: 172.6326 }, category: 'market', bio: 'A buzzing indoor market hall of food stalls, bakeries, bars and local produce on the banks of the Avon.', hours: '9:00 AM – 6:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://riverside.nz' },
  { id: 'christchurch-8', destinationId: 'christchurch', name: 'International Antarctic Centre', icon: '🐧', coordinates: { latitude: -43.4887, longitude: 172.5470 }, category: 'museum', bio: 'Brave a polar storm room, ride an all-terrain Hägglund and meet rescued little blue penguins beside the airport.', hours: '9:00 AM – 5:30 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 69, costMax: 79, currency: 'NZD', ticketUrl: 'https://www.iceberg.co.nz' },
  { id: 'christchurch-9', destinationId: 'christchurch', name: 'Christchurch Gondola', icon: '🚡', coordinates: { latitude: -43.5826, longitude: 172.7083 }, category: 'viewpoint', bio: 'A cable car up the Port Hills to views over the city, Lyttelton Harbour, the Canterbury Plains and the Alps.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 35, costMax: 35, currency: 'NZD', ticketUrl: 'https://www.christchurchattractions.nz' },
  // Akaroa
  { id: 'akaroa-1', destinationId: 'akaroa', name: 'Akaroa Harbour', icon: '🐬', coordinates: { latitude: -43.8300, longitude: 172.9500 }, category: 'nature', bio: "A flooded volcanic crater where cruises spot — and small groups swim with — rare Hector's dolphins beneath towering cliffs.", hours: 'Daytime cruises', visitHoursMin: 2, visitHoursMax: 3, costMin: 95, costMax: 195, currency: 'NZD' },
  { id: 'akaroa-2', destinationId: 'akaroa', name: "The Giant's House", icon: '🎨', coordinates: { latitude: -43.8035, longitude: 172.9700 }, category: 'entertainment', bio: 'An 1880 house whose terraced gardens burst with sparkling mosaic sculptures by artist Josie Martin.', hours: '12:00 PM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 25, costMax: 25, currency: 'NZD', ticketUrl: 'https://www.thegiantshouse.co.nz' },
  { id: 'akaroa-3', destinationId: 'akaroa', name: 'Akaroa Lighthouse', icon: '🗼', coordinates: { latitude: -43.8100, longitude: 172.9650 }, category: 'historic', bio: 'A white timber lighthouse, moved from the harbour heads to the waterfront and now the emblem of the village.', hours: 'Exterior viewing anytime', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'akaroa-4', destinationId: 'akaroa', name: 'Akaroa Museum', icon: '🏛️', coordinates: { latitude: -43.8040, longitude: 172.9680 }, category: 'museum', bio: "Small but rich in stories of the peninsula's Ngāi Tahu, French and British settlers, including an 1858 courthouse.", hours: '10:30 AM – 4:00 PM', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  // Kaikōura
  { id: 'kaikoura-1', destinationId: 'kaikoura', name: 'Whale Watch Kaikōura', icon: '🐋', coordinates: { latitude: -42.4085, longitude: 173.6813 }, category: 'nature', bio: 'Māori-owned boat trips over the Kaikōura Canyon to see giant sperm whales surface, blow and dive.', hours: '7:15 AM – 3:30 PM (departures)', visitHoursMin: 3, visitHoursMax: 3.5, costMin: 165, costMax: 165, currency: 'NZD', ticketUrl: 'https://www.whalewatch.co.nz' },
  { id: 'kaikoura-2', destinationId: 'kaikoura', name: 'Kaikōura Peninsula Walkway', icon: '🥾', coordinates: { latitude: -42.4210, longitude: 173.7130 }, category: 'hike', bio: 'A clifftop and shoreline loop past fur seal haul-outs, with the Seaward Kaikōura Range behind.', hours: 'Open 24 hours', visitHoursMin: 2.5, visitHoursMax: 4, free: true },
  { id: 'kaikoura-3', destinationId: 'kaikoura', name: 'Ohau Point', icon: '🦭', coordinates: { latitude: -42.2470, longitude: 173.8290 }, category: 'viewpoint', bio: 'A roadside lookout over a large New Zealand fur seal colony, with pups playing in the rock pools in summer.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'kaikoura-4', destinationId: 'kaikoura', name: 'Fyffe House', icon: '🏚️', coordinates: { latitude: -42.4182, longitude: 173.7041 }, category: 'historic', bio: "Kaikōura's oldest surviving building, an 1840s whaling cottage built on foundations of whale bone.", hours: '10:00 AM – 4:00 PM', visitHoursMin: 0.5, visitHoursMax: 1, costMin: 10, costMax: 10, currency: 'NZD', ticketUrl: 'https://www.heritage.org.nz' },
  { id: 'kaikoura-5', destinationId: 'kaikoura', name: 'Mount Fyffe', icon: '⛰️', coordinates: { latitude: -42.3210, longitude: 173.6230 }, category: 'hike', bio: 'A long, steep climb to a 1,602 m summit with views along the coast and out over the Pacific.', hours: 'Open 24 hours', visitHoursMin: 6, visitHoursMax: 8, free: true },
  // Hanmer Springs
  { id: 'hanmer-springs-1', destinationId: 'hanmer-springs', name: 'Hanmer Springs Thermal Pools', icon: '♨️', coordinates: { latitude: -42.5226, longitude: 172.8281 }, category: 'entertainment', bio: 'Open-air rock pools, sulphur pools and waterslides fed by natural thermal springs beneath the mountains.', hours: '10:00 AM – 9:00 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 39, costMax: 39, currency: 'NZD', ticketUrl: 'https://hanmersprings.co.nz' },
  { id: 'hanmer-springs-2', destinationId: 'hanmer-springs', name: 'Conical Hill', icon: '🥾', coordinates: { latitude: -42.5150, longitude: 172.8340 }, category: 'hike', bio: 'A short zigzag climb through forest to a lookout over the village and the Hanmer Basin.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'hanmer-springs-3', destinationId: 'hanmer-springs', name: 'Waiau Ferry Bridge', icon: '🌉', coordinates: { latitude: -42.5600, longitude: 172.8530 }, category: 'landmark', bio: 'A historic bridge over the Waiau Gorge, base for bungy jumps and jet-boat rides through the canyon.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 2, free: true },
  // Arthur's Pass
  { id: 'arthurs-pass-1', destinationId: 'arthurs-pass', name: 'TranzAlpine', icon: '🚂', coordinates: { latitude: -42.9403, longitude: 171.5627 }, category: 'entertainment', bio: 'One of the world\'s great train journeys, crossing the Canterbury Plains and Southern Alps from Christchurch to Greymouth.', hours: 'Departs Christchurch 8:15 AM', visitHoursMin: 5, visitHoursMax: 10, costMin: 159, costMax: 249, currency: 'NZD', ticketUrl: 'https://www.greatjourneysnz.com/tranzalpine' },
  { id: 'arthurs-pass-2', destinationId: 'arthurs-pass', name: 'Avalanche Peak', icon: '⛰️', coordinates: { latitude: -42.9300, longitude: 171.5450 }, category: 'hike', bio: 'A steep, rewarding climb from the village to a summit facing glaciers on Mount Rolleston — kea are often for company.', hours: 'Open 24 hours', visitHoursMin: 6, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/canterbury/places/arthurs-pass-national-park/' },
  { id: 'arthurs-pass-3', destinationId: 'arthurs-pass', name: 'Devils Punchbowl Falls', icon: '💦', coordinates: { latitude: -42.9285, longitude: 171.5690 }, category: 'hike', bio: 'A short walk through beech forest to a 131 m waterfall plunging off the valley wall.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/canterbury/places/arthurs-pass-national-park/' },
  // Lake Tekapo
  { id: 'lake-tekapo-1', destinationId: 'lake-tekapo', name: 'Church of the Good Shepherd', icon: '⛪', coordinates: { latitude: -44.0049, longitude: 170.4836 }, category: 'religious', bio: 'A little 1935 stone church on the lakeshore whose altar window frames the turquoise water and mountains.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'lake-tekapo-2', destinationId: 'lake-tekapo', name: 'Mount John University Observatory', icon: '🔭', coordinates: { latitude: -43.9856, longitude: 170.4650 }, category: 'viewpoint', bio: "New Zealand's premier observatory, on a summit with 360° views over the Mackenzie Basin by day.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'lake-tekapo-3', destinationId: 'lake-tekapo', name: 'Dark Sky Project', icon: '🌌', coordinates: { latitude: -44.0040, longitude: 170.4780 }, category: 'entertainment', bio: 'Guided stargazing at the Mount John observatory, plus an indoor astronomy experience on the lakefront.', hours: 'Night tours from dusk', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 40, costMax: 199, currency: 'NZD', ticketUrl: 'https://darkskyproject.co.nz' },
  { id: 'lake-tekapo-4', destinationId: 'lake-tekapo', name: 'Tekapo Springs', icon: '♨️', coordinates: { latitude: -43.9930, longitude: 170.4700 }, category: 'entertainment', bio: 'Hot pools with mountain views, plus winter ice skating and snow tubing at the foot of Mount John.', hours: '10:00 AM – 9:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 32, costMax: 32, currency: 'NZD', ticketUrl: 'https://tekaposprings.co.nz' },
  // Aoraki / Mount Cook
  { id: 'aoraki-mount-cook-1', destinationId: 'aoraki-mount-cook', name: 'Hooker Valley Track', icon: '🥾', coordinates: { latitude: -43.7186, longitude: 170.0936 }, category: 'hike', bio: 'An easy, spectacular walk over three swing bridges to an iceberg-dotted lake at the foot of Aoraki / Mount Cook.', hours: 'Open 24 hours', visitHoursMin: 3, visitHoursMax: 3.5, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/canterbury/places/aoraki-mount-cook-national-park/' },
  { id: 'aoraki-mount-cook-2', destinationId: 'aoraki-mount-cook', name: 'Tasman Glacier', icon: '🧊', coordinates: { latitude: -43.6930, longitude: 170.1720 }, category: 'viewpoint', bio: "New Zealand's longest glacier, viewed over its terminal lake from a short climb, or up close by boat among icebergs.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/canterbury/places/aoraki-mount-cook-national-park/' },
  { id: 'aoraki-mount-cook-3', destinationId: 'aoraki-mount-cook', name: 'Mueller Hut', icon: '🛖', coordinates: { latitude: -43.7208, longitude: 170.0656 }, category: 'hike', bio: 'A tough climb up the Sealy Tarns steps to an alpine hut facing hanging glaciers and the summit of Aoraki.', hours: 'Open 24 hours', visitHoursMin: 6, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/canterbury/places/aoraki-mount-cook-national-park/' },
  { id: 'aoraki-mount-cook-4', destinationId: 'aoraki-mount-cook', name: 'Sir Edmund Hillary Alpine Centre', icon: '🧗', coordinates: { latitude: -43.7346, longitude: 170.0957 }, category: 'museum', bio: "A museum and planetarium at The Hermitage celebrating Hillary's life and the region's climbing history.", hours: '7:00 AM – 8:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 20, costMax: 20, currency: 'NZD', ticketUrl: 'https://www.hermitage.co.nz' },
  { id: 'aoraki-mount-cook-5', destinationId: 'aoraki-mount-cook', name: 'Lake Pukaki', icon: '💧', coordinates: { latitude: -44.0500, longitude: 170.1700 }, category: 'viewpoint', bio: 'A vast glacial lake of startling blue, with Aoraki / Mount Cook rising at the head of the valley.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  // Queenstown
  { id: 'queenstown-1', destinationId: 'queenstown', name: 'Skyline Queenstown', icon: '🚡', coordinates: { latitude: -45.0298, longitude: 168.6487 }, category: 'viewpoint', bio: 'A gondola up Bob\'s Peak to the classic view over Lake Wakatipu and the Remarkables, with luge tracks at the top.', hours: '9:00 AM – 9:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 59, costMax: 85, currency: 'NZD', ticketUrl: 'https://www.skyline.co.nz/queenstown' },
  { id: 'queenstown-2', destinationId: 'queenstown', name: 'Kawarau Gorge Suspension Bridge', icon: '🪂', coordinates: { latitude: -45.0105, longitude: 168.8902 }, category: 'landmark', bio: "The 1880 bridge where AJ Hackett launched the world's first commercial bungy jump, 43 m above the river.", hours: '9:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 205, costMax: 275, currency: 'NZD', ticketUrl: 'https://www.bungy.co.nz' },
  { id: 'queenstown-3', destinationId: 'queenstown', name: 'Shotover Jet', icon: '🚤', coordinates: { latitude: -44.9960, longitude: 168.6840 }, category: 'entertainment', bio: 'A high-speed jet boat that spins and skims past the rock walls of the narrow Shotover River canyons.', hours: '8:30 AM – 5:30 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 159, costMax: 159, currency: 'NZD', ticketUrl: 'https://www.shotoverjet.com' },
  { id: 'queenstown-4', destinationId: 'queenstown', name: 'TSS Earnslaw', icon: '🛳️', coordinates: { latitude: -45.0346, longitude: 168.6595 }, category: 'entertainment', bio: 'A century-old coal-fired steamship cruising Lake Wakatipu to Walter Peak high-country farm.', hours: '10:00 AM – 6:00 PM (sailings)', visitHoursMin: 1.5, visitHoursMax: 3.5, costMin: 85, costMax: 85, currency: 'NZD', ticketUrl: 'https://www.realnz.com' },
  { id: 'queenstown-5', destinationId: 'queenstown', name: 'Arrowtown', icon: '🍂', coordinates: { latitude: -44.9410, longitude: 168.8310 }, category: 'historic', bio: 'A gold-rush village of heritage cottages and a restored Chinese miners\' settlement, ablaze with colour in autumn.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true },
  { id: 'queenstown-7', destinationId: 'queenstown', name: 'Ben Lomond Track', icon: '🥾', coordinates: { latitude: -44.9900, longitude: 168.6250 }, category: 'hike', bio: 'A big climb from the top of the gondola to a 1,748 m summit with views across the lake and the Southern Alps.', hours: 'Open 24 hours', visitHoursMin: 6, visitHoursMax: 8, free: true },
  { id: 'queenstown-8', destinationId: 'queenstown', name: 'Queenstown Gardens', icon: '🌳', coordinates: { latitude: -45.0381, longitude: 168.6630 }, category: 'nature', bio: 'A lakeside peninsula of lawns, rose beds and a frisbee-golf course, with the Remarkables framed across the water.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1.5, free: true },
  { id: 'queenstown-9', destinationId: 'queenstown', name: 'Gibbston Valley', icon: '🍷', coordinates: { latitude: -45.0160, longitude: 168.9400 }, category: 'nature', bio: 'A narrow river valley of Pinot Noir vineyards, with cellar doors and a wine cave carved into the hillside.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 2, visitHoursMax: 4, free: true },
  // Wānaka
  { id: 'wanaka-1', destinationId: 'wanaka', name: 'That Wānaka Tree', icon: '🌳', coordinates: { latitude: -44.6998, longitude: 169.1199 }, category: 'landmark', bio: 'A lone willow growing out of Lake Wānaka, at its most magical at dawn with the mountains reflected behind it.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'wanaka-2', destinationId: 'wanaka', name: 'Roys Peak', icon: '⛰️', coordinates: { latitude: -44.6982, longitude: 169.0981 }, category: 'hike', bio: 'A steep, exposed climb to a ridge with the famous view over Lake Wānaka and Mount Aspiring. Closed 1 Oct – 10 Nov.', hours: 'Open 24 hours', visitHoursMin: 5, visitHoursMax: 6, free: true },
  { id: 'wanaka-4', destinationId: 'wanaka', name: 'Puzzling World', icon: '🧩', coordinates: { latitude: -44.6950, longitude: 169.1600 }, category: 'entertainment', bio: 'A leaning clock tower, a two-storey maze and rooms of mind-bending optical illusions.', hours: '8:30 AM – 5:30 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 25, costMax: 25, currency: 'NZD', ticketUrl: 'https://www.puzzlingworld.co.nz' },
  { id: 'wanaka-5', destinationId: 'wanaka', name: 'Mount Iron', icon: '🥾', coordinates: { latitude: -44.6990, longitude: 169.1660 }, category: 'hike', bio: 'A short climb over a glacier-carved knoll to a summit overlooking the town, the lake and the Clutha River.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'wanaka-7', destinationId: 'wanaka', name: 'Cardrona Hotel', icon: '🍺', coordinates: { latitude: -44.8750, longitude: 169.0060 }, category: 'historic', bio: 'An 1863 gold-rush hotel on the Crown Range road, one of the oldest in New Zealand, with a sunny garden bar.', hours: '10:00 AM – 10:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Fiordland
  { id: 'fiordland-1', destinationId: 'fiordland', name: 'Milford Sound', icon: '🛳️', coordinates: { latitude: -44.6414, longitude: 167.8974 }, category: 'nature', bio: 'The legendary fiord where Mitre Peak rises from black water and waterfalls pour off sheer granite walls.', hours: 'Cruises 8:30 AM – 4:30 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 75, costMax: 150, currency: 'NZD' },
  { id: 'fiordland-2', destinationId: 'fiordland', name: 'Doubtful Sound', icon: '🌊', coordinates: { latitude: -45.3000, longitude: 166.9800 }, category: 'nature', bio: 'A vast, remote fiord reached by boat and bus over Wilmot Pass — deeper, quieter and wilder than Milford.', hours: 'Day cruises from Manapōuri', visitHoursMin: 7, visitHoursMax: 8, costMin: 280, costMax: 350, currency: 'NZD' },
  { id: 'fiordland-3', destinationId: 'fiordland', name: 'Mirror Lakes', icon: '🪞', coordinates: { latitude: -44.9900, longitude: 168.0400 }, category: 'viewpoint', bio: 'Small still tarns on the Milford Road that perfectly reflect the Earl Mountains on calm mornings.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'fiordland-4', destinationId: 'fiordland', name: 'Homer Tunnel', icon: '🚇', coordinates: { latitude: -44.7650, longitude: 167.9900 }, category: 'landmark', bio: 'A rough-hewn, 1.2 km tunnel bored through the mountains on the road to Milford, beneath towering cirque walls.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'fiordland-5', destinationId: 'fiordland', name: 'Te Anau Glowworm Caves', icon: '✨', coordinates: { latitude: -45.3500, longitude: 167.6700 }, category: 'nature', bio: 'A boat across Lake Te Anau leads to young limestone caves where a silent punt drifts beneath glowworm grottos.', hours: 'Tours 10:00 AM – 8:00 PM', visitHoursMin: 2, visitHoursMax: 2.5, costMin: 109, costMax: 109, currency: 'NZD', ticketUrl: 'https://www.realnz.com' },
  { id: 'fiordland-6', destinationId: 'fiordland', name: 'Milford Track', icon: '🥾', coordinates: { latitude: -44.9330, longitude: 167.9440 }, category: 'hike', bio: "The 'finest walk in the world', a four-day Great Walk over Mackinnon Pass past Sutherland Falls to Milford Sound.", hours: 'Great Walk season Oct – Apr', visitHoursMin: 6, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/fiordland/places/fiordland-national-park/' },
  { id: 'fiordland-7', destinationId: 'fiordland', name: 'Kepler Track', icon: '⛰️', coordinates: { latitude: -45.4400, longitude: 167.6900 }, category: 'hike', bio: 'A Great Walk loop from Te Anau along an exposed alpine ridge high above the lakes, walkable in day sections.', hours: 'Open 24 hours', visitHoursMin: 4, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/fiordland/places/fiordland-national-park/' },
  { id: 'fiordland-8', destinationId: 'fiordland', name: 'Routeburn Track', icon: '🏔️', coordinates: { latitude: -44.8250, longitude: 168.1200 }, category: 'hike', bio: 'An alpine Great Walk between Fiordland and Mount Aspiring; from The Divide, Key Summit makes a superb day hike.', hours: 'Open 24 hours', visitHoursMin: 3, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/fiordland/places/fiordland-national-park/' },
  { id: 'fiordland-9', destinationId: 'fiordland', name: 'Te Anau', icon: '🏡', coordinates: { latitude: -45.4143, longitude: 167.718 }, category: 'landmark', bio: 'The lakeside town that is the main base for Fiordland, Milford Sound and the Kepler Track.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  // Dunedin
  { id: 'dunedin-1', destinationId: 'dunedin', name: 'Dunedin Railway Station', icon: '🚉', coordinates: { latitude: -45.8754, longitude: 170.5080 }, category: 'historic', bio: "A Flemish Renaissance gem of basalt and limestone, with a mosaic-floored hall — New Zealand's most photographed building.", hours: 'Exterior viewing anytime', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'dunedin-2', destinationId: 'dunedin', name: 'Larnach Castle', icon: '🏰', coordinates: { latitude: -45.8617, longitude: 170.6283 }, category: 'historic', bio: 'A Gothic Revival mansion high on the Otago Peninsula, with lavish interiors and celebrated gardens.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 45, costMax: 45, currency: 'NZD', ticketUrl: 'https://www.larnachcastle.co.nz' },
  { id: 'dunedin-3', destinationId: 'dunedin', name: 'Royal Albatross Centre', icon: '🪽', coordinates: { latitude: -45.7742, longitude: 170.7290 }, category: 'nature', bio: "At Taiaroa Head, a hide overlooks the world's only mainland breeding colony of northern royal albatross.", hours: '10:00 AM – 5:00 PM', visitHoursMin: 1.5, visitHoursMax: 2, costMin: 25, costMax: 60, currency: 'NZD', ticketUrl: 'https://albatross.org.nz' },
  { id: 'dunedin-4', destinationId: 'dunedin', name: 'Penguin Place', icon: '🐧', coordinates: { latitude: -45.8000, longitude: 170.7000 }, category: 'nature', bio: 'A conservation reserve where trenches and hides bring you close to endangered yellow-eyed penguins.', hours: 'Guided tours daily', visitHoursMin: 1.5, visitHoursMax: 2, costMin: 65, costMax: 65, currency: 'NZD', ticketUrl: 'https://www.penguinplace.co.nz' },
  { id: 'dunedin-5', destinationId: 'dunedin', name: 'Otago Museum', icon: '🦕', coordinates: { latitude: -45.8656, longitude: 170.5107 }, category: 'museum', bio: 'Natural history, Pacific and Māori cultures, a tropical butterfly house and a planetarium beside the university.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true, ticketUrl: 'https://otagomuseum.nz' },
  { id: 'dunedin-6', destinationId: 'dunedin', name: 'Toitū Otago Settlers Museum', icon: '🏛️', coordinates: { latitude: -45.8743, longitude: 170.5050 }, category: 'museum', bio: 'The story of Otago told through Māori, Scottish and Chinese settlers, vintage trams and a hall of portraits.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://www.toitu.co.nz' },
  { id: 'dunedin-7', destinationId: 'dunedin', name: 'Baldwin Street', icon: '⛰️', coordinates: { latitude: -45.8494, longitude: 170.5330 }, category: 'landmark', bio: "A short residential street so steep it has held the title of the world's steepest — walk up if you dare.", hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'dunedin-8', destinationId: 'dunedin', name: 'Tunnel Beach', icon: '🏖️', coordinates: { latitude: -45.9206, longitude: 170.4588 }, category: 'beach', bio: 'Sandstone sea arches and a hand-carved Victorian tunnel leading down to a hidden cove.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'dunedin-9', destinationId: 'dunedin', name: 'Sandfly Bay', icon: '🦭', coordinates: { latitude: -45.8960, longitude: 170.6440 }, category: 'beach', bio: 'Giant sand dunes tumble down to a wild beach where New Zealand sea lions often doze on the sand.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Oamaru
  { id: 'oamaru-1', destinationId: 'oamaru', name: 'Oamaru Blue Penguin Colony', icon: '🐧', coordinates: { latitude: -45.1090, longitude: 170.9840 }, category: 'nature', bio: "From a grandstand at dusk, watch rafts of little blue penguins — the world's smallest — come ashore and waddle home.", hours: 'Evening viewing from dusk', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 45, costMax: 60, currency: 'NZD', ticketUrl: 'https://www.penguins.co.nz' },
  { id: 'oamaru-2', destinationId: 'oamaru', name: 'Oamaru Victorian Precinct', icon: '🏛️', coordinates: { latitude: -45.1000, longitude: 170.9710 }, category: 'historic', bio: 'Grand whitestone warehouses and banks from the 1870s, now filled with craftspeople, booksellers and bars.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'oamaru-3', destinationId: 'oamaru', name: 'Steampunk HQ', icon: '⚙️', coordinates: { latitude: -45.0994, longitude: 170.9705 }, category: 'entertainment', bio: 'A clanking, smoking museum of retro-futurist machines, with a steam locomotive out front and a mirrored infinity room.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 15, costMax: 15, currency: 'NZD', ticketUrl: 'https://www.steampunkoamaru.co.nz' },
  { id: 'oamaru-4', destinationId: 'oamaru', name: 'Moeraki Boulders', icon: '🪨', coordinates: { latitude: -45.3453, longitude: 170.8270 }, category: 'nature', bio: 'Huge, almost perfectly spherical boulders scattered along Koekohe Beach, formed over millions of years.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'oamaru-5', destinationId: 'oamaru', name: 'Bushy Beach', icon: '🏖️', coordinates: { latitude: -45.1167, longitude: 170.9800 }, category: 'beach', bio: 'A clifftop hide above a beach where rare yellow-eyed penguins come ashore in the late afternoon.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  // The Catlins
  { id: 'catlins-1', destinationId: 'catlins', name: 'Nugget Point', icon: '🗼', coordinates: { latitude: -46.4473, longitude: 169.8140 }, category: 'viewpoint', bio: 'A lighthouse on a knife-edge headland above a scatter of rocky islets, with fur seals below.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1, free: true },
  { id: 'catlins-2', destinationId: 'catlins', name: 'Purakaunui Falls', icon: '💦', coordinates: { latitude: -46.5440, longitude: 169.6160 }, category: 'nature', bio: 'A graceful three-tiered waterfall reached by a short walk through podocarp forest.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'catlins-3', destinationId: 'catlins', name: 'Cathedral Caves', icon: '🕳️', coordinates: { latitude: -46.5960, longitude: 169.3700 }, category: 'nature', bio: 'Vast sea caves 30 m high on Waipati Beach, only reachable for a couple of hours either side of low tide.', hours: 'Around low tide (Nov – May)', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 10, costMax: 10, currency: 'NZD', ticketUrl: 'https://www.cathedralcaves.co.nz' },
  { id: 'catlins-4', destinationId: 'catlins', name: 'McLean Falls', icon: '💦', coordinates: { latitude: -46.6100, longitude: 169.3500 }, category: 'nature', bio: 'The tallest waterfall in the Catlins, cascading 22 m through lush rainforest.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1, free: true },
  { id: 'catlins-5', destinationId: 'catlins', name: 'Curio Bay', icon: '🪵', coordinates: { latitude: -46.6630, longitude: 169.1000 }, category: 'nature', bio: "A 180-million-year-old petrified forest revealed at low tide, with yellow-eyed penguins and Hector's dolphins nearby.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'catlins-6', destinationId: 'catlins', name: 'Slope Point', icon: '🧭', coordinates: { latitude: -46.6730, longitude: 169.0010 }, category: 'viewpoint', bio: 'The southernmost point of the South Island, marked by a signpost amid wind-sculpted, sideways-growing trees.', hours: 'Closed Sep – Nov (lambing)', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  // Stewart Island
  { id: 'stewart-island-1', destinationId: 'stewart-island', name: 'Ulva Island', icon: '🐦', coordinates: { latitude: -46.9300, longitude: 168.1300 }, category: 'nature', bio: 'A predator-free open sanctuary where saddleback, rifleman and Stewart Island robins flit around your feet.', hours: 'Daytime water taxis', visitHoursMin: 2, visitHoursMax: 4, free: true },
  { id: 'stewart-island-2', destinationId: 'stewart-island', name: 'Rakiura Track', icon: '🥾', coordinates: { latitude: -46.9100, longitude: 168.1000 }, category: 'hike', bio: 'A three-day Great Walk loop through rimu forest and along golden beaches from Oban.', hours: 'Open 24 hours', visitHoursMin: 4, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/southland/places/rakiura-national-park/' },
  { id: 'stewart-island-3', destinationId: 'stewart-island', name: 'Ackers Point', icon: '🗼', coordinates: { latitude: -46.8850, longitude: 168.1580 }, category: 'hike', bio: 'A coastal walk from Oban to a lighthouse where little blue penguins and sooty shearwaters return at dusk.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true },
  { id: 'stewart-island-4', destinationId: 'stewart-island', name: 'Observation Rock', icon: '🌅', coordinates: { latitude: -46.8980, longitude: 168.1200 }, category: 'viewpoint', bio: 'A short climb above Oban to a granite outcrop with sunset views over Paterson Inlet.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  { id: 'stewart-island-5', destinationId: 'stewart-island', name: 'Mason Bay', icon: '🥝', coordinates: { latitude: -46.9200, longitude: 167.7700 }, category: 'beach', bio: 'A remote 20 km beach of dunes on the wild west coast, where Stewart Island kiwi forage even by day.', hours: 'Open 24 hours', visitHoursMin: 3, visitHoursMax: 6, free: true },
  // Franz Josef
  { id: 'westland-tai-poutini-1', destinationId: 'westland-tai-poutini', name: 'Franz Josef Glacier', icon: '🧊', coordinates: { latitude: -43.4300, longitude: 170.1820 }, category: 'nature', bio: 'A glacier tumbling from the Southern Alps into rainforest — walk the valley to its viewpoint or heli-hike onto the ice.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 4, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/west-coast/places/westland-tai-poutini-national-park/' },
  { id: 'westland-tai-poutini-2', destinationId: 'westland-tai-poutini', name: 'Fox Glacier', icon: '🧊', coordinates: { latitude: -43.4950, longitude: 170.0400 }, category: 'nature', bio: "Franz Josef's twin, a 12 km river of ice whose valley walk shows how fast the glacier has retreated.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/west-coast/places/westland-tai-poutini-national-park/' },
  { id: 'westland-tai-poutini-3', destinationId: 'westland-tai-poutini', name: 'Lake Matheson', icon: '🪞', coordinates: { latitude: -43.4425, longitude: 169.9650 }, category: 'viewpoint', bio: 'A dark, still lake that mirrors Aoraki / Mount Cook and Mount Tasman on calm mornings.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'westland-tai-poutini-4', destinationId: 'westland-tai-poutini', name: 'Glacier Hot Pools', icon: '♨️', coordinates: { latitude: -43.3880, longitude: 170.1840 }, category: 'entertainment', bio: 'Hot pools set in the rainforest at the edge of the village, fed by glacier water.', hours: '1:00 PM – 9:00 PM', visitHoursMin: 1, visitHoursMax: 2, costMin: 32, costMax: 32, currency: 'NZD', ticketUrl: 'https://www.glacierhotpools.co.nz' },
  { id: 'westland-tai-poutini-5', destinationId: 'westland-tai-poutini', name: 'West Coast Wildlife Centre', icon: '🥝', coordinates: { latitude: -43.3870, longitude: 170.1820 }, category: 'nature', bio: "A hatchery raising rowi and Haast tokoeka — the world's rarest kiwi — with a nocturnal viewing house.", hours: '8:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 45, costMax: 45, currency: 'NZD', ticketUrl: 'https://wildkiwi.co.nz' },
  { id: 'westland-tai-poutini-6', destinationId: 'westland-tai-poutini', name: 'Okarito', icon: '🛶', coordinates: { latitude: -43.2240, longitude: 170.1600 }, category: 'nature', bio: "A tiny coastal hamlet on New Zealand's largest unmodified wetland, for kayaking, birdwatching and kiwi tours.", hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 4, free: true },
  // Hokitika
  { id: 'hokitika-1', destinationId: 'hokitika', name: 'Hokitika Gorge', icon: '💎', coordinates: { latitude: -42.9540, longitude: 171.0080 }, category: 'nature', bio: 'Milky turquoise water between white granite walls, crossed by a swing bridge in podocarp forest.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1, free: true },
  { id: 'hokitika-2', destinationId: 'hokitika', name: 'Hokitika Beach', icon: '🌅', coordinates: { latitude: -42.7150, longitude: 170.9590 }, category: 'beach', bio: 'A wild driftwood-strewn beach with a giant driftwood HOKITIKA sign and blazing Tasman Sea sunsets.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'hokitika-3', destinationId: 'hokitika', name: 'West Coast Treetop Walk', icon: '🌲', coordinates: { latitude: -42.8470, longitude: 170.9620 }, category: 'viewpoint', bio: 'A steel walkway 20 m up in the canopy of an ancient rimu and kāmahi forest, with a tower above.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 45, costMax: 45, currency: 'NZD', ticketUrl: 'https://www.treetopsnz.com' },
  { id: 'hokitika-4', destinationId: 'hokitika', name: 'Lake Kaniere', icon: '💧', coordinates: { latitude: -42.8300, longitude: 171.1400 }, category: 'nature', bio: 'A clear, forest-ringed lake with swimming, kayaking and the Dorothy Falls waterfall on its shore.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  { id: 'hokitika-5', destinationId: 'hokitika', name: 'Hokitika Glow-worm Dell', icon: '✨', coordinates: { latitude: -42.7090, longitude: 170.9660 }, category: 'nature', bio: 'A short path at the edge of town into a mossy dell that glitters with glowworms after dark.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  // Punakaiki
  { id: 'paparoa-1', destinationId: 'paparoa', name: 'Pancake Rocks', icon: '🥞', coordinates: { latitude: -42.1145, longitude: 171.3270 }, category: 'nature', bio: 'Layered limestone stacks like piles of pancakes, with blowholes that roar and spout at high tide.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/west-coast/places/paparoa-national-park/' },
  { id: 'paparoa-2', destinationId: 'paparoa', name: 'Truman Track', icon: '🥾', coordinates: { latitude: -42.0941, longitude: 171.3432 }, category: 'hike', bio: 'A short walk through coastal forest to a wild beach of caves, rock pools and a waterfall dropping onto the sand.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'paparoa-3', destinationId: 'paparoa', name: 'Pororari River Track', icon: '🌿', coordinates: { latitude: -42.1000, longitude: 171.3420 }, category: 'hike', bio: 'A riverside path beneath limestone cliffs and nīkau palms, through a gorge of deep green pools.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'paparoa-4', destinationId: 'paparoa', name: 'Paparoa Track', icon: '⛰️', coordinates: { latitude: -42.1010, longitude: 171.3410 }, category: 'hike', bio: 'A Great Walk and Great Ride over the Paparoa Range, ending down the Pororari gorge to the coast.', hours: 'Open 24 hours', visitHoursMin: 4, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/west-coast/places/paparoa-national-park/' },
  { id: 'paparoa-5', destinationId: 'paparoa', name: 'Punakaiki Cavern', icon: '🕳️', coordinates: { latitude: -42.1210, longitude: 171.3290 }, category: 'nature', bio: 'A roadside limestone cave you can explore by torchlight, with stalactites and glowworms.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  // Greymouth
  { id: 'greymouth-1', destinationId: 'greymouth', name: 'Shantytown Heritage Park', icon: '⛏️', coordinates: { latitude: -42.5280, longitude: 171.1720 }, category: 'historic', bio: 'A recreated 1860s gold-rush town with a steam train, sawmill and the chance to pan for real gold.', hours: '9:00 AM – 4:30 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 39, costMax: 39, currency: 'NZD', ticketUrl: 'https://www.shantytown.co.nz' },
  { id: 'greymouth-2', destinationId: 'greymouth', name: "Monteith's Brewery", icon: '🍺', coordinates: { latitude: -42.4520, longitude: 171.2060 }, category: 'entertainment', bio: "The original home of one of New Zealand's best-known beers, with brewery tours and a tasting bar.", hours: '11:00 AM – 8:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 30, costMax: 30, currency: 'NZD', ticketUrl: 'https://www.monteiths.co.nz' },
  { id: 'greymouth-3', destinationId: 'greymouth', name: 'Point Elizabeth Walkway', icon: '🥾', coordinates: { latitude: -42.3800, longitude: 171.2200 }, category: 'hike', bio: 'A coastal track through nīkau palms and rātā forest to a lookout over the Tasman Sea.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 3, free: true },
  // Westport
  { id: 'westport-1', destinationId: 'westport', name: 'Cape Foulwind', icon: '🦭', coordinates: { latitude: -41.7520, longitude: 171.4560 }, category: 'hike', bio: 'A windswept clifftop walkway from the lighthouse to the Tauranga Bay fur seal colony.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  { id: 'westport-2', destinationId: 'westport', name: 'Denniston Plateau', icon: '⛏️', coordinates: { latitude: -41.7400, longitude: 171.7950 }, category: 'historic', bio: "The remains of a hilltop coal town and its 'Eighth Wonder' incline, which lowered coal wagons down a sheer slope.", hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  { id: 'westport-3', destinationId: 'westport', name: 'Coaltown Museum', icon: '🏛️', coordinates: { latitude: -41.7550, longitude: 171.6020 }, category: 'museum', bio: "A modern museum telling the story of the West Coast's coal and gold mining, including a replica Denniston wagon.", hours: '9:00 AM – 4:30 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 20, costMax: 20, currency: 'NZD', ticketUrl: 'https://www.coaltown.co.nz' },
  // Nelson
  { id: 'nelson-1', destinationId: 'nelson', name: 'Tāhunanui Beach', icon: '🏖️', coordinates: { latitude: -41.2830, longitude: 173.2420 }, category: 'beach', bio: 'A huge, shallow sandy beach on the edge of the city, popular for swimming, kite-surfing and sunsets.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  { id: 'nelson-2', destinationId: 'nelson', name: 'Centre of New Zealand', icon: '📍', coordinates: { latitude: -41.2730, longitude: 173.2960 }, category: 'viewpoint', bio: 'A hilltop marker said to be the geographic centre of the country, with views across the city and Tasman Bay.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1, free: true },
  { id: 'nelson-3', destinationId: 'nelson', name: 'Nelson Market', icon: '🛍️', coordinates: { latitude: -41.2740, longitude: 173.2830 }, category: 'market', bio: 'A Saturday market in Montgomery Square packed with local artisans, growers and food stalls.', hours: '8:00 AM – 1:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, closedDays: [0, 1, 2, 3, 4, 5], free: true, ticketUrl: 'https://www.nelsonmarket.co.nz' },
  { id: 'nelson-4', destinationId: 'nelson', name: 'World of WearableArt and Classic Cars Museum', icon: '👗', coordinates: { latitude: -41.2950, longitude: 173.2370 }, category: 'museum', bio: 'Extravagant wearable-art garments from the famous WOW show, alongside a gleaming collection of classic cars.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 1.5, visitHoursMax: 2, costMin: 30, costMax: 30, currency: 'NZD', ticketUrl: 'https://www.wowcars.co.nz' },
  { id: 'nelson-5', destinationId: 'nelson', name: 'Christ Church Cathedral, Nelson', icon: '⛪', coordinates: { latitude: -41.2760, longitude: 173.2840 }, category: 'religious', bio: 'A grey marble cathedral atop Church Hill at the head of the main street, reached by a broad flight of steps.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'nelson-6', destinationId: 'nelson', name: 'Suter Art Gallery', icon: '🖼️', coordinates: { latitude: -41.2740, longitude: 173.2900 }, category: 'museum', bio: "One of New Zealand's oldest public galleries, beside Queens Gardens, with strong regional and Māori collections.", hours: '9:30 AM – 4:30 PM', visitHoursMin: 1, visitHoursMax: 1.5, free: true, ticketUrl: 'https://thesuter.org.nz' },
  // Abel Tasman
  { id: 'abel-tasman-1', destinationId: 'abel-tasman', name: 'Abel Tasman Coast Track', icon: '🥾', coordinates: { latitude: -41.0050, longitude: 173.0040 }, category: 'hike', bio: 'A Great Walk weaving through coastal forest between golden beaches, walkable as a day section or over five days.', hours: 'Open 24 hours', visitHoursMin: 3, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/nelson-tasman/places/abel-tasman-national-park/' },
  { id: 'abel-tasman-2', destinationId: 'abel-tasman', name: 'Split Apple Rock', icon: '🍎', coordinates: { latitude: -41.0340, longitude: 173.0470 }, category: 'landmark', bio: 'A giant granite boulder split cleanly in two, sitting in the shallows off a sandy cove.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'abel-tasman-3', destinationId: 'abel-tasman', name: 'Kaiteriteri', icon: '🏖️', coordinates: { latitude: -41.0380, longitude: 173.0170 }, category: 'beach', bio: 'A golden-sand resort beach and the main departure point for water taxis and kayak trips into the park.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  { id: 'abel-tasman-4', destinationId: 'abel-tasman', name: 'Anchorage Bay', icon: '⛵', coordinates: { latitude: -40.9600, longitude: 173.0500 }, category: 'beach', bio: 'A sweeping golden bay on the Coast Track, a popular drop-off with short walks to Te Pukatea Bay.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 4, free: true },
  { id: 'abel-tasman-5', destinationId: 'abel-tasman', name: "Cleopatra's Pool", icon: '💧', coordinates: { latitude: -40.9750, longitude: 173.0320 }, category: 'nature', bio: 'A clear forest rock pool with a natural moss-lined waterslide, a short detour off the Coast Track.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'abel-tasman-6', destinationId: 'abel-tasman', name: 'Tonga Island Marine Reserve', icon: '🦭', coordinates: { latitude: -40.8900, longitude: 173.0600 }, category: 'nature', bio: 'A protected stretch of sea where kayakers paddle alongside fur seal pups and dolphins.', hours: 'Daytime kayak tours', visitHoursMin: 3, visitHoursMax: 6, free: true },
  { id: 'abel-tasman-7', destinationId: 'abel-tasman', name: 'Totaranui', icon: '🏖️', coordinates: { latitude: -40.8220, longitude: 173.0060 }, category: 'beach', bio: 'A long, golden beach at the northern end of the park, with a large campground behind the dunes.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  // Golden Bay
  { id: 'golden-bay-1', destinationId: 'golden-bay', name: 'Te Waikoropupū Springs', icon: '💧', coordinates: { latitude: -40.8470, longitude: 172.7720 }, category: 'nature', bio: 'Sacred springs with some of the clearest fresh water ever measured, welling up in shades of blue and green.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'golden-bay-2', destinationId: 'golden-bay', name: 'Wharariki Beach', icon: '🏖️', coordinates: { latitude: -40.5000, longitude: 172.6800 }, category: 'beach', bio: 'A windswept beach of dunes, caves and the iconic Archway Islands, with seal pups in its rock pools.', hours: 'Open 24 hours', visitHoursMin: 1.5, visitHoursMax: 2.5, free: true },
  { id: 'golden-bay-3', destinationId: 'golden-bay', name: 'Farewell Spit', icon: '🏜️', coordinates: { latitude: -40.5300, longitude: 172.8800 }, category: 'nature', bio: 'A 30 km arc of sand dunes reaching into the sea, a bird sanctuary visited by guided 4WD tours.', hours: 'Guided tours (tide dependent)', visitHoursMin: 4, visitHoursMax: 6, costMin: 165, costMax: 165, currency: 'NZD', ticketUrl: 'https://www.farewellspit.com' },
  { id: 'golden-bay-4', destinationId: 'golden-bay', name: 'Labyrinth Rocks', icon: '🪨', coordinates: { latitude: -40.8780, longitude: 172.8280 }, category: 'nature', bio: 'A maze of narrow passages between weathered limestone outcrops, with little toys hidden in the crevices.', hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 1, free: true },
  { id: 'golden-bay-6', destinationId: 'golden-bay', name: 'Takaka', icon: '🏡', coordinates: { latitude: -40.8517, longitude: 172.8097 }, category: 'landmark', bio: "Golden Bay's laid-back main town of cafés, galleries and markets, and the base for the springs and beaches around it.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  // Marlborough Sounds
  { id: 'marlborough-sounds-1', destinationId: 'marlborough-sounds', name: 'Queen Charlotte Track', icon: '🥾', coordinates: { latitude: -41.1600, longitude: 174.1200 }, category: 'hike', bio: 'A 73 km ridgeline track between Ship Cove and Anakiwa, with sweeping views over sounds on both sides.', hours: 'Open 24 hours', visitHoursMin: 4, visitHoursMax: 8, costMin: 10, costMax: 25, currency: 'NZD', ticketUrl: 'https://www.qctrack.co.nz' },
  { id: 'marlborough-sounds-2', destinationId: 'marlborough-sounds', name: 'Ship Cove', icon: '⚓', coordinates: { latitude: -41.0940, longitude: 174.2380 }, category: 'historic', bio: "Meretoto, the sheltered cove where Captain Cook anchored on all three of his Pacific voyages.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'marlborough-sounds-3', destinationId: 'marlborough-sounds', name: 'Motuara Island', icon: '🐦', coordinates: { latitude: -41.0870, longitude: 174.2700 }, category: 'nature', bio: 'A predator-free bird sanctuary with a lookout tower, home to South Island saddleback and little spotted kiwi.', hours: 'Daytime boat trips', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'marlborough-sounds-4', destinationId: 'marlborough-sounds', name: 'Edwin Fox', icon: '⛵', coordinates: { latitude: -41.2900, longitude: 174.0050 }, category: 'museum', bio: "The hull of an 1853 sailing ship on Picton's foreshore — the last surviving ship to carry convicts to Australia.", hours: '9:00 AM – 5:00 PM', visitHoursMin: 1, visitHoursMax: 1, costMin: 15, costMax: 15, currency: 'NZD', ticketUrl: 'https://www.edwinfoxship.nz' },
  { id: 'marlborough-sounds-5', destinationId: 'marlborough-sounds', name: 'Pelorus Bridge Scenic Reserve', icon: '🌉', coordinates: { latitude: -41.2970, longitude: 173.5730 }, category: 'nature', bio: 'Clear green river pools beneath an old bridge in towering podocarp forest, famous from The Hobbit barrel scene.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'marlborough-sounds-6', destinationId: 'marlborough-sounds', name: 'Picton', icon: '⛴️', coordinates: { latitude: -41.291, longitude: 174.001 }, category: 'landmark', bio: 'The ferry port and waterfront town at the head of Queen Charlotte Sound, and the base for the Sounds.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  { id: 'marlborough-sounds-7', destinationId: 'marlborough-sounds', name: 'Havelock', icon: '🦪', coordinates: { latitude: -41.2833, longitude: 173.7667 }, category: 'landmark', bio: 'A quiet harbour village known as the green-lipped mussel capital, at the head of Pelorus Sound.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  // Blenheim
  { id: 'blenheim-1', destinationId: 'blenheim', name: 'Omaka Aviation Heritage Centre', icon: '✈️', coordinates: { latitude: -41.5390, longitude: 173.9230 }, category: 'museum', bio: 'Rare WWI and WWII aircraft staged in lifelike dioramas created with the help of Peter Jackson\'s Weta Workshop.', hours: '9:00 AM – 5:00 PM', visitHoursMin: 1.5, visitHoursMax: 2.5, costMin: 30, costMax: 50, currency: 'NZD', ticketUrl: 'https://www.omaka.org.nz' },
  { id: 'blenheim-2', destinationId: 'blenheim', name: 'Cloudy Bay Vineyards', icon: '🍇', coordinates: { latitude: -41.5100, longitude: 173.8580 }, category: 'entertainment', bio: 'The cellar door of the winery whose Sauvignon Blanc made Marlborough world-famous, with a garden tasting room.', hours: '10:00 AM – 4:00 PM', visitHoursMin: 1, visitHoursMax: 1.5, costMin: 25, costMax: 75, currency: 'NZD', ticketUrl: 'https://www.cloudybay.com' },
  { id: 'blenheim-3', destinationId: 'blenheim', name: 'Wither Hills Farm Park', icon: '🥾', coordinates: { latitude: -41.5400, longitude: 173.9600 }, category: 'hike', bio: "Walking and biking tracks over the dry hills behind Blenheim, with views over the vineyards of the Wairau Valley.", hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  // Nelson Lakes
  { id: 'nelson-lakes-1', destinationId: 'nelson-lakes', name: 'Lake Rotoiti', icon: '🏞️', coordinates: { latitude: -41.8028, longitude: 172.8480 }, category: 'nature', bio: 'A glacial lake whose Kerr Bay jetty, framed by forested mountains, is one of the South Island\'s best-loved views.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/nelson-tasman/places/nelson-lakes-national-park/' },
  { id: 'nelson-lakes-2', destinationId: 'nelson-lakes', name: 'Mount Robert', icon: '⛰️', coordinates: { latitude: -41.8300, longitude: 172.8100 }, category: 'hike', bio: 'A loop climbing Pinchgut Track to an alpine ridge with views straight down onto Lake Rotoiti.', hours: 'Open 24 hours', visitHoursMin: 4, visitHoursMax: 6, free: true },
  { id: 'nelson-lakes-3', destinationId: 'nelson-lakes', name: 'Lake Rotoroa', icon: '💧', coordinates: { latitude: -41.8000, longitude: 172.6000 }, category: 'nature', bio: 'The quieter, wilder sister lake, reached by a side road through beech forest, with mountains rising from its head.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  // Kahurangi
  { id: 'kahurangi-1', destinationId: 'kahurangi', name: 'Heaphy Track', icon: '🥾', coordinates: { latitude: -40.8500, longitude: 172.4500 }, category: 'hike', bio: "The longest Great Walk, crossing Kahurangi National Park's tussock downs to nīkau-lined West Coast beaches.", hours: 'Open 24 hours', visitHoursMin: 4, visitHoursMax: 8, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/nelson-tasman/places/kahurangi-national-park/' },
  { id: 'kahurangi-2', destinationId: 'kahurangi', name: 'Ōpārara Basin', icon: '🌉', coordinates: { latitude: -41.19, longitude: 172.1 }, category: 'nature', bio: 'Huge limestone arches, caves and moss-draped forest on short walks from the end of the Karamea road.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 4, free: true },
  { id: 'kahurangi-3', destinationId: 'kahurangi', name: 'Karamea', icon: '🏡', coordinates: { latitude: -41.2575, longitude: 172.1089 }, category: 'landmark', bio: 'A remote end-of-the-road town and the gateway to the Ōpārara Basin and the Heaphy Track.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 3, free: true },
  // Mount Aspiring
  { id: 'mount-aspiring-1', destinationId: 'mount-aspiring', name: 'Rob Roy Glacier Track', icon: '🧊', coordinates: { latitude: -44.5020, longitude: 168.7540 }, category: 'hike', bio: 'A walk up a beech-forested valley in Mount Aspiring National Park to a hanging glacier spilling waterfalls.', hours: 'Open 24 hours', visitHoursMin: 3, visitHoursMax: 4, free: true, ticketUrl: 'https://www.doc.govt.nz/parks-and-recreation/places-to-go/otago/places/mount-aspiring-national-park/' },
  { id: 'mount-aspiring-2', destinationId: 'mount-aspiring', name: 'Blue Pools', icon: '💎', coordinates: { latitude: -44.1600, longitude: 169.2700 }, category: 'nature', bio: 'Clear, glacier-blue pools in a beech forest gorge on the Haast Pass road, reached over swing bridges.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1, free: true },
  { id: 'mount-aspiring-3', destinationId: 'mount-aspiring', name: 'Haast Pass', icon: '🛣️', coordinates: { latitude: -44.0833, longitude: 169.35 }, category: 'viewpoint', bio: 'The alpine road pass between Wānaka and the West Coast, with waterfalls and short bush walks beside the highway.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  // Timaru
  { id: 'timaru-1', destinationId: 'timaru', name: 'Caroline Bay', icon: '🏖️', coordinates: { latitude: -44.401, longitude: 171.265 }, category: 'beach', bio: 'A sandy city beach with a summer carnival tradition, close to the town centre.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'timaru-2', destinationId: 'timaru', name: 'South Canterbury Museum', icon: '🏛️', coordinates: { latitude: -44.399, longitude: 171.248 }, category: 'museum', bio: "A regional museum with natural history and the story of Richard Pearse's early flight experiments.", hours: '10:00 AM – 4:30 PM', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'timaru-3', destinationId: 'timaru', name: 'Te Ana Māori Rock Art Centre', icon: '🎨', coordinates: { latitude: -44.396, longitude: 171.248 }, category: 'museum', bio: 'An interpretive centre on the Māori rock art of South Canterbury, with guided tours of the art in the region.', hours: 'Daytime tours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'timaru-4', destinationId: 'timaru', name: 'Aigantighe Art Gallery', icon: '🖼️', coordinates: { latitude: -44.399, longitude: 171.244 }, category: 'museum', bio: 'A regional art gallery in a historic house, set in sculpture-dotted gardens.', hours: 'Check opening hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  // Central Otago
  { id: 'central-otago-1', destinationId: 'central-otago', name: 'Otago Central Rail Trail', icon: '🚲', coordinates: { latitude: -45.1890, longitude: 169.3150 }, category: 'hike', bio: '152 km of gentle cycling along an old railway line through tunnels, viaducts and gold-rush villages.', hours: 'Open 24 hours', visitHoursMin: 4, visitHoursMax: 8, free: true, ticketUrl: 'https://www.otagocentralrailtrail.co.nz' },
  { id: 'central-otago-2', destinationId: 'central-otago', name: 'Clyde', icon: '🏘️', coordinates: { latitude: -45.1880, longitude: 169.3160 }, category: 'historic', bio: 'A charming gold-rush town of stone cottages and old hotels beneath the Clyde Dam, at the start of the Rail Trail.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'central-otago-3', destinationId: 'central-otago', name: 'Blue Lake, St Bathans', icon: '💧', coordinates: { latitude: -44.8690, longitude: 169.8120 }, category: 'nature', bio: 'A vivid blue lake filling an old gold-sluicing pit, ringed by eroded white cliffs beside a tiny historic village.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'central-otago-4', destinationId: 'central-otago', name: 'Cromwell Heritage Precinct', icon: '🏚️', coordinates: { latitude: -45.0450, longitude: 169.2000 }, category: 'historic', bio: 'Old Cromwell rebuilt stone by stone on the shore of Lake Dunstan after the town was flooded by the Clyde Dam.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  // Invercargill
  { id: 'invercargill-1', destinationId: 'invercargill', name: 'E Hayes and Sons', icon: '🏍️', coordinates: { latitude: -46.4120, longitude: 168.3500 }, category: 'museum', bio: "A working hardware store displaying Burt Munro's record-breaking Indian motorcycle among hundreds of classic machines.", hours: '7:30 AM – 5:30 PM', visitHoursMin: 0.5, visitHoursMax: 1, free: true, ticketUrl: 'https://www.ehayes.co.nz' },
  { id: 'invercargill-2', destinationId: 'invercargill', name: 'Bill Richardson Transport World', icon: '🚚', coordinates: { latitude: -46.4170, longitude: 168.3700 }, category: 'museum', bio: 'One of the largest private collections of trucks and vehicles in the world, with a quirky WOW wearable-art gallery.', hours: '10:00 AM – 5:00 PM', visitHoursMin: 2, visitHoursMax: 3, costMin: 30, costMax: 30, currency: 'NZD', ticketUrl: 'https://www.transportworld.co.nz' },
  { id: 'invercargill-3', destinationId: 'invercargill', name: 'Queens Park, Invercargill', icon: '🌳', coordinates: { latitude: -46.3990, longitude: 168.3540 }, category: 'nature', bio: 'An 80-hectare park of rose gardens, an aviary and an animal enclosure at the heart of the city.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
  { id: 'invercargill-4', destinationId: 'invercargill', name: 'Stirling Point', icon: '🧭', coordinates: { latitude: -46.6140, longitude: 168.3590 }, category: 'landmark', bio: "Bluff's famous signpost at the end of State Highway 1, pointing to cities around the world.", hours: 'Open 24 hours', visitHoursMin: 0.5, visitHoursMax: 0.5, free: true },
  // ── Standalone spots (no destination) ──────────────────────────────────────────
  // Places with no appropriate destination to sit under, or too few neighbouring spots to be one — see DESTINATIONS.md.
  { id: 'glenorchy', country: 'New Zealand', countryCode: 'NZ', continent: 'Oceania', timezone: 'Pacific/Auckland', name: 'Glenorchy', icon: '🏔️', coordinates: { latitude: -44.8500, longitude: 168.3870 }, category: 'nature', bio: 'A tiny village at the head of Lake Wakatipu, beneath the peaks and valleys used as Middle-earth in The Lord of the Rings.', hours: 'Open 24 hours', visitHoursMin: 2, visitHoursMax: 4, free: true },
  { id: 'kura-tawhiti-castle-hill', country: 'New Zealand', countryCode: 'NZ', continent: 'Oceania', timezone: 'Pacific/Auckland', name: 'Kura Tāwhiti / Castle Hill', icon: '🪨', coordinates: { latitude: -43.2250, longitude: 171.7280 }, category: 'nature', bio: 'Kura Tāwhiti, a surreal field of giant limestone boulders on a tussock hillside, sacred to Ngāi Tahu.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 2, free: true },
  { id: 'cave-stream', country: 'New Zealand', countryCode: 'NZ', continent: 'Oceania', timezone: 'Pacific/Auckland', name: 'Cave Stream Scenic Reserve', icon: '🔦', coordinates: { latitude: -43.2000, longitude: 171.7500 }, category: 'hike', bio: 'Wade 594 m through a dark limestone cave with a stream running through it — bring a torch and warm clothes.', hours: 'Open 24 hours', visitHoursMin: 1, visitHoursMax: 1.5, free: true },
];
