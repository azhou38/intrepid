import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable, Text, Dimensions, Animated, Platform, TextInput, Image } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers, Check, SlidersHorizontal, X, Search } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { CATEGORY_ICONS } from '../types';
import type { Destination, CountryCluster } from '../types';
import { flag } from '../utils/stats';
import { getCountryRegion, getCountryCenter, getClusterThreshold } from '../utils/countryBounds';
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
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
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
    color: '#111827', textAlign: 'center', maxWidth: 90,
    textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
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
type MapStyleKey = 'standard' | 'hybrid';
type MapState    = 'world' | 'context' | 'sheet';

const MAP_TYPES: { key: MapStyleKey; label: string }[] = [
  { key: 'standard', label: 'Light' },
  { key: 'hybrid',   label: 'Dark'  },
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
  const mapRef = useRef<MapView>(null);

  const savedDestinations = useStore(s => s.savedDestinations);

  const [mapType,        setMapType       ] = useState<MapStyleKey>('standard');
  const [filter,         setFilter        ] = useState<MapFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [mapState,       setMapState      ] = useState<MapState>('world');
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null);
  const [region,       setRegion      ] = useState<Region>({
    latitude: 20, longitude: 10, latitudeDelta: 120, longitudeDelta: 120,
  });

  const prevRegionRef       = useRef<Region>({ latitude: 20, longitude: 10, latitudeDelta: 120, longitudeDelta: 120 });
  const lastWorldRegionRef  = useRef<Region>({ latitude: 20, longitude: 10, latitudeDelta: 120, longitudeDelta: 120 });

  const [showMapMenu, setShowMapMenu] = useState(false);

  // ── Zoom / exit timers ───────────────────────────────────────────────────
  const [zoomedIntoDestination, setZoomedIntoDestination] = useState(false);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery  ] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // ── Country selection ─────────────────────────────────────────────────────
  const [selectedCountry, setSelectedCountry] = useState<CountryCluster | null>(null);
  // True only after the zoom animation into a country completes, so pins don't flash
  // during the animation (when region.latitudeDelta is still at world-view level).
  const [countryPinsReady, setCountryPinsReady] = useState(false);
  const selectedCountryRef   = useRef<CountryCluster | null>(null);
  const lastCountryPressRef  = useRef(0);

  // ── Animation refs ────────────────────────────────────────────────────────
  const worldPillAnim  = useRef(new Animated.Value(1)).current;
  const breadcrumbAnim = useRef(new Animated.Value(0)).current;
  const worldPillScale  = useMemo(() => worldPillAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }), []);
  const breadcrumbScale = useMemo(() => breadcrumbAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }), []);

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
      if (region.latitudeDelta <= threshold) continue; // zoomed in enough → show individual pins

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
  const countryDetached = useMemo((): boolean => {
    if (!selectedCountry || selectedDest) return false;
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const { latitude: cLat, longitude: cLng } = selectedCountry;
    return (
      cLat < latitude - latitudeDelta * 0.55 || cLat > latitude + latitudeDelta * 0.55 ||
      cLng < longitude - longitudeDelta * 0.55 || cLng > longitude + longitudeDelta * 0.55
    );
  }, [selectedCountry, selectedDest, region]);

  const destDetached = useMemo((): boolean => {
    if (!selectedDest) return false;
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const { latitude: dLat, longitude: dLng } = selectedDest.coordinates;
    return (
      dLat < latitude - latitudeDelta * 0.55 || dLat > latitude + latitudeDelta * 0.55 ||
      dLng < longitude - longitudeDelta * 0.55 || dLng > longitude + longitudeDelta * 0.55
    );
  }, [selectedDest, region]);


  // ── Breadcrumb helpers ────────────────────────────────────────────────────
  const showBreadcrumb = useCallback((show: boolean) => {
    Animated.parallel([
      Animated.spring(worldPillAnim, { toValue: show ? 0 : 1, damping: 22, stiffness: 280, useNativeDriver: true }),
      Animated.spring(breadcrumbAnim, { toValue: show ? 1 : 0, damping: 22, stiffness: 280, useNativeDriver: true }),
    ]).start();
  }, [worldPillAnim, breadcrumbAnim]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleMarkerPress = useCallback((dest: Destination) => {
    // Keep selectedCountry set — we're drilling into a destination within the country.
    // Clearing it would briefly re-show the country pill before the zoom animation lands.
    // CountrySheet is suppressed by the !selectedDest guard on its render condition.
    lastCountryPressRef.current = Date.now(); // prevent auto-dismiss during destination zoom
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    prevRegionRef.current = region;
    setSelectedDest(dest);
    setMapState('context');
    setZoomedIntoDestination(true);
    showBreadcrumb(true);
    const zoom = getZoomDelta(dest.category);
    mapRef.current?.animateToRegion(
      { ...dest.coordinates, latitudeDelta: zoom, longitudeDelta: zoom }, 500
    );
  }, [region, showBreadcrumb]);

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
    setMapState('world');
    setZoomedIntoDestination(false);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => { setSelectedDest(null); exitTimerRef.current = null; }, 220);
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
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 120, longitudeDelta: 120 },
      500
    );
  }, [selectedDest, showBreadcrumb]);

  // Called by DestinationSheet's own X/swipe close — restores the country view naturally
  const handleCloseDestinationSheet = useCallback(() => {
    if (!selectedDest) return;
    setMapState('world');
    setZoomedIntoDestination(false);
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
    selectedCountryRef.current = cluster;
    setSelectedCountry(cluster);
    // Breadcrumb stays visible — naturally shortens from "…> Dest" to "…> Country" after dest clears
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => { setSelectedDest(null); exitTimerRef.current = null; }, 300);

    const countryRegion = getCountryRegion(selectedDest.countryCode);
    if (countryRegion) {
      mapRef.current?.animateToRegion(countryRegion, 500);
    } else {
      mapRef.current?.fitToCoordinates(
        dests.map(d => d.coordinates),
        { edgePadding: { top: 120, right: 120, bottom: 300, left: 120 }, animated: true },
      );
    }
  }, [selectedDest, savedDestinations]);

  const handleCloseCountry = useCallback(() => {
    if (!selectedCountryRef.current) return;
    const { latitude, longitude } = selectedCountryRef.current;
    selectedCountryRef.current = null;
    setCountryPinsReady(false);
    showBreadcrumb(false);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => { setSelectedCountry(null); exitTimerRef.current = null; }, 280);
    mapRef.current?.animateToRegion(
      { latitude, longitude, latitudeDelta: 120, longitudeDelta: 120 }, 600,
    );
  }, [showBreadcrumb]);

  const handleCountryPress = useCallback((cluster: CountryCluster) => {
    lastCountryPressRef.current = Date.now();
    selectedCountryRef.current = cluster;
    setCountryPinsReady(false); // pins hidden until zoom animation completes
    setSelectedCountry(cluster);
    showBreadcrumb(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const region = getCountryRegion(cluster.countryCode);
    if (region) {
      mapRef.current?.animateToRegion(region, 500);
    } else {
      // Fallback for unknown country codes: fit to destination pins with generous padding
      const dests = DESTINATIONS.filter(d => d.country === cluster.country);
      if (dests.length > 0) {
        mapRef.current?.fitToCoordinates(
          dests.map(d => d.coordinates),
          { edgePadding: { top: 120, right: 120, bottom: 300, left: 120 }, animated: true }
        );
      }
    }
  }, [showBreadcrumb]);

  const handleClusterPress = useCallback((dests: Destination[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    lastCountryPressRef.current = Date.now(); // prevent auto-dismiss during zoom animation
    mapRef.current?.fitToCoordinates(
      dests.map(d => d.coordinates),
      { edgePadding: { top: 100, right: 80, bottom: 280, left: 80 }, animated: true },
    );
  }, []);

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
      handleCountryPress(cluster);
    } else if (item.type === 'destination') {
      handleMarkerPress(item.destination);
    } else {
      // Spot: open parent destination and zoom to the spot's exact location
      prevRegionRef.current = region;
      setSelectedDest(item.destination);
      setMapState('context');
      setZoomedIntoDestination(true);
      mapRef.current?.animateToRegion(
        { ...item.spot.coordinates, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500,
      );
    }
  }, [handleCountryPress, handleMarkerPress, region]);

  const handleRegionChangeComplete = useCallback((newRegion: Region) => {
    setRegion(newRegion);
    setShowMapMenu(false);

    // Once the zoom animation into a country lands, enable destination pins
    if (selectedCountryRef.current) {
      setCountryPinsReady(true);
    }

    // Dismiss country card if user manually zooms back past the country's own threshold.
    // Skipped when viewing a destination (selectedDest) since the zoom is intentionally wide.
    // Guard with 1.5 s so the fitToCoordinates animation itself doesn't trigger this.
    if (selectedCountryRef.current && !selectedDest && newRegion.latitudeDelta > getClusterThreshold(selectedCountryRef.current.countryCode) &&
        Date.now() - lastCountryPressRef.current > 1500) {
      selectedCountryRef.current = null;
      setSelectedCountry(null);
      setCountryPinsReady(false);
      showBreadcrumb(false);
    }

    if (mapState === 'world' && !selectedDest) {
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
      const offCenter =
        Math.abs(newRegion.latitude  - selectedDest.coordinates.latitude)  > newRegion.latitudeDelta  ||
        Math.abs(newRegion.longitude - selectedDest.coordinates.longitude) > newRegion.longitudeDelta;
      const zoomedOut = newRegion.latitudeDelta > SPOT_THRESHOLD * 6;
      if (offCenter || zoomedOut) {
        setMapState('world');
        setZoomedIntoDestination(false);
        if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
        // Restore country context so the breadcrumb and country sheet persist
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
        selectedCountryRef.current = cluster;
        lastCountryPressRef.current = Date.now(); // prevent auto-dismiss guard from firing
        setSelectedCountry(cluster);
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => { setSelectedDest(null); exitTimerRef.current = null; }, 220);
      } else if (newRegion.latitudeDelta < SPOT_THRESHOLD) {
        setZoomedIntoDestination(true);
      }
    }
  }, [mapState, selectedDest, savedDestinations, showBreadcrumb]);

  return (
    <View style={styles.root}>

      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType={mapType}
        initialRegion={{ latitude: 20, longitude: 10, latitudeDelta: 120, longitudeDelta: 120 }}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={() => {
          if (Date.now() - lastCountryPressRef.current > 600) {
            setSelectedCountry(null);
            selectedCountryRef.current = null;
          }
          setShowMapMenu(false);
          setShowFilterMenu(false);
          searchInputRef.current?.blur();
          setSearchFocused(false);
        }}
        showsUserLocation
        showsCompass={false}
        showsPointsOfInterest={false}
      >
        {/* Spot pins (shown when zoomed in) */}
        {visibleSpots.map(spot => (
          <Marker key={spot.id} coordinate={spot.coordinates}
            anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.spotPin}>
              <Text style={styles.spotPinIcon}>{spot.icon}</Text>
            </View>
          </Marker>
        ))}

        {/* Country cluster pills — hidden for selected country (showing its pins instead),
            still shown for all other countries whose threshold hasn't been met */}
        {countryPills.filter(c => c.countryCode !== selectedCountry?.countryCode).map(cluster => (
          <Marker key={cluster.country}
            coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
            anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}
            onPress={() => handleCountryPress(cluster)}
          >
            <View style={[styles.countryPill, cluster.visitedCount > 0 && styles.countryPillVisited]}>
              <View style={styles.countryPillFlagBubble}>
                <Text style={styles.countryPillFlag}>{flag(cluster.countryCode)}</Text>
              </View>
              <Text style={styles.countryPillName} numberOfLines={1}>{cluster.country}</Text>
            </View>
          </Marker>
        ))}

        {/* Destination pins / cluster bubbles */}
        {region.latitudeDelta >= SPOT_THRESHOLD && destItems.map(item => {
          const destCountryCode = item.type === 'pin' ? item.dest.countryCode : item.dests[0]?.countryCode ?? '';
          if (selectedCountry) {
            // Country mode: hide all pins during zoom animation (prevents flash)
            if (!countryPinsReady) return null;

            if (clusteredCodes.has(destCountryCode)) return null;
          } else {
            // World mode: hide pins for countries that still have a visible pill
            if (clusteredCodes.has(destCountryCode)) return null;
          }

          // Primary destination marker (full photo pin or cluster bubble)
          if (item.type === 'cluster') {
            const anyVisited  = item.dests.some(d => savedDestinations[d.id]?.type === 'visited');
            const anyWishlist = item.dests.some(d => savedDestinations[d.id]?.isWishlisted || savedDestinations[d.id]?.type === 'wishlist');
            const ringColor   = anyVisited ? VISITED_COLOR : anyWishlist ? WISHLIST_COLOR : '#374151';
            return (
              <Marker key={`cluster-${item.latitude}-${item.longitude}`}
                coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}
                onPress={() => handleClusterPress(item.dests)}>
                <View style={[styles.clusterHalo, { backgroundColor: ringColor + '40' }]}>
                  <View style={[styles.clusterBubble, { backgroundColor: ringColor }]}>
                    <Text style={styles.clusterCount}>{item.count}</Text>
                  </View>
                </View>
              </Marker>
            );
          }
          const dest       = item.dest;
          const saved      = savedDestinations[dest.id];
          const isVisited  = saved?.type === 'visited';
          const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');
          const isSelected = dest.id === selectedDest?.id;
          const spotCount  = SPOT_COUNT_BY_DEST[dest.id] ?? 0;
          return (
            <Marker key={dest.id} coordinate={dest.coordinates}
              onPress={() => handleMarkerPress(dest)}
              anchor={{ x: 0.5, y: 0.38 }} tracksViewChanges={true}>
              <DestPin
                dest={dest} spotCount={spotCount}
                isVisited={isVisited} isWishlist={isWishlist} isSelected={isSelected}
              />
            </Marker>
          );
        })}
      </MapView>

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
          <View style={styles.breadcrumbPill}>
            {/* World */}
            <Pressable
              style={styles.breadcrumbSegment}
              onPress={selectedDest ? handleExitDestination : handleCloseCountry}
              hitSlop={6}
            >
              <Text style={styles.breadcrumbIcon}>🌍</Text>
              <Text style={styles.breadcrumbTxt}>World</Text>
            </Pressable>

            {/* Country */}
            {(selectedDest || selectedCountry) && (() => {
              const country = selectedDest?.country ?? selectedCountry!.country;
              const code    = selectedDest?.countryCode ?? selectedCountry!.countryCode;
              return (
                <>
                  <Text style={styles.breadcrumbSep}>›</Text>
                  <Pressable
                    style={styles.breadcrumbSegment}
                    onPress={selectedDest ? handleZoomToCountry : undefined}
                    hitSlop={6}
                  >
                    <Text style={styles.breadcrumbIcon}>{flag(code)}</Text>
                    <Text style={styles.breadcrumbTxt}>{country}</Text>
                  </Pressable>
                </>
              );
            })()}

            {/* Destination */}
            {selectedDest && (
              <>
                <Text style={styles.breadcrumbSep}>›</Text>
                <View style={styles.breadcrumbSegment}>
                  <Text style={styles.breadcrumbTxtActive} numberOfLines={1}>{selectedDest.name}</Text>
                </View>
              </>
            )}
          </View>
        </Animated.View>
      )}

      {/* ── Menu backdrops (dismiss on outside tap) ──────────────────────── */}
      {(showMapMenu || showFilterMenu) && (
        <Pressable style={StyleSheet.absoluteFill}
          onPress={() => { setShowMapMenu(false); setShowFilterMenu(false); }} />
      )}

      {/* ── Up One Level pill (top right, below layers button) ──────────── */}
      {(selectedCountry || selectedDest) && (
        <Animated.View
          style={[styles.upPillWrap, {
            top: insets.top + 58,
            opacity: breadcrumbAnim,
            transform: [{ scale: breadcrumbScale }],
          }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.upPill}
            onPress={selectedDest ? handleZoomToCountry : handleCloseCountry}
            hitSlop={6}
          >
            <Text style={styles.upPillArrow}>↑</Text>
            <Text style={styles.upPillTxt} numberOfLines={1}>
              {selectedDest
                ? (selectedDest.country.length > 10
                    ? flag(selectedDest.countryCode)
                    : selectedDest.country)
                : 'World'}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Layers button + dropdown ─────────────────────────────────────── */}
      <View style={[styles.mapTypeWrap, { top: insets.top + 10 }]}>
        <Pressable style={[styles.mapTypeBtn, showMapMenu && styles.mapTypeBtnOpen]}
          onPress={() => { setShowMapMenu(v => !v); setShowFilterMenu(false); }}>
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

      {/* ── Detached destination chip — "Return to Paris" ────────────────── */}
      {selectedDest && destDetached && (
        <Pressable
          style={[styles.detachedChip, { bottom: insets.bottom + 168 }]}
          onPress={() => mapRef.current?.animateToRegion(
            { ...selectedDest.coordinates, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 500
          )}
        >
          <Text style={styles.detachedChipIcon}>{selectedDest.icon ?? '📍'}</Text>
          <Text style={styles.detachedChipTxt} numberOfLines={1}>
            Return to {selectedDest.name}
          </Text>
        </Pressable>
      )}

      {/* ── Detached country chip — "Return to France" ───────────────────── */}
      {selectedCountry && !selectedDest && countryDetached && (
        <Pressable
          style={[styles.detachedChip, { bottom: insets.bottom + 168 }]}
          onPress={() => {
            const r = getCountryRegion(selectedCountry.countryCode);
            if (r) mapRef.current?.animateToRegion(r, 500);
          }}
        >
          <Text style={styles.detachedChipIcon}>{flag(selectedCountry.countryCode)}</Text>
          <Text style={styles.detachedChipTxt} numberOfLines={1}>
            Return to {selectedCountry.country}
          </Text>
        </Pressable>
      )}

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
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 3,
    borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 3, elevation: 3,
  },
  countryPillFlagBubble: {
    width: 18, height: 18, borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  countryPillFlag: { fontSize: 11 },
  countryPillName: { fontSize: 10, fontWeight: '700', color: '#111827', maxWidth: 72 },
  countryPillVisited: { borderColor: '#059669', borderWidth: 1.5 },

  // Up One Level pill
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

  // Detached state chip ("Return to …")
  detachedChip: {
    position: 'absolute', right: 12, zIndex: 30,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  detachedChipIcon: { fontSize: 15 },
  detachedChipTxt:  { fontSize: 13, fontWeight: '600', color: '#111827', maxWidth: 140 },


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
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
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
    position: 'absolute', left: 12, zIndex: 20,
  },
  breadcrumbPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 24,
    paddingHorizontal: 6, paddingVertical: 9,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  breadcrumbSegment: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8,
  },
  breadcrumbIcon: { fontSize: 14 },
  breadcrumbTxt:  { fontSize: 13, fontWeight: '500', color: '#374151' },
  breadcrumbTxtActive: { fontSize: 13, fontWeight: '600', color: '#111827', maxWidth: 120 },
  breadcrumbSep:  { fontSize: 13, color: '#9CA3AF', paddingHorizontal: 1 },

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
