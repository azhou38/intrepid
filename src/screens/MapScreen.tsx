import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable, Text, Dimensions, Animated, Platform, TextInput, Image, Easing as RNEasing, Keyboard, ScrollView } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';

const MAPBOX_TOKEN = 'pk.eyJ1IjoidGFiYnkxMDEwIiwiYSI6ImNtcXN3ZHNrMTBkdG4ydnB4dGx0cjhzbTEifQ.dgznC6Z7ugUd5u56TZ3sjg';
MapboxGL.setAccessToken(MAPBOX_TOKEN);

// Fetch a Mapbox style and return a customized version:
//  • strip text-label symbol layers
//  • drop the style's own administrative boundary lines (we draw our own border layers as
//    map children so their color/opacity can change with the active map type — standard vs
//    satellite — without ever swapping the MapView's style, which would reload the map and
//    make the MarkerView pins disappear)
//  • fade the road network in only near destination-level zoom
//  • force Mercator (flat) projection
// Returns null if the style uses the newer imports-based format (layers array is empty).
async function fetchStyleNoLabels(styleId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/styles/v1/${styleId}?access_token=${MAPBOX_TOKEN}`,
    );
    const style = await res.json();
    const layers: any[] = style.layers ?? [];
    if (layers.length === 0) return null; // imports-based style — can't filter client-side
    style.layers = layers
      .filter((l: any) => !(l.type === 'symbol' && l.layout?.['text-field']))
      .filter((l: any) => !(l.type === 'line' && (l['source-layer'] === 'admin' || /admin/i.test(l.id ?? ''))))
      .map((l: any) => {
        // Roads: hidden at country/world zoom, smoothly fading in as the camera approaches
        // destination-level zoom (~z9.5–11). Continuous interpolate = genuine fade.
        const isRoad =
          l.type === 'line' && (l['source-layer'] === 'road' || /^(road|bridge|tunnel)-/i.test(l.id ?? ''));
        if (isRoad) {
          return {
            ...l,
            paint: {
              ...l.paint,
              'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 11, 0.45],
            },
          };
        }
        return l;
      });
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

// Web-Mercator projection to PAN-INVARIANT world pixels, given a horizontal scale in pixels
// per degree of longitude. `longitudeDelta` (the viewport's degree-span in longitude) is
// constant under panning at a fixed zoom — unlike `latitudeDelta`, which drifts as you pan
// north/south because Mercator compresses degrees toward the poles. Deriving the scale from
// longitude and using the conformal Mercator y (same scale for x and y locally) makes
// pairwise on-screen pixel distances between two fixed points depend ONLY on zoom, never on
// where the camera is panned — which is what keeps pin collision/promotion decisions stable
// while panning. Only pairwise differences are ever used, so no world-origin offset is needed.
function mercatorPx(lng: number, lat: number, pxPerDegLng: number): { x: number; y: number } {
  const clamped = Math.max(-85, Math.min(85, lat));
  const yDeg = (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return { x: lng * pxPerDegLng, y: yDeg * pxPerDegLng };
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers, Check, Heart, X, Search, Globe, CornerUpLeft, Filter } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useStore } from '../store';
import { CATEGORY_ICONS } from '../types';
import type { Destination, CountryCluster, SavedDestination } from '../types';
import type GeoJSON from 'geojson';
import { getCountryRegion, getCountryBounds, getCountryCenter, getCountryPopularity } from '../utils/countryBounds';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS, type Spot } from '../data/spots';
import DestinationSheet from '../components/Map/DestinationSheet';
import CircleFlag from '../components/CircleFlag';
import SpotSheet from '../components/Map/SpotSheet';
import CountrySheet from '../components/Map/CountrySheet';
import { thumbCache, fetchWikiThumbnail } from '../utils/photoCache';

const VISITED_COLOR  = '#10B981';
const WISHLIST_COLOR = '#EC4899';
const EXPLORE_COLOR  = '#6366F1';

const PIN_SIZE        = 41;  // 10% larger than 37 (which was 20% smaller than the original 46)
const PIN_BORDER      = 2;
const BADGE_SIZE      = 16;  // 20% smaller than the original 20
const STAMP_SIZE = 7;        // 20% smaller than the original 9

function DestPin({ dest, spotCount, isVisited, isWishlist, isSelected, pinState }: {
  dest: Destination;
  spotCount: number;
  isVisited: boolean;
  isWishlist: boolean;
  isSelected: boolean;
  pinState: 'photo' | 'stamp';
}) {
  // Small pin (46px) — request a small thumbnail rather than the full-res header image,
  // so map pins load and decode quickly during pan/zoom.
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(dest.id) ?? null);
  useEffect(() => {
    if (thumbCache.has(dest.id)) { setPhotoUrl(thumbCache.get(dest.id)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(dest.name, 120).then(url => {
      if (url) { thumbCache.set(dest.id, url); setPhotoUrl(url); }
    });
  }, [dest.id]);

  const ringColor = isVisited ? VISITED_COLOR : isWishlist ? WISHLIST_COLOR : 'white';
  const icon      = dest.icon ?? CATEGORY_ICONS[dest.category];

  // Stamp state — tiny dot
  if (pinState === 'stamp') {
    return (
      <View style={pinSt.stampWrap}>
        <View style={[pinSt.stamp, isSelected && { borderColor: VISITED_COLOR, borderWidth: 2 }]} />
      </View>
    );
  }

  // Photo state — full circle with photo + label
  return (
    <View style={pinSt.wrap}>
      <View style={{ width: PIN_SIZE, height: PIN_SIZE }}>
        {/* Shadow on outer ring; overflow:hidden kept on inner clip so shadow isn't clipped on iOS */}
        <View style={[pinSt.circleShadow, { borderColor: isSelected ? VISITED_COLOR : ringColor }]}>
          <View style={pinSt.circleClip}>
            {photoUrl
              ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
              : <Text style={pinSt.fallbackIcon}>{icon}</Text>
            }
          </View>
        </View>
        {spotCount > 0 && isVisited && (
          <View style={[pinSt.badge, { backgroundColor: isVisited ? VISITED_COLOR : '#111827' }]}>
            <Text style={pinSt.badgeTxt} adjustsFontSizeToFit numberOfLines={1}>{spotCount}</Text>
          </View>
        )}
      </View>
      {/* Outlined label: 4 dark offset copies behind the white text trace the letter borders */}
      <View style={pinSt.labelWrap}>
        <Text style={[pinSt.label, pinSt.labelOutline, { transform: [{ translateX: -1 }, { translateY: -1 }] }]} numberOfLines={2}>{dest.name}</Text>
        <Text style={[pinSt.label, pinSt.labelOutline, { transform: [{ translateX:  1 }, { translateY: -1 }] }]} numberOfLines={2}>{dest.name}</Text>
        <Text style={[pinSt.label, pinSt.labelOutline, { transform: [{ translateX: -1 }, { translateY:  1 }] }]} numberOfLines={2}>{dest.name}</Text>
        <Text style={[pinSt.label, pinSt.labelOutline, { transform: [{ translateX:  1 }, { translateY:  1 }] }]} numberOfLines={2}>{dest.name}</Text>
        <Text style={pinSt.label} numberOfLines={2}>{dest.name}</Text>
      </View>
    </View>
  );
}

const pinSt = StyleSheet.create({
  stampWrap: { alignItems: 'center', justifyContent: 'center' },
  stamp: {
    width: STAMP_SIZE, height: STAMP_SIZE, borderRadius: STAMP_SIZE / 2,
    backgroundColor: VISITED_COLOR, borderWidth: 1.5, borderColor: 'white',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 4,
  },
  wrap:  { alignItems: 'center' },
  // Outer ring: carries the shadow. No overflow:hidden so shadow renders on iOS.
  circleShadow: {
    width: PIN_SIZE, height: PIN_SIZE, borderRadius: PIN_SIZE / 2,
    borderWidth: PIN_BORDER, borderColor: 'white',
    backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 14,
  },
  // Inner circle: clips photo/emoji to round shape.
  circleClip: {
    width: PIN_SIZE - PIN_BORDER * 2,
    height: PIN_SIZE - PIN_BORDER * 2,
    borderRadius: (PIN_SIZE - PIN_BORDER * 2) / 2,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  fallbackIcon: { fontSize: 22 },
  badge: {
    position: 'absolute', bottom: -3, right: -3,
    width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: BADGE_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: 'white', textAlign: 'center' },
  labelWrap: { alignItems: 'center', marginTop: 4 },
  label: {
    fontSize: 11, fontWeight: '700',
    color: 'white', textAlign: 'center', maxWidth: 90,
    letterSpacing: 0.3,
  },
  // Absolute dark copies offset ±1px in each diagonal — traces letter outlines.
  labelOutline: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    color: 'rgba(0,0,0,0.35)',
  },
});

// ─── Country Marker (photo circle — world view) ───────────────────────────────
const CPIN_SIZE   = 62;
const CPIN_BORDER = 3;
const CPIN_BADGE  = 22;

function CountryPin({ cluster }: { cluster: CountryCluster }) {
  const cacheKey = `country_${cluster.countryCode}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(cluster.country, 150).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [cluster.countryCode, cluster.country, cacheKey]);

  const isVisited = cluster.visitedCount > 0;
  return (
    <View style={cpinSt.wrap}>
      <View style={cpinSt.circleWrap}>
        <View style={[cpinSt.circle, isVisited && cpinSt.circleVisited]}>
          {photoUrl
            ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
            : <CircleFlag countryCode={cluster.countryCode} size={CPIN_SIZE - CPIN_BORDER * 2} />
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


// Rounded-square header-image thumbnail for destination/spot rows in the search
// results/suggestions dropdown, replacing the plain emoji icon — falls back to the emoji
// while the image is loading or if none was found, same pattern as every other thumbnail
// in this file (thumbCache + fetchWikiThumbnail, cache key convention matching what
// DestPin/SpotSheet's own carousel already use for the same underlying id).
function SearchResultThumb({ name, icon, cacheKey, size }: {
  name: string; icon: string; cacheKey: string; size: number;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(name, 120).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [cacheKey, name]);

  return (
    <View style={[srtSt.wrap, { width: size, height: size, borderRadius: size * 0.28 }]}>
      {photoUrl
        ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
        : <Text style={{ fontSize: size * 0.55 }}>{icon}</Text>}
    </View>
  );
}
const srtSt = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
});

// Spot counts per destination (static — SPOTS never changes at runtime)
const SPOT_COUNT_BY_DEST: Record<string, number> = {};
for (const s of SPOTS) SPOT_COUNT_BY_DEST[s.destinationId] = (SPOT_COUNT_BY_DEST[s.destinationId] ?? 0) + 1;

// Static grouping of every country that has destinations, with a stable pill position
// (country center, falling back to the mean of its destination coordinates). Country pills
// are derived from THIS full list rather than from the viewport-filtered visible set, so an
// unselected country's pin never blinks out at intermediate zoom levels.
interface CountryGroup {
  country: string; countryCode: string;
  latitude: number; longitude: number;
  count: number; minRank: number; destIds: string[];
}
const COUNTRY_GROUPS: CountryGroup[] = (() => {
  const map = new Map<string, { countryCode: string; lats: number[]; lngs: number[]; minRank: number; destIds: string[] }>();
  for (const d of DESTINATIONS) {
    let e = map.get(d.country);
    if (!e) { e = { countryCode: d.countryCode, lats: [], lngs: [], minRank: d.rank, destIds: [] }; map.set(d.country, e); }
    e.lats.push(d.coordinates.latitude);
    e.lngs.push(d.coordinates.longitude);
    e.destIds.push(d.id);
    if (d.rank < e.minRank) e.minRank = d.rank;
  }
  return [...map.entries()].map(([country, e]) => {
    const center = getCountryCenter(e.countryCode);
    return {
      country, countryCode: e.countryCode,
      latitude:  center?.latitude  ?? e.lats.reduce((a, b) => a + b, 0) / e.lats.length,
      longitude: center?.longitude ?? e.lngs.reduce((a, b) => a + b, 0) / e.lngs.length,
      count: e.destIds.length, minRank: e.minRank, destIds: e.destIds,
    };
  });
})();

// ─── Constants ────────────────────────────────────────────────────────────────
const { width: SCREEN_W_GLOBAL, height: H } = Dimensions.get('window');

// Pan-invariant zoom measure. `latitudeDelta` (the viewport's degree-span in latitude)
// DRIFTS as you pan north/south — Mercator compresses degrees toward the poles, so at a
// FIXED zoom the same view reports a smaller latitudeDelta the further from the equator you
// pan. `longitudeDelta`, by contrast, is constant at a fixed zoom no matter where you pan.
// Every zoom TIER / GATE decision (which pins show, stamp↔photo promotion, world-view
// cutoffs) must therefore key off longitudeDelta, or panning near a tier boundary silently
// flips the tier and glitches the pins. This converts a longitudeDelta into the equivalent
// latitude-delta AT THE EQUATOR, so the existing latDelta-based thresholds keep working
// unchanged while becoming pan-invariant. (Actual on-screen latDelta = this × cos(centre
// latitude); dropping that cos term is exactly what removes the pan dependence.)
const SCREEN_ASPECT = H / SCREEN_W_GLOBAL;
const panInvariantLatDelta = (longitudeDelta: number) => longitudeDelta * SCREEN_ASPECT;

