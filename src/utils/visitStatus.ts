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
//   • a country is visited if it has a record of its own, or any of its destinations is visited.
// Visiting a destination never marks its spots, and visiting a country never marks its destinations.
//
// Un-visiting goes the other way: it rolls DOWN, never up. Un-visiting a country un-visits its
// destinations and spots, and un-visiting a destination its spots — but the place above stays visited
// (see keepVisited), even if it was visited only through what was removed.

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
}

export function buildVisitIndex(
  savedDestinations: Record<string, SavedDestination>,
  savedSpots: Record<string, SavedSpot>,
  savedCountries: Record<string, SavedCountry>,
): VisitIndex {
  const ticked = new Set<string>();
  for (const rec of Object.values(savedDestinations)) {
    for (const visit of rec.visits ?? []) {
      for (const spotId of visit.spotIds ?? []) {
        if (SPOT_DEST.get(spotId) === rec.destinationId) ticked.add(spotId);
      }
    }
  }

  const visitedSpotIds = new Set<string>([
    ...Object.keys(savedSpots).filter(id => SPOT_DEST.has(id)),
    ...ticked,
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
    visitedCountryCodes.add(rec.countryCode);   // a country record is only ever made for a visit
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
  };
}

// ── Each level's own trips ─────────────────────────────────────────────────────────────────────
// A My Visit tab lists only that place's own trips — nothing is grouped in from the levels around it.

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

// ── Ticking a place in a trip gives it a log of its own ──────────────────────────────────────────
// Ticking a spot in a destination trip (or a destination in a country trip) that has no record of its
// own yet gives it one log, so its own My Visit tab has a trip to edit. Only what was ticked is carried
// over — no dates, notes or photos. The log's id ties it to the trip that made it ('auto:<trip id>'),
// so unticking it again, or removing that trip, takes it away — as long as it's still untouched.

const SPOT_NAME = new Map(SPOTS.map(s => [s.id, s.name]));
const DEST_NAME = new Map(DESTINATIONS.map(d => [d.id, d.name]));
const autoId = (tripId: string) => `auto:${tripId}`;
// Untouched = exactly as created: no dates, notes, photos or ticks of its own, default title.
const isUntouched = (v: Visit, title: string) =>
  !v.startDate && !v.endDate && !v.notes && !v.photos?.length && !v.spotIds?.length && (!v.title || v.title === title);

export function withTripTicks(
  r: VisitRecords,
  level: 'destination' | 'country',
  tripId: string,
  before: string[],
  after: string[],
): VisitRecords {
  const added = after.filter(id => !before.includes(id));
  const removed = before.filter(id => !after.includes(id));
  if (!added.length && !removed.length) return r;
  const id = autoId(tripId);

  if (level === 'destination') {
    const savedSpots = { ...r.savedSpots };
    for (const spotId of added) {
      const rec = savedSpots[spotId];
      const destinationId = SPOT_DEST.get(spotId);
      if (!destinationId || rec) continue;   // already has a record of its own
      const visit: Visit = { id, title: `${SPOT_NAME.get(spotId)} Visit`, startDate: '' };
      savedSpots[spotId] = { spotId, destinationId, visits: [visit] };
    }
    for (const spotId of removed) {
      const rec = savedSpots[spotId];
      const auto = rec?.visits?.find(v => v.id === id);
      if (!rec || !auto || !isUntouched(auto, `${SPOT_NAME.get(spotId)} Visit`)) continue;
      const left = rec.visits!.filter(v => v.id !== id);
      if (left.length || rec.rating) savedSpots[spotId] = { ...rec, visits: left };
      else delete savedSpots[spotId];
    }
    return { ...r, savedSpots };
  }

  const savedDestinations = { ...r.savedDestinations };
  for (const destId of added) {
    const rec = savedDestinations[destId];
    if (!DEST_COUNTRY.has(destId) || rec) continue;   // already has a record of its own
    const visit: Visit = { id, title: `${DEST_NAME.get(destId)} Trip`, startDate: '' };
    savedDestinations[destId] = { destinationId: destId, type: 'visited', visits: [visit] };
  }
  for (const destId of removed) {
    const rec = savedDestinations[destId];
    const auto = rec?.visits?.find(v => v.id === id);
    if (!rec || !auto || !isUntouched(auto, `${DEST_NAME.get(destId)} Trip`)) continue;
    const left = rec.visits!.filter(v => v.id !== id);
    if (left.length || rec.photos?.length || rec.notes) savedDestinations[destId] = { ...rec, visits: left };
    else delete savedDestinations[destId];
  }
  return { ...r, savedDestinations };
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

const untick = (rec: { visits?: Visit[] }, id: string) =>
  rec.visits?.some(v => v.spotIds?.includes(id))
    ? { visits: rec.visits.map(v => v.spotIds?.includes(id) ? { ...v, spotIds: v.spotIds.filter(x => x !== id) } : v) }
    : null;

// Un-visits a spot: its own record goes, and it's unticked from its destination's trips. Its
// destination and country stay visited.
export function withoutSpot(r: VisitRecords, spotId: string): VisitRecords {
  const destId = SPOT_DEST.get(spotId);
  const dest = destId ? r.savedDestinations[destId] : undefined;
  const unticked = dest && untick(dest, spotId);
  return keepVisited(r, {
    ...r,
    savedSpots: omit(r.savedSpots, [spotId]),
    savedDestinations: unticked ? { ...r.savedDestinations, [destId!]: { ...dest!, ...unticked } } : r.savedDestinations,
  }, destId);
}

// Removes a spot's record (its last trip went) — without un-visiting its destination or country.
export function withoutSpotRecord(r: VisitRecords, spotId: string): VisitRecords {
  return keepVisited(r, { ...r, savedSpots: omit(r.savedSpots, [spotId]) }, SPOT_DEST.get(spotId));
}

// Removes a destination's record (its last trip went) — without un-visiting its country.
export function withoutDestinationRecord(r: VisitRecords, destinationId: string): VisitRecords {
  return keepVisited(r, { ...r, savedDestinations: omit(r.savedDestinations, [destinationId]) }, undefined, DEST_COUNTRY.get(destinationId));
}

// Un-visiting never rolls up: after a removal, a destination (and/or country) above it that was visited
// before and no longer is gets a bare record of its own, so it stays visited.
function keepVisited(before: VisitRecords, after: VisitRecords, destId?: string, countryCode?: string): VisitRecords {
  const was = buildVisitIndex(before.savedDestinations, before.savedSpots, before.savedCountries);
  let next = after;
  let now = buildVisitIndex(next.savedDestinations, next.savedSpots, next.savedCountries);
  if (destId && was.isDestVisited(destId) && !now.isDestVisited(destId)) {
    next = { ...next, savedDestinations: { ...next.savedDestinations, [destId]: { destinationId: destId, type: 'visited' } } };
    now = buildVisitIndex(next.savedDestinations, next.savedSpots, next.savedCountries);
  }
  const code = countryCode ?? (destId ? DEST_COUNTRY.get(destId) : undefined);
  if (code && was.isCountryVisited(code) && !now.isCountryVisited(code)) {
    next = { ...next, savedCountries: { ...next.savedCountries, [code]: { countryCode: code } } };
  }
  return next;
}

// Un-visits a destination: its own record and all its spots' records go, and it's unticked from its
// country's trips. Its country stays visited.
export function withoutDestination(r: VisitRecords, destinationId: string): VisitRecords {
  const code = DEST_COUNTRY.get(destinationId);
  const country = code ? r.savedCountries[code] : undefined;
  const unticked = country && untick(country, destinationId);
  return keepVisited(r, {
    savedDestinations: omit(r.savedDestinations, [destinationId]),
    savedSpots: omit(r.savedSpots, Object.values(r.savedSpots).filter(s => SPOT_DEST.get(s.spotId) === destinationId).map(s => s.spotId)),
    savedCountries: unticked ? { ...r.savedCountries, [code!]: { ...country!, ...unticked } } : r.savedCountries,
  }, undefined, code);
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
