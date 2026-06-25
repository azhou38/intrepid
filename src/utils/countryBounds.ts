// Approximate bounding boxes for the 10 countries in the destinations dataset.
// Format: [minLat, maxLat, minLng, maxLng]
const BOUNDS: Record<string, [number, number, number, number]> = {
  AU: [-43.6, -10.7, 113.3, 153.6],
  CZ: [ 48.6,  51.1,  12.1,  18.9],
  ES: [ 35.2,  43.8,  -9.3,   4.3],
  FR: [ 41.3,  51.1,  -5.1,   9.6],
  GB: [ 49.9,  61.1,  -8.6,   1.8],
  GR: [ 34.8,  41.8,  19.3,  29.6],
  IT: [ 36.6,  47.1,   6.6,  18.5],
  JP: [ 24.0,  45.5, 122.9, 153.0],
  NL: [ 50.8,  53.5,   3.4,   7.2],
  US: [ 20.0,  50.0,-125.0, -66.0],
};

export interface CountryRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Returns the geographic center of the country. */
export function getCountryCenter(countryCode: string): { latitude: number; longitude: number } | null {
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
