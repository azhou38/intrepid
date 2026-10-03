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

// ── Clean-up: logs ticking used to create ────────────────────────────────────────────────────────
// For a while, ticking a spot in a destination trip (or a destination in a country trip) gave it a
// log of its own ('auto:<trip id>', titled "{Spot} Visit" / "{Destination} Trip"). Ticking now only
// marks it visited, so the ones still exactly as created are removed — along with a record left with
// nothing else in it (the tick still counts it as visited).

const SPOT_NAME = new Map(SPOTS.map(s => [s.id, s.name]));
const DEST_NAME = new Map(DESTINATIONS.map(d => [d.id, d.name]));
const isUntouchedAuto = (v: Visit, title: string) =>
  v.id.startsWith('auto:') && !v.startDate && !v.endDate && !v.notes && !v.photos?.length
  && !v.spotIds?.length && (!v.title || v.title === title);

export function withoutAutoLogs(r: VisitRecords): VisitRecords {
  let changed = false;
  const savedSpots = { ...r.savedSpots };
  for (const [id, rec] of Object.entries(r.savedSpots)) {
    const visits = rec.visits?.filter(v => !isUntouchedAuto(v, `${SPOT_NAME.get(id)} Visit`));
    if (!rec.visits || visits!.length === rec.visits.length) continue;
    changed = true;
    if (visits!.length || rec.rating) savedSpots[id] = { ...rec, visits: visits! };
    else delete savedSpots[id];
  }
  const savedDestinations = { ...r.savedDestinations };
  for (const [id, rec] of Object.entries(r.savedDestinations)) {
    const visits = rec.visits?.filter(v => !isUntouchedAuto(v, `${DEST_NAME.get(id)} Trip`));
    if (!rec.visits || visits!.length === rec.visits.length) continue;
    changed = true;
    if (visits!.length || rec.photos?.length || rec.notes) savedDestinations[id] = { ...rec, visits: visits! };
    else delete savedDestinations[id];
  }
  return changed ? { ...r, savedSpots, savedDestinations } : r;
}

// ── Counting what's logged beneath a place (for the remove-visit warnings) ─────────────────────────

const hasSpotLog = (rec: SavedSpot) => !!rec.visits?.length || !!rec.visitDate;

// How many of a destination's spots have something logged.
export function spotsWithLogsIn(r: VisitRecords, destinationId: string): number {
  return Object.values(r.savedSpots).filter(rec => SPOT_DEST.get(rec.spotId) === destinationId && hasSpotLog(rec)).length;
}

// How many of a country's destinations, and of their spots, have something logged.
export function placesWithLogsInCountry(r: VisitRecords, countryCode: string): { destinations: number; spots: number } {
  const destinations = Object.values(r.savedDestinations).filter(rec =>
    DEST_COUNTRY.get(rec.destinationId) === countryCode && destinationTripsOf(rec, r.savedSpots).length > 0).length;
  const spots = Object.values(r.savedSpots).filter(rec => {
    const destId = SPOT_DEST.get(rec.spotId);
    return !!destId && DEST_COUNTRY.get(destId) === countryCode && hasSpotLog(rec);
  }).length;
  return { destinations, spots };
}

const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "This will permanently delete everything you logged for France, including its 3 destinations and 5 spots."
export function removeCountryMessage(country: string, n: { destinations: number; spots: number }): string {
  const parts = [n.destinations && counted(n.destinations, 'destination'), n.spots && counted(n.spots, 'spot')].filter(Boolean);
  const including = parts.length ? `, including its ${parts.join(' and ')}` : '';
  return `This will permanently delete everything you logged for ${country}${including}.`;
}

// "This will permanently delete everything you logged for Paris and its 4 spots."
export function removeDestinationMessage(destination: string, spots: number): string {
  return `This will permanently delete everything you logged for ${destination}${spots ? ` and its ${counted(spots, 'spot')}` : ''}.`;
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
