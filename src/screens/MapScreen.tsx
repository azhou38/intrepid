import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable, Text, Dimensions, Animated, Platform, TextInput, Image } from 'react-native';
import MapboxGL from '@rnmapbox/maps';

const MAPBOX_TOKEN = 'pk.eyJ1IjoidGFiYnkxMDEwIiwiYSI6ImNtcXN3ZHNrMTBkdG4ydnB4dGx0cjhzbTEifQ.dgznC6Z7ugUd5u56TZ3sjg';
MapboxGL.setAccessToken(MAPBOX_TOKEN);

// Fetch a Mapbox style, strip text-label symbol layers, and force Mercator (flat) projection.
// Returns null if the style uses the newer imports-based format (layers array is empty).
async function fetchStyleNoLabels(styleId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/styles/v1/${styleId}?access_token=${MAPBOX_TOKEN}`,
    );
    const style = await res.json();
    const layers: any[] = style.layers ?? [];
    if (layers.length === 0) return null; // imports-based style — can't filter client-side
    style.layers = layers.filter(
      (l: any) => !(l.type === 'symbol' && l.layout?.['text-field']),
    );
    style.projection = { name: 'mercator' };
    return JSON.stringify(style);
  } catch {
    return null;
  }
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

function latDeltaToZoom(latDelta: number): number {
  return Math.max(0, Math.min(22, Math.log2(360 / latDelta) - 1));
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers, Check, SlidersHorizontal, X, Search } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { CATEGORY_ICONS } from '../types';
import type { Destination, CountryCluster } from '../types';
import { flag } from '../utils/stats';
import { getCountryRegion, getCountryBounds, getCountryCenter, getClusterThreshold } from '../utils/countryBounds';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS, type Spot } from '../data/spots';
import DestinationSheet from '../components/Map/DestinationSheet';
import CountrySheet from '../components/Map/CountrySheet';
import { photoCache } from '../utils/photoCache';

const VISITED_COLOR  = '#10B981';
const WISHLIST_COLOR = '#EC4899';
const EXPLORE_COLOR  = '#6366F1';

const PIN_SIZE   = 46;
const PIN_BORDER = 3;
const BADGE_SIZE = 20;

function DestPin({ dest, spotCount, isVisited, isWishlist, isSelected }: {
  dest: Destination;
  spotCount: number;
  isVisited: boolean;
  isWishlist: boolean;
  isSelected: boolean;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    photoCache.get(dest.id) ?? null,
  );
  useEffect(() => {
    if (photoCache.has(dest.id)) { setPhotoUrl(photoCache.get(dest.id)!); return; }
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(dest.name)}`)
      .then(r => r.json())
      .then(d => {
        const url = d?.originalimage?.source ?? d?.thumbnail?.source ?? null;
        if (url) { photoCache.set(dest.id, url); setPhotoUrl(url); }
      })
      .catch(() => {});
  }, [dest.id]);

  const ringColor = isVisited ? '#10B981' : isWishlist ? '#EC4899' : 'white';

  return (
    <View style={pinSt.wrap}>
      <View style={pinSt.circleWrap}>
        <View style={[pinSt.circle, { borderColor: ringColor }]}>
          {photoUrl
            ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
            : <Text style={pinSt.fallbackIcon}>{dest.icon ?? CATEGORY_ICONS[dest.category]}</Text>
          }
        </View>
        {spotCount > 0 && (
          <View style={[pinSt.badge, { backgroundColor: isVisited ? '#10B981' : '#111827' }]}>
            <Text style={pinSt.badgeTxt} adjustsFontSizeToFit numberOfLines={1}>
              {spotCount}
            </Text>
          </View>
        )}
      </View>
      <Text style={pinSt.label} numberOfLines={1}>{dest.name}</Text>
    </View>
  );
}

const pinSt = StyleSheet.create({
  wrap:       { alignItems: 'center' },
  circleWrap: { width: PIN_SIZE, height: PIN_SIZE },
  circle: {
    width: PIN_SIZE, height: PIN_SIZE, borderRadius: PIN_SIZE / 2,
    borderWidth: PIN_BORDER, borderColor: 'white',
    overflow: 'hidden', backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 10,
  },
  fallbackIcon: { fontSize: 22 },
  badge: {
    position: 'absolute', bottom: -3, right: -3,
    width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: BADGE_SIZE / 2,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: 'white', textAlign: 'center' },
  label: {
    marginTop: 4, fontSize: 11, fontWeight: '700',
    color: 'white', textAlign: 'center', maxWidth: 90,
    textTransform: 'uppercase', letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
});

// ─── Country Marker (photo circle — world view) ───────────────────────────────
const CPIN_SIZE   = 62;
const CPIN_BORDER = 3;
const CPIN_BADGE  = 22;

function CountryPin({ cluster }: { cluster: CountryCluster }) {
  const cacheKey = `country_${cluster.countryCode}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(photoCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (photoCache.has(cacheKey)) { setPhotoUrl(photoCache.get(cacheKey)!); return; }
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cluster.country)}`)
      .then(r => r.json())
      .then(d => {
        const url = d?.originalimage?.source ?? d?.thumbnail?.source ?? null;
        if (url) { photoCache.set(cacheKey, url); setPhotoUrl(url); }
      })
      .catch(() => {});
  }, [cluster.countryCode, cluster.country, cacheKey]);

  const isVisited = cluster.visitedCount > 0;
  return (
    <View style={cpinSt.wrap}>
      <View style={cpinSt.circleWrap}>
        <View style={[cpinSt.circle, isVisited && cpinSt.circleVisited]}>
          {photoUrl
            ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
            : <Text style={cpinSt.flagFallback}>{flag(cluster.countryCode)}</Text>
          }
        </View>
        <View style={[cpinSt.badge, { backgroundColor: isVisited ? VISITED_COLOR : '#374151' }]}>
          <Text style={cpinSt.badgeTxt}>{cluster.count}</Text>
        </View>
      </View>
      <Text style={cpinSt.label} numberOfLines={1}>{cluster.country}</Text>
    </View>
  );
}

const cpinSt = StyleSheet.create({
  wrap:       { alignItems: 'center' },
  circleWrap: { width: CPIN_SIZE + 4, height: CPIN_SIZE + 4 },
  circle: {
    width: CPIN_SIZE, height: CPIN_SIZE, borderRadius: CPIN_SIZE / 2,
    borderWidth: CPIN_BORDER, borderColor: 'white',
    overflow: 'hidden', backgroundColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.30, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  circleVisited: { borderColor: VISITED_COLOR },
  flagFallback: { fontSize: 32 },
  badge: {
    position: 'absolute', bottom: 0, right: 0,
    width: CPIN_BADGE, height: CPIN_BADGE, borderRadius: CPIN_BADGE / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 4, elevation: 5,
  },
  badgeTxt: { fontSize: 11, fontWeight: '800', color: 'white' },
  label: {
    marginTop: 3, fontSize: 11, fontWeight: '700', color: '#111827',
    textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 }, maxWidth: 90,
  },
});