const SPOT_THRESHOLD     = 0.5;
// At true world-view zoom (the same "> 50" boundary already used elsewhere to bypass
// viewport-bounds filtering, and to cap visibleRank at 1), destination stamps add visual
// noise without much value — dozens of unlabeled dots scattered across the whole globe.
// Country pins alone are enough at this zoom; stamps start appearing once the user has
// zoomed in past the world tier toward a continent/country, matching Apple Maps' behavior
// of only showing country/region-level markers at the widest zoom.
const WORLD_VIEW_LATDELTA = 50;
// Per-country stamp-visibility threshold — replaces the single global WORLD_VIEW_LATDELTA
// cutoff whenever a country/destination is selected, so a geographically wide country
// (Australia, Canada, Russia...) doesn't have its stamps blanked out just because its own
// default view naturally needs a wider longitudeDelta than a small/dense country's does.
// 1.35 roughly accounts for fitCoords' own screen-edge padding (the gap between a country's
// raw lng span and the camera's actual resulting longitudeDelta); 1.25 on top of that is the
// "slightly beyond the default view" buffer, so panning/zooming out a bit past the default
// view still shows stamps before they cut off.
function getCountryStampThreshold(countryCode: string): number {
  const bounds = getCountryBounds(countryCode);
  if (!bounds) return WORLD_VIEW_LATDELTA;
  const lngSpan = bounds.ne.longitude - bounds.sw.longitude;
  return panInvariantLatDelta(lngSpan * 1.35) * 1.25;
}
// Photo-promotion eligibility zoom gate (reuses the same tier boundary as getVisibleRank's
// "country zoom" tier) — no destination promotes to a photo marker while zoomed out wider
// than this, regardless of available space, matching Apple Maps not showing POI photos at
// continental/world zoom.
const PHOTO_ZOOM_MAX_LATDELTA = 20;
// Max pixel distance a country pin may shift (screen-space) to avoid overlapping a photo pin.
const COUNTRY_PIN_MAX_SHIFT   = 60;

type DestItem = { type: 'pin'; dest: Destination };

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

// Layer pill sizing — a single continuous capsule (see the JSX comment above its render
// block), so its fully-open height is a pure function of these rather than measured,
// letting the grow/shrink animation target an exact pixel value instead of an unmeasured
// 'auto'. Closed height is exactly MAP_PILL_BTN (a true circle); open height adds the
// divider + two option rows beneath it.
const MAP_PILL_BTN        = 44;   // also the pill's fixed width throughout
const MAP_PILL_OPTION_H   = 44;
const MAP_PILL_DIVIDER_H  = StyleSheet.hairlineWidth;
const MAP_PILL_CLOSED_H   = MAP_PILL_BTN;
const MAP_PILL_OPEN_H     = MAP_PILL_BTN + MAP_PILL_DIVIDER_H
  + MAP_PILL_OPTION_H * MAP_TYPES.length + MAP_PILL_DIVIDER_H * (MAP_TYPES.length - 1);

// Visited/wishlist filter pill — same capsule mechanism, two options (no "All" row; see
// filterMenuProgress's own comment for how clearing the filter works instead).
const FILTER_TYPES: { key: Exclude<MapFilter, 'all'>; label: string }[] = [
  { key: 'visited',  label: 'Visited'  },
  { key: 'wishlist', label: 'Wishlist' },
];
const FILTER_PILL_OPEN_H = MAP_PILL_BTN + MAP_PILL_DIVIDER_H
  + MAP_PILL_OPTION_H * FILTER_TYPES.length + MAP_PILL_DIVIDER_H * (FILTER_TYPES.length - 1);

// Small square swatches approximating each map style's actual look, in place of a generic
// icon — a light vector-style road/park/water sketch for Standard, a mottled aerial-terrain
// texture for Satellite. Both are self-contained 26×26 SVGs so no network image is needed.
function StandardSwatch({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Rect x={0} y={0} width={26} height={26} fill="#F1EFE9" />
      {/* Park */}
      <Rect x={2} y={2} width={9} height={8} rx={1.5} fill="#CFE3C6" />
      {/* Water */}
      <Path d="M15 26 L26 26 L26 14 Q19 16 15 22 Z" fill="#BEDCEB" />
      {/* Roads */}
      <Path d="M0 16 L26 10" stroke="#FFFFFF" strokeWidth={2} />
      <Path d="M9 0 L13 26" stroke="#FFFFFF" strokeWidth={1.6} />
    </Svg>
  );
}

