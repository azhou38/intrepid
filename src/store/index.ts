import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedDestination, Continent } from '../types';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS } from '../data/spots';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface AppState {
  savedDestinations: Record<string, SavedDestination>;
  selectedDestinationId: string | null;
  userName: string;

  saveDestination: (id: string, type: 'visited' | 'wishlist', extra?: Partial<Omit<SavedDestination, 'destinationId' | 'type'>>) => void;
  unsaveDestination: (id: string) => void;
  updateSaved: (id: string, update: Partial<SavedDestination>) => void;
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
      },
    }
  )
);

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