// Spot counts per destination (static — SPOTS never changes at runtime)
const SPOT_COUNT_BY_DEST: Record<string, number> = {};
for (const s of SPOTS) SPOT_COUNT_BY_DEST[s.destinationId] = (SPOT_COUNT_BY_DEST[s.destinationId] ?? 0) + 1;

// ─── Constants ────────────────────────────────────────────────────────────────
const { height: H } = Dimensions.get('window');

const SPOT_THRESHOLD     = 0.5;
const MAX_VISIBLE        = 60;
// Below this latDelta individual destination pins are shown;
// above it, destinations are collapsed to per-country pills.
// Above this latDelta only rank-1 countries are shown (de-crowd further).
const CLUSTER_PROMINENT  = 80;
// Normalized viewport distance at which two destination pins are merged into a cluster bubble.
const DEST_CLUSTER_DIST  = 0.08;

type DestItem =
  | { type: 'pin';     dest: Destination }
  | { type: 'cluster'; count: number; latitude: number; longitude: number; dests: Destination[] };

type SearchResult =
  | { type: 'country';     country: string; countryCode: string }
  | { type: 'destination'; destination: Destination }
  | { type: 'spot';        spot: Spot; destination: Destination }

type MapFilter   = 'all' | 'visited' | 'wishlist';
type MapStyleKey = 'standard' | 'satellite';
type MapState    = 'world' | 'context' | 'sheet';

const MAP_TYPES: { key: MapStyleKey; label: string }[] = [
  { key: 'standard',  label: 'Standard'  },
  { key: 'satellite', label: 'Satellite' },
];


function getVisibleRank(latDelta: number): number {
  if (latDelta > 50) return 1;
  if (latDelta > 20) return 2;
  if (latDelta > 8)  return 3;
  if (latDelta > 3)  return 4;
  return 5;
}

function getZoomDelta(category: string): number {
  if (category === 'park' || category === 'nature' || category === 'desert') return 0.25;
  return 0.1;
}


