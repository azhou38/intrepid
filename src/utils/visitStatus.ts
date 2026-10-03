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
}

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
  for (const rec of Object.values(savedCountries)) {
    for (const visit of rec.visits ?? []) {
      for (const destId of visit.spotIds ?? []) {        // a country trip's selector items are destinations
        if (DEST_COUNTRY.get(destId) === rec.countryCode) visitedDestIds.add(destId);
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
    linkedTripsForSpot: id => linked.get(id) ?? [],
  };
}

// ── A destination's trips, with its spot visits grouped in ─────────────────────────────────────────
// People remember "my Paris trip", not one entry per spot. So on a destination's My Visit tab:
//   • a spot visit within TRIP_GAP_DAYS of one of the destination's own trips shows inside that trip;
//   • the remaining spot visits are grouped with each other the same way (any gap ≤ TRIP_GAP_DAYS joins
//     them) into trips that are derived, not stored — editing one saves it as a real destination trip,
//     removing one removes the spot visits it was built from (see `derivedFrom`);
//   • spot visits with no dates form one "undated" trip, never merged into dated ones.

export const TRIP_GAP_DAYS = 2;

export type DisplayTrip = Visit & {
  // Present on derived trips: the spot visits it was built from.
  derivedFrom?: { spotId: string; visitId: string }[];
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

// A spot record's visits, with the pre-redesign single-date fields (and a dateless record) as one visit.
export function spotVisitsOf(rec: SavedSpot): Visit[] {
  if (rec.visits?.length) return rec.visits;
  return [{ id: 'legacy', startDate: rec.visitDate ?? '' }];
}

export function destinationDisplayTrips(
  destinationId: string,
  ownTrips: Visit[],
  savedSpots: Record<string, SavedSpot>,
): DisplayTrip[] {
  const own: DisplayTrip[] = ownTrips.map(v => ({ ...v, spotIds: [...(v.spotIds ?? [])] }));
  const ownRanges = own.map(v => dayRange(v.startDate, v.endDate));

  type SpotVisit = { spotId: string; visit: Visit; range: [number, number] | null };
  const loose: SpotVisit[] = [];
  for (const rec of Object.values(savedSpots)) {
    if (rec.destinationId !== destinationId || SPOT_DEST.get(rec.spotId) !== destinationId) continue;
    for (const visit of spotVisitsOf(rec)) {
      const range = dayRange(visit.startDate, visit.endDate);
      const host = range ? own.findIndex((_, i) => ownRanges[i] && near(range, ownRanges[i]!)) : -1;
      if (host >= 0) {
        if (!own[host].spotIds!.includes(rec.spotId)) own[host].spotIds!.push(rec.spotId);
      } else {
        loose.push({ spotId: rec.spotId, visit, range });
      }
    }
  }

  const derived: DisplayTrip[] = [];
  const toTrip = (group: SpotVisit[], undated: boolean): DisplayTrip => {
    const sorted = [...group].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
    const first = sorted[0].visit;
    const last = sorted.reduce((m, x) => (x.range && m.range && x.range[1] > m.range[1] ? x : m), sorted[0]);
    const endDate = last.visit.endDate ?? last.visit.startDate;
    const derivedFrom = sorted.map(x => ({ spotId: x.spotId, visitId: x.visit.id }));
    return {
      id: 'derived:' + derivedFrom.map(x => `${x.spotId}/${x.visitId}`).join(','),
      startDate: undated ? '' : first.startDate,
      endDate: undated || endDate === first.startDate ? undefined : endDate,
      spotIds: [...new Set(sorted.map(x => x.spotId))],
      derivedFrom,
    };
  };
  const dated = loose.filter(x => x.range).sort((a, b) => a.range![0] - b.range![0]);
  let group: SpotVisit[] = [];
  let groupEnd = -Infinity;
  for (const x of dated) {
    if (group.length && x.range![0] > groupEnd + TRIP_GAP_DAYS) { derived.push(toTrip(group, false)); group = []; }
    group.push(x);
    groupEnd = group.length === 1 ? x.range![1] : Math.max(groupEnd, x.range![1]);
  }
  if (group.length) derived.push(toTrip(group, false));
  const undated = loose.filter(x => !x.range);
  if (undated.length) derived.push(toTrip(undated, true));

  // Newest first; undated last.
  return [...own, ...derived].sort((a, b) =>
    (!a.startDate ? 1 : 0) - (!b.startDate ? 1 : 0) || b.startDate.localeCompare(a.startDate));
}
