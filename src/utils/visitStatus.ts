// Visited status for spots, destinations and countries, derived from what the user actually logged.
//
// Only what the user logs is stored: trips (Visit) and per-place records (SavedSpot / SavedDestination /
// SavedCountry). Whether a place counts as visited is worked out from those, here, so every surface (pins,
// pills, borders, sheets, stats) reads the same answer and nothing can fall out of sync — deleting a trip
// un-visits whatever it alone covered, with no clean-up code anywhere.
//
// Visited rolls UP, never down:
//   • a spot is visited if it has its own record, or a destination trip ticked it under "Spots Visited";
//   • a destination is visited if it has its own record, any of its spots is visited, or a country trip
//     ticked it under "Destinations Visited";
//   • a country is visited if it has its own trips, or any of its destinations is visited.
// Visiting a destination never marks its spots, and visiting a country never marks its destinations.

import { DESTINATIONS } from '../data/destinations';
import { SPOTS } from '../data/spots';
import type { SavedCountry, SavedDestination, SavedSpot, Visit } from '../types';

const SPOT_DEST = new Map(SPOTS.map(s => [s.id, s.destinationId]));
const DEST_COUNTRY = new Map(DESTINATIONS.map(d => [d.id, d.countryCode]));

export interface VisitIndex {
  visitedSpotIds: Set<string>;
  visitedDestIds: Set<string>;
  visitedCountryCodes: Set<string>;
  isSpotVisited: (id: string) => boolean;
  isDestVisited: (id: string) => boolean;
  isCountryVisited: (countryCode: string) => boolean;
  // Destination trips that ticked this spot (read-only on the spot — they're edited on the destination).
  linkedTripsForSpot: (spotId: string) => { destinationId: string; visit: Visit }[];
  // Country trips that ticked this destination (read-only on the destination, likewise).
  linkedTripsForDest: (destinationId: string) => { countryCode: string; visit: Visit }[];
}

const NONE: never[] = [];

export function buildVisitIndex(
  savedDestinations: Record<string, SavedDestination>,
  savedSpots: Record<string, SavedSpot>,
  savedCountries: Record<string, SavedCountry>,
): VisitIndex {
  const linked = new Map<string, { destinationId: string; visit: Visit }[]>();
  for (const rec of Object.values(savedDestinations)) {
    for (const visit of rec.visits ?? []) {
      for (const spotId of visit.spotIds ?? []) {
        if (SPOT_DEST.get(spotId) !== rec.destinationId) continue;
        const list = linked.get(spotId) ?? [];
        list.push({ destinationId: rec.destinationId, visit });
        linked.set(spotId, list);
      }
    }
  }

  const visitedSpotIds = new Set<string>([
    ...Object.keys(savedSpots).filter(id => SPOT_DEST.has(id)),
    ...linked.keys(),
  ]);

  const visitedDestIds = new Set<string>();
  for (const rec of Object.values(savedDestinations)) {
    if (rec.type === 'visited' && DEST_COUNTRY.has(rec.destinationId)) visitedDestIds.add(rec.destinationId);
  }
  for (const spotId of visitedSpotIds) {
    const destId = SPOT_DEST.get(spotId);
    if (destId) visitedDestIds.add(destId);
  }
  const linkedDest = new Map<string, { countryCode: string; visit: Visit }[]>();
  for (const rec of Object.values(savedCountries)) {
    for (const visit of rec.visits ?? []) {
      for (const destId of visit.spotIds ?? []) {        // a country trip's selector items are destinations
        if (DEST_COUNTRY.get(destId) !== rec.countryCode) continue;
        visitedDestIds.add(destId);
        const list = linkedDest.get(destId) ?? [];
        list.push({ countryCode: rec.countryCode, visit });
        linkedDest.set(destId, list);
      }
    }
  }

  const visitedCountryCodes = new Set<string>();
  for (const rec of Object.values(savedCountries)) {
    if (rec.visitDate || rec.visits?.length) visitedCountryCodes.add(rec.countryCode);
  }
  for (const destId of visitedDestIds) {
    const code = DEST_COUNTRY.get(destId);
    if (code) visitedCountryCodes.add(code);
  }

  return {
    visitedSpotIds, visitedDestIds, visitedCountryCodes,
    isSpotVisited: id => visitedSpotIds.has(id),
    isDestVisited: id => visitedDestIds.has(id),
    isCountryVisited: code => visitedCountryCodes.has(code),
    linkedTripsForSpot: id => linked.get(id) ?? NONE,
    linkedTripsForDest: id => linkedDest.get(id) ?? NONE,
  };
}