export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<MapboxGL.Camera>(null);

  const savedDestinations = useStore(s => s.savedDestinations);

  const [mapType,        setMapType       ] = useState<MapStyleKey>('standard');
  const [filter,         setFilter        ] = useState<MapFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [noLabelStyles, setNoLabelStyles] = useState<Partial<Record<MapStyleKey, string>>>({});
  const [backdropActive, setBackdropActive] = useState(false);
  const backdropRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const [mapState,       setMapState      ] = useState<MapState>('world');
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null);
  const [region,       setRegion      ] = useState<Region>({
    latitude: 20, longitude: 10, latitudeDelta: 120, longitudeDelta: 120,
  });

  const prevRegionRef       = useRef<Region>({ latitude: 20, longitude: 10, latitudeDelta: 120, longitudeDelta: 120 });
  const lastWorldRegionRef  = useRef<Region>({ latitude: 20, longitude: 10, latitudeDelta: 120, longitudeDelta: 120 });
  const prevCountryRef      = useRef<CountryCluster | null>(null);

  const [showMapMenu, setShowMapMenu] = useState(false);

  // ── Zoom / exit timers ───────────────────────────────────────────────────
  const [zoomedIntoDestination, setZoomedIntoDestination] = useState(false);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraTimeRef = useRef(0);



  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery  ] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // ── Country selection ─────────────────────────────────────────────────────
  const [selectedCountry, setSelectedCountry] = useState<CountryCluster | null>(null);
  // True only after the zoom animation into a country completes, so pins don't flash
  // during the animation (when region.latitudeDelta is still at world-view level).
  const selectedCountryRef   = useRef<CountryCluster | null>(null);
  // The settled camera region when a country view first stabilises — "Return" only shows after this is captured
  const [countryHomeRegion, setCountryHomeRegion] = useState<Region | null>(null);
  const countryHomeRegionRef = useRef<Region | null>(null);
  const [destHomeRegion, setDestHomeRegion] = useState<Region | null>(null);
  const destHomeRegionRef = useRef<Region | null>(null);
  const lastCountryPressRef  = useRef(0);
  const lastMenuOpenRef      = useRef(0);
  const showMapMenuRef       = useRef(false);
  const showFilterMenuRef    = useRef(false);
  // Keep refs in sync so MapView's native onPress can read current menu state synchronously
  showMapMenuRef.current    = showMapMenu;
  showFilterMenuRef.current = showFilterMenu;

  // ── Animation refs ────────────────────────────────────────────────────────
  const worldPillAnim    = useRef(new Animated.Value(1)).current;
  const breadcrumbAnim   = useRef(new Animated.Value(0)).current;
  const returnPromptAnim = useRef(new Animated.Value(0)).current;
  const destReturnPromptAnim = useRef(new Animated.Value(0)).current;
  const worldPillScale  = useMemo(() => worldPillAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }), []);
  const breadcrumbScale = useMemo(() => breadcrumbAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }), []);

  // Show "Return" only after the camera has settled into the country view, and only if the
  // user has since panned or zoomed away from that settled position.
  const showReturnPrompt = useMemo(() => {
    if (!selectedCountry || selectedDest || !countryHomeRegion) return false;
    const zoomedOut = region.latitudeDelta > countryHomeRegion.latitudeDelta * 1.6;
    const pannedAway =
      Math.abs(region.latitude  - countryHomeRegion.latitude)  > countryHomeRegion.latitudeDelta  * 0.45 ||
      Math.abs(region.longitude - countryHomeRegion.longitude) > countryHomeRegion.longitudeDelta * 0.45;
    return zoomedOut || pannedAway;
  }, [selectedCountry, selectedDest, countryHomeRegion, region]);

  const showDestReturnPrompt = useMemo(() => {
    if (!selectedDest || !destHomeRegion) return false;
    const zoomedOut = region.latitudeDelta > destHomeRegion.latitudeDelta * 1.6;
    const pannedAway =
      Math.abs(region.latitude  - destHomeRegion.latitude)  > destHomeRegion.latitudeDelta  * 0.45 ||
      Math.abs(region.longitude - destHomeRegion.longitude) > destHomeRegion.longitudeDelta * 0.45;
    return zoomedOut || pannedAway;
  }, [selectedDest, destHomeRegion, region]);

  useEffect(() => {
    Animated.timing(returnPromptAnim, {
      toValue: showReturnPrompt ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [showReturnPrompt, returnPromptAnim]);

  useEffect(() => {
    Animated.timing(destReturnPromptAnim, {
      toValue: showDestReturnPrompt ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [showDestReturnPrompt, destReturnPromptAnim]);

  // ── Map data ─────────────────────────────────────────────────────────────
  const visibleRank = useMemo(() => getVisibleRank(region.latitudeDelta), [region.latitudeDelta]);

  const visibleDests = useMemo(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const pad = 0.15;
    const minLat = latitude - latitudeDelta * (0.5 + pad);
    const maxLat = latitude + latitudeDelta * (0.5 + pad);
    const minLng = longitude - longitudeDelta * (0.5 + pad);
    const maxLng = longitude + longitudeDelta * (0.5 + pad);

    const results: Destination[] = [];
    const added = new Set<string>();

    // In country view: always include every destination in the selected country
    // (bypasses rank and bounds so none are omitted when crammed)
    if (selectedCountry) {
      for (const d of DESTINATIONS) {
        if (d.country !== selectedCountry.country) continue;
        const saved = savedDestinations[d.id];
        if (filter === 'visited'  && saved?.type !== 'visited') continue;
        if (filter === 'wishlist' && !saved?.isWishlisted && saved?.type !== 'wishlist') continue;
        results.push(d);
        added.add(d.id);
      }
    }

    // Add remaining visible destinations from other countries using normal rank/bounds logic
    for (const d of DESTINATIONS) {
      if (added.has(d.id)) continue;
      const saved   = savedDestinations[d.id];
      const isSaved = !!saved;
      if (d.rank > visibleRank && !isSaved) continue;
      const { latitude: lat, longitude: lng } = d.coordinates;
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
      if (filter === 'visited'  && saved?.type !== 'visited') continue;
      if (filter === 'wishlist' && !saved?.isWishlisted && saved?.type !== 'wishlist') continue;
      results.push(d);
      if (results.length >= MAX_VISIBLE) break;
    }
    return results;
  }, [region, visibleRank, savedDestinations, filter, selectedCountry]);

  // Per-country adaptive clustering: each country independently decides pill vs pins
  // based on its own geographic size (via getClusterThreshold).
  const { countryPills, clusteredCodes } = useMemo(() => {
    const byCountry = new Map<string, {
      countryCode: string; lats: number[]; lngs: number[]; minRank: number; visitedCount: number;
    }>();

    for (const d of visibleDests) {
      let entry = byCountry.get(d.country);
      if (!entry) {
        entry = { countryCode: d.countryCode, lats: [], lngs: [], minRank: d.rank, visitedCount: 0 };
        byCountry.set(d.country, entry);
      }
      entry.lats.push(d.coordinates.latitude);
      entry.lngs.push(d.coordinates.longitude);
      if (d.rank < entry.minRank) entry.minRank = d.rank;
      if (savedDestinations[d.id]?.type === 'visited') entry.visitedCount++;
    }

    const pills: CountryCluster[] = [];
    const codes = new Set<string>();

    for (const [country, { countryCode, lats, lngs, minRank, visitedCount }] of byCountry) {
      const threshold = getClusterThreshold(countryCode);
      if (region.latitudeDelta <= threshold * 0.8) continue; // remove once fully faded out

      // At very wide zoom, only show rank-1 countries
      if (region.latitudeDelta > CLUSTER_PROMINENT && minRank > 1) continue;

      const center = getCountryCenter(countryCode);
      pills.push({
        country, countryCode,
        latitude:  center?.latitude  ?? lats.reduce((a, b) => a + b, 0) / lats.length,
        longitude: center?.longitude ?? lngs.reduce((a, b) => a + b, 0) / lngs.length,
        count: lats.length,
        minRank,
        visitedCount,
      });
      codes.add(countryCode);
    }

    pills.sort((a, b) => b.count - a.count || a.minRank - b.minRank);
    return { countryPills: pills, clusteredCodes: codes };
  }, [visibleDests, region.latitudeDelta, savedDestinations]);

  // Cluster nearby destination pins into bubble groups based on viewport proximity
  const destItems = useMemo((): DestItem[] => {
    if (visibleDests.length <= 1) return visibleDests.map(dest => ({ type: 'pin', dest }));
    const { latitude: cLat, longitude: cLng, latitudeDelta, longitudeDelta } = region;
    const nx = (d: Destination) => (d.coordinates.longitude - cLng) / longitudeDelta;
    const ny = (d: Destination) => (d.coordinates.latitude  - cLat) / latitudeDelta;
    const groups: { dests: Destination[]; cx: number; cy: number }[] = [];
    for (const dest of visibleDests) {
      const px = nx(dest), py = ny(dest);
      let placed = false;
      for (const g of groups) {
        const dx = px - g.cx, dy = py - g.cy;
        if (Math.sqrt(dx * dx + dy * dy) < DEST_CLUSTER_DIST) {
          g.dests.push(dest);
          g.cx = g.dests.reduce((s, d) => s + nx(d), 0) / g.dests.length;
          g.cy = g.dests.reduce((s, d) => s + ny(d), 0) / g.dests.length;
          placed = true;
          break;
        }
      }
      if (!placed) groups.push({ dests: [dest], cx: px, cy: py });
    }
    return groups.map(g => {
      if (g.dests.length === 1) return { type: 'pin', dest: g.dests[0] };
      const lat = g.dests.reduce((s, d) => s + d.coordinates.latitude,  0) / g.dests.length;
      const lng = g.dests.reduce((s, d) => s + d.coordinates.longitude, 0) / g.dests.length;
      return { type: 'cluster', count: g.dests.length, latitude: lat, longitude: lng, dests: g.dests };
    });
  }, [visibleDests, region]);

  // Diagnostic: log destItems when Japan is selected so we can verify Tokyo is present
  if (selectedCountry?.countryCode === 'JP') {
    console.log('[TripGlide] Japan destItems:', destItems.map(i => i.type === 'pin' ? `pin:${i.dest.name}` : `cluster:${i.count}(${i.dests.map(d => d.name).join(',')})`));
    console.log('[TripGlide] Japan region: latDelta=' + region.latitudeDelta.toFixed(2) + ' lngDelta=' + region.longitudeDelta.toFixed(2));
    console.log('[TripGlide] visibleDests:', visibleDests.map(d => d.name));
  }

  const visibleSpots = useMemo(() => {
    // In context/sheet mode, always show spots for the selected destination
    if (mapState !== 'world' && selectedDest) {
      if (region.latitudeDelta >= SPOT_THRESHOLD) return [];
      const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
      const pad = 0.15;
      const minLat = latitude - latitudeDelta * (0.5 + pad);
      const maxLat = latitude + latitudeDelta * (0.5 + pad);
      const minLng = longitude - longitudeDelta * (0.5 + pad);
      const maxLng = longitude + longitudeDelta * (0.5 + pad);
      return SPOTS.filter(s => {
        if (s.destinationId !== selectedDest.id) return false;
        const { latitude: lat, longitude: lng } = s.coordinates;
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });
    }
    if (region.latitudeDelta >= SPOT_THRESHOLD) return [];
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const pad = 0.1;
    const minLat = latitude - latitudeDelta * (0.5 + pad);
    const maxLat = latitude + latitudeDelta * (0.5 + pad);
    const minLng = longitude - longitudeDelta * (0.5 + pad);
    const maxLng = longitude + longitudeDelta * (0.5 + pad);
    return SPOTS.filter(s => {
      const saved = savedDestinations[s.destinationId];
      if (filter === 'visited'  && saved?.type !== 'visited') return false;
      if (filter === 'wishlist' && !saved?.isWishlisted && saved?.type !== 'wishlist') return false;
      const { latitude: lat, longitude: lng } = s.coordinates;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });
  }, [region, filter, savedDestinations, mapState, selectedDest]);

  // ── Search results ────────────────────────────────────────────────────────
  const searchResults = useMemo((): SearchResult[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: SearchResult[] = [];

    // Countries (deduplicated)
    const seenCountries = new Set<string>();
    for (const d of DESTINATIONS) {
      if (!seenCountries.has(d.countryCode) && d.country.toLowerCase().includes(q)) {
        seenCountries.add(d.countryCode);
        results.push({ type: 'country', country: d.country, countryCode: d.countryCode });
      }
    }
    // Destinations
    for (const d of DESTINATIONS) {
      if (d.name.toLowerCase().includes(q)) {
        results.push({ type: 'destination', destination: d });
      }
    }
    // Spots
    for (const s of SPOTS) {
      if (s.name.toLowerCase().includes(q)) {
        const dest = DESTINATIONS.find(d => d.id === s.destinationId);
        if (dest) results.push({ type: 'spot', spot: s, destination: dest });
      }
    }
    return results.slice(0, 10);
  }, [searchQuery]);

  // Detect when selected country/destination has drifted out of the visible viewport


  // ── Fetch label-free style JSONs on mount ────────────────────────────────
  useEffect(() => {
    fetchStyleNoLabels('mapbox/standard').then(json => {
      if (json) setNoLabelStyles(prev => ({ ...prev, standard: json }));
    });
    fetchStyleNoLabels('mapbox/standard-satellite').then(json => {
      if (json) setNoLabelStyles(prev => ({ ...prev, satellite: json }));
    });
  }, []);

  // Activate backdrop only after the frame following menu-open so the
  // touch that opened the menu cannot immediately fire the backdrop.
  useEffect(() => {
    if (backdropRafRef.current != null) {
      cancelAnimationFrame(backdropRafRef.current);
      backdropRafRef.current = null;
    }
    if (showMapMenu || showFilterMenu) {
      backdropRafRef.current = requestAnimationFrame(() => {
        setBackdropActive(true);
        backdropRafRef.current = null;
      });
    } else {
      setBackdropActive(false);
    }
  }, [showMapMenu, showFilterMenu]);

  // ── Breadcrumb helpers ────────────────────────────────────────────────────
  const showBreadcrumb = useCallback((show: boolean) => {
    Animated.parallel([
      Animated.spring(worldPillAnim, { toValue: show ? 0 : 1, damping: 22, stiffness: 280, useNativeDriver: true }),
      Animated.spring(breadcrumbAnim, { toValue: show ? 1 : 0, damping: 22, stiffness: 280, useNativeDriver: true }),
    ]).start();
  }, [worldPillAnim, breadcrumbAnim]);

  // ── Camera helpers ────────────────────────────────────────────────────────
  const animateCamera = useCallback((reg: Region, duration = 500) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [reg.longitude, reg.latitude],
      zoomLevel: latDeltaToZoom(reg.latitudeDelta),
      animationDuration: duration,
      animationMode: 'easeTo',
    });
  }, []);

  const fitCoords = useCallback((
    coords: { latitude: number; longitude: number }[],
    padding: { top: number; right: number; bottom: number; left: number },
    duration = 500,
  ) => {
    if (!coords.length) return;
    const lngs = coords.map(c => c.longitude);
    const lats = coords.map(c => c.latitude);
    cameraRef.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      [padding.top, padding.right, padding.bottom, padding.left],
      duration,
    );
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleMarkerPress = useCallback((dest: Destination) => {
    // Keep selectedCountry set — we're drilling into a destination within the country.
    // Clearing it would briefly re-show the country pill before the zoom animation lands.
    // CountrySheet is suppressed by the !selectedDest guard on its render condition.
    lastCountryPressRef.current = Date.now(); // prevent auto-dismiss during destination zoom
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    prevRegionRef.current = region;
    prevCountryRef.current = selectedCountry;
    setSelectedDest(dest);
    destHomeRegionRef.current = null;
    setDestHomeRegion(null);
    setMapState('context');
    setZoomedIntoDestination(true);
    showBreadcrumb(true);
    const zoom = getZoomDelta(dest.category);
    animateCamera({ ...dest.coordinates, latitudeDelta: zoom, longitudeDelta: zoom }, 500);
  }, [region, selectedCountry, showBreadcrumb]);

  const handleCloseSheet = useCallback(() => {
    setMapState('context');
  }, []);

  const handleZoomToCountry = useCallback(() => {
    if (!selectedDest) return;
    const dests  = DESTINATIONS.filter(d => d.country === selectedDest.country);
    const center = getCountryCenter(selectedDest.countryCode);
    const cluster: CountryCluster = {
      country:      selectedDest.country,
      countryCode:  selectedDest.countryCode,
      latitude:     center?.latitude  ?? selectedDest.coordinates.latitude,
      longitude:    center?.longitude ?? selectedDest.coordinates.longitude,
      count:        dests.length,
      minRank:      Math.min(...dests.map(d => d.rank)),
      visitedCount: dests.filter(d => savedDestinations[d.id]?.type === 'visited').length,
    };
    // Exit destination mode then show country card
    // handleCountryPress clears selectedDest, mapState, and zoomedIntoDestination directly
    handleCountryPress(cluster);
  }, [selectedDest, handleCountryPress]);

  const handleExitDestination = useCallback(() => {
    setMapState('world');
    setZoomedIntoDestination(false);
    showBreadcrumb(false);
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => { setSelectedDest(null); exitTimerRef.current = null; }, 280);
    const lat = selectedDest?.coordinates.latitude  ?? 20;
    const lng = selectedDest?.coordinates.longitude ?? 10;
    animateCamera({ latitude: lat, longitude: lng, latitudeDelta: 120, longitudeDelta: 120 }, 500);
  }, [selectedDest, showBreadcrumb]);

  // Called by DestinationSheet's own X/swipe close — restores the country view naturally
  const handleCloseDestinationSheet = useCallback(() => {
    if (!selectedDest) return;
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }

    // Rebuild the country cluster so CountrySheet can remount
    const dests  = DESTINATIONS.filter(d => d.country === selectedDest.country);
    const center = getCountryCenter(selectedDest.countryCode);
    const cluster: CountryCluster = {
      country:      selectedDest.country,
      countryCode:  selectedDest.countryCode,
      latitude:     center?.latitude  ?? selectedDest.coordinates.latitude,
      longitude:    center?.longitude ?? selectedDest.coordinates.longitude,
      count:        dests.length,
      minRank:      Math.min(...dests.map(d => d.rank)),
      visitedCount: dests.filter(d => savedDestinations[d.id]?.type === 'visited').length,
    };
    // handleCountryPress clears selectedDest/mapState/zoomedIntoDestination and calls fitCoords
    handleCountryPress(cluster);
  }, [selectedDest, savedDestinations, handleCountryPress]);

  const handleResetToCountry = useCallback(() => {
    if (!selectedCountryRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cluster = selectedCountryRef.current;
    const bounds = getCountryBounds(cluster.countryCode);
    if (bounds) {
      fitCoords([bounds.ne, bounds.sw], { top: 100, right: 25, bottom: 210, left: 25 });
    } else {
      const dests = DESTINATIONS.filter(d => d.country === cluster.country);
      if (dests.length > 0) {
        fitCoords(dests.map(d => d.coordinates), { top: 120, right: 120, bottom: 300, left: 120 });
      }
    }
  }, [fitCoords]);

  const handleResetToDest = useCallback(() => {
    if (!selectedDest) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const zoom = getZoomDelta(selectedDest.category);
    animateCamera({ ...selectedDest.coordinates, latitudeDelta: zoom, longitudeDelta: zoom }, 500);
  }, [selectedDest, animateCamera]);

  const handleCloseCountry = useCallback(() => {
    if (!selectedCountryRef.current) return;
    const { latitude, longitude } = selectedCountryRef.current;
    selectedCountryRef.current = null;
    showBreadcrumb(false);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => { setSelectedCountry(null); exitTimerRef.current = null; }, 280);
    animateCamera({ latitude, longitude, latitudeDelta: 120, longitudeDelta: 120 }, 600);
  }, [showBreadcrumb, animateCamera]);

  const handleCountryPress = useCallback((cluster: CountryCluster) => {
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    lastCountryPressRef.current = Date.now();
    selectedCountryRef.current = cluster;
    countryHomeRegionRef.current = null;
    setCountryHomeRegion(null);
    setSelectedDest(null);
    setMapState('world');
    setZoomedIntoDestination(false);
    setSelectedCountry(cluster);
    showBreadcrumb(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const bounds = getCountryBounds(cluster.countryCode);
    if (bounds) {
      fitCoords([bounds.ne, bounds.sw], { top: 100, right: 25, bottom: 210, left: 25 });
    } else {
      const dests = DESTINATIONS.filter(d => d.country === cluster.country);
      if (dests.length > 0) {
        fitCoords(dests.map(d => d.coordinates), { top: 120, right: 120, bottom: 300, left: 120 });
      }
    }
  }, [showBreadcrumb, animateCamera, fitCoords]);

  // Back pill: navigate to the previous view (country→country, dest→country, or world)
  const handleBackNav = useCallback(() => {
    const target = prevCountryRef.current;
    prevCountryRef.current = null;
    if (target) {
      handleCountryPress(target);
    } else if (selectedDest) {
      handleExitDestination();
    } else {
      handleCloseCountry();
    }
  }, [handleCountryPress, handleExitDestination, handleCloseCountry, selectedDest]);

  const handleClusterPress = useCallback((dests: Destination[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    lastCountryPressRef.current = Date.now();
    fitCoords(dests.map(d => d.coordinates), { top: 100, right: 80, bottom: 280, left: 80 });
  }, [fitCoords]);

  const handleSearchSelect = useCallback((item: SearchResult) => {
    setSearchQuery('');
    setSearchFocused(false);
    searchInputRef.current?.blur();

    if (item.type === 'country') {
      const dests = DESTINATIONS.filter(d => d.countryCode === item.countryCode);
      const center = getCountryCenter(item.countryCode);
      const cluster: CountryCluster = {
        country:      item.country,
        countryCode:  item.countryCode,
        latitude:     center?.latitude  ?? dests[0].coordinates.latitude,
        longitude:    center?.longitude ?? dests[0].coordinates.longitude,
        count:        dests.length,
        minRank:      Math.min(...dests.map(d => d.rank)),
        visitedCount: dests.filter(d => savedDestinations[d.id]?.type === 'visited').length,
      };
      prevCountryRef.current = selectedCountry;
      handleCountryPress(cluster);
    } else if (item.type === 'destination') {
      handleMarkerPress(item.destination);
    } else {
      // Spot: open parent destination and zoom to the spot's exact location
      prevRegionRef.current = region;
      setSelectedDest(item.destination);
      setMapState('context');
      setZoomedIntoDestination(true);
      animateCamera({ ...item.spot.coordinates, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
    }
  }, [handleCountryPress, handleMarkerPress, region, animateCamera, selectedCountry, savedDestinations]);

  // Fires continuously while the camera moves — update region live so markers
  // appear/fade during the gesture rather than only after it settles.
  const handleCameraChanged = useCallback((state: {
    properties: {
      center: [number, number];
      bounds: { ne: [number, number]; sw: [number, number] };
      zoom: number;
    };
  }) => {
    const now = Date.now();
    if (now - lastCameraTimeRef.current < 50) return; // ~20 fps
    lastCameraTimeRef.current = now;
    const { center, bounds } = state.properties;
    setRegion({
      latitude:       center[1],
      longitude:      center[0],
      latitudeDelta:  Math.abs(bounds.ne[1] - bounds.sw[1]),
      longitudeDelta: Math.abs(bounds.ne[0] - bounds.sw[0]),
    });
  }, []);

  const handleMapIdle = useCallback((state: {
    properties: {
      center: [number, number];
      bounds: { ne: [number, number]; sw: [number, number] };
      zoom: number;
    };
  }) => {
    const { center, bounds } = state.properties;
    const newRegion: Region = {
      latitude:      center[1],
      longitude:     center[0],
      latitudeDelta: Math.abs(bounds.ne[1] - bounds.sw[1]),
      longitudeDelta: Math.abs(bounds.ne[0] - bounds.sw[0]),
    };
    setRegion(newRegion);

    if (mapState === 'world' && !selectedDest) {
      // Capture the settled camera position as the "home" for the current country view
      if (selectedCountryRef.current && !countryHomeRegionRef.current) {
        countryHomeRegionRef.current = newRegion;
        setCountryHomeRegion(newRegion);
      }

      if (newRegion.latitudeDelta >= SPOT_THRESHOLD) {
        // Track the last zoomed-out world region so we can restore it on exit
        lastWorldRegionRef.current = newRegion;
      } else {
        // User manually zoomed in — find the nearest destination in view
        const { latitude: lat, longitude: lng, latitudeDelta, longitudeDelta } = newRegion;
        let best: Destination | null = null;
        let bestDist = Infinity;
        for (const dest of DESTINATIONS) {
          const dlat = Math.abs(dest.coordinates.latitude - lat);
          const dlng = Math.abs(dest.coordinates.longitude - lng);
          if (dlat > latitudeDelta * 2 || dlng > longitudeDelta * 2) continue;
          const d = dlat * dlat + dlng * dlng;
          if (d < bestDist) { best = dest; bestDist = d; }
        }
        if (best) {
          prevRegionRef.current = lastWorldRegionRef.current;
          setSelectedDest(best);
          setMapState('context');
          setZoomedIntoDestination(true);
        }
      }
      return;
    }

    if (mapState === 'context' && selectedDest) {
      if (!destHomeRegionRef.current) {
        destHomeRegionRef.current = newRegion;
        setDestHomeRegion(newRegion);
      }
      if (newRegion.latitudeDelta < SPOT_THRESHOLD) {
        setZoomedIntoDestination(true);
      } else {
        setZoomedIntoDestination(false);
      }
    }
  }, [mapState, selectedDest, savedDestinations, showBreadcrumb]);

  return (
    <View style={styles.root}>

      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        rotateEnabled={false}
        {...(noLabelStyles[mapType]
          ? { styleJSON: noLabelStyles[mapType] }
          : { styleURL: mapType === 'satellite' ? 'mapbox://styles/mapbox/satellite-v9' : MapboxGL.StyleURL.Light }
        )}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onPress={() => {
          searchInputRef.current?.blur();
          setSearchFocused(false);
        }}
        logoEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        attributionEnabled={false}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [10, 20], zoomLevel: 1.5 }}
        />
        <MapboxGL.UserLocation animated />

        {/* Country highlight — fill + outline for selected country */}
        {selectedCountry && (
          <MapboxGL.VectorSource
            id="countryBoundaries"
            url="mapbox://mapbox.country-boundaries-v1"
          >
            <MapboxGL.FillLayer
              id="countryFill"
              sourceLayerID="country_boundaries"
              filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
              style={{ fillColor: '#22C55E', fillOpacity: 0.10 }}
            />
	{/* Outer glow */}
    	<MapboxGL.LineLayer
      		id="countryGlowOuter"
      		sourceLayerID="country_boundaries"
      		filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
      		style={{
        		lineColor: '#16A34A',
        		lineWidth: 12,
        		lineOpacity: 0.08,
      		}}
    	/>

    	{/* Inner glow */}
    	<MapboxGL.LineLayer
      		id="countryGlowInner"
      		sourceLayerID="country_boundaries"
      		filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
      		style={{
        		lineColor: '#16A34A',
        		lineWidth: 6,
        		lineOpacity: 0.18,
      		}}
    	/>
            <MapboxGL.LineLayer
              id="countryOutline"
              sourceLayerID="country_boundaries"
              filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
              style={{ lineColor: '#16A34A', lineWidth: 2, lineOpacity: 0.7 }}
            />
          </MapboxGL.VectorSource>
        )}

        {/* Spot pins (shown when zoomed in) */}
        {visibleSpots.map(spot => (
          <MapboxGL.MarkerView
            key={spot.id}
            coordinate={[spot.coordinates.longitude, spot.coordinates.latitude]}
          >
            <View style={styles.spotPin}>
              <Text style={styles.spotPinIcon}>{spot.icon}</Text>
            </View>
          </MapboxGL.MarkerView>
        ))}

        {/* Country cluster pills — shown for all countries in their pill zone.
            Selected country's pill reappears when user zooms out past its threshold. */}
        {countryPills
          .filter(c => {
            const thr = getClusterThreshold(c.countryCode);
            if (c.countryCode === selectedCountry?.countryCode) {
              // Selected country's pill: only render when entering/past the crossfade zone
              return region.latitudeDelta > thr * 0.8;
            }
            // Non-selected: in country view only render pills that are fully in pill zone
            return !selectedCountry || region.latitudeDelta >= thr;
          })
          .map(cluster => {
          const thr = getClusterThreshold(cluster.countryCode);
          const isSelectedPill = cluster.countryCode === selectedCountry?.countryCode;
          // Selected country's pill gets smooth crossfade (fades in as user zooms out).
          // Non-selected in country view: already filtered to visible zone, so fully opaque.
          // World view: smooth crossfade for everyone.
          const pillOpacity = (isSelectedPill || !selectedCountry)
            ? Math.min(1, Math.max(0, (region.latitudeDelta - thr * 0.8) / (thr * 0.4)))
            : 1;
          return (
            <MapboxGL.MarkerView
              key={cluster.country}
              coordinate={[cluster.longitude, cluster.latitude]}
            >
              <Pressable
                onPressIn={() => { lastCountryPressRef.current = Date.now(); }}
                onPress={() => { prevCountryRef.current = selectedCountry; handleCountryPress(cluster); }}
                style={{ opacity: pillOpacity }}
              >
                <View style={styles.countryPill}>
                  {/* Card first so circle (declared last) renders on top */}
                  <View style={[styles.countryPillCard, isSelectedPill && styles.countryPillCardGlow]}>
                    <Text style={styles.countryPillName} numberOfLines={1}>{cluster.country}</Text>
                  </View>
                  <View style={[styles.countryPillCircle, isSelectedPill && styles.countryPillCircleGlow]}>
                    {isSelectedPill && <View style={styles.countryPillGlowRing} />}
                    <View style={styles.countryPillFlagClip}>
                      <Image
                        source={{ uri: `https://flagcdn.com/w160/${cluster.countryCode.toLowerCase()}.png` }}
                        style={styles.countryPillFlagImg}
                        resizeMode="cover"
                      />
                    </View>
                    {cluster.visitedCount > 0 && (
                      <View style={styles.countryPillBadge}>
                        <Text style={styles.countryPillBadgeTxt}>{cluster.visitedCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            </MapboxGL.MarkerView>
          );
        })}

        {/* Destination pins / cluster bubbles */}
        {region.latitudeDelta >= SPOT_THRESHOLD && destItems.map(item => {
          const destCountryCode = item.type === 'pin' ? item.dest.countryCode : item.dests[0]?.countryCode ?? '';

          // Crossfade with the country pill in the [thr*0.8 → thr*1.2] zone.
          let markerOpacity = 1;
          const isClustered = clusteredCodes.has(destCountryCode);
          // Only bypass fade for pins/clusters that are ENTIRELY from the selected country.
          // A mixed-country cluster (e.g. London+Paris at world zoom) must still fade out.
          const isSelectedCountryPin = selectedCountry != null && (
            item.type === 'pin'
              ? destCountryCode === selectedCountry.countryCode
              : item.dests.every(d => d.countryCode === selectedCountry.countryCode)
          );

          if (isClustered && !isSelectedCountryPin) {
            const thr = getClusterThreshold(destCountryCode);
            // In country view, snap to binary — no half-faded states for non-selected countries.
            markerOpacity = selectedCountry
              ? (region.latitudeDelta <= thr ? 1 : 0)
              : Math.min(1, Math.max(0, (thr * 1.2 - region.latitudeDelta) / (thr * 0.4)));
            if (markerOpacity <= 0) return null;
          } else if (isClustered && isSelectedCountryPin) {
            // Selected country's own pins: smooth crossfade out when zooming past their threshold.
            const thr = getClusterThreshold(destCountryCode);
            markerOpacity = Math.min(1, Math.max(0, (thr * 1.2 - region.latitudeDelta) / (thr * 0.4)));
            if (markerOpacity <= 0) return null;
          }

          if (item.type === 'cluster') {
            const anyVisited  = item.dests.some(d => savedDestinations[d.id]?.type === 'visited');
            const anyWishlist = item.dests.some(d => savedDestinations[d.id]?.isWishlisted || savedDestinations[d.id]?.type === 'wishlist');
            const ringColor   = anyVisited ? VISITED_COLOR : anyWishlist ? WISHLIST_COLOR : '#374151';
            return (
              <MapboxGL.MarkerView
                key={`cluster-${item.latitude}-${item.longitude}`}
                coordinate={[item.longitude, item.latitude]}
              >
                <Pressable style={{ opacity: markerOpacity }} onPress={() => handleClusterPress(item.dests)}>
                  <View style={[styles.clusterHalo, { backgroundColor: ringColor + '40' }]}>
                    <View style={[styles.clusterBubble, { backgroundColor: ringColor }]}>
                      <Text style={styles.clusterCount}>{item.count}</Text>
                    </View>
                  </View>
                </Pressable>
              </MapboxGL.MarkerView>
            );
          }
          const dest       = item.dest;
          const saved      = savedDestinations[dest.id];
          const isVisited  = saved?.type === 'visited';
          const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');
          const isSelected = dest.id === selectedDest?.id;
          const spotCount  = SPOT_COUNT_BY_DEST[dest.id] ?? 0;
          return (
            <MapboxGL.MarkerView
              key={dest.id}
              coordinate={[dest.coordinates.longitude, dest.coordinates.latitude]}
            >
              <Pressable style={{ opacity: markerOpacity }} onPress={() => handleMarkerPress(dest)}>
                <DestPin
                  dest={dest} spotCount={spotCount}
                  isVisited={isVisited} isWishlist={isWishlist} isSelected={isSelected}
                />
              </Pressable>
            </MapboxGL.MarkerView>
          );
        })}
      </MapboxGL.MapView>

      {/* ── Search bar (world mode only) ─────────────────────────────────── */}
      <Animated.View
        style={[styles.searchWrap, {
          top: insets.top + 10,
          opacity: worldPillAnim,
          transform: [{ scale: worldPillScale }],
        }]}
        pointerEvents={mapState === 'world' && !selectedCountry ? 'box-none' : 'none'}
      >
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Pressable
            onPressIn={() => { lastMenuOpenRef.current = Date.now(); }}
            onPress={() => { setShowFilterMenu(v => !v); setShowMapMenu(false); }}
            hitSlop={8}
          >
            <SlidersHorizontal size={16} color={filter !== 'all' ? '#6366F1' : '#9CA3AF'} />
          </Pressable>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search countries, destinations, spots…"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => { setSearchFocused(true); setShowFilterMenu(false); setShowMapMenu(false); }}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <Pressable onPress={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} hitSlop={8}>
              <X size={15} color="#9CA3AF" />
            </Pressable>
          ) : (
            <Search size={15} color="#9CA3AF" />
          )}
        </View>

        {/* Filter menu */}
        {showFilterMenu && !searchFocused && (
          <View style={styles.filterMenu}>
            {(['all', 'visited', 'wishlist'] as MapFilter[]).map(f => (
              <Pressable key={f} style={styles.filterMenuItem}
                onPress={() => { setFilter(f); setShowFilterMenu(false); }}>
                <Text style={[styles.filterMenuItemTxt, f === filter && styles.filterMenuItemTxtActive]}>
                  {f === 'all' ? 'All' : f === 'visited' ? 'Visited' : 'Wishlist'}
                </Text>
                {f === filter && <Check size={14} color="#6366F1" strokeWidth={2.5} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* Search results */}
        {searchFocused && searchResults.length > 0 && (
          <View style={styles.searchResultsList}>
            {searchResults.map((item, i) => {
              let icon: string, label: string, sublabel: string, badge: string;
              if (item.type === 'country') {
                icon = flag(item.countryCode); label = item.country; sublabel = ''; badge = 'Country';
              } else if (item.type === 'destination') {
                icon = item.destination.icon ?? '📍'; label = item.destination.name;
                sublabel = item.destination.country; badge = 'Destination';
              } else {
                icon = item.spot.icon; label = item.spot.name;
                sublabel = item.destination.name; badge = 'Spot';
              }
              return (
                <Pressable
                  key={i}
                  style={[styles.searchResultItem, i === searchResults.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => handleSearchSelect(item)}
                >
                  <Text style={styles.searchResultIcon}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultLabel} numberOfLines={1}>{label}</Text>
                    {sublabel ? <Text style={styles.searchResultSub} numberOfLines={1}>{sublabel}</Text> : null}
                  </View>
                  <Text style={styles.searchResultBadge}>{badge}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Animated.View>

      {/* ── Breadcrumb (country + destination modes) ─────────────────────── */}
      {(selectedCountry || selectedDest) && (
        <Animated.View
          style={[styles.breadcrumbBar, {
            top: insets.top + 10,
            opacity: breadcrumbAnim,
            transform: [{ scale: breadcrumbScale }],
          }]}
          pointerEvents={(selectedCountry || selectedDest) ? 'box-none' : 'none'}
        >
          {selectedDest ? (
            /* Destination view: single white pill (fixed height) so black segment overflows below */
            <View style={styles.breadcrumbPillWhite}>
              <Pressable style={styles.breadcrumbSegmentInactive} onPress={handleZoomToCountry} hitSlop={6}>
                <View style={styles.bcFlagCircle}>
                  <View style={styles.bcFlagClip}>
                    <Image
                      source={{ uri: `https://flagcdn.com/w160/${selectedDest.countryCode.toLowerCase()}.png` }}
                      style={styles.bcFlagImg}
                      resizeMode="cover"
                    />
                  </View>
                </View>
                <Text style={styles.breadcrumbTxtDark} numberOfLines={1}>{selectedDest.country}</Text>
              </Pressable>
              <Pressable style={styles.breadcrumbSegmentActive} onPress={handleResetToDest} hitSlop={6}>
                <View style={styles.breadcrumbPillRow}>
                  <Text style={styles.breadcrumbTxtLight} numberOfLines={1}>{selectedDest.name}</Text>
                </View>
                <Animated.View style={{
                  overflow: 'hidden',
                  maxHeight: destReturnPromptAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }),
                  opacity: destReturnPromptAnim,
                }}>
                  <Text style={styles.breadcrumbReturnTxt}>Return</Text>
                </Animated.View>
              </Pressable>
            </View>
          ) : (
            /* Country view: black pill — expands with "Return" when user pans/zooms away */
            <Pressable
              style={styles.breadcrumbPillBlack}
              onPress={handleResetToCountry}
              hitSlop={6}
            >
              <View style={styles.breadcrumbPillRow}>
                <View style={styles.bcFlagCircle}>
                  <View style={styles.bcFlagClip}>
                    <Image
                      source={{ uri: `https://flagcdn.com/w160/${selectedCountry!.countryCode.toLowerCase()}.png` }}
                      style={styles.bcFlagImg}
                      resizeMode="cover"
                    />
                  </View>
                </View>
                <Text style={styles.breadcrumbTxtLight} numberOfLines={1}>{selectedCountry!.country}</Text>
              </View>
              <Animated.View style={{
                overflow: 'hidden',
                maxHeight: returnPromptAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }),
                opacity: returnPromptAnim,
              }}>
                <Text style={styles.breadcrumbReturnTxt}>Return</Text>
              </Animated.View>
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* ── Back pill (bottom right, above card) ────────────────────────── */}
      {(selectedCountry || selectedDest) && (
        <Animated.View
          style={[styles.upPillWrap, {
            bottom: insets.bottom + 90,
            opacity: breadcrumbAnim,
            transform: [{ scale: breadcrumbScale }],
          }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.upPill}
            onPress={handleBackNav}
            hitSlop={6}
          >
            <Text style={styles.upPillArrow}>←</Text>
            <Text style={styles.upPillTxt} numberOfLines={1}>
              {prevCountryRef.current ? prevCountryRef.current.country : '🌍'}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Menu backdrop — activates on next frame so opening-tap can't fire it ── */}
      {backdropActive && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { setShowMapMenu(false); setShowFilterMenu(false); }}
        />
      )}

      {/* ── Layers button + dropdown ─────────────────────────────────────── */}
      <View
        style={[styles.mapTypeWrap, { top: insets.top + 10 }]}
        onTouchStart={() => { lastMenuOpenRef.current = Date.now(); }}
      >
        <Pressable style={[styles.mapTypeBtn, showMapMenu && styles.mapTypeBtnOpen]}
          onPress={() => {
            const next = !showMapMenuRef.current;
            showMapMenuRef.current = next;   // sync before re-render so MapView guard sees it
            setShowMapMenu(next);
            setShowFilterMenu(false);
          }}>
          <Layers size={18} color="#111827" />
        </Pressable>
        {showMapMenu && (
          <View style={styles.mapMenu}>
            {MAP_TYPES.map(m => (
              <Pressable key={m.key} style={styles.mapMenuItem}
                onPress={() => { setMapType(m.key); setShowMapMenu(false); }}>
                <Text style={[styles.mapMenuItemTxt, m.key === mapType && styles.mapMenuItemTxtActive]}>
                  {m.label}
                </Text>
                {m.key === mapType && <Check size={14} color="#6366F1" strokeWidth={2.5} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>


      {/* ── Country sheet ─────────────────────────────────────────────────── */}
      {selectedCountry && !selectedDest && (
        <CountrySheet
          cluster={selectedCountry}
          onClose={handleCloseCountry}
          onSelectDestination={handleMarkerPress}
        />
      )}

      {/* ── Unified destination sheet — collapsed card + full-screen in one component */}
      {mapState !== 'world' && selectedDest && zoomedIntoDestination && (
        <DestinationSheet
          destination={selectedDest}
          onClose={handleCloseDestinationSheet}
          onExpand={() => setMapState('sheet')}
          onCollapse={handleCloseSheet}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Country cluster pills
  countryPill: {
    flexDirection: 'row', alignItems: 'center',
  },
  countryPillCircle: {
    position: 'absolute', left: 0,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 5,
    shadowOffset: { width: -3, height: 1 }, elevation: 6,
  },
  countryPillFlagClip: {
    width: 27, height: 27, borderRadius: 13.5,
    overflow: 'hidden',
  },
  countryPillFlagImg: { width: 27, height: 27 },

  countryPillBadge: {
    position: 'absolute', bottom: -1, right: -1,
    minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#fff',
  },
  countryPillBadgeTxt: { fontSize: 9, fontWeight: '700', color: '#fff' },
  countryPillCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingLeft: 17, paddingRight: 7, paddingVertical: 5,
    marginLeft: 15,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  countryPillCardGlow: {
    borderWidth: 1.5, borderColor: 'rgba(22,163,74,0.85)',
    shadowColor: '#16A34A', shadowOpacity: 0.7, shadowRadius: 10,
    shadowOffset: { width: 6, height: 0 },
  },
  countryPillCircleGlow: {
    shadowColor: '#16A34A', shadowOpacity: 0.7, shadowRadius: 10,
    shadowOffset: { width: -6, height: 0 },
  },
  countryPillGlowRing: {
    position: 'absolute', top: -2, left: -2,
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5,
    borderTopColor: 'rgba(22,163,74,0.7)',
    borderLeftColor: 'rgba(22,163,74,0.7)',
    borderBottomColor: 'rgba(22,163,74,0.7)',
    borderRightColor: 'transparent',
    backgroundColor: 'transparent',
  },
  countryPillName: { fontSize: 11, fontWeight: '600', color: '#111827', maxWidth: 90 },



  // Detached state chip ("Return to …")


  spotPin: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'white', borderWidth: 2, borderColor: VISITED_COLOR,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },
  spotPinIcon: { fontSize: 11 },

  clusterHalo: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  clusterBubble: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 10,
  },
  clusterCount: { fontSize: 16, fontWeight: '800', color: 'white' },

  // Search bar
  searchWrap: { position: 'absolute', left: 12, right: 60, zIndex: 20 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', borderRadius: 24,
    paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  searchBarFocused: { shadowOpacity: 0.18, shadowRadius: 14 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  filterMenu: {
    marginTop: 8, backgroundColor: 'white', borderRadius: 14,
    overflow: 'hidden', minWidth: 130,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, elevation: 8,
  },
  filterMenuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  filterMenuItemTxt:       { fontSize: 14, fontWeight: '600', color: '#374151' },
  filterMenuItemTxtActive: { color: '#6366F1' },
  // Search results
  searchResultsList: {
    marginTop: 8, backgroundColor: 'white', borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, elevation: 8,
  },
  searchResultItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  searchResultIcon:  { fontSize: 20 },
  searchResultLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  searchResultSub:   { fontSize: 12, color: '#6B7280', marginTop: 1 },
  searchResultBadge: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },

  // Breadcrumb pill
  breadcrumbBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 20, alignItems: 'center',
  },
  breadcrumbPillBlack: {
    flexDirection: 'column', alignItems: 'center',
    backgroundColor: '#111827', borderRadius: 20,
    paddingHorizontal: 16, paddingTop: 9, paddingBottom: 9,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  breadcrumbPillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbReturnTxt: {
    fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.65)',
    textAlign: 'center', paddingTop: 3,
  },
  breadcrumbDestRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
  },
  breadcrumbPillWhite: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'white', borderRadius: 100,
    paddingHorizontal: 5, paddingVertical: 5,
    height: 40,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  breadcrumbSegmentInactive: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  breadcrumbSegmentActive: {
    flexDirection: 'column', alignItems: 'center',
    backgroundColor: '#111827', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  breadcrumbIcon:    { fontSize: 14 },
  bcFlagCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  bcFlagClip: {
    width: 19, height: 19, borderRadius: 9.5,
    overflow: 'hidden',
  },
  bcFlagImg: { width: 19, height: 19 },
  breadcrumbTxtDark: { fontSize: 13, fontWeight: '500', color: '#111827', maxWidth: 90 },
  breadcrumbTxtLight:{ fontSize: 13, fontWeight: '600', color: 'white',   maxWidth: 130 },
  breadcrumbSep:     { fontSize: 13, color: '#9CA3AF' },

  // Back pill
  upPillWrap: { position: 'absolute', right: 12, zIndex: 20 },
  upPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 22,
    paddingHorizontal: 12, paddingVertical: 9,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  upPillArrow: { fontSize: 13, color: '#374151', fontWeight: '700' },
  upPillTxt:   { fontSize: 13, fontWeight: '600', color: '#111827', maxWidth: 100 },

  // Map type button + dropdown
  mapTypeWrap:    { position: 'absolute', right: 12, zIndex: 20, alignItems: 'flex-end' },
  mapTypeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  mapTypeBtnOpen: { backgroundColor: '#F3F4F6' },
  mapMenu: {
    marginTop: 8,
    backgroundColor: 'white',
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 120,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, elevation: 8,
  },
  mapMenuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  mapMenuItemTxt:       { fontSize: 14, fontWeight: '600', color: '#374151' },
  mapMenuItemTxtActive: { color: '#6366F1' },
});
