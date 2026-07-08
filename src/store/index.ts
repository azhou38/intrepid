import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedDestination, SavedSpot, SavedCountry, PhotoEntry, Continent } from '../types';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS } from '../data/spots';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface AppState {
  savedDestinations: Record<string, SavedDestination>;
  savedSpots: Record<string, SavedSpot>;
  savedCountries: Record<string, SavedCountry>;
  selectedDestinationId: string | null;
  userName: string;

  saveDestination: (id: string, type: 'visited' | 'wishlist', extra?: Partial<Omit<SavedDestination, 'destinationId' | 'type'>>) => void;
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
  selectDestination: (id: string | null) => void;
  setUserName: (name: string) => void;
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
      saveSpotVisited: (spotId, destinationId) =>
        set((s) => {
          const nextSpots = {
            ...s.savedSpots,
            [spotId]: s.savedSpots[spotId] ?? { spotId, destinationId },
          };
          // Auto-mark the parent destination visited (keeps any existing wishlist flag/data).
          const parent = s.savedDestinations[destinationId];
          const nextDests = parent?.type === 'visited'
            ? s.savedDestinations
            : {
                ...s.savedDestinations,
                [destinationId]: {
                  ...(parent ?? { destinationId }),
                  destinationId,
                  type: 'visited' as const,
                },
              };
          return { savedSpots: nextSpots, savedDestinations: nextDests };
        }),

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
      // Merges with any existing record (e.g. an isWishlisted-only entry, or existing notes)
      // rather than replacing it outright — this doubles as the general "create or update a
      // saved country" entry point, not just a "mark visited" action.
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

      selectDestination: (id) => set({ selectedDestinationId: id }),
      setUserName: (name) => set({ userName: name }),
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

export function useStats() {
  const savedDestinations = useStore((s) => s.savedDestinations);

  return useMemo(() => {
    const entries = Object.values(savedDestinations);
    const visitedEntries = entries.filter((e) => e.type === 'visited');
    const wishlistCount = entries.filter((e) => e.isWishlisted || e.type === 'wishlist').length;

    const visitedDests = visitedEntries
      .map((e) => DESTINATIONS.find((d) => d.id === e.destinationId))
      .filter(Boolean) as typeof DESTINATIONS;

    const countryCodes = new Set(visitedDests.map((d) => d.countryCode));
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
      totalWishlist: wishlistCount,
      totalSpots: SPOTS.filter(s => new Set(visitedDests.map(d => d.id)).has(s.destinationId)).length,
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
  }, [savedDestinations]);
}