// ── Trips, with what was logged beneath them grouped in ───────────────────────────────────────────
// People remember "my Paris trip", not one entry per spot. So on a destination's My Visit tab (its
// spots' visits) and a country's (its destinations' trips):
//   • a visit beneath it within TRIP_GAP_DAYS of one of its own trips shows inside that trip;
//   • the remaining ones are grouped with each other the same way (any gap ≤ TRIP_GAP_DAYS joins
//     them) into trips that are derived, not stored — editing one saves it as a real trip, removing
//     one removes what it was built from (see `derivedFrom`);
//   • ones with no dates form one "undated" trip, never merged into dated ones.

export const TRIP_GAP_DAYS = 2;

export type DisplayTrip = Visit & {
  // Present on derived trips: what it was built from — spot visits on a destination's tab
  // (id = spot id), destination trips on a country's (id = destination id).
  derivedFrom?: { id: string; visitId: string }[];
};

const DAY_MS = 86400000;
// A date as [first day, last day] in whole days; month-only dates ("2024-04-00") span their month.
function dayRange(start: string, end?: string): [number, number] | null {
  const parse = (s: string, last: boolean): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
    if (!m) return null;
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (mo < 0 || mo > 11) return null;
    const day = d === 0 ? (last ? new Date(Date.UTC(y, mo + 1, 0)).getUTCDate() : 1) : d;
    return Math.round(Date.UTC(y, mo, day) / DAY_MS);
  };
  const s = parse(start, false);
  if (s === null) return null;
  const e = (end ? parse(end, true) : null) ?? parse(start, true) ?? s;
  return [s, Math.max(s, e)];
}
const near = (a: [number, number], b: [number, number]) =>
  a[0] <= b[1] + TRIP_GAP_DAYS && b[0] <= a[1] + TRIP_GAP_DAYS;

const newestFirst = (a: Visit, b: Visit) =>
  (!a.startDate ? 1 : 0) - (!b.startDate ? 1 : 0) || b.startDate.localeCompare(a.startDate);

// A spot record's visits, with the pre-redesign single-date fields (and a dateless record) as one visit.
export function spotVisitsOf(rec: SavedSpot): Visit[] {
  if (rec.visits?.length) return rec.visits;
  return [{ id: 'legacy', startDate: rec.visitDate ?? '' }];
}

// A destination record's own trips — the pre-redesign single-visit fields as one 'legacy' trip.
export function destinationTripsOf(rec: SavedDestination | undefined, savedSpots: Record<string, SavedSpot>): Visit[] {
  if (!rec) return [];
  if (rec.visits) return rec.visits;
  if (!rec.visitDate) return [];
  return [{
    id: 'legacy', startDate: rec.visitDate, photos: rec.photos, notes: rec.notes,
    spotIds: Object.values(savedSpots).filter(ss => ss.destinationId === rec.destinationId).map(ss => ss.spotId),
  }];
}

// A country record's own trips — the pre-redesign single-visit fields as one 'legacy' trip.
export function countryTripsOf(rec: SavedCountry | undefined): Visit[] {
  if (!rec) return [];
  return rec.visits ?? (rec.visitDate ? [{ id: 'legacy', startDate: rec.visitDate, notes: rec.notes }] : []);
}

type Beneath = { id: string; visit: Visit };