function SatelliteSwatch({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Rect x={0} y={0} width={26} height={26} fill="#3E4A2E" />
      <Path d="M0 6 Q7 2 13 7 T26 5 L26 0 L0 0 Z" fill="#57683F" />
      <Path d="M0 26 Q6 18 14 22 T26 19 L26 26 Z" fill="#2E3A22" />
      <Circle cx={19} cy={9} r={5} fill="#6B5A3A" opacity={0.85} />
      <Path d="M2 14 Q9 11 15 15 T26 13" stroke="#8C9A6B" strokeWidth={1.4} fill="none" opacity={0.7} />
    </Svg>
  );
}


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
  // A single stable base style. Satellite is layered on top as a toggleable raster (see
  // render) rather than swapping this — swapping the MapView style reloads the native map
  // and drops all MarkerView pins, which is exactly what we must avoid.
  const [baseStyle, setBaseStyle] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapState,       setMapState      ] = useState<MapState>('world');
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null);
  // A spot selected on the map. Its parent destination stays selected underneath so the
  // country/destination breadcrumb pill remains present while the spot sheet is open.
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const selectedSpotRef = useRef<Spot | null>(null);
  // The spot the carousel should focus when the spot sheet (re)opens. Only changes when a
  // new spot is tapped on the map — NOT while swiping the carousel — so carousel swipes
  // (which update selectedSpot) never reset the carousel position.
  const [spotFocusId, setSpotFocusId] = useState<string | null>(null);
  // Exact distance from the screen bottom to the top of the collapsed spot carousel / the
  // destination compact card, reported live by SpotSheet / DestinationSheet once they
  // measure themselves — lets the back-nav pill reproduce the same real gap above either,
  // rather than guessing fixed offsets that drift from whatever those cards actually render at.
  const [spotCarouselTop, setSpotCarouselTop] = useState(232 + (Platform.OS === 'ios' ? 88 : 64));
  const [destCardTop,     setDestCardTop    ] = useState(164 + (Platform.OS === 'ios' ? 88 : 64));
  // A Reanimated shared value (not core Animated) — DestinationSheet writes to it directly
  // from its own UI-thread reaction while a destination sheet is open (see pillOffsetSV prop
  // below), with zero JS-thread hop, so the pill glides exactly as smoothly as the sheet
  // itself. The spot-carousel effect below writes to it too (via withTiming) when a spot is
  // selected instead.
  const upPillBottomSV = useSharedValue(insets.bottom + 90);
  // Guards against DestinationSheet's continuous writes fighting the spot-carousel effect's
  // own target while a spot is selected on top of an still-mounted destination sheet.
  const spotOwnsPillSV = useSharedValue(false);
  const upPillWrapStyle = useAnimatedStyle(() => ({ bottom: upPillBottomSV.value }));
  // One-shot mount hints for DestinationSheet, set right before it (re)mounts so it can open
  // straight to a specific tab/snap point (e.g. the spot carousel's "list view" button).
  // Cleared again immediately after — DestinationSheet only reads these in its initial
  // useState, so clearing on the next render doesn't affect the already-mounted instance.
  const [destInitialTab,  setDestInitialTab ] = useState<'spots' | undefined>(undefined);
  const [destInitialSnap, setDestInitialSnap] = useState<'full' | 'collapsed' | undefined>(undefined);
  // One-shot mount hint for CountrySheet, same idea as destInitialTab/destInitialSnap above
  // — set right before it (re)mounts so DestinationSheet's collapsed-carousel "List" button
  // can reopen it straight on the Destinations tab.
  const [countryInitialTab, setCountryInitialTab] = useState<'destinations' | undefined>(undefined);
  // Same idea again — lets swiping down from DestinationSheet's own collapsed carousel land
  // CountrySheet in its collapsed view too ('collapsed'), or its own "List view" button open
  // straight to full-screen ('full'), instead of the usual half-screen default.
  const [countryInitialSnap, setCountryInitialSnap] = useState<'collapsed' | 'full' | undefined>(undefined);
  const [region,       setRegion      ] = useState<Region>({
    latitude: 20, longitude: 10, latitudeDelta: 180, longitudeDelta: 360,
  });
  // Always-current mirror of `region`, so callbacks that only need to *read* the latest
  // region (e.g. handleMarkerPress capturing the pre-zoom view) can do so WITHOUT taking
  // `region` as a useCallback dep — which would otherwise recreate the callback on every
  // pan frame and bust the memoized marker lists that depend on it.
  const regionRef = useRef(region);
  regionRef.current = region;

  const prevRegionRef       = useRef<Region>({ latitude: 30, longitude: 10, latitudeDelta: 120, longitudeDelta: 360 });
  const lastWorldRegionRef  = useRef<Region>({ latitude: 30, longitude: 10, latitudeDelta: 120, longitudeDelta: 360 });
  const prevCountryRef      = useRef<CountryCluster | null>(null);

  const [showMapMenu, setShowMapMenu] = useState(false);
  // Drives the vertical layer-menu pill's grow/shrink animation. A plain effect watching the
  // boolean (rather than triggering the animation at each individual setShowMapMenu call
  // site — there are several: the button itself, the backdrop, the filter-menu toggle,
  // search focus) so every path that opens/closes the menu animates consistently.
  const mapMenuProgress = useSharedValue(0);
  useEffect(() => {
    mapMenuProgress.value = withTiming(showMapMenu ? 1 : 0, {
      duration: showMapMenu ? 240 : 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [showMapMenu]);
  // The button and the options list are ONE continuous capsule, not a button with a separate
  // dropdown below it — so this animates the whole pill's own height from the closed circle
  // (MAP_PILL_CLOSED_H) to the fully open capsule (MAP_PILL_OPEN_H), with its fixed
  // borderRadius (see styles.mapPill) rounding both ends throughout regardless of height,
  // and overflow:hidden progressively revealing the option rows underneath as it grows.
  const mapPillStyle = useAnimatedStyle(() => ({
    height: MAP_PILL_CLOSED_H + mapMenuProgress.value * (MAP_PILL_OPEN_H - MAP_PILL_CLOSED_H),
  }));

  // Visited/wishlist filter pill — identical mechanism to the layers pill above (single
  // capsule, closed = a circle, open = grows down to reveal its option rows), just with
  // Visited/Wishlist options instead of Standard/Satellite, and no "All" row: tapping
  // whichever option is already active clears the filter back to 'all' instead.
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuProgress = useSharedValue(0);
  useEffect(() => {
    filterMenuProgress.value = withTiming(showFilterMenu ? 1 : 0, {
      duration: showFilterMenu ? 240 : 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [showFilterMenu]);
  const filterPillStyle = useAnimatedStyle(() => ({
    height: MAP_PILL_CLOSED_H + filterMenuProgress.value * (FILTER_PILL_OPEN_H - MAP_PILL_CLOSED_H),
  }));
  // filterWrapStyle (the filter pill's own position) is defined further down, once
  // selectedCountry/selectedDest/selectedSpot all exist — its position depends on whether
  // anything is selected.

  // ── Zoom / exit timers ───────────────────────────────────────────────────
  const [zoomedIntoDestination, setZoomedIntoDestination] = useState(false);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraTimeRef = useRef(0);
  // Guards the south-limit glide-back (see handleCameraChanged) so the correction's own
  // animation frames — which briefly still report an out-of-bounds south edge while
  // easing back — don't retrigger/restart themselves mid-flight.
  const southCorrectingRef = useRef(false);
  const southCorrectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppresses the south-limit glide-back for the duration of an explicit "zoom out to
  // world" animation (see handleCloseCountry) — without this, zooming out from a southern
  // country like Australia passes through intermediate frames whose bounds legitimately dip
  // past SOUTH_LIMIT, and the glide-back would fire its own competing setCamera (with no
  // zoomLevel of its own) mid-flight, stalling the zoom-out almost immediately.
  const suppressSouthLimitRef = useRef(false);
  const suppressSouthLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery  ] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  // Tracked so the suggestions/results dropdown can cap its own height above the keyboard
  // instead of extending underneath it. iOS fires `keyboardWillShow/Hide` (pre-empting the
  // animation so the cap resizes in step with the keyboard itself); Android only has the
  // non-"will" variants.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  // Caps the results/suggestions dropdown so it never extends under the keyboard — its own
  // top sits at the search bar's top (insets.top+10) plus the bar's height (MAP_PILL_BTN)
  // plus the dropdown's own marginTop (8); whatever's left above the keyboard (minus a
  // little breathing room) is how tall it's allowed to get before scrolling takes over.
  const searchResultsMaxHeight = Math.max(
    120,
    H - (insets.top + 10 + MAP_PILL_BTN + 8) - keyboardHeight - 12,
  );

  // ── Country selection ─────────────────────────────────────────────────────
  const [selectedCountry, setSelectedCountry] = useState<CountryCluster | null>(null);

  // Whether anything (country/destination/spot) is currently selected — determines whether
  // the filter pill sits in the top row next to the search bar (nothing selected) or
  // stacked below the layers pill (something selected, its original spot). The filter
  // pill's own slide between these two spots is animated (selectionProgress, Reanimated,
  // matching the pill's existing UI-thread animations); the search bar's width change is
  // a plain instant recompute instead, since the search bar is simultaneously fading out
  // via worldPillAnim at the same moment a selection happens, making its own width change
  // essentially invisible — not worth a second, cross-animation-library bridge just for that.
  const hasSelection = !!(selectedCountry || selectedDest || selectedSpot);
  const selectionProgress = useSharedValue(hasSelection ? 1 : 0);
  useEffect(() => {
    selectionProgress.value = withTiming(hasSelection ? 1 : 0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [hasSelection]);
  // Row mode (nothing selected): sits left of the layers pill, same top, with a 10px gap.
  // Stacked mode (something selected): directly below the layers pill, same right inset —
  // this second case's top also tracks the layers pill's own open/close (mapMenuProgress),
  // exactly as before.
  const filterWrapStyle = useAnimatedStyle(() => {
    const rowTop      = insets.top + 10;
    const rowRight     = 12 + MAP_PILL_BTN + 10;
    const stackedTop   = insets.top + 10 + MAP_PILL_BTN + 10
      + mapMenuProgress.value * (MAP_PILL_OPEN_H - MAP_PILL_CLOSED_H);
    const stackedRight = 12;
    return {
      top:   rowTop   + selectionProgress.value * (stackedTop   - rowTop),
      right: rowRight + selectionProgress.value * (stackedRight - rowRight),
    };
  });
  // Search bar's right inset: room for both pills + gaps in row mode, just its normal inset
  // (clearing only the layers pill) once something's selected and the filter pill moves out
  // of its way.
  const searchWrapRight = hasSelection ? 72 : 12 + MAP_PILL_BTN + 10 + MAP_PILL_BTN + 10;
  // Animates the search bar's own expand/collapse — its width grows from its collapsed
  // inset up to nearly the full screen while focused, instead of snapping instantly. This
  // has to live on a SEPARATE inner Animated.View from the outer opacity/transform wrapper
  // below (worldPillAnim/worldPillScale, which run on the native driver): mixing a
  // useNativeDriver:false value (width/right are layout properties, which the native
  // driver can't touch regardless of which animation API drives them) into the same style
  // array as native-driven values throws "Attempting to run JS driven animation on
  // animated node that has been moved to native" — RN attaches an entire view's style
  // array to one driver or the other, never both. Width (anchored to the fixed left edge)
  // rather than animating `right` directly, so the outer wrapper's own box can stay a
  // static, unanimated left:12/right:12 — full width at all times — with this inner value
  // only ever affecting this one child's own layout box, not the outer's.
  const searchCollapsedWidth = SCREEN_W_GLOBAL - 12 - searchWrapRight;
  const searchExpandedWidth  = SCREEN_W_GLOBAL - 24;
  const searchWidthAnim = useRef(new Animated.Value(searchCollapsedWidth)).current;
  useEffect(() => {
    Animated.timing(searchWidthAnim, {
      toValue: searchFocused ? searchExpandedWidth : searchCollapsedWidth,
      duration: 260,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: false,
    }).start();
  }, [searchFocused, searchCollapsedWidth, searchExpandedWidth]);

  // Fades out the layers/filter pills while the search bar is focused, since the expanded
  // search bar (see its own right-inset override) extends into the same top-right corner
  // they normally occupy. pointerEvents is toggled directly off searchFocused (not the
  // animated value) so they stop being tappable immediately, not only once fully faded.
  const searchFocusProgress = useSharedValue(0);
  useEffect(() => {
    searchFocusProgress.value = withTiming(searchFocused ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [searchFocused]);
  const layersPillFadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - searchFocusProgress.value,
  }));
  const filterPillFadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - searchFocusProgress.value,
  }));
  // True only after the zoom animation into a country completes, so pins don't flash
  // during the animation (when region.latitudeDelta is still at world-view level).
  const selectedCountryRef   = useRef<CountryCluster | null>(null);
  // Mirrors selectedDest as a ref so handleMapIdle can read it without stale closure issues
  const selectedDestRef      = useRef<Destination | null>(null);
  // The settled camera region when a country view first stabilises — "Return" only shows after this is captured
  const [countryHomeRegion, setCountryHomeRegion] = useState<Region | null>(null);
  const countryHomeRegionRef = useRef<Region | null>(null);
  const [destHomeRegion, setDestHomeRegion] = useState<Region | null>(null);
  const destHomeRegionRef = useRef<Region | null>(null);
  const lastCountryPressRef  = useRef(0);
  const lastMenuOpenRef      = useRef(0);
  // Mirrors whichever of CountrySheet/DestinationSheet is currently open, via their shared
  // onSnapStateChange prop — read inside handleCameraChanged (a gesture callback) to decide
  // whether a map pan should auto-collapse the sheet, without needing that callback to
  // depend on (and re-create itself around) React state.
  const sheetSnapStateRef = useRef<'collapsed' | 'half' | 'full'>('collapsed');
  // Bumped to imperatively collapse whichever sheet is open, from handleCameraChanged, when
  // the user starts panning the map while it's at half-screen.
  const [collapseSheetSignal, setCollapseSheetSignal] = useState(0);
  const wasMapGestureActiveRef = useRef(false);
  const showMapMenuRef       = useRef(false);
  const showFilterMenuRef    = useRef(false);
  // Keep refs in sync so MapView's native onPress/onCameraChanged can read current menu
  // state synchronously without needing them in those callbacks' own dependency arrays.
  showMapMenuRef.current    = showMapMenu;
  showFilterMenuRef.current = showFilterMenu;

  // ── Animation refs ────────────────────────────────────────────────────────
  const worldPillAnim    = useRef(new Animated.Value(1)).current;
  const breadcrumbAnim   = useRef(new Animated.Value(0)).current;
  // Reanimated shared values — animate width+opacity on the UI thread so gestures don't block them
  const returnPromptProgress     = useSharedValue(0);
  const destReturnPromptProgress = useSharedValue(0);
  // Track visible state so we don't restart an in-progress animation on every camera frame
  const returnPromptVisibleRef     = useRef(false);
  const destReturnPromptVisibleRef = useRef(false);
  const worldPillScale  = useMemo(() => worldPillAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }), []);
  const breadcrumbScale = useMemo(() => breadcrumbAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }), []);
  const returnPromptStyle = useAnimatedStyle(() => ({
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: returnPromptProgress.value,
    width: returnPromptProgress.value * 20,
    marginRight: returnPromptProgress.value * 6,
  }));
  const destReturnPromptStyle = useAnimatedStyle(() => ({
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: destReturnPromptProgress.value,
    width: destReturnPromptProgress.value * 20,
    marginRight: destReturnPromptProgress.value * 6,
  }));

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
    // Fallback for state-driven transitions (e.g. selectedCountry changes while map is static).
    // The ref guard prevents restarting an animation already triggered by handleCameraChanged.
    if (showReturnPrompt === returnPromptVisibleRef.current) return;
    returnPromptVisibleRef.current = showReturnPrompt;
    returnPromptProgress.value = withTiming(showReturnPrompt ? 1 : 0, { duration: showReturnPrompt ? 250 : 200 });
  }, [showReturnPrompt, returnPromptProgress]);

  useEffect(() => {
    if (showDestReturnPrompt === destReturnPromptVisibleRef.current) return;
    destReturnPromptVisibleRef.current = showDestReturnPrompt;
    destReturnPromptProgress.value = withTiming(showDestReturnPrompt ? 1 : 0, { duration: showDestReturnPrompt ? 250 : 200 });
  }, [showDestReturnPrompt, destReturnPromptProgress]);

  // Center the world view on the user's longitude at first load (fallback: Europe).
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        // Only center on user's longitude if the user hasn't already navigated somewhere.
        if (selectedCountryRef.current) return;
        const lng = loc.coords.longitude;
        setRegion(prev => ({ ...prev, longitude: lng }));
        cameraRef.current?.setCamera({
          centerCoordinate: [lng, 20],
          zoomLevel: 1,
          animationDuration: 0,
        });
      } catch {}
    })();
  }, []);

  // ── Map data ─────────────────────────────────────────────────────────────
  // Pan-invariant: derived from longitudeDelta (see panInvariantLatDelta) so panning north/
  // south never flips the rank tier — which would otherwise reshuffle eligibleDests and the
  // photo-promotion plan mid-pan and glitch the pins.
  const visibleRank = useMemo(() => getVisibleRank(panInvariantLatDelta(region.longitudeDelta)), [region.longitudeDelta]);

  // ── Planning set (pan-invariant) ────────────────────────────────────────────
  // Every destination ELIGIBLE to be shown at the current zoom — rank tier + active filter
  // + selection rules — but WITHOUT any viewport-bounds culling. This deliberately does not
  // depend on the camera centre, only on `visibleRank` (a zoom step-function), so it stays a
  // stable reference while panning. The photo-promotion plan is computed over THIS set, so
  // the greedy collision resolution sees the same destinations every frame during a pan and
  // can never flip a visible pin's state just because an off-screen neighbour scrolled in or
  // out of a viewport-culled candidate list (the root cause of the pan glitching).
  const eligibleDests = useMemo(() => {
    const passFilter = (saved: SavedDestination | undefined) =>
      filter === 'all'
        ? true
        : filter === 'visited'
          ? saved?.type === 'visited'
          : (saved?.isWishlisted || saved?.type === 'wishlist');

    const results: Destination[] = [];
    const added = new Set<string>();
    for (const d of DESTINATIONS) {
      const saved = savedDestinations[d.id];
      // Bypass for a destination's siblings applies whether the country got selected
      // explicitly (selectedCountry) OR only implicitly via a directly-selected destination
      // (e.g. reached through search with no country context) — either way, its country
      // shouldn't blink out other destinations there.
      const inSelectedCountry =
        selectedCountry?.country === d.country || selectedDest?.country === d.country;
      const isSelected = selectedDest?.id === d.id;
      // Eligible if: it's the selected destination; or in the selected country (always shown);
      // or within the current rank tier (or saved, which is always shown); or a rank-1 anchor
      // worldwide while drilled into a country/destination (so every country pill can form).
      const rankOk = d.rank <= visibleRank || !!saved;
      const anchorRank1 = (selectedCountry || selectedDest) && d.rank === 1;
      if (!(isSelected || inSelectedCountry || rankOk || anchorRank1)) continue;
      // The active visited/wishlist filter DOES still apply within the selected country —
      // only the exact destination currently open (isSelected) is exempt, so its own pin
      // stays visible even if it doesn't match the filter.
      if (!isSelected && !passFilter(saved)) continue;
      results.push(d);
      added.add(d.id);
    }
    return results;
  }, [visibleRank, savedDestinations, filter, selectedCountry, selectedDest]);

  // NOTE: there is deliberately NO viewport-bounds culling of the render set. There are only
  // ~45 destinations total, so rendering every eligible one (Mapbox natively clips whatever
  // falls off-screen) costs nothing — and, crucially, it means the rendered pin/stamp set is
  // a *pan-invariant* function of zoom + selection. A viewport cull, by contrast, depends on
  // the camera centre and so produced a brand-new render array on every throttled pan frame
  // (even when its contents were identical), which re-fed the stamp ShapeSource and re-mounted
  // every MarkerView each frame — the churn that made closely-spaced pins flicker/fight while
  // panning. Driving the render straight off the pan-invariant eligible set removes it.

  // Country pills: a priority + collision-aware selection over the full, static
  // COUNTRY_GROUPS list (not the viewport-filtered visible set), so an unselected country's
  // pin persists at every zoom level and never blinks out in the band where its destination
  // pins begin to appear.
  //
  // Three rules govern which pins actually get shown:
  //  1. The selected country's own pin is hidden while zoomed in to (or past) its own
  //     "default view" (countryHomeRegion, captured once the fitBounds animation settles),
  //     and reappears once the user zooms OUT past that point — it never needs to fight for
  //     space at that point since it's forced to the front of the priority order below.
  //  2. Remaining countries are prioritized by real-world tourism prominence
  //     (getCountryPopularity) — more famous countries keep their pin over less famous ones.
  //  3. As many pins as possible are shown at once: a greedy placement (same pan-invariant
  //     mercatorPx projection destPinPlan uses, so this is stable while panning) walks the
  //     priority order and only rejects a candidate if it would visually collide with an
  //     already-placed, higher-priority pin.
  const countryPills = useMemo(() => {
    const passFilter = (destIds: string[]) => {
      if (filter === 'all') return true;
      return destIds.some(id => {
        const saved = savedDestinations[id];
        return filter === 'visited'
          ? saved?.type === 'visited'
          : (saved?.isWishlisted || saved?.type === 'wishlist');
      });
    };

    // "visitedCount" is spots, not destinations: for each destination marked visited, every
    // spot it has counts (SPOT_COUNT_BY_DEST) — not just spots individually checked off via
    // savedSpots, which stays empty for most real data (destinations are commonly marked
    // visited in bulk without ever visiting each spot one by one), which would make the
    // country pill badge disappear entirely for effectively every country.
    const toCluster = (g: (typeof COUNTRY_GROUPS)[number]): CountryCluster => {
      let visitedCount = 0;
      for (const id of g.destIds) {
        if (savedDestinations[id]?.type === 'visited') visitedCount += SPOT_COUNT_BY_DEST[id] ?? 0;
      }
      return {
        country: g.country, countryCode: g.countryCode,
        latitude: g.latitude, longitude: g.longitude,
        count: g.count, minRank: g.minRank, visitedCount,
      };
    };

    // Rule 1: is the selected country's own pin eligible to show at the CURRENT zoom?
    // Only once zoomed out past its captured "default view" — never while home is still
    // unsettled (e.g. mid fly-to-country animation).
    // Compare longitudeDeltas (pan-invariant), not latitudeDeltas — otherwise panning
    // drifts region.latitudeDelta relative to the fixed captured home and the selected
    // country's pin blinks in/out mid-pan.
    const selectedCountryEligible =
      !!selectedCountry && !!countryHomeRegion && region.longitudeDelta > countryHomeRegion.longitudeDelta;

    const candidates: CountryCluster[] = [];
    for (const g of COUNTRY_GROUPS) {
      if (!passFilter(g.destIds)) continue;
      // Always hide the selected destination's country pill — the destination pin itself
      // is shown instead at all zoom levels while the destination is selected.
      if (selectedDest?.countryCode === g.countryCode) continue;
      const isSelectedCountry = selectedCountry?.countryCode === g.countryCode;
      if (isSelectedCountry && !selectedCountryEligible) continue;
      candidates.push(toCluster(g));
    }

    // Rule 2: priority order — the selected country (if eligible) always wins first, then
    // real-world fame, then a fixed tiebreak for determinism.
    const byPriority = (a: CountryCluster, b: CountryCluster) => {
      const aSel = a.countryCode === selectedCountry?.countryCode ? 0 : 1;
      const bSel = b.countryCode === selectedCountry?.countryCode ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      const pop = getCountryPopularity(a.countryCode) - getCountryPopularity(b.countryCode);
      if (pop !== 0) return pop;
      return a.countryCode < b.countryCode ? -1 : 1;
    };
    const ordered = [...candidates].sort(byPriority);

    // Rule 3: greedy collision resolution using the same pan-invariant Mercator projection
    // destPinPlan uses (scaled off longitudeDelta only), so results don't shift while panning.
    const pxPerDegLng = Dimensions.get('window').width / region.longitudeDelta;
    // Approximate footprint radius of a country pill (circle + name card) — generous enough
    // that two labels never visually overlap.
    const COUNTRY_COLLISION_RADIUS_PX = 70;

    const placed: { x: number; y: number }[] = [];
    const pills: CountryCluster[] = [];
    for (const c of ordered) {
      const p = mercatorPx(c.longitude, c.latitude, pxPerDegLng);
      const isSelectedCountry = c.countryCode === selectedCountry?.countryCode;
      // The selected country's pin is forced — it always wins any collision (other
      // lower-priority pins simply don't get placed instead), matching how the selected
      // destination is forced in destPinPlan.
      if (!isSelectedCountry) {
        let collides = false;
        for (const o of placed) {
          const dx = p.x - o.x, dy = p.y - o.y;
          if (dx * dx + dy * dy < COUNTRY_COLLISION_RADIUS_PX * COUNTRY_COLLISION_RADIUS_PX) { collides = true; break; }
        }
        if (collides) continue;
      }
      placed.push(p);
      pills.push(c);
    }

    return pills;
    // Depends on region.longitudeDelta only (pan-invariant zoom) — NOT latitudeDelta, which
    // drifts on pan and would otherwise recompute this and re-resolve pill collisions mid-pan.
  }, [savedDestinations, filter, selectedCountry, selectedDest, countryHomeRegion, region.longitudeDelta]);

  // Render set = the pan-invariant eligible set (see note above; ~45 pins max, Mapbox clips
  // off-screen). Stable while panning, so the pin/stamp lists never churn on pan.
