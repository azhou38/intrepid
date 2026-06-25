export type Continent =
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'Oceania'
  | 'South America';

export const CONTINENTS: Continent[] = [
  'Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America',
];

export const CONTINENT_COLORS: Record<Continent, string> = {
  Africa: '#F59E0B',
  Asia: '#EF4444',
  Europe: '#3B82F6',
  'North America': '#10B981',
  Oceania: '#8B5CF6',
  'South America': '#F97316',
};

export const CONTINENT_EMOJIS: Record<Continent, string> = {
  Africa: '🌍',
  Asia: '🌏',
  Europe: '🌍',
  'North America': '🌎',
  Oceania: '🌊',
  'South America': '🌎',
};

export type DestinationCategory =
  | 'city'
  | 'park'
  | 'beach'
  | 'mountain'
  | 'landmark'
  | 'island'
  | 'desert'
  | 'ruin'
  | 'nature'
  | 'lake';

export const CATEGORY_ICONS: Record<DestinationCategory, string> = {
  city: '🏙',
  park: '🌲',
  beach: '🏖',
  mountain: '⛰',
  landmark: '🏛',
  island: '🏝',
  desert: '🏜',
  ruin: '🏺',
  nature: '🌿',
  lake: '💧',
};

export interface Destination {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  continent: Continent;
  coordinates: { latitude: number; longitude: number };
  category: DestinationCategory;
  icon?: string;
  rank: 1 | 2 | 3 | 4 | 5;
  tagline?: string;
  description?: string;
  whyVisit?: [string, string, string];
}

export interface PhotoEntry {
  uri: string;
  width: number;
  height: number;
}

export interface Visit {
  id: string;
  startDate: string;
  endDate?: string;
}

export interface CountryCluster {
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  count: number;
  minRank: number;
  visitedCount: number;
}

export interface SavedDestination {
  destinationId: string;
  type: 'visited' | 'wishlist';
  isWishlisted?: boolean;  // true when on wishlist; can coexist with type:'visited'
  visitDate?: string;      // legacy single date
  notes?: string;
  rating?: number; // 0.5–5 in 0.5 increments
  photos?: PhotoEntry[];
  visits?: Visit[];
}
