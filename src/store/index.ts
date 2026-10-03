import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedDestination, SavedSpot, SavedCountry, PhotoEntry, Continent } from '../types';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS } from '../data/spots';
import {
  buildVisitIndex, withoutCountry, withoutCountryTrip, withoutDestination, withoutDestinationTrip, withoutSpot,
  type VisitIndex,
} from '../utils/visitStatus';

// A place opened from search, by id — resolved back to the live data when shown, so a renamed or removed
// place can never resurface stale.
export type RecentSearch =
  | { type: 'country';     countryCode: string }
  | { type: 'destination'; id: string }
  | { type: 'spot';        id: string };
const MAX_RECENT_SEARCHES = 5;
const recentKey = (r: RecentSearch) => r.type === 'country' ? `country:${r.countryCode}` : `${r.type}:${r.id}`;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface AppState {
  savedDestinations: Record<string, SavedDestination>;
  savedSpots: Record<string, SavedSpot>;
  savedCountries: Record<string, SavedCountry>;
  selectedDestinationId: string | null;
  userName: string;

  saveDestination: (id: string, type: 'visited', extra?: Partial<Omit<SavedDestination, 'destinationId' | 'type'>>) => void;
  unsaveDestination: (id: string) => void;
  updateSaved: (id: string, update: Partial<SavedDestination>) => void;
  // Spots. Presence of an entry in savedSpots means "visited".
  saveSpotVisited: (spotId: string, destinationId: string) => void;
  updateSpot: (spotId: string, update: Partial<SavedSpot>) => void;
  unsaveSpot: (spotId: string) => void;
  // Whole-country visited tracking — independent of any individual destination's own status.
  saveCountryVisited: (countryCode: string, extra?: Partial<Omit<SavedCountry, 'countryCode'>>) => void;
  unsaveCountry: (countryCode: string) => void;
  updateSavedCountry: (countryCode: string, update: Partial<SavedCountry>) => void;
  // Removing what was logged (see the `without…` helpers in utils/visitStatus.ts). A trip id may be
  // a derived one, which removes what it was built from.
  removeDestinationTrip: (destinationId: string, tripId: string) => void;
  removeCountryTrip: (countryCode: string, tripId: string) => void;
  // Un-visit a place entirely: everything logged for it and beneath it, and its ticks in the trips above.
  unvisitSpot: (spotId: string) => void;
  unvisitDestination: (destinationId: string) => void;
  unvisitCountry: (countryCode: string) => void;
  selectDestination: (id: string | null) => void;
  setUserName: (name: string) => void;
  // Places opened from search, most recent first (see RecentSearch) — shown as the search bar's
  // "Recent" suggestions.
  recentSearches: RecentSearch[];
  addRecentSearch: (r: RecentSearch) => void;
  removeRecentSearch: (r: RecentSearch) => void;
  clearRecentSearches: () => void;
}

const DEFAULT_VISITED_IDS = [
  'nyc', 'grand-canyon', 'yosemite', 'paris', 'london', 'rome',
  'barcelona', 'amsterdam', 'prague', 'tokyo', 'kyoto', 'bali',
  'sydney', 'bangkok', 'rio', 'cape-town', 'dubai', 'machu-picchu',
  'santorini', 'singapore',
];

function buildDefaultSaved(): Record<string, SavedDestination> {
  const result: Record<string, SavedDestination> = {};
  for (const id of DEFAULT_VISITED_IDS) {
    result[id] = { destinationId: id, type: 'visited' };
  }
  return result;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      savedDestinations: buildDefaultSaved(),
      savedSpots: {},
      savedCountries: {},
      selectedDestinationId: null,
      userName: 'Explorer',

      saveDestination: (id, type, extra = {}) =>
        set((s) => ({
          savedDestinations: {
            ...s.savedDestinations,
            [id]: { destinationId: id, type, ...extra },
          },
        })),

      unsaveDestination: (id) =>
        set((s) => {
          const next = { ...s.savedDestinations };
          delete next[id];
          return { savedDestinations: next };
        }),

      updateSaved: (id, update) =>
        set((s) => ({
          savedDestinations: {
            ...s.savedDestinations,
            [id]: { ...s.savedDestinations[id], ...update },
          },
        })),

      // ── Spots ────────────────────────────────────────────────────────────
      // Only the spot's own record. Its destination (and country) count as visited through it — see
      // utils/visitStatus.ts — rather than through a destination record written here, which used to
      // leave the destination visited after the spot was un-visited.
      saveSpotVisited: (spotId, destinationId) =>
        set((s) => ({
          savedSpots: {
            ...s.savedSpots,
            [spotId]: s.savedSpots[spotId] ?? { spotId, destinationId },
          },
        })),

      updateSpot: (spotId, update) =>
        set((s) => ({
          savedSpots: {
            ...s.savedSpots,
            [spotId]: { ...s.savedSpots[spotId], ...update },
          },
        })),

      unsaveSpot: (spotId) =>
        set((s) => {
          const next = { ...s.savedSpots };
          delete next[spotId];
          return { savedSpots: next };
        }),

      // ── Countries ────────────────────────────────────────────────────────
      // Merges with any existing record (e.g. existing notes) rather than replacing it
      // outright — this doubles as the general "create or update a saved country" entry
      // point, not just a "mark visited" action.
      saveCountryVisited: (countryCode, extra = {}) =>
        set((s) => ({
          savedCountries: {
            ...s.savedCountries,
            [countryCode]: { ...s.savedCountries[countryCode], countryCode, ...extra },
          },
        })),

      unsaveCountry: (countryCode) =>
        set((s) => {
          const next = { ...s.savedCountries };
          delete next[countryCode];
          return { savedCountries: next };
        }),

      updateSavedCountry: (countryCode, update) =>
        set((s) => ({
          savedCountries: {
            ...s.savedCountries,
            [countryCode]: { ...s.savedCountries[countryCode], ...update },
          },
        })),

      removeDestinationTrip: (destinationId, tripId) => set((s) => withoutDestinationTrip(s, destinationId, tripId)),
      removeCountryTrip: (countryCode, tripId) => set((s) => withoutCountryTrip(s, countryCode, tripId)),
      unvisitSpot: (spotId) => set((s) => withoutSpot(s, spotId)),
      unvisitDestination: (destinationId) => set((s) => withoutDestination(s, destinationId)),
      unvisitCountry: (countryCode) => set((s) => withoutCountry(s, countryCode)),

      selectDestination: (id) => set({ selectedDestinationId: id }),
      setUserName: (name) => set({ userName: name }),

      recentSearches: [],
      // Moves an already-listed place back to the top rather than listing it twice.
      addRecentSearch: (r) =>
        set((s) => ({
          recentSearches: [r, ...(s.recentSearches ?? []).filter(x => recentKey(x) !== recentKey(r))]
            .slice(0, MAX_RECENT_SEARCHES),
        })),
      removeRecentSearch: (r) =>
        set((s) => ({ recentSearches: (s.recentSearches ?? []).filter(x => recentKey(x) !== recentKey(r)) })),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'intrepid-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state && Object.keys(state.savedDestinations).length === 0) {
          state.savedDestinations = buildDefaultSaved();
        }
        // Backfill for state persisted before savedCountries existed.
        if (state && !state.savedCountries) {
          state.savedCountries = {};
        }
        // Likewise for recentSearches.
        if (state && !state.recentSearches) {
          state.recentSearches = [];
        }
      },
    }
  )
);

