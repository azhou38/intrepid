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

// A practical, destination-specific heads-up tip — things that trip up first-time
// travelers (etiquette quirks, scams, booking gotchas, timing pitfalls, etc.). `icon` is a
// single emoji used as that tip's custom icon in the Good to Know list.
export interface GoodToKnowTip {
  icon: string;
  title: string;
  detail: string;
}

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
  // Up to three short (2–3 word) phrases, one per whyVisit item, for space-tight surfaces like
  // the Explore cards ("Hot springs · Nordic cafés · Northern lights").
  highlights?: string[];
  goodToKnow?: [GoodToKnowTip, GoodToKnowTip, GoodToKnowTip];
}

export type SpotCategory =
  | 'museum'
  | 'landmark'
  | 'monument'
  | 'religious'
  | 'nature'
  | 'viewpoint'
  | 'hike'
  | 'entertainment'
  | 'market'
  | 'beach'
  | 'historic';

export const SPOT_CATEGORY_META: Record<SpotCategory, { label: string; icon: string }> = {
  museum:        { label: 'Museum',         icon: '🏛️' },
  landmark:      { label: 'Landmark',       icon: '🗽' },
  monument:      { label: 'Monument',       icon: '🗿' },
  religious:     { label: 'Religious Site', icon: '⛪' },
  nature:        { label: 'Nature & Parks', icon: '🌿' },
  viewpoint:     { label: 'Viewpoint',      icon: '🌄' },
  hike:          { label: 'Hike / Trail',   icon: '🥾' },
  entertainment: { label: 'Entertainment',  icon: '🎭' },
  market:        { label: 'Market',         icon: '🛍️' },
  beach:         { label: 'Beach',          icon: '🏖️' },
  historic:      { label: 'Historic Site',  icon: '🏺' },
};

export interface PhotoEntry {
  uri: string;
  width: number;
  height: number;
  // The media library's own stable ID for this asset (expo-image-picker's ImagePickerAsset.assetId)
  // — used to detect the same photo being picked again, since `uri` alone isn't reliable for
  // that (the picker can hand back a fresh temp-file copy of the same underlying photo on a
  // later pick, e.g. on iOS). Absent when the OS didn't provide one (e.g. limited library
  // access, or an Android file picked outside the media library) — those can't be deduped.
  assetId?: string;
  // When a photo originates from a spot, it's tagged so the destination collage
  // can show which spot it came from. Absent for photos added at the destination level.
  spotId?: string;
  spotName?: string;
}

export interface SavedSpot {
  spotId: string;
  destinationId: string;
  rating?: number;       // 1–5 stars
  visitDate?: string;    // YYYY-MM-DD (day may be '00')
  notes?: string;
  photos?: PhotoEntry[];
}

export interface Visit {
  id: string;
  // Optional name for the trip itself ("Anniversary trip", "Layover"), distinct from the
  // destination's own name — most visits won't need one, so this is never required.
  title?: string;
  startDate: string;
  endDate?: string;
  // Each visit is its own self-contained log entry (like a separate Strava activity) —
  // spots visited, photos, and notes all live here per-visit, not shared across every
  // trip to the destination.
  spotIds?: string[];
  photos?: PhotoEntry[];
  notes?: string;
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
  type: 'visited';
  visitDate?: string;      // legacy single date
  notes?: string;
  photos?: PhotoEntry[];
  visits?: Visit[];
}

// A whole COUNTRY marked visited, independent of any individual destination's own visited
// status — lets the country sheet's "My Visit" tab exist even for a trip that didn't map
// onto one of this app's curated destinations.
export interface SavedCountry {
  countryCode: string;
  visitDate?: string; // YYYY-MM-DD — presence is what makes the country "visited"
  notes?: string;
}
