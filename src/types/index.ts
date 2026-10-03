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

// Known recurring seasonal patterns that drive tourist crowds independently of (or on top of)
// generic weather/hemisphere assumptions — see utils/travelData.ts's crowd model. A tag only
// asserts THAT a pattern applies to this destination; the actual month-by-month curve for each
// tag is defined once, generically, and shared by every destination that carries it. Tags whose
// timing genuinely varies by place (a specific festival, a migration, a pilgrimage) take an
// explicit `months`; the rest (ski, cherry blossom, beach, northern lights, autumn foliage) have
// a sensible default and only need `months` to override it.
export type SeasonalTagKind =
  | 'ski' | 'cherry-blossom' | 'autumn-foliage' | 'beach-peak' | 'northern-lights'
  | 'monsoon-dry-season' | 'major-festival' | 'religious-pilgrimage' | 'wildlife-migration';

export interface SeasonalSignal {
  tag: SeasonalTagKind;
  // 1–12 (Jan–Dec). Required for monsoon-dry-season/major-festival/religious-pilgrimage/
  // wildlife-migration, since those have no universal default; optional override for the rest.
  months?: number[];
  // 0–1, default 1: how strongly this signal should pull the curve, for a pattern that matters
  // but isn't the dominant reason people visit (e.g. a smaller regional festival).
  strength?: number;
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  // IANA timezone identifier (e.g. "Europe/Paris") — used to compute each spot's live open/
  // closed status in the destination's own local time rather than the device's.
  timezone: string;
  continent: Continent;
  coordinates: { latitude: number; longitude: number };
  category: DestinationCategory;
  // The full span (in km) the map's default zoom for this destination should fit on screen —
  // sized to just contain the metro area (city destinations) or the visited/scenic extent of
  // the park or natural region (nature/park destinations), rather than one fixed zoom for every
  // destination regardless of size. See getDestZoomDelta in MapScreen.tsx, the sole consumer.
  defaultZoomSpanKm: number;
  icon?: string;
  // Prominence tier, used to rank what's shown when space is limited (pin plans, Near You):
  //   1 world-famous · 2 country highlight · 3 regional favourite · 4 worth a detour · 5 local.
  // Keep the tiers honest as coverage grows — a country guidebook's "top experiences" map to 1–2.
  rank: 1 | 2 | 3 | 4 | 5;
  tagline?: string;
  description?: string;
  whyVisit?: [string, string, string];
  // One Wikimedia Commons file name (no "File:" prefix) per whyVisit item — a specific photo hand-
  // picked to show exactly that reason (e.g. the Eiffel Tower AT NIGHT), shown beside it in the
  // About tab's "Why visit" card. Pre-resolved into imageManifest.json under "File:<name>" (see
  // scripts/build-image-manifest.ts), so it loads with no lookup — see fetchCommonsPhoto.
  whyVisitPhotos?: [string, string, string];
  // Up to three short (2–3 word) phrases, one per whyVisit item, for space-tight surfaces like
  // the Explore cards ("Hot springs · Nordic cafés · Northern lights").
  highlights?: string[];
  goodToKnow?: [GoodToKnowTip, GoodToKnowTip, GoodToKnowTip];
  // Destination-specific crowd drivers (Tier 2 of the crowd model) — see travelData.ts.
  seasonalTags?: SeasonalSignal[];
  // "Best time to visit" months (1–12), from general travel-guide consensus rather than this
  // app's own climate/crowd model — see levelsToMonthCrowd in travelData.ts, which uses this
  // directly instead of deriving "best" from computed crowd levels and temperature.
  bestMonths?: number[];
  // Freeform "why these months" sentence, also from travel-guide consensus rather than this
  // app's own weather/crowd numbers. Must contain exactly one `{months}` placeholder, which
  // WhenToVisitCard swaps for the actual (coloured) month range from `bestMonths`.
  bestTimeBlurb?: string;
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
  destinationId?: string;   // absent for a standalone spot (see Spot in data/spots.ts)
  rating?: number;       // 1–5 stars
  visitDate?: string;    // legacy single date (YYYY-MM-DD, day may be '00')
  notes?: string;        // legacy single note
  photos?: PhotoEntry[]; // legacy single photo set
  // Same per-visit journal-entry system as SavedDestination.visits — a spot has no selector
  // section of its own (see the shared VisitCardList/VisitModuleSheet's own selectorLabel), but
  // otherwise logs trips the same way.
  visits?: Visit[];
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
  visitedCount: number; // visited destinations in the country
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
  visitDate?: string; // legacy single date (YYYY-MM-DD) — presence is what made the country "visited" pre-visits-array
  notes?: string;      // legacy single note
  // Same per-visit journal-entry system as SavedDestination.visits, with the selector section
  // (see the shared VisitCardList/VisitModuleSheet) populated by this country's own
  // destinations rather than spots. Presence of visitDate, OR a non-empty visits array, OR one
  // of this country's own destinations being visited, is what makes the country "visited" —
  // see CountrySheet's own isCountryVisited.
  visits?: Visit[];
}