/**
 * Merged photo list for a destination: its own photos (added at destination level, untagged)
 * followed by every child-spot photo (tagged with spotId/spotName so the collage can label them).
 * Spot photos are the single source of truth — they live on the spot, not duplicated here.
 */
export function useDestinationPhotos(destinationId: string): PhotoEntry[] {
  const savedDestinations = useStore((s) => s.savedDestinations);
  const savedSpots        = useStore((s) => s.savedSpots);

  return useMemo(() => {
    const own = savedDestinations[destinationId]?.photos ?? [];
    const spotPhotos: PhotoEntry[] = [];
    for (const ss of Object.values(savedSpots)) {
      if (ss.destinationId !== destinationId || !ss.photos?.length) continue;
      const spot = SPOTS.find((sp) => sp.id === ss.spotId);
      for (const p of ss.photos) {
        spotPhotos.push({ ...p, spotId: ss.spotId, spotName: p.spotName ?? spot?.name });
      }
    }
    return [...own, ...spotPhotos];
  }, [savedDestinations, savedSpots, destinationId]);
}

// Visited status for every spot, destination and country, derived from what's logged — the one place
// the app gets it from (see utils/visitStatus.ts). Built once per change to the saved records and
// shared by every caller, so a list of cards each asking for it doesn't each rebuild it.
let visitIndexCache: { inputs: unknown[]; index: VisitIndex } | null = null;
function getVisitIndex(s: AppState): VisitIndex {
  const inputs = [s.savedDestinations, s.savedSpots, s.savedCountries];
  if (!visitIndexCache || inputs.some((x, i) => x !== visitIndexCache!.inputs[i])) {
    visitIndexCache = { inputs, index: buildVisitIndex(s.savedDestinations, s.savedSpots, s.savedCountries) };
  }
  return visitIndexCache.index;
}
export function useVisitIndex(): VisitIndex {
  return useStore(getVisitIndex);
}

export function useStats() {
  const savedDestinations = useStore((s) => s.savedDestinations);
  const index = useVisitIndex();

  return useMemo(() => {
    const entries = Object.values(savedDestinations);
    const visitedEntries = entries.filter((e) => e.type === 'visited');

    // Visited destinations/countries per the visit index — including ones visited only through a spot
    // or a country trip — rather than only destinations with their own record.
    const visitedDests = DESTINATIONS.filter((d) => index.isDestVisited(d.id));

    const countryCodes = index.visitedCountryCodes;
    const continents = new Set<Continent>(visitedDests.map((d) => d.continent));

    const countryCount: Record<string, number> = {};
    for (const d of visitedDests) {
      countryCount[d.country] = (countryCount[d.country] ?? 0) + 1;
    }
    const mostVisitedCountry =
      Object.entries(countryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    const visitsByYear: Record<string, number> = {};
    for (const e of visitedEntries) {
      if (e.visitDate) {
        const yr = e.visitDate.slice(0, 4);
        visitsByYear[yr] = (visitsByYear[yr] ?? 0) + 1;
      }
    }

    const visitDates = visitedEntries
      .filter((e) => e.visitDate)
      .map((e) => e.visitDate!)
      .sort();

    const continentDestCount: Record<string, number> = {};
    for (const d of visitedDests) {
      continentDestCount[d.continent] = (continentDestCount[d.continent] ?? 0) + 1;
    }

    return {
      totalDestinations: visitedDests.length,
      totalVisited: visitedDests.length,
      // Spots actually logged (their own visit, or ticked on a trip) — not every spot of a visited destination.
      totalSpots: index.visitedSpotIds.size,
      totalCountries: countryCodes.size,
      visitedCountryCodes: [...countryCodes],
      continentsVisited: [...continents] as Continent[],
      continentDestCount,
      mostVisitedCountry,
      countryCount,
      visitsByYear,
      firstVisitDate: visitDates[0] ?? '',
      mostRecentVisitDate: visitDates[visitDates.length - 1] ?? '',
    };
  }, [savedDestinations, index]);
}