function groupTrips(ownTrips: Visit[], beneath: Beneath[]): DisplayTrip[] {
  const own: DisplayTrip[] = ownTrips.map(v => ({ ...v, spotIds: [...(v.spotIds ?? [])] }));
  const ownRanges = own.map(v => dayRange(v.startDate, v.endDate));

  type Item = Beneath & { range: [number, number] | null };
  const loose: Item[] = [];
  for (const b of beneath) {
    const range = dayRange(b.visit.startDate, b.visit.endDate);
    const host = range ? own.findIndex((_, i) => ownRanges[i] && near(range, ownRanges[i]!)) : -1;
    if (host >= 0) {
      if (!own[host].spotIds!.includes(b.id)) own[host].spotIds!.push(b.id);
    } else {
      loose.push({ ...b, range });
    }
  }

  const derived: DisplayTrip[] = [];
  const toTrip = (group: Item[], undated: boolean): DisplayTrip => {
    const sorted = [...group].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
    const first = sorted[0].visit;
    const last = sorted.reduce((m, x) => (x.range && m.range && x.range[1] > m.range[1] ? x : m), sorted[0]);
    const endDate = last.visit.endDate ?? last.visit.startDate;
    const derivedFrom = sorted.map(x => ({ id: x.id, visitId: x.visit.id }));
    return {
      id: 'derived:' + derivedFrom.map(x => `${x.id}/${x.visitId}`).join(','),
      startDate: undated ? '' : first.startDate,
      endDate: undated || endDate === first.startDate ? undefined : endDate,
      spotIds: [...new Set(sorted.map(x => x.id))],
      derivedFrom,
    };
  };
  const dated = loose.filter(x => x.range).sort((a, b) => a.range![0] - b.range![0]);
  let group: Item[] = [];
  let groupEnd = -Infinity;
  for (const x of dated) {
    if (group.length && x.range![0] > groupEnd + TRIP_GAP_DAYS) { derived.push(toTrip(group, false)); group = []; }
    group.push(x);
    groupEnd = group.length === 1 ? x.range![1] : Math.max(groupEnd, x.range![1]);
  }
  if (group.length) derived.push(toTrip(group, false));
  const undated = loose.filter(x => !x.range);
  if (undated.length) derived.push(toTrip(undated, true));

  return [...own, ...derived].sort(newestFirst);
}

// A destination's My Visit: its own trips, with its spots' visits grouped in.
export function destinationDisplayTrips(
  destinationId: string,
  ownTrips: Visit[],
  savedSpots: Record<string, SavedSpot>,
): DisplayTrip[] {
  const beneath: Beneath[] = [];
  for (const rec of Object.values(savedSpots)) {
    if (rec.destinationId !== destinationId || SPOT_DEST.get(rec.spotId) !== destinationId) continue;
    for (const visit of spotVisitsOf(rec)) beneath.push({ id: rec.spotId, visit });
  }
  return groupTrips(ownTrips, beneath);
}

// A destination's trips as they roll up to its country: everything its own My Visit shows, or — for
// a destination marked visited with nothing logged — one undated entry ('record').
function destinationRollUp(destinationId: string, rec: SavedDestination | undefined, savedSpots: Record<string, SavedSpot>): Visit[] {
  const trips = destinationDisplayTrips(destinationId, destinationTripsOf(rec, savedSpots), savedSpots);
  if (trips.length) return trips;
  return rec ? [{ id: 'record', startDate: '' }] : [];
}

// A country's My Visit: its own trips, with its destinations' trips (their spot visits included)
// grouped in.
export function countryDisplayTrips(
  countryCode: string,
  ownTrips: Visit[],
  savedDestinations: Record<string, SavedDestination>,
  savedSpots: Record<string, SavedSpot>,
): DisplayTrip[] {
  const destIds = new Set<string>();
  for (const rec of Object.values(savedDestinations)) {
    if (DEST_COUNTRY.get(rec.destinationId) === countryCode) destIds.add(rec.destinationId);
  }
  for (const rec of Object.values(savedSpots)) {
    const destId = SPOT_DEST.get(rec.spotId);
    if (destId && DEST_COUNTRY.get(destId) === countryCode) destIds.add(destId);
  }
  const beneath: Beneath[] = [];
  for (const destId of destIds) {
    for (const visit of destinationRollUp(destId, savedDestinations[destId], savedSpots)) beneath.push({ id: destId, visit });
  }
  return groupTrips(ownTrips, beneath);
}

// ── Removing what was logged ───────────────────────────────────────────────────────────────────
// Pure: each takes the saved records and returns them with something removed. Since visited status
// is derived from these, removing the records is all un-visiting takes.

export interface VisitRecords {
  savedDestinations: Record<string, SavedDestination>;
  savedSpots: Record<string, SavedSpot>;
  savedCountries: Record<string, SavedCountry>;
}

function omit<T>(map: Record<string, T>, keys: Iterable<string>): Record<string, T> {
  const next = { ...map };
  for (const k of keys) delete next[k];
  return next;
}

// Removes some of spots' visits; a spot left with none has its record (and rating) removed.
export function withoutSpotVisits(r: VisitRecords, pairs: { id: string; visitId: string }[]): VisitRecords {
  const savedSpots = { ...r.savedSpots };
  const bySpot: Record<string, Set<string>> = {};
  for (const { id, visitId } of pairs) (bySpot[id] ??= new Set()).add(visitId);
  for (const [spotId, visitIds] of Object.entries(bySpot)) {
    const rec = savedSpots[spotId];
    if (!rec) continue;
    const left = rec.visits?.length ? rec.visits.filter(v => !visitIds.has(v.id)) : [];
    if (left.length) savedSpots[spotId] = { ...rec, visits: left, visitDate: left[0]?.startDate };
    else delete savedSpots[spotId];
  }
  return { ...r, savedSpots };
}

