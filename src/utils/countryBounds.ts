// Approximate bounding boxes for countries in the destinations dataset.
// Format: [minLat, maxLat, minLng, maxLng]
const BOUNDS: Record<string, [number, number, number, number]> = {
  AT: [ 46.4,  49.0,   9.5,  17.2],
  AU: [-43.6, -10.7, 113.3, 153.6],
  BE: [ 49.5,  51.5,   2.5,   6.4],
  CH: [ 45.8,  47.8,   6.0,  10.5],
  CZ: [ 48.6,  51.1,  12.1,  18.9],
  DE: [ 47.3,  55.1,   6.0,  15.0],
  DK: [ 54.5,  57.8,   8.0,  15.2],
  ES: [ 35.2,  43.8,  -9.3,   4.3],
  FI: [ 59.8,  70.1,  19.1,  31.6],
  FR: [ 41.3,  51.1,  -5.1,   9.6],
  GB: [ 49.9,  61.1,  -8.6,   1.8],
  GR: [ 34.8,  41.8,  19.3,  29.6],
  IE: [ 51.4,  55.4, -10.5,  -6.0],
  IS: [ 63.4,  66.6, -24.5, -13.5],
  IT: [ 36.6,  47.1,   6.6,  18.5],
  JP: [ 30.5,  45.5, 129.0, 146.0],
  NL: [ 50.8,  53.5,   3.4,   7.2],
  NO: [ 57.9,  71.2,   4.5,  31.1],
  PT: [ 36.8,  42.2,  -9.5,  -6.2],
  SE: [ 55.3,  69.1,  11.0,  24.2],
  US: [ 25.0,  50.0,-125.0, -66.0],
};

// Approximate real-world tourism/fame ranking for the countries in this dataset (1 = most
// famous/most-visited, larger = less so). Used purely to prioritize which country map pins
// stay visible when there isn't room to show them all without colliding — not a scientific
// ranking, just a reasonable approximation of global tourist-arrival prominence.
const POPULARITY: Record<string, number> = {
  FR: 1, ES: 2, IT: 3, US: 4, GB: 5, DE: 6, JP: 7, GR: 8, AT: 9, NL: 10,
  PT: 11, CH: 12, CZ: 13, IE: 14, IS: 15, AU: 16, BE: 17, DK: 18, SE: 19, NO: 20, FI: 21,
};

/** Lower = more famous/higher display priority. Unknown countries sort last. */
export function getCountryPopularity(countryCode: string): number {
  return POPULARITY[countryCode] ?? 999;
}

export interface CountryRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Hand-tuned label anchor points ([lat, lng]) for countries whose bounding-box centre
// falls off the landmass — elongated or curved shapes throw the box centre into the sea or
// a neighbouring country (Norway's lands in Sweden, Japan's in the Sea of Japan, Greece's
// in the Aegean, Denmark's in the Kattegat; the UK's lands in southern Scotland where
// central England reads better). Countries not listed have well-behaved box centres.
const LABEL_POINTS: Record<string, [number, number]> = {
  DK: [56.0, 9.3],    // central Jutland
  GB: [52.9, -1.5],   // English midlands
  GR: [39.4, 22.0],   // Thessaly (mainland)
  JP: [36.4, 138.5],  // central Honshu
  NO: [61.2, 8.8],    // southern-interior Norway
};

/** Returns the point a country's map pin/label should anchor to — a hand-tuned on-landmass
 *  point where one exists (see LABEL_POINTS), otherwise the bounding-box center. */
export function getCountryCenter(countryCode: string): { latitude: number; longitude: number } | null {
  const lp = LABEL_POINTS[countryCode];
  if (lp) return { latitude: lp[0], longitude: lp[1] };
  const b = BOUNDS[countryCode];
  if (!b) return null;
  return { latitude: (b[0] + b[1]) / 2, longitude: (b[2] + b[3]) / 2 };
}

/**
 * Returns the latitudeDelta at which the map should switch from a country pill
 * to individual destination pins. Based on the country's geographic height so
 * large countries (AU, US) switch later and small ones (NL, CZ) switch earlier.
 * Falls back to the legacy fixed threshold for unknown country codes.
 */
export function getClusterThreshold(countryCode: string, fallback = 30): number {
  const b = BOUNDS[countryCode];
  if (!b) return fallback;
  const latSpan = b[1] - b[0];
  return latSpan * 3.0;
}

/** Returns the NE/SW corners of a country's bounding box for use with fitBounds. */
export function getCountryBounds(countryCode: string): {
  ne: { latitude: number; longitude: number };
  sw: { latitude: number; longitude: number };
} | null {
  const b = BOUNDS[countryCode];
  if (!b) return null;
  return {
    ne: { latitude: b[1], longitude: b[3] },
    sw: { latitude: b[0], longitude: b[2] },
  };
}

/** Returns a MapView region that fits the whole country with optional padding factor (default 1.10). */
export function getCountryRegion(countryCode: string, padFactor = 1.10): CountryRegion | null {
  const b = BOUNDS[countryCode];
  if (!b) return null;
  const [minLat, maxLat, minLng, maxLng] = b;
  const latSpan = (maxLat - minLat) * padFactor;
  const lngSpan = (maxLng - minLng) * padFactor;
  return {
    latitude:      (minLat + maxLat) / 2,
    longitude:     (minLng + maxLng) / 2,
    latitudeDelta:  latSpan,
    longitudeDelta: lngSpan,
  };
}