const destItems = useMemo((): DestItem[] =>
    eligibleDests.map(dest => ({ type: 'pin', dest })),
  [eligibleDests]);

  // Destination photo-promotion: a greedy, priority-ordered, collision-aware placement —
  // never a hard zoom cutoff. Every visible destination always renders as at least a stamp
  // (see stampGeoJSON below); this only decides which subset additionally gets the larger
  // "photo" treatment.
  //
  // STABILITY IS THE PRIORITY: the plan is a *pure function of zoom* (plus the destination
  // set + selection) and is completely independent of the camera centre. Because pairwise
  // on-screen distances between two fixed destinations depend only on the zoom deltas — not
  // on where the map is panned — panning at a fixed zoom produces an identical plan, so pins
  // never glitch stamp↔photo while panning. Zooming changes it monotonically and
  // deterministically, so there's no frame-to-frame flicker either (no dependence on prior
  // frames' decisions).
  const { width: SCREEN_W } = Dimensions.get('window');
  // STAMP_PX must exceed the photo pin diameter (37pt) so two photo pins never overlap —
  // also reused as the minimum spacing between any two promoted photo markers below.
  const STAMP_PX = 44;  // 20% smaller than the original 55, kept proportional to PIN_SIZE

  const destPinPlan = useMemo(() => {
    const { longitudeDelta } = region;
    // Pan-invariant Web-Mercator projection scaled off longitudeDelta only (see mercatorPx).
    // NO camera centre, NO latitudeDelta — both drift under pan; longitudeDelta does not.
    const pxPerDegLng = SCREEN_W / longitudeDelta;

    // Plan over the pan-invariant ELIGIBLE set (not the viewport-culled render set), so the
    // greedy collision resolution sees a stable roster while panning.
    const dests = eligibleDests;
    const positions = new Map<string, { x: number; y: number }>();
    for (const d of dests) positions.set(d.id, mercatorPx(d.coordinates.longitude, d.coordinates.latitude, pxPerDegLng));

    // The selected destination always wins a photo, unconditionally (even outside the photo
    // zoom range); its MarkerView is hidden separately at spot zoom.
    const isForced = (d: Destination) => selectedDest?.id === d.id;
    // Gate on `visibleRank` (a zoom step-function) rather than raw latitudeDelta, which
    // drifts on vertical pan; visibleRank >= 3 corresponds to latitudeDelta <= 20 (the photo
    // zoom range) and holds steady while panning within a zoom tier.
    const canPromote = visibleRank >= 3;

    // Deterministic, pan-invariant priority: selected destination first; then (while a
    // country is selected) that country's own destinations; then importance (rank); then a
    // fixed id tiebreak. It NEVER references the viewport centre, so panning can't reshuffle
    // who wins the limited photo slots — the previous centre-distance ordering was the main
    // cause of pins swapping stamp↔photo as you panned.
    const rankScore = (d: Destination) =>
      (isForced(d) ? -1_000_000 : 0) +
      (selectedCountry && d.countryCode === selectedCountry.countryCode ? -1_000 : 0) +
      d.rank;
    const ordered = [...dests].sort(
      (a, b) => rankScore(a) - rankScore(b) || (a.id < b.id ? -1 : 1),
    );

    const photoIds = new Set<string>();
    const placed: { x: number; y: number }[] = [];
    for (const d of ordered) {
      const forced = isForced(d);
      if (!forced && !canPromote) continue;               // stays a stamp at wide zoom
      const p = positions.get(d.id)!;
      if (!forced) {
        // Reject (stays a stamp) if it would sit within STAMP_PX of an already-placed,
        // higher-priority photo — this is the collision rule, and since photos are only
        // ever placed in the fixed priority order, the lower-priority one is the one that
        // stays a stamp. STAMP_PX (44) > photo diameter (37) so photos never overlap.
        let collides = false;
        for (const o of placed) {
          const dx = p.x - o.x, dy = p.y - o.y;
          if (dx * dx + dy * dy < STAMP_PX * STAMP_PX) { collides = true; break; }
        }
        if (collides) continue;
      }
      photoIds.add(d.id);
      placed.push(p);
    }

    return { photoIds, positions };
    // Pure function of zoom (longitudeDelta + visibleRank) + eligible set + selection.
    // No camera centre → recompute produces an identical plan while panning at fixed zoom.
  }, [eligibleDests, region.longitudeDelta, visibleRank, selectedCountry, selectedDest]);

  // Country pins are a stable, always-on layer, but their fixed geographic centroid can
  // land near a promoted photo pin — nudge them aside (up to COUNTRY_PIN_MAX_SHIFT) so
  // neither is obscured. If a nudge still can't clear the collision, demote the one
  // conflicting destination back to a stamp as the tie-breaker of last resort.
  const { countryPinOffsets, countryPinDemotedIds } = useMemo(() => {
    const { longitudeDelta } = region;
    // Must use the SAME pan-invariant Web-Mercator projection as destPinPlan, since we
    // compare country-pin screen positions against destPinPlan.positions. This also makes
    // the nudge offsets themselves pan-invariant, so country pins hold position while panning.
    const pxPerDegLng = SCREEN_W / longitudeDelta;

    // Approximate combined radius: the country pill's visual footprint (circle + name
    // card) plus the photo pin's own radius.
    const COUNTRY_PIN_RADIUS_PX = 40;  // 20% smaller, matching the shrunk country pill
    const MIN_SEP = COUNTRY_PIN_RADIUS_PX + PIN_SIZE / 2;

    const offsets = new Map<string, { dx: number; dy: number }>();
    const demoted = new Set<string>();

    for (const cluster of countryPills) {
      const cp = mercatorPx(cluster.longitude, cluster.latitude, pxPerDegLng);
      const cx = cp.x, cy = cp.y;
      let conflict: { id: string; x: number; y: number; dist: number } | null = null;
      for (const [destId, p] of destPinPlan.positions) {
        if (!destPinPlan.photoIds.has(destId)) continue;
        const dx = cx - p.x, dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_SEP && (!conflict || dist < conflict.dist)) {
          conflict = { id: destId, x: p.x, y: p.y, dist };
        }
      }
      if (!conflict) continue;

      // Push directly away from the conflicting photo pin, just clear of the combined radius.
      let dx = cx - conflict.x, dy = cy - conflict.y;
      const dist = Math.max(conflict.dist, 0.001);
      const needed = MIN_SEP - dist;
      dx = (dx / dist) * needed;
      dy = (dy / dist) * needed;
      const shiftMag = Math.sqrt(dx * dx + dy * dy);
      if (shiftMag > COUNTRY_PIN_MAX_SHIFT) {
        const scale = COUNTRY_PIN_MAX_SHIFT / shiftMag;
        dx *= scale; dy *= scale;
      }
      offsets.set(cluster.countryCode, { dx, dy });

      // If even the max shift can't clear it, demote the destination instead — except the
      // selected destination, which must never be hidden or demoted from photo mode.
      const newDist = Math.sqrt((cx + dx - conflict.x) ** 2 + (cy + dy - conflict.y) ** 2);
      if (newDist < MIN_SEP && conflict.id !== selectedDest?.id) demoted.add(conflict.id);
    }

    return { countryPinOffsets: offsets, countryPinDemotedIds: demoted };
  }, [countryPills, destPinPlan, region.longitudeDelta]);

  // Stamps are rendered via CircleLayer (not MarkerView) so Mapbox renders all of them
  // regardless of proximity — every visible destination not currently promoted to a photo
  // marker (or demoted back by a country-pin collision) gets a stamp here, so nothing is
  // ever hidden outright.
  const stampGeoJSON = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    // Pan-invariant world-view gate (see panInvariantLatDelta) so stamps don't all blink
    // in/out mid-pan near the boundary. Uses a per-country threshold (see
    // getCountryStampThreshold) while a country/destination is selected, instead of the flat
    // WORLD_VIEW_LATDELTA — a geographically wide country (Australia, Canada, Russia...)
    // needs a much wider longitudeDelta to fit its own bounds on screen than a small/dense
    // one does, so a single global cutoff either blanked out wide countries' own default
    // views or (if loosened) kept showing stamps too far into genuine world-view zoom for
    // small countries. Falls back to the flat cutoff with nothing selected (true world view).
    const countryCodeForThreshold = selectedCountry?.countryCode ?? selectedDest?.countryCode;
    const stampThreshold = countryCodeForThreshold
      ? getCountryStampThreshold(countryCodeForThreshold)
      : WORLD_VIEW_LATDELTA;
    if (panInvariantLatDelta(region.longitudeDelta) > stampThreshold) {
      return { type: 'FeatureCollection' as const, features };
    }
    for (const { dest } of destItems) {
      if (destPinPlan.photoIds.has(dest.id) && !countryPinDemotedIds.has(dest.id)) continue;
      const saved = savedDestinations[dest.id];
      features.push({
        type: 'Feature',
        id: dest.id,
        geometry: { type: 'Point', coordinates: [dest.coordinates.longitude, dest.coordinates.latitude] },
        properties: {
          id: dest.id,
          color: saved?.type === 'visited' ? VISITED_COLOR
               : saved?.isWishlisted || saved?.type === 'wishlist' ? WISHLIST_COLOR
               : '#6B7280',
        },
      });
    }
    return { type: 'FeatureCollection' as const, features };
  }, [destItems, destPinPlan, countryPinDemotedIds, savedDestinations, region.longitudeDelta, selectedCountry, selectedDest]);

  const visibleSpots = useMemo(() => {
    const belowSpotZoom = region.latitudeDelta < SPOT_THRESHOLD + 0.1;
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const pad = 0.15;
    const minLat = latitude - latitudeDelta * (0.5 + pad);
    const maxLat = latitude + latitudeDelta * (0.5 + pad);
    const minLng = longitude - longitudeDelta * (0.5 + pad);
    const maxLng = longitude + longitudeDelta * (0.5 + pad);
    const results = belowSpotZoom
      ? SPOTS.filter(s => {
          const { latitude: lat, longitude: lng } = s.coordinates;
          const inBounds = lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
          if (!inBounds) return false;
          // Spots have no wishlist concept of their own, only visited (savedSpots) — so the
          // Visited filter hides a spot whenever its PARENT destination isn't visited, and
          // the Wishlist filter (with no per-spot equivalent to check) is left alone here.
          if (filter === 'visited' && savedDestinations[s.destinationId]?.type !== 'visited') return false;
          return true;
        })
      : [];
    // Always keep the selected spot's pin on screen while its sheet is open.
    if (selectedSpot && !results.some(s => s.id === selectedSpot.id)) {
      results.push(selectedSpot);
    }
    return results;
  }, [region, selectedSpot, filter, savedDestinations]);

  // All spots in the selected destination — the set the spot carousel pages through.
  const spotsInDest = useMemo(
    () => (selectedDest ? SPOTS.filter(s => s.destinationId === selectedDest.id) : []),
    [selectedDest],
  );

  // ── Search results ────────────────────────────────────────────────────────
  const searchResults = useMemo((): SearchResult[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      // Suggestions shown the instant the user focuses the search bar, before typing
      // anything — the highest-ranked (most popular) destinations, so there's always
      // something useful to tap into instead of an empty dropdown.
      return [...DESTINATIONS]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 10)
        .map((destination): SearchResult => ({ type: 'destination', destination }));
    }
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


  // ── Fetch the single base style once on mount ─────────────────────────────
  useEffect(() => {
    fetchStyleNoLabels('mapbox/standard').then(json => {
      if (json) setBaseStyle(json);
    });
  }, []);

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
    prevRegionRef.current = regionRef.current;
    prevCountryRef.current = selectedCountry;
    selectedDestRef.current = dest;
    setSelectedDest(dest);
    destHomeRegionRef.current = null;
    setDestHomeRegion(null);
    destReturnPromptProgress.value = 0; destReturnPromptVisibleRef.current = false;
    setMapState('context');
    setZoomedIntoDestination(true);
    showBreadcrumb(true);
    // Opening a destination clears any spot drilldown.
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
    const zoom = getZoomDelta(dest.category);
    animateCamera({ ...dest.coordinates, latitudeDelta: zoom, longitudeDelta: zoom }, 500);
    // Reads region via regionRef (not a dep) so this callback stays stable across pans and
    // doesn't bust the memoized destination-pin marker list.
  }, [selectedCountry, showBreadcrumb, animateCamera]);

  // "Map view" from CountrySheet's Destinations tab grid — same destination as a normal
  // marker press, but lands DestinationSheet in its collapsed/bottom-screen sliding carousel
  // instead of the usual half-screen default, since the whole point is to browse the map.
  const handleGoToDestinationsMap = useCallback((dest: Destination) => {
    setDestInitialSnap('collapsed');
    handleMarkerPress(dest);
  }, [handleMarkerPress]);

  // Fired when the user swipes DestinationSheet's hero to a different destination in the
  // same country (a carousel gesture, not a marker tap) — lighter than handleMarkerPress
  // above (no haptics or spot/mapState resets, since the sheet itself already handled the
  // transition and none of that should re-trigger), but the map camera still needs to
  // re-center on whichever destination is now showing, same as a normal marker tap would.
  const handleSwipeToDestination = useCallback((dest: Destination) => {
    selectedDestRef.current = dest;
    setSelectedDest(dest);
    // Without this, the "return to X" breadcrumb prompt kept comparing the freshly
    // recentered camera against the *previous* destination's home region (only
    // handleMarkerPress cleared it) — since that's now far away by definition, it read as
    // "panned away" and showed the return button immediately, even at the new destination's
    // just-arrived-at default view. Re-captured fresh below at line ~1409 once the camera
    // actually settles near this destination, exactly like a normal marker tap.
    destHomeRegionRef.current = null;
    setDestHomeRegion(null);
    destReturnPromptProgress.value = 0; destReturnPromptVisibleRef.current = false;
    const zoom = getZoomDelta(dest.category);
    animateCamera({ ...dest.coordinates, latitudeDelta: zoom, longitudeDelta: zoom }, 500);
  }, [animateCamera]);

  // Shared by both CountrySheet and DestinationSheet — only one is ever mounted at a time,
  // so a single ref is enough to track "is whichever sheet is currently open at half-screen".
  const handleSheetSnapStateChange = useCallback((state: 'collapsed' | 'half' | 'full') => {
    sheetSnapStateRef.current = state;
  }, []);

  const handleCloseSheet = useCallback(() => {
    setMapState('context');
  }, []);

  // ── Spot selection ──────────────────────────────────────────────────────────
  const handleSpotPress = useCallback((spot: Spot) => {
    const dest = DESTINATIONS.find(d => d.id === spot.destinationId);
    if (!dest) return;
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    // Keep the parent destination selected so the country/destination breadcrumb stays present.
    if (selectedDestRef.current?.id !== dest.id) {
      selectedDestRef.current = dest;
      setSelectedDest(dest);
    }
    selectedSpotRef.current = spot;
    setSelectedSpot(spot);
    setSpotFocusId(spot.id);
    setMapState('context');
    setZoomedIntoDestination(true);
    showBreadcrumb(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCamera({ ...spot.coordinates, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
  }, [showBreadcrumb, animateCamera]);

  // Fired as the user swipes the spot carousel. Follows the focused spot with the map
  // (pan + pin highlight) WITHOUT touching spotFocusId, so the carousel isn't reset.
  const handleActiveSpotChange = useCallback((spot: Spot) => {
    selectedSpotRef.current = spot;
    setSelectedSpot(spot);
    animateCamera({ ...spot.coordinates, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
  }, [animateCamera]);

  // Closing the spot sheet returns to the parent destination sheet (still selected) and
  // re-centers the camera on the destination's default zoomed-in view. `toCollapsed` (set
  // when this fires from a swipe-down while the spot carousel was itself collapsed) lands
  // the destination sheet in its own collapsed view too, instead of the usual half default.
  const handleCloseSpot = useCallback((toCollapsed?: boolean) => {
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
    setMapState('context');
    if (toCollapsed) setDestInitialSnap('collapsed');
    if (selectedDest) {
      const zoom = getZoomDelta(selectedDest.category);
      animateCamera({ ...selectedDest.coordinates, latitudeDelta: zoom, longitudeDelta: zoom }, 500);
    }
  }, [selectedDest, animateCamera]);

  // "List view" from the spot carousel — swap it for the destination sheet, opened straight
  // to its full-screen Spots grid rather than the usual collapsed compact card.
  const handleGoToListView = useCallback(() => {
    setDestInitialTab('spots');
    setDestInitialSnap('full');
    handleCloseSpot();
  }, [handleCloseSpot]);

  // One-shot: clear the mount hints once consumed (see declaration above) so a later,
  // unrelated destination-sheet mount doesn't inherit them.
  useEffect(() => {
    if (destInitialTab || destInitialSnap) {
      setDestInitialTab(undefined);
      setDestInitialSnap(undefined);
    }
  }, [destInitialTab, destInitialSnap]);

  // Same one-shot clearing for CountrySheet's mount hints.
  useEffect(() => {
    if (countryInitialTab || countryInitialSnap) {
      setCountryInitialTab(undefined);
      setCountryInitialSnap(undefined);
    }
  }, [countryInitialTab, countryInitialSnap]);

  // Spot carousel case only — glide the pill to its new resting spot when the carousel's
  // own measured top changes. (The destination-sheet case is handled continuously instead,
  // via the pillOffsetSV prop below, so it can track the sheet's drag in perfect lockstep
  // rather than only re-targeting an animation once the drag settles.)
  useEffect(() => {
    // Tells DestinationSheet's own continuous writer (still mounted underneath, possibly
    // still moving) to back off while the spot carousel owns the pill's position.
    spotOwnsPillSV.value = !!selectedSpot;
    if (!selectedSpot) return;
    // A small fixed gap above the spot carousel's own measured top — matches the same
    // "pill sits a tuned gap above whichever collapsed card is showing" pattern
    // DestinationSheet/CountrySheet use for their own collapsed resting targets, rather than
    // deriving an offset from destCardTop. That derivation used to assume destCardTop always
    // reflected the destination's *collapsed* card height specifically, but DestinationSheet
    // now also reports its half-screen position through the same prop (since half is its
    // default view) — so destCardTop no longer reliably means "collapsed", and using it here
    // put the pill at an arbitrary, wrong distance above the spot carousel.
    const SPOT_PILL_GAP = -75;
    const target = spotCarouselTop + SPOT_PILL_GAP;
    upPillBottomSV.value = withTiming(target, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [selectedSpot, spotCarouselTop]);


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
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => { selectedDestRef.current = null; setSelectedDest(null); exitTimerRef.current = null; }, 280);
    const lat = selectedDest?.coordinates.latitude  ?? 20;
    const lng = selectedDest?.coordinates.longitude ?? 10;
    animateCamera({ latitude: lat, longitude: lng, latitudeDelta: 120, longitudeDelta: 120 }, 500);
  }, [selectedDest, showBreadcrumb]);

  // Called by DestinationSheet's own X/swipe close — restores the country view naturally.
  // `toCollapsed` (set when this fires from a swipe-down while the destination sheet was
  // itself collapsed) lands the country sheet in its own collapsed view too, instead of the
  // usual half-screen default.
  const handleCloseDestinationSheet = useCallback((toCollapsed?: boolean) => {
    if (!selectedDest) return;
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    if (toCollapsed) setCountryInitialSnap('collapsed');

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

  // "List view" from the destination sheet's collapsed carousel — swap it for CountrySheet,
  // opened straight to its Destinations tab, full-screen, rather than the usual half-screen
  // default. Mirrors handleGoToListView above (the spot carousel's equivalent).
  const handleGoToCountryList = useCallback(() => {
    setCountryInitialTab('destinations');
    setCountryInitialSnap('full');
    handleCloseDestinationSheet();
  }, [handleCloseDestinationSheet]);

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
    // If a spot sheet is showing, tapping the destination breadcrumb closes it — the
    // destination sheet remounts underneath and defaults to its half-screen view.
    if (selectedSpot) {
      handleCloseSpot();
      return;
    }
    const zoom = getZoomDelta(selectedDest.category);
    animateCamera({ ...selectedDest.coordinates, latitudeDelta: zoom, longitudeDelta: zoom }, 500);
  }, [selectedDest, selectedSpot, handleCloseSpot, animateCamera]);

  const handleCloseCountry = useCallback(() => {
    if (!selectedCountryRef.current) return;
    selectedCountryRef.current = null;
    showBreadcrumb(false);
    // Without this, mapState could be left at 'sheet' (set by onExpand whenever the country
    // sheet was viewed full-screen) with nothing to reset it back — the search bar's
    // pointerEvents gate (`mapState === 'world' && !selectedCountry`) would then stay
    // 'none' even after the country closes, making it look unresponsive/never came back.
    // handleExitDestination's equivalent path already does this; this one was missing it.
    setMapState('world');
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => { setSelectedCountry(null); exitTimerRef.current = null; }, 280);
    // Zoom out to the same "default world view" reference already used elsewhere in this
    // file (prevRegionRef/lastWorldRegionRef's own initial values) — latitude:30/
    // latitudeDelta:120 is the app's established resting world-view scale, already tuned so
    // the south edge naturally lands near SOUTH_LIMIT without showing all of Antarctica
    // (latitudeDelta:180 was too extreme and revealed the whole continent). Longitude comes
    // from the CURRENT map position, not the country's own centroid — previously this
    // recentered on e.g. Australia's own longitude, visibly panning the map sideways instead
    // of zooming out in place.
    // Suppress the south-limit glide-back for the duration of this animation — see
    // suppressSouthLimitRef's own comment for why it'd otherwise stall the zoom-out.
    suppressSouthLimitRef.current = true;
    if (suppressSouthLimitTimerRef.current) clearTimeout(suppressSouthLimitTimerRef.current);
    suppressSouthLimitTimerRef.current = setTimeout(() => { suppressSouthLimitRef.current = false; }, 650);
    animateCamera({ latitude: 30, longitude: regionRef.current.longitude, latitudeDelta: 120, longitudeDelta: 360 }, 600);
  }, [showBreadcrumb, animateCamera]);

  const handleCountryPress = useCallback((cluster: CountryCluster) => {
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    lastCountryPressRef.current = Date.now();
    selectedCountryRef.current = cluster;
    countryHomeRegionRef.current = null;
    setCountryHomeRegion(null);
    returnPromptProgress.value = 0; returnPromptVisibleRef.current = false;
    selectedDestRef.current = null;
    setSelectedDest(null);
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
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

  // Back pill: one level up — spot → destination, destination → country, country → world
  const handleBackNav = useCallback(() => {
    if (selectedSpot) {
      handleCloseSpot();
    } else if (selectedDest) {
      handleCloseDestinationSheet();
    } else {
      handleCloseCountry();
    }
  }, [selectedSpot, selectedDest, handleCloseSpot, handleCloseDestinationSheet, handleCloseCountry]);

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
      // Spot: open its dedicated sheet (also selects the parent destination + zooms in).
      prevRegionRef.current = region;
      handleSpotPress(item.spot);
    }
  }, [handleCountryPress, handleMarkerPress, handleSpotPress, region, selectedCountry, savedDestinations]);

  // Fires continuously while the camera moves — update region live so markers
  // appear/fade during the gesture rather than only after it settles.
  const handleCameraChanged = useCallback((state: {
    properties: {
      center: [number, number];
      bounds: { ne: [number, number]; sw: [number, number] };
      zoom: number;
    };
    gestures?: { isGestureActive: boolean };
  }) => {
    const { center, bounds } = state.properties;
    const isGestureActive = state.gestures?.isGestureActive ?? false;

    // The user just started panning/pinching the map — auto-collapse whichever sheet is
    // currently at half-screen, so it doesn't sit half-covering the map while they navigate.
    if (isGestureActive && !wasMapGestureActiveRef.current && sheetSnapStateRef.current === 'half') {
      setCollapseSheetSignal(c => c + 1);
    }
    // Same rising-edge check — minimize the layers/filter pills if either is expanded, so
    // they don't sit open over the map while the user navigates.
    if (isGestureActive && !wasMapGestureActiveRef.current) {
      if (showMapMenuRef.current) { showMapMenuRef.current = false; setShowMapMenu(false); }
      if (showFilterMenuRef.current) { showFilterMenuRef.current = false; setShowFilterMenu(false); }
    }
    wasMapGestureActiveRef.current = isGestureActive;

    // South-limit glide-back: let the user freely drag as far south as they want (so they
    // can actually see how much of Antarctica there is while their finger is down) — but
    // the instant they release, ease back to the limit. Keyed off isGestureActive rather
    // than onMapIdle so it fires on the very next camera-changed event after release,
    // not after waiting for any momentum/deceleration glide to finish first.
    // -60 keeps southern South America (Cape Horn ≈ -56°) comfortably in view while
    // trimming Antarctica to only its northernmost strip. Only the south edge is clamped;
    // the north cap and longitude (center[0], passed through) are untouched.
    const SOUTH_LIMIT = -60;
    if (!selectedCountryRef.current && !isGestureActive && !southCorrectingRef.current
        && !suppressSouthLimitRef.current && bounds.sw[1] < SOUTH_LIMIT) {
      southCorrectingRef.current = true;
      const toMercY = (lt: number) => Math.log(Math.tan(Math.PI / 4 + lt * Math.PI / 360));
      const fromMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
      const span = toMercY(Math.min(bounds.ne[1], 85.05)) - toMercY(Math.max(bounds.sw[1], -85.05));
      const targetCenterLat = Math.min(fromMercY(toMercY(SOUTH_LIMIT) + span / 2), 80);
      cameraRef.current?.setCamera({
        centerCoordinate: [center[0], targetCenterLat],
        animationDuration: 300,
        animationMode: 'easeTo',
      });
      if (southCorrectingTimerRef.current) clearTimeout(southCorrectingTimerRef.current);
      southCorrectingTimerRef.current = setTimeout(() => { southCorrectingRef.current = false; }, 320);
      return;
    }

    const latDelta = Math.abs(bounds.ne[1] - bounds.sw[1]);
    const lngDelta = Math.abs(bounds.ne[0] - bounds.sw[0]);
    const lat = center[1];
    const lng = center[0];

    // Trigger prompt animations imperatively on every camera frame so they respond
    // during gestures. Reanimated shared values run the animation on the UI thread.
    const animatePrompt = (
      shouldShow: boolean,
      visibleRef: React.MutableRefObject<boolean>,
      progress: Reanimated.SharedValue<number>,
    ) => {
      if (shouldShow === visibleRef.current) return;
      visibleRef.current = shouldShow;
      progress.value = withTiming(shouldShow ? 1 : 0, { duration: shouldShow ? 250 : 200 });
    };

    const ch = countryHomeRegionRef.current;
    if (selectedCountryRef.current && !selectedDestRef.current && ch) {
      const zoomedOut  = latDelta > ch.latitudeDelta * 1.6;
      const pannedAway = Math.abs(lat - ch.latitude)  > ch.latitudeDelta  * 0.45 ||
                         Math.abs(lng - ch.longitude) > ch.longitudeDelta * 0.45;
      animatePrompt(zoomedOut || pannedAway, returnPromptVisibleRef, returnPromptProgress);
    } else {
      animatePrompt(false, returnPromptVisibleRef, returnPromptProgress);
    }

    const dh = destHomeRegionRef.current;
    if (selectedDestRef.current && dh) {
      const zoomedOut  = latDelta > dh.latitudeDelta * 1.6;
      const pannedAway = Math.abs(lat - dh.latitude)  > dh.latitudeDelta  * 0.45 ||
                         Math.abs(lng - dh.longitude) > dh.longitudeDelta * 0.45;
      animatePrompt(zoomedOut || pannedAway, destReturnPromptVisibleRef, destReturnPromptProgress);
    } else {
      animatePrompt(false, destReturnPromptVisibleRef, destReturnPromptProgress);
    }

    // Throttle the region-state updates to ~20 fps.
    const now = Date.now();
    if (now - lastCameraTimeRef.current < 50) return;
    lastCameraTimeRef.current = now;

    setRegion({
      latitude:       lat,
      longitude:      lng,
      latitudeDelta:  latDelta,
      longitudeDelta: lngDelta,
    });
  }, [returnPromptProgress, destReturnPromptProgress]);

  const handleMapIdle = useCallback((state: {
    properties: {
      center: [number, number];
      bounds: { ne: [number, number]; sw: [number, number] };
      zoom: number;
    };
  }) => {
    // Once the camera is fully settled, no more onCameraChanged events fire until the next
    // gesture — if the last one before idle happened to report isGestureActive:true (e.g.
    // during momentum), wasMapGestureActiveRef would otherwise stay stuck at true forever,
    // and the *next* pan's true would never register as a fresh rising edge (only the very
    // first pan of the whole session ever would). Reset it here so every pan is detected.
    wasMapGestureActiveRef.current = false;
    const { center, bounds } = state.properties;
    const newRegion: Region = {
      latitude:      center[1],
      longitude:     center[0],
      latitudeDelta: Math.abs(bounds.ne[1] - bounds.sw[1]),
      longitudeDelta: Math.abs(bounds.ne[0] - bounds.sw[0]),
    };
    // South-limit correction now lives in handleCameraChanged, keyed off gesture-release
    // instead of idle — by the time onMapIdle fires here, the glide-back has already
    // finished and the region below is normally already back within bounds.

    setRegion(newRegion);

    // Capture dest home using a ref so stale closures don't block it.
    // Guard latDelta < 2 so a country-view idle (5°+) never poisons the home position.
    if (selectedDestRef.current && !destHomeRegionRef.current && newRegion.latitudeDelta < 2) {
      destHomeRegionRef.current = newRegion;
      setDestHomeRegion(newRegion);
      // Belt-and-suspenders: force arrow hidden immediately when home is captured.
      destReturnPromptProgress.value = 0; destReturnPromptVisibleRef.current = false;
    }

    if (mapState === 'world' && !selectedDest) {
      // Capture the settled camera position as the "home" for the current country view
      if (selectedCountryRef.current && !countryHomeRegionRef.current) {
        countryHomeRegionRef.current = newRegion;
        setCountryHomeRegion(newRegion);
      }

      if (newRegion.latitudeDelta >= SPOT_THRESHOLD) {
        lastWorldRegionRef.current = newRegion;
      }
      return;
    }
  }, [mapState, selectedDest, savedDestinations, showBreadcrumb]);

  // Pre-rendered marker element arrays, memoized on their pan-invariant inputs. Building the
  // MarkerViews here (instead of inline in the JSX) means the SAME element instances — and
  // therefore the same `coordinate` array references — are reused across the frequent
  // re-renders a pan triggers via setRegion. Without this, each render created fresh
  // `coordinate={[lng, lat]}` literals, so every MarkerView saw a "changed" prop and
  // re-synced its native marker every frame, making closely-spaced pins flicker/fight.
  // These deps change only on zoom/selection, never on a pure pan.
  // Country codes with at least one visited destination — used both by the pill border
  // below and by the map boundary highlight further down. Derived from the full static
  // COUNTRY_GROUPS list, NOT from countryPills — countryPills drops a country's pill when
  // it collides with a higher-priority one at wide zoom (by design, so pills don't
  // overlap), but this highlight must stay independent of that.
  const visitedCountryCodes = useMemo(
    () => COUNTRY_GROUPS
      .filter(g => g.destIds.some(id => savedDestinations[id]?.type === 'visited'))
      .map(g => g.countryCode),
    [savedDestinations],
  );
  const visitedCountryCodeSet = useMemo(() => new Set(visitedCountryCodes), [visitedCountryCodes]);

  const countryPillMarkers = useMemo(() => countryPills.map(cluster => {
    const isSelectedPill = cluster.countryCode === selectedCountry?.countryCode;
    // Plain border (no glow/shadow) on every OTHER visited country's pill, always — the
    // selected country keeps the full glow treatment instead, handled separately below so
    // the two states never compete on the same element. Checked against
    // visitedCountryCodeSet (destination-visited-status based, same source the map boundary
    // highlight uses) rather than cluster.visitedCount, which is actually a SPOT count
    // (SPOT_COUNT_BY_DEST) — a visited destination with zero spots in the data would leave
    // visitedCount at 0 despite genuinely being visited, silently hiding this border.
    const isClusterVisited = visitedCountryCodeSet.has(cluster.countryCode);
    const isVisitedHighlighted = isClusterVisited && !isSelectedPill;
    // Selected-but-unvisited uses the blue variant instead of the default emerald —
    // isVisitedHighlighted (the non-selected case) is always a visited country by
    // construction, so it never needs this: gray is reserved for "you're looking at this
    // country but haven't been there," not for the general highlight color.
    const isSelectedUnvisited = isSelectedPill && !isClusterVisited;
    const offset = countryPinOffsets.get(cluster.countryCode);
    return (
      <MapboxGL.MarkerView
        key={cluster.country}
        coordinate={[cluster.longitude, cluster.latitude]}
      >
        <View style={offset ? { transform: [{ translateX: offset.dx }, { translateY: offset.dy }] } : undefined}>
          <Pressable
            onPressIn={() => { lastCountryPressRef.current = Date.now(); }}
            onPress={() => { prevCountryRef.current = selectedCountry; handleCountryPress(cluster); }}
          >
            <View style={styles.countryPill}>
              {/* Card first so circle (declared last) renders on top */}
              <View style={[
                styles.countryPillCard,
                isSelectedPill && (isSelectedUnvisited ? styles.countryPillCardGlowGray : styles.countryPillCardGlow),
                isVisitedHighlighted && styles.countryPillCardBorder,
              ]}>
                <Text style={styles.countryPillName} numberOfLines={1}>{cluster.country}</Text>
              </View>
              <View style={[
                styles.countryPillCircle,
                isSelectedPill && (isSelectedUnvisited ? styles.countryPillCircleGlowGray : styles.countryPillCircleGlow),
              ]}>
                <View style={styles.countryPillFlagClip}>
                  <Image
                    source={{ uri: `https://flagcdn.com/w160/${cluster.countryCode.toLowerCase()}.png` }}
                    style={styles.countryPillFlagImg}
                    resizeMode="cover"
                  />
                </View>
                {(isSelectedPill || isVisitedHighlighted) && (
                  <>
                    {/* Left semicircle only (clipped to the flag's true outer-cap half) —
                        a full circular ring here would dip into the card's interior for
                        x>12, since the card's own corner curve only spans the left half;
                        past that point the border is flat, filled in by the two bars below.
                        These ring pieces are plain colored borders with no shadow, so
                        they're used for the plain "visited, not selected" case too, not just
                        isSelectedPill — only countryPillCardGlow/countryPillCircleGlow (the
                        shadow-based glow) is selected-only. Blue variants swap in only for
                        the selected-but-unvisited case (isVisitedHighlighted alone is
                        always a visited country, so it's always the green ones). */}
                    <View style={styles.countryPillFlagRingClip}>
                      <View style={isSelectedUnvisited ? styles.countryPillFlagRingCircleGray : styles.countryPillFlagRingCircle} />
                    </View>
                    <View style={isSelectedUnvisited ? styles.countryPillFlagRingBarTopGray : styles.countryPillFlagRingBarTop} />
                    <View style={isSelectedUnvisited ? styles.countryPillFlagRingBarBottomGray : styles.countryPillFlagRingBarBottom} />
                  </>
                )}
                {cluster.visitedCount > 0 && (
                  <View style={styles.countryPillBadge}>
                    <Text style={styles.countryPillBadgeTxt}>{cluster.visitedCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        </View>
      </MapboxGL.MarkerView>
    );
  }), [countryPills, countryPinOffsets, selectedCountry, handleCountryPress, visitedCountryCodeSet]);

  const destPhotoMarkers = useMemo(() => destItems
    .filter(item => {
      // Hide the selected destination's own pin for as long as its sheet is showing —
      // regardless of zoom level, since the sheet (or the spot carousel, once zoomed to
      // spot level) already represents it. Previously this only hid at spot zoom and
      // reappeared at any wider one, which meant swiping between destinations within a
      // country (recentering the camera without necessarily crossing that threshold)
      // could leave the newly-selected destination's own pin visibly still showing.
      if (selectedDest?.id === item.dest.id) return false;
      return destPinPlan.photoIds.has(item.dest.id) && !countryPinDemotedIds.has(item.dest.id);
    })
    .sort((a, b) => b.dest.rank - a.dest.rank) // rank=1 renders last (on top)
    .map(item => {
      const dest = item.dest;
      const saved = savedDestinations[dest.id];
      const isVisited  = saved?.type === 'visited';
      const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');
      const spotCount  = SPOT_COUNT_BY_DEST[dest.id] ?? 0;
      const isSelectedDest = selectedDest?.id === dest.id;
      return (
        <MapboxGL.MarkerView
          key={dest.id}
          coordinate={[dest.coordinates.longitude, dest.coordinates.latitude]}
        >
          <Pressable onPress={() => handleMarkerPress(dest)}>
            <DestPin
              dest={dest} spotCount={spotCount}
              isVisited={isVisited} isWishlist={isWishlist}
              isSelected={isSelectedDest} pinState="photo"
            />
          </Pressable>
        </MapboxGL.MarkerView>
      );
    }),
  [destItems, destPinPlan, countryPinDemotedIds, selectedDest, savedDestinations, handleMarkerPress]);

  return (
    <View style={styles.root}>

      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        rotateEnabled={false}
        pitchEnabled={false}
        {...(baseStyle
          ? { styleJSON: baseStyle }
          : { styleURL: MapboxGL.StyleURL.Light }
        )}
        onDidFinishLoadingMap={() => setMapReady(true)}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onPress={() => {
          searchInputRef.current?.blur();
          setSearchFocused(false);
          if (showMapMenuRef.current) { showMapMenuRef.current = false; setShowMapMenu(false); }
          if (showFilterMenuRef.current) { showFilterMenuRef.current = false; setShowFilterMenu(false); }
        }}
        logoEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        attributionEnabled={false}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [10, 20], zoomLevel: 1 }}
        />
        {/* Satellite imagery — layered on top of the (always-standard) base style and
            toggled purely via raster opacity, so switching map type never reloads the
            style and the MarkerView pins never disappear. */}
        <MapboxGL.RasterSource id="satelliteSource" url="mapbox://mapbox.satellite" tileSize={256} maxZoomLevel={22}>
          <MapboxGL.RasterLayer
            id="satelliteLayer"
            style={{ rasterOpacity: mapType === 'satellite' ? 1 : 0 }}
          />
        </MapboxGL.RasterSource>

        {/* Our own country + region border lines — drawn above the raster so they show on
            both backgrounds, and re-colored per map type via paint props (a live update,
            not a style reload). */}
        <MapboxGL.VectorSource id="adminBorders" url="mapbox://mapbox.mapbox-streets-v8">
          <MapboxGL.LineLayer
            id="regionBorderLine"
            sourceLayerID="admin"
            filter={['all',
              ['==', ['get', 'admin_level'], 1],
              ['!=', ['get', 'maritime'], 'true'],
              ['match', ['get', 'worldview'], ['all', 'US'], true, false],
            ] as any}
            style={{
              lineColor: mapType === 'satellite' ? '#D1D5DB' : '#AEB4BD',
              lineOpacity: 0.7,
              lineWidth: 0.7,
            }}
          />
          <MapboxGL.LineLayer
            id="countryBorderLine"
            sourceLayerID="admin"
            filter={['all',
              ['==', ['get', 'admin_level'], 0],
              ['!=', ['get', 'maritime'], 'true'],
              ['!=', ['get', 'disputed'], 'true'],
              ['match', ['get', 'worldview'], ['all', 'US'], true, false],
            ] as any}
            style={{
              lineColor: mapType === 'satellite' ? '#F3F4F6' : '#374151',
              lineOpacity: ['interpolate', ['linear'], ['zoom'],
                1, mapType === 'satellite' ? 0.6 : 0.35,
                6, mapType === 'satellite' ? 0.8 : 0.55] as any,
              lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 0.7, 6, 1.3] as any,
            }}
          />
          {/* Disputed country borders: identical color/opacity/width to a normal country
              border, distinguished only by a dash pattern — kept in a separate layer (and
              excluded above) because disputed segments carry duplicate overlapping
              features per claimant, which doubled up and looked far brighter when they
              shared the solid countryBorderLine layer. The worldview filter (Mapbox's own
              convention for these boundaries — e.g. Crimea, Kashmir, Western Sahara have a
              separate line per cartographic perspective) picks a single consistent
              perspective ("all" + "US") instead of drawing every variant stacked on top of
              each other, which was the real cause of the extra-dark segments.  */}
          <MapboxGL.LineLayer
            id="disputedBorderLine"
            sourceLayerID="admin"
            filter={['all',
              ['==', ['get', 'admin_level'], 0],
              ['!=', ['get', 'maritime'], 'true'],
              ['==', ['get', 'disputed'], 'true'],
              ['match', ['get', 'worldview'], ['all', 'US'], true, false],
            ] as any}
            style={{
              lineColor: mapType === 'satellite' ? '#F3F4F6' : '#374151',
              lineOpacity: ['interpolate', ['linear'], ['zoom'],
                1, mapType === 'satellite' ? 0.6 : 0.35,
                6, mapType === 'satellite' ? 0.8 : 0.55] as any,
              lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 0.7, 6, 1.3] as any,
              lineDasharray: [2, 2],
            }}
          />
        </MapboxGL.VectorSource>

        {/* Country boundary highlight — only when a country is selected. Explicitly pinned
            below the stamp layer via belowLayerID (not just JSX order) since this block
            mounts/unmounts on every selection change, while the stamp layer mounts once —
            native insertion order otherwise depends on mount timing, not render position.
            Color depends on whether the selected country has been visited: the default
            emerald if so, a muted blue (#5B7DBE) if not — same pairing as the pill glow's own
            countryPillCardGlow/countryPillCardGlowGray. */}
        {selectedCountry && (() => {
          const selectedIsVisited = visitedCountryCodeSet.has(selectedCountry.countryCode);
          const fillColor = selectedIsVisited ? '#22C55E' : '#5B7DBE';
          const lineColor = selectedIsVisited ? '#16A34A' : '#5B7DBE';
          return (
            <MapboxGL.VectorSource
              id="countryBoundaries"
              url="mapbox://mapbox.country-boundaries-v1"
            >
              <MapboxGL.FillLayer
                id="countryFill"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ fillColor, fillOpacity: 0.10 }}
              />
              <MapboxGL.LineLayer
                id="countryGlowOuter"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ lineColor, lineWidth: 12, lineOpacity: 0.08 }}
              />
              <MapboxGL.LineLayer
                id="countryGlowInner"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ lineColor, lineWidth: 6, lineOpacity: 0.18 }}
              />
              <MapboxGL.LineLayer
                id="countryOutline"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ lineColor, lineWidth: 2, lineOpacity: 0.7 }}
              />
            </MapboxGL.VectorSource>
          );
        })()}

        {/* Visited-country boundary highlight — every country with at least one visited
            destination, only while the Visited filter is on. Fill + crisp outline only (no
            glowOuter/glowInner blur layers) — the selected country above keeps the full
            glow treatment; this is a plain border for every other visited country. */}
        {filter === 'visited' && visitedCountryCodes.length > 0 && (
          <MapboxGL.VectorSource
            id="visitedCountryBoundaries"
            url="mapbox://mapbox.country-boundaries-v1"
          >
            <MapboxGL.FillLayer
              id="visitedCountryFill"
              sourceLayerID="country_boundaries"
              filter={['in', ['get', 'iso_3166_1'], ['literal', visitedCountryCodes]] as any}
              style={{ fillColor: '#22C55E', fillOpacity: 0.10 }}
            />
            <MapboxGL.LineLayer
              id="visitedCountryOutline"
              sourceLayerID="country_boundaries"
              filter={['in', ['get', 'iso_3166_1'], ['literal', visitedCountryCodes]] as any}
              style={{ lineColor: '#16A34A', lineWidth: 2, lineOpacity: 0.7 }}
            />
          </MapboxGL.VectorSource>
        )}

        {/* Stamp pins — always shown, single source regardless of selection state */}
        <MapboxGL.ShapeSource
          id="destStamps"
          shape={stampGeoJSON}
          onPress={(e) => {
            const id = e.features[0]?.properties?.id as string | undefined;
            if (!id) return;
            const dest = DESTINATIONS.find(d => d.id === id);
            if (dest) handleMarkerPress(dest);
          }}
        >
          <MapboxGL.CircleLayer
            id="destStampCircles"
            // Explicitly insert above the admin border layers rather than relying on JSX
            // declaration order — stamps must never render underneath country/region borders.
            aboveLayerID="disputedBorderLine"
            style={{
              circleRadius: STAMP_SIZE / 2,
              circleColor: ['get', 'color'] as any,
              circleStrokeWidth: 1.5,
              circleStrokeColor: 'white',
            }}
          />
        </MapboxGL.ShapeSource>

        {/* All MarkerViews require the map style to be loaded before Mapbox can
            project coordinates to screen positions. Gate on mapReady. */}
        {mapReady && <>

        {/* Spot pins — teardrop markers whose pointed tip sits on the exact coordinate. */}
        {visibleSpots.map(spot => {
          const isSelectedSpot = selectedSpot?.id === spot.id;
          // Selected spot ignores the zoom fade so it stays fully visible while its sheet is open.
          const spotOpacity = isSelectedSpot
            ? 1
            : Math.min(1, Math.max(0, (SPOT_THRESHOLD - region.latitudeDelta) / 0.15));
          return (
            <MapboxGL.MarkerView
              key={spot.id}
              coordinate={[spot.coordinates.longitude, spot.coordinates.latitude]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <Pressable onPress={() => handleSpotPress(spot)} hitSlop={6}>
                <View style={[styles.spotPinWrap, { opacity: spotOpacity }]}>
                  <View style={[styles.spotPinBubble, isSelectedSpot && styles.spotPinBubbleSelected]}>
                    <Text style={[styles.spotPinIcon, isSelectedSpot && styles.spotPinIconSelected]}>{spot.icon}</Text>
                  </View>
                  <View style={[styles.spotPinTip, isSelectedSpot && styles.spotPinTipSelected]} />
                </View>
              </Pressable>
            </MapboxGL.MarkerView>
          );
        })}

{/* Country cluster pills — a stable, always-on layer for every country except the one
            currently selected (replaced by its breadcrumb pill instead). Memoized above so
            the marker instances are reused verbatim across pan re-renders. */}
        {countryPillMarkers}

        {/* Destination photo pins — the finalized priority+collision plan from destPinPlan.
            Everything else already has a stamp (CircleLayer above); nothing is ever hidden.
            Memoized above so pins don't re-sync (and flicker) on every pan frame. */}
        {destPhotoMarkers}

        </>}
      </MapboxGL.MapView>

      {/* ── Search bar (world mode only) ─────────────────────────────────── */}
      {/* Static left:12/right:12 (full width) at all times — opacity/transform below run on
          the native driver (worldPillAnim/worldPillScale), which can't share a style array
          with a JS-driven layout animation (see searchWidthAnim's own comment). The actual
          expand/collapse instead animates the inner row's own `width` on a separate node. */}
      <Animated.View
        style={[styles.searchWrap, {
          top: insets.top + 10,
          right: 12,
          opacity: worldPillAnim,
          transform: [{ scale: worldPillScale }],
        }]}
        pointerEvents={mapState === 'world' && !selectedCountry ? 'box-none' : 'none'}
      >
        <Animated.View style={[styles.searchRow, { width: searchWidthAnim }]}>
          <View style={[styles.searchBar, styles.searchBarFlex, searchFocused && styles.searchBarFocused]}>
            <Search size={15} color="#9CA3AF" />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search countries, destinations, spots…"
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => { setSearchFocused(true); setShowMapMenu(false); setShowFilterMenu(false); }}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery ? (
              <Pressable onPress={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} hitSlop={8}>
                <X size={15} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>
          {searchFocused && (
            <Pressable
              style={styles.searchCloseBtn}
              onPress={() => { searchInputRef.current?.blur(); setSearchFocused(false); setSearchQuery(''); }}
              hitSlop={6}
            >
              <X size={18} color="#111827" />
            </Pressable>
          )}
        </Animated.View>


        {/* Search results (or, with no query yet, suggested destinations) — capped above
            the keyboard (searchResultsMaxHeight) and scrollable once results overflow it. */}
        {searchFocused && searchResults.length > 0 && (
          <ScrollView
            style={[styles.searchResultsList, { maxHeight: searchResultsMaxHeight }]}
            contentContainerStyle={{ paddingRight: 2 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            indicatorStyle="black"
            persistentScrollbar
            // Native scroll indicators render flush to the view's raw edge, ignoring
            // borderRadius/overflow:hidden clipping — nudging it inward on all sides keeps
            // it inside the rounded corners instead of poking through them (iOS-only prop;
            // Android's own scrollbar already respects the clip).
            scrollIndicatorInsets={{ top: 4, right: 3, bottom: 4 }}
          >
            {!searchQuery.trim() && (
              <Text style={styles.searchResultsHeader}>Suggested</Text>
            )}
            {searchResults.map((item, i) => {
              let icon: string | null, countryCode: string | null, label: string, sublabel: string, badge: string;
              let thumbName: string | null = null, thumbKey: string | null = null;
              if (item.type === 'country') {
                icon = null; countryCode = item.countryCode; label = item.country; sublabel = ''; badge = 'Country';
              } else if (item.type === 'destination') {
                icon = item.destination.icon ?? '📍'; countryCode = null; label = item.destination.name;
                sublabel = item.destination.country; badge = 'Destination';
                thumbName = item.destination.name; thumbKey = item.destination.id;
              } else {
                icon = item.spot.icon; countryCode = null; label = item.spot.name;
                sublabel = item.destination.name; badge = 'Spot';
                thumbName = item.spot.name; thumbKey = `spot_${item.spot.id}`;
              }
              return (
                <Pressable
                  key={i}
                  style={[styles.searchResultItem, i === searchResults.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => handleSearchSelect(item)}
                >
                  {countryCode
                    ? <CircleFlag countryCode={countryCode} size={22} />
                    : <SearchResultThumb name={thumbName!} icon={icon ?? '📍'} cacheKey={thumbKey!} size={30} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultLabel} numberOfLines={1}>{label}</Text>
                    {sublabel ? <Text style={styles.searchResultSub} numberOfLines={1}>{sublabel}</Text> : null}
                  </View>
                  <Text style={styles.searchResultBadge}>{badge}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
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
                <Text style={styles.breadcrumbTxtDark}>{selectedDest.country}</Text>
              </Pressable>
              <Pressable style={styles.breadcrumbSegmentActive} onPress={handleResetToDest} hitSlop={6}>
                <Reanimated.View style={destReturnPromptStyle}>
                  <CornerUpLeft size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
                </Reanimated.View>
                <View style={styles.breadcrumbPillRow}>
                  <Text style={styles.breadcrumbTxtLight} numberOfLines={1}>{selectedDest.name}</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            /* Country view: black pill — arrow slides in when user pans/zooms away */
            <Pressable
              style={styles.breadcrumbPillBlack}
              onPress={handleResetToCountry}
              hitSlop={6}
            >
              <Reanimated.View style={returnPromptStyle}>
                <CornerUpLeft size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
              </Reanimated.View>
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
                <Text style={styles.breadcrumbTxtLight}>{selectedCountry!.country}</Text>
              </View>
            </Pressable>
          )}
        </Animated.View>
      )}


      {/* ── Layers pill — a single continuous capsule, not a button with a separate
          dropdown floating below it. Closed, it's just a circle (the Layers icon); opening
          grows THAT SAME shape straight down into a taller capsule that reveals the two
          option rows beneath it, rounded top and bottom throughout. Fades out while the
          search bar is focused (layersPillFadeStyle) since the expanded search bar then
          occupies this same corner. ──────────────────────────────────────────────────── */}
      <Reanimated.View
        style={[styles.mapTypeWrap, { top: insets.top + 10 }, layersPillFadeStyle]}
        onTouchStart={() => { lastMenuOpenRef.current = Date.now(); }}
        pointerEvents={searchFocused ? 'none' : 'auto'}
      >
        <Reanimated.View style={[styles.mapPill, mapPillStyle]}>
          <Pressable style={styles.mapPillBtn}
            onPress={() => {
              const next = !showMapMenuRef.current;
              showMapMenuRef.current = next;   // sync before re-render so MapView guard sees it
              setShowMapMenu(next);
              setShowFilterMenu(false);
            }}>
            <Layers size={18} color="#111827" />
          </Pressable>
          <View style={styles.mapPillDivider} pointerEvents="none" />
          <View pointerEvents={showMapMenu ? 'auto' : 'none'}>
            {MAP_TYPES.map((m, i) => {
              const active = m.key === mapType;
              const Swatch = m.key === 'standard' ? StandardSwatch : SatelliteSwatch;
              return (
                <React.Fragment key={m.key}>
                  {i > 0 && <View style={styles.mapPillOptionDivider} pointerEvents="none" />}
                  <Pressable
                    style={[styles.mapPillOption, active && styles.mapPillOptionActive]}
                    onPress={() => { setMapType(m.key); setShowMapMenu(false); }}>
                    <View style={[styles.mapPillSwatch, active && styles.mapPillSwatchActive]}>
                      <Swatch />
                    </View>
                    {active && (
                      <View style={styles.mapPillOptionCheck}>
                        <Check size={9} color="white" strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </Reanimated.View>
      </Reanimated.View>

      {/* ── Filter pill — same single-capsule mechanism as the layers pill above, right
          below it. Closed circle shows a Filter icon (tinted when a filter is active);
          opening reveals Visited/Wishlist rows. Tapping the already-active option clears
          back to 'all' instead of there being a separate "All" row. Slides down while the
          layers pill above is expanded (see filterWrapStyle) so the two never overlap, and
          fades out while the search bar is focused (filterPillFadeStyle), same as the
          layers pill. ─────────────────────────────────────────────────────────────────── */}
      <Reanimated.View
        style={[styles.mapTypeWrap, filterWrapStyle, filterPillFadeStyle]}
        onTouchStart={() => { lastMenuOpenRef.current = Date.now(); }}
        pointerEvents={searchFocused ? 'none' : 'auto'}
      >
        <Reanimated.View style={[styles.mapPill, filterPillStyle]}>
          <Pressable style={styles.mapPillBtn}
            onPress={() => {
              const next = !showFilterMenu;
              setShowFilterMenu(next);
              setShowMapMenu(false);
            }}>
            <Filter size={17} color={filter !== 'all' ? '#6366F1' : '#111827'} />
            {filter !== 'all' && (
              <View style={[
                styles.mapPillBtnBadge,
                { backgroundColor: filter === 'visited' ? VISITED_COLOR : WISHLIST_COLOR },
              ]}>
                {filter === 'visited'
                  ? <Check size={8} color="white" strokeWidth={3} />
                  : <Heart size={8} color="white" strokeWidth={3} fill="white" />
                }
              </View>
            )}
          </Pressable>
          <View style={styles.mapPillDivider} pointerEvents="none" />
          <View pointerEvents={showFilterMenu ? 'auto' : 'none'}>
            {FILTER_TYPES.map((f, i) => {
              const active = f.key === filter;
              const color  = f.key === 'visited' ? VISITED_COLOR : WISHLIST_COLOR;
              const Icon   = f.key === 'visited' ? Check : Heart;
              return (
                <React.Fragment key={f.key}>
                  {i > 0 && <View style={styles.mapPillOptionDivider} pointerEvents="none" />}
                  <Pressable
                    style={[styles.mapPillOption, active && { backgroundColor: color + '1A' }]}
                    onPress={() => {
                      setFilter(active ? 'all' : f.key);
                      setShowFilterMenu(false);
                    }}>
                    <Icon size={18} color={active ? color : '#6B7280'} strokeWidth={2.5}
                      fill={f.key === 'wishlist' && active ? color : 'none'} />
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </Reanimated.View>
      </Reanimated.View>


{/* ── Country sheet ─────────────────────────────────────────────────── */}
      {selectedCountry && !selectedDest && (
        <CountrySheet
          cluster={selectedCountry}
          onClose={handleCloseCountry}
          onSelectDestination={handleMarkerPress}
          onGoToDestinationsMap={handleGoToDestinationsMap}
          onExpand={() => setMapState('sheet')}
          onCollapse={handleCloseSheet}
          pillOffsetSV={upPillBottomSV}
          pillOffsetLockedSV={spotOwnsPillSV}
          onSnapStateChange={handleSheetSnapStateChange}
          collapseSignal={collapseSheetSignal}
          initialTab={countryInitialTab}
          initialSnap={countryInitialSnap}
        />
      )}

      {/* ── Unified destination sheet — hidden while a spot sheet is open on top */}
      {mapState !== 'world' && selectedDest && !selectedSpot && (
        <DestinationSheet
          destination={selectedDest}
          onClose={handleCloseDestinationSheet}
          onExpand={() => setMapState('sheet')}
          onCollapse={handleCloseSheet}
          onSelectSpot={handleSpotPress}
          onCollapsedTopChange={setDestCardTop}
          pillOffsetSV={upPillBottomSV}
          pillOffsetLockedSV={spotOwnsPillSV}
          initialTab={destInitialTab}
          initialSnap={destInitialSnap}
          onSwipeToDestination={handleSwipeToDestination}
          onSnapStateChange={handleSheetSnapStateChange}
          collapseSignal={collapseSheetSignal}
          onGoToCountryList={handleGoToCountryList}
        />
      )}

      {/* ── Spot sheet — swipeable carousel of the destination's spots, expandable to full */}
      {selectedSpot && selectedDest && spotFocusId && (
        <SpotSheet
          spots={spotsInDest}
          focusSpotId={spotFocusId}
          destination={selectedDest}
          onClose={handleCloseSpot}
          onExpand={() => setMapState('sheet')}
          onCollapse={handleCloseSheet}
          onActiveSpotChange={handleActiveSpotChange}
          onCollapsedTopChange={setSpotCarouselTop}
          onGoToList={handleGoToListView}
        />
      )}

      {/* ── Back pill — visible through collapsed/half/full for both the country and
          destination sheets now (DestinationSheet's own close button was removed in favor
          of this pill gliding to take its place at full/half screen; CountrySheet still
          shows the pill alongside its own close button there). Still hidden specifically
          while the SPOT sheet is full-screen (mapState 'sheet' with a spot selected) — that
          sheet has its own close button and no repositioning logic for this pill to glide
          to. Rendered after the sheets above (not before) so it reliably paints on top of
          them, reinforcing its zIndex rather than depending on it alone. */}
      {(selectedCountry || selectedDest) && !(mapState === 'sheet' && selectedSpot) && (
        // `bottom` lives on this outer Reanimated wrapper (a UI-thread shared value, written
        // to directly by DestinationSheet — see pillOffsetSV — with no JS-thread hop, so it
        // glides exactly as smoothly as the sheet itself), separate from the inner view's
        // native-driven opacity/scale. Kept as two nested views (rather than merging the
        // styles) since mixing a Reanimated-driven style and a core-Animated native-driven
        // style on the *same* view previously threw "Attempting to run JS driven animation on
        // animated node that has been moved to native".
        <Reanimated.View
          style={[styles.upPillWrap, upPillWrapStyle]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={{ opacity: breadcrumbAnim, transform: [{ scale: breadcrumbScale }] }}
          >
            <Pressable
              style={styles.upPill}
              onPress={handleBackNav}
              hitSlop={6}
            >
              <Text style={styles.upPillArrow}>←</Text>
              {selectedSpot ? (
                // Back from a spot goes to its parent destination; fall back to the country
                // (or world) if the spot has no resolvable destination.
                selectedDest
                  ? <Text style={styles.upPillTxt}>{selectedDest.name}</Text>
                  : selectedCountry
                    ? <Text style={styles.upPillTxt}>{selectedCountry.country}</Text>
                    : <Globe size={14} color="#374151" strokeWidth={2} />
              ) : selectedDest ? (
                <Text style={styles.upPillTxt}>{selectedDest.country}</Text>
              ) : (
                <Globe size={14} color="#374151" strokeWidth={2} />
              )}
            </Pressable>
          </Animated.View>
        </Reanimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Country cluster pills
  countryDotCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 4,
  },
  countryDotClip: { width: 19, height: 19, borderRadius: 9.5, overflow: 'hidden' },
  countryDotImg:  { width: 19, height: 19 },
  countryPill: {
    flexDirection: 'row', alignItems: 'center',
  },
  // The flag circle's own diameter (24) is flush with the card's height — same center point
  // and radius as the card's rounded-left-cap curve, so it exactly fills that corner with no
  // gap. The card's true corner curve is only a semicircle (it goes flat past x=12, since
  // corner radius = height/2) — the flag being a full circle covers that flat region too, so
  // countryPillFlagRing* below redraws the border on top: a clipped left semicircle for the
  // true rounded cap, plus two straight bars for the flat stretch the flag also covers,
  // instead of one full circular ring (which would dip into the interior past x=12).
  countryPillCircle: {
    position: 'absolute', left: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 5,
    shadowOffset: { width: -3, height: 1 }, elevation: 6,
  },
  countryPillFlagClip: {
    width: 22, height: 22, borderRadius: 11,  // 1px white margin around the flag photo
    overflow: 'hidden',
  },
  countryPillFlagImg: { width: 22, height: 22 },
  countryPillFlagRingClip: {
    position: 'absolute', top: 0, left: 0,
    width: 12, height: 24, overflow: 'hidden',
  },
  countryPillFlagRingCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(22,163,74,0.85)',
  },
  countryPillFlagRingBarTop: {
    position: 'absolute', top: 0, left: 12,
    width: 12, height: 1.5, backgroundColor: 'rgba(22,163,74,0.85)',
  },
  countryPillFlagRingBarBottom: {
    position: 'absolute', bottom: 0, left: 12,
    width: 12, height: 1.5, backgroundColor: 'rgba(22,163,74,0.85)',
  },
  // Blue variants — selected-but-unvisited country, replacing the default emerald above.
  countryPillFlagRingCircleGray: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#5B7DBE',
  },
  countryPillFlagRingBarTopGray: {
    position: 'absolute', top: 0, left: 12,
    width: 12, height: 1.5, backgroundColor: '#5B7DBE',
  },
  countryPillFlagRingBarBottomGray: {
    position: 'absolute', bottom: 0, left: 12,
    width: 12, height: 1.5, backgroundColor: '#5B7DBE',
  },

  countryPillBadge: {
    position: 'absolute', bottom: -4, right: -1,
    minWidth: 14, height: 14, borderRadius: 7,  // 20% smaller than the original 17
    backgroundColor: '#059669',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countryPillBadgeTxt: { fontSize: 9, fontWeight: '700', color: '#fff' },
  // Fixed height:24 (matching the flag circle's 24px slot exactly) so the card's own
  // rounded-left corner is centered at the same point as the flag circle above — the two
  // curves become concentric instead of offset, which is what makes the border seamless.
  countryPillCard: {
    backgroundColor: '#fff',
    borderRadius: 12, height: 24,
    justifyContent: 'center',
    paddingLeft: 26, paddingRight: 6,  // 26 = 24px flag slot + 2px breathing room before text
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
  // Blue variants — selected country that hasn't been visited, replacing the default
  // emerald glow above with a muted blue instead.
  countryPillCardGlowGray: {
    borderWidth: 1.5, borderColor: '#5B7DBE',
    shadowColor: '#5B7DBE', shadowOpacity: 0.7, shadowRadius: 10,
    shadowOffset: { width: 6, height: 0 },
  },
  countryPillCircleGlowGray: {
    shadowColor: '#5B7DBE', shadowOpacity: 0.7, shadowRadius: 10,
    shadowOffset: { width: -6, height: 0 },
  },
  // Same border color as countryPillCardGlow, minus the shadow — used for every OTHER
  // visited country's pill while the Visited filter is on (the selected country keeps the
  // full glow above instead).
  countryPillCardBorder: { borderWidth: 1.5, borderColor: 'rgba(22,163,74,0.85)' },
  countryPillName: { fontSize: 11, fontWeight: '600', color: '#111827', maxWidth: 90 },



  // Detached state chip ("Return to …")


  // Teardrop spot pin: rounded bubble atop a downward triangle whose tip marks the coordinate.
  spotPinWrap: {
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  spotPinBubble: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'white', borderWidth: 2, borderColor: VISITED_COLOR,
    alignItems: 'center', justifyContent: 'center',
  },
  spotPinBubbleSelected: {
    width: 40, height: 40, borderRadius: 20, borderColor: VISITED_COLOR,
    backgroundColor: VISITED_COLOR,
  },
  // Triangle pointer (via border trick) — sits flush under the bubble, tip pointing down.
  spotPinTip: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: VISITED_COLOR,
  },
  spotPinTipSelected: {
    borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10, borderTopColor: VISITED_COLOR,
  },
  spotPinIcon: { fontSize: 13 },
  spotPinIconSelected: { fontSize: 18 },

// Search bar
  // right:72 (was 60) leaves a bit more breathing room before the layers pill.
  searchWrap: { position: 'absolute', left: 12, right: 72, zIndex: 20 },
  // Row wrapping the search bar itself + the focused-only close button beside it — the bar
  // uses flex:1 so it fills whatever width searchWrap leaves it, shrinking automatically
  // when the close button appears rather than needing separate manual width math.
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: MAP_PILL_BTN, // matches the layers pill's own closed height
    backgroundColor: 'white', borderRadius: MAP_PILL_BTN / 2,
    paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  searchBarFlex: { flex: 1 },
  searchBarFocused: { shadowOpacity: 0.18, shadowRadius: 14 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  searchCloseBtn: {
    width: MAP_PILL_BTN, height: MAP_PILL_BTN, borderRadius: MAP_PILL_BTN / 2,
    backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  // Search results
  searchResultsList: {
    marginTop: 8, backgroundColor: 'white', borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, elevation: 8,
  },
  searchResultsHeader: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  searchResultItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  searchResultLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  searchResultSub:   { fontSize: 12, color: '#6B7280', marginTop: 1 },
  searchResultBadge: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },

  // Breadcrumb pill
  breadcrumbBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 20, alignItems: 'center',
  },
  breadcrumbPillBlack: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111827', borderRadius: 20,
    paddingHorizontal: 16, paddingTop: 9, paddingBottom: 9,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  breadcrumbPillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  breadcrumbDestRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
  },
  breadcrumbPillWhite: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 100,
    paddingHorizontal: 4, paddingVertical: 3,
    height: 40,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  breadcrumbSegmentInactive: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  breadcrumbSegmentActive: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111827', borderRadius: 100,
    paddingHorizontal: 16, alignSelf: 'stretch',
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
  breadcrumbTxtDark: { fontSize: 13, fontWeight: '500', color: '#111827' },
  breadcrumbTxtLight:{ fontSize: 13, fontWeight: '600', color: 'white' },
  breadcrumbSep:     { fontSize: 13, color: '#9CA3AF' },

  // Back pill
  // zIndex must clear the sheets' backdrop/shadow layers (up to 210) or the pill renders
  // dimmed underneath the sheet's drop shadow instead of cleanly above it.
  upPillWrap: { position: 'absolute', left: 12, zIndex: 220, elevation: 220 },
  upPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 22,
    paddingHorizontal: 12, paddingVertical: 9,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  upPillArrow: { fontSize: 13, color: '#374151', fontWeight: '700' },
  upPillTxt:   { fontSize: 13, fontWeight: '600', color: '#111827' },

  // Map type button + dropdown
  mapTypeWrap: { position: 'absolute', right: 12, zIndex: 20, alignItems: 'flex-end' },
  // The single continuous capsule (see mapPillStyle) — fixed width/borderRadius throughout,
  // only its height animates, so it reads as one shape growing, not a button plus a
  // separate box appearing below it.
  mapPill: {
    width: MAP_PILL_BTN,
    borderRadius: MAP_PILL_BTN / 2,
    backgroundColor: 'white',
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  mapPillBtn: {
    width: MAP_PILL_BTN, height: MAP_PILL_BTN,
    alignItems: 'center', justifyContent: 'center',
  },
  // Badge on the closed filter button itself, indicating which filter is active without
  // needing to open the pill. Positioned within the button's own bounds (not overhanging
  // its edge) since the outer mapPill has overflow:hidden for its capsule shape/animation.
  mapPillBtnBadge: {
    // Sits closer to center than the button's own edge, so it overlaps the Filter icon's
    // own top-right corner directly rather than floating near the button's outer bounds.
    position: 'absolute', top: 8, right: 8,
    width: 13, height: 13, borderRadius: 6.5,
    alignItems: 'center', justifyContent: 'center',
  },
  mapPillDivider: { height: MAP_PILL_DIVIDER_H, backgroundColor: '#E5E7EB', marginHorizontal: 8 },
  mapPillOption: {
    width: MAP_PILL_BTN, height: MAP_PILL_OPTION_H,
    alignItems: 'center', justifyContent: 'center',
  },
  mapPillOptionActive: { backgroundColor: '#EEF2FF' },
  mapPillSwatch: {
    width: 26, height: 26, borderRadius: 6, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  mapPillSwatchActive: { borderColor: '#6366F1', borderWidth: 1.5 },
  mapPillOptionDivider: { height: MAP_PILL_DIVIDER_H, backgroundColor: '#E5E7EB', marginHorizontal: 8 },
  mapPillOptionCheck: {
    position: 'absolute', top: 3, right: 3,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'white',
  },
});