// Removes one trip from a destination's My Visit — its own, or a derived one (its spot visits) — or
// ('record') its bare visited record.
export function withoutDestinationTrip(r: VisitRecords, destinationId: string, tripId: string): VisitRecords {
  const rec = r.savedDestinations[destinationId];
  const own = destinationTripsOf(rec, r.savedSpots);
  if (tripId === 'record' || own.some(v => v.id === tripId)) {
    const left = own.filter(v => v.id !== tripId && v.id !== 'legacy');
    if (!left.length || tripId === 'record') return { ...r, savedDestinations: omit(r.savedDestinations, [destinationId]) };
    return { ...r, savedDestinations: { ...r.savedDestinations, [destinationId]: { ...rec!, visits: left, visitDate: left[0]?.startDate } } };
  }
  const trip = destinationDisplayTrips(destinationId, own, r.savedSpots).find(t => t.id === tripId);
  return trip?.derivedFrom ? withoutSpotVisits(r, trip.derivedFrom) : r;
}

// Removes one trip from a country's My Visit — its own, or a derived one (the destination trips it
// was built from).
export function withoutCountryTrip(r: VisitRecords, countryCode: string, tripId: string): VisitRecords {
  const rec = r.savedCountries[countryCode];
  const own = countryTripsOf(rec);
  if (own.some(v => v.id === tripId)) {
    const left = own.filter(v => v.id !== tripId && v.id !== 'legacy');
    if (!left.length) return { ...r, savedCountries: omit(r.savedCountries, [countryCode]) };
    return { ...r, savedCountries: { ...r.savedCountries, [countryCode]: { ...rec!, visits: left, visitDate: left[0]?.startDate } } };
  }
  const trip = countryDisplayTrips(countryCode, own, r.savedDestinations, r.savedSpots).find(t => t.id === tripId);
  let next = r;
  for (const { id, visitId } of trip?.derivedFrom ?? []) next = withoutDestinationTrip(next, id, visitId);
  return next;
}

const untick = (rec: { visits?: Visit[] }, id: string) =>
  rec.visits?.some(v => v.spotIds?.includes(id))
    ? { visits: rec.visits.map(v => v.spotIds?.includes(id) ? { ...v, spotIds: v.spotIds.filter(x => x !== id) } : v) }
    : null;

// Un-visits a spot: its own record goes, and it's unticked from its destination's trips.
export function withoutSpot(r: VisitRecords, spotId: string): VisitRecords {
  const destId = SPOT_DEST.get(spotId);
  const dest = destId ? r.savedDestinations[destId] : undefined;
  const unticked = dest && untick(dest, spotId);
  return {
    ...r,
    savedSpots: omit(r.savedSpots, [spotId]),
    savedDestinations: unticked ? { ...r.savedDestinations, [destId!]: { ...dest!, ...unticked } } : r.savedDestinations,
  };
}

// Un-visits a destination: its own record and all its spots' records go, and it's unticked from its
// country's trips.
export function withoutDestination(r: VisitRecords, destinationId: string): VisitRecords {
  const code = DEST_COUNTRY.get(destinationId);
  const country = code ? r.savedCountries[code] : undefined;
  const unticked = country && untick(country, destinationId);
  return {
    savedDestinations: omit(r.savedDestinations, [destinationId]),
    savedSpots: omit(r.savedSpots, Object.values(r.savedSpots).filter(s => SPOT_DEST.get(s.spotId) === destinationId).map(s => s.spotId)),
    savedCountries: unticked ? { ...r.savedCountries, [code!]: { ...country!, ...unticked } } : r.savedCountries,
  };
}

// Un-visits a country: its own record, and every record of its destinations and their spots, go.
export function withoutCountry(r: VisitRecords, countryCode: string): VisitRecords {
  const inCountry = (destId: string | undefined) => !!destId && DEST_COUNTRY.get(destId) === countryCode;
  return {
    savedCountries: omit(r.savedCountries, [countryCode]),
    savedDestinations: omit(r.savedDestinations, Object.keys(r.savedDestinations).filter(inCountry)),
    savedSpots: omit(r.savedSpots, Object.values(r.savedSpots).filter(s => inCountry(SPOT_DEST.get(s.spotId))).map(s => s.spotId)),
  };
}
