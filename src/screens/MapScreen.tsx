import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable, Text, Dimensions, Animated, Platform, TextInput, Image, Easing as RNEasing, Keyboard, ScrollView } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, runOnJS, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import MapboxGL from '@rnmapbox/maps';

// Public (pk.) token — Mapbox's own public tokens are designed to ship in client bundles
// (scoped/restricted server-side, not secret), so this doesn't need the same handling as the
// sk. download token in app.config.js. Still pulled from the environment rather than hardcoded
// so it's not duplicated across dev/staging/prod and can be rotated in one place. EXPO_PUBLIC_
// vars are inlined into the JS bundle at build time by Expo's own tooling — see .env.example.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
if (!MAPBOX_TOKEN && __DEV__) {
  console.warn('EXPO_PUBLIC_MAPBOX_TOKEN is not set — see .env.example. The map will fail to load tiles.');
}
MapboxGL.setAccessToken(MAPBOX_TOKEN);

// Fetch a Mapbox style and return a customized version:
//  • strip text-label symbol layers
//  • drop the style's own administrative boundary lines (we draw our own border layers as
//    map children so their color/opacity can change with the active map type — standard vs
//    satellite — without ever swapping the MapView's style, which would reload the map and
//    make the MarkerView pins disappear)
//  • fade the road network in only near destination-level zoom
// Rendering projection (mercator vs. globe) is set directly on the MapView's own
// `projection` prop below, not baked into the style JSON here — that way it applies
// uniformly whether or not this customized style has finished loading yet.
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

// Web-Mercator vertical projection, normalized 0 (north pole) .. 1 (south pole). Multiply a
// difference of these by the world size in px (512·2^zoom) to get real screen pixels.
//
// Only sound at DESTINATION zooms. getZoomDelta feeds latDeltaToZoom to give z≈9.5–10.8,
// far past the ~z6 point where Mapbox's globe has finished blending into mercator, so the
// projection really is mercator there and this is exact. It is NOT valid at the country zooms
// (z≈2–5) fitCountryDefaultView deals with — that's the whole reason that function delegates
// its sizing to Mapbox instead of solving in closed form. Don't reuse these there.
const mercY    = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const invMercY = (y: number)   => (Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 4) * 360 / Math.PI;

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
import { Layers, Check, X, Search, CornerUpLeft, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useStore } from '../store';
import type { Destination, CountryCluster } from '../types';
import type GeoJSON from 'geojson';
import { getCountryRegion, getCountryBounds, getCountryCenter, getCountryPopularity } from '../utils/countryBounds';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS, type Spot } from '../data/spots';
import DestinationSheet from '../components/Map/DestinationSheet';
import CircleFlag from '../components/CircleFlag';
import PinPhoto from '../components/Map/PinPhoto';
import { computeSearchResults, SearchResultRows, type SearchResult } from '../components/Map/SearchResults';
import SpotSheet from '../components/Map/SpotSheet';
import CountrySheet from '../components/Map/CountrySheet';
import ExploreSheet from '../components/Map/ExploreSheet';
import { thumbCache, photoCache, fetchWikiThumbnail, prefetchWikiThumbnail } from '../utils/photoCache';

const VISITED_COLOR  = '#10B981';
const EXPLORE_COLOR  = '#6366F1';

const PIN_SIZE        = 41;  // 10% larger than 37 (which was 20% smaller than the original 46)
const PIN_BORDER      = 2;
const BADGE_SIZE      = 16;  // 20% smaller than the original 20
const STAMP_SIZE = 7;        // 20% smaller than the original 9

function DestPin({ dest, spotCount, isVisited, isSelected, pinState }: {
  dest: Destination;
  spotCount: number;
  isVisited: boolean;
  isSelected: boolean;
  pinState: 'photo' | 'stamp';
}) {
  // Small pin (46px) — request a small thumbnail rather than the full-res header image,
  // so map pins load and decode quickly during pan/zoom.
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(dest.id) ?? null);
  // True when the photo was already cached before this pin showed: it appears at once instead of
  // fading in. Otherwise the disc sits as a plain dark placeholder (no emoji — a flash of the
  // category icon before every photo looked like flicker) until the photo fades in over it.
  const photoWasCachedRef = useRef(thumbCache.has(dest.id));
  useEffect(() => {
    if (thumbCache.has(dest.id)) { photoWasCachedRef.current = true; setPhotoUrl(thumbCache.get(dest.id)!); return; }
    photoWasCachedRef.current = false;
    setPhotoUrl(null);
    fetchWikiThumbnail(dest.name, 120).then(url => {
      if (url) { thumbCache.set(dest.id, url); setPhotoUrl(url); }
    });
  }, [dest.id]);

  const ringColor = isVisited ? VISITED_COLOR : 'white';

  // Stamp state — tiny dot. Selection only thickens the border (a size cue); the COLOR is
  // ringColor either way, since visited-status — not selection — is what green means here.
  // A stamp forced to green on tap for an unvisited destination previously read as "you've
  // been here" for a place you hadn't.
  if (pinState === 'stamp') {
    return (
      <View style={pinSt.stampWrap}>
        <View style={[pinSt.stamp, { borderColor: ringColor }, isSelected && { borderWidth: 2 }]} />
      </View>
    );
  }

  // Photo state — full circle with photo + label
  return (
    <View style={pinSt.wrap}>
      <View style={{ width: PIN_SIZE, height: PIN_SIZE }}>
        {/* Shadow on outer ring; overflow:hidden kept on inner clip so shadow isn't clipped on iOS.
            Ring color is ALWAYS ringColor (visited-derived) — selection must not tint an
            unvisited pin green, same reasoning as the stamp case above. */}
        <View style={[pinSt.circleShadow, { borderColor: ringColor }, isSelected && pinSt.circleSelectedGlow, isSelected && isVisited && { shadowColor: VISITED_COLOR }]}>
          <View style={pinSt.circleClip}>
            {photoUrl && (
              <PinPhoto
                instant={photoWasCachedRef.current}
                source={{ uri: photoUrl }}
                style={StyleSheet.absoluteFill as any}
                resizeMode="cover"
              />
            )}
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

const SPOT_PIN_SIZE = 28;
const SPOT_PIN_SIZE_SELECTED = 40;

const SPOT_LABEL_GAP = 6;
// Position of each spot in the spots data — the popularity proxy used to decide whose name wins a crowded spot.
const SPOT_ORDER = new Map(SPOTS.map((sp, i) => [sp.id, i]));

// Spot marker — the ENTIRE thing (name label + teardrop pin) rendered inside ONE MarkerView,
// as a horizontal row. Two earlier attempts at the label failed:
//  1. Nesting it as an absolutely positioned child (`right: '100%'`) of the pin's own marker
//     fought Yoga's auto-sizing for an absolute box with no paired `left`/`width`, collapsing
//     to near-zero width and wrapping the name into a vertical stack of single words.
//  2. A SEPARATE MarkerView at the same coordinate, sized purely by its own text content —
//     this never rendered at all. (Most likely cause: unlike DestPin's own label, which sits
//     below an already-sized photo circle, this marker had nothing else establishing a
//     non-zero bounding box for the very first native measurement pass — but the true cause
//     was never conclusively isolated, since @rnmapbox/maps' MarkerView measurement isn't
//     inspectable from here.)
// This third approach avoids both failure modes: normal (non-absolute) flex-row layout, in
// the SAME marker as the pin (nesting content in one marker is the one thing already proven
// to work, for the pin itself and for DestPin). The only wrinkle is that the pin's own tip —
// not the label — must land on the true coordinate regardless of how wide the (unbounded,
// un-truncated) label renders, which requires knowing that width; onLayout measures it after
// the first frame and anchorX corrects itself from a pin-only fallback. That one-frame
// correction lands inside the existing FadePin fade-in, so it isn't visible in practice.
function SpotMarker({ spot, isVisited, isSelected, exiting, isSatellite, labelSide, instant, onPress }: {
  spot: Spot; isVisited: boolean; isSelected: boolean; exiting: boolean; isSatellite: boolean;
  // Which side of the pin the name sits on, or 'none' to leave it off (see spotLabelPlan).
  labelSide: 'left' | 'right' | 'none';
  instant?: boolean;
  onPress: () => void;
}) {
  const cacheKey = `spotpin_${spot.id}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  const photoWasCachedRef = useRef(thumbCache.has(cacheKey));   // see DestPin
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { photoWasCachedRef.current = true; setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    photoWasCachedRef.current = false;
    setPhotoUrl(null);
    fetchWikiThumbnail(spot.name, 120).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [spot.id]);

  const [labelW, setLabelW] = useState(0);

  // Teardrop geometry: the tail's two edges are the straight TANGENT lines from the tip to the
  // bubble's circle, so each edge meets the circle smoothly instead of kinking where a small
  // triangle used to butt against it. For a circle of radius R and a tip a distance d below
  // its centre, the tangent points sit at y = R²/d and x = ±R·√(1 − R²/d²).
  const pinR = (isSelected ? SPOT_PIN_SIZE_SELECTED : SPOT_PIN_SIZE) / 2;
  const tailL = isSelected ? 14 : 10;              // how far the tip hangs below the circle
  const tipD = pinR + tailL;
  const tanY = (pinR * pinR) / tipD;
  const tanX = pinR * Math.sqrt(1 - (pinR * pinR) / (tipD * tipD));

  // Visited spots keep the green ring; unvisited ones are white — same visited-derived color
  // rule DestPin uses, just white instead of gray as the "nothing to report yet" default so
  // the pin still reads clearly against the map rather than blending into it.
  const ringColor = isVisited ? VISITED_COLOR : 'white';
  const bubbleSize = isSelected ? SPOT_PIN_SIZE_SELECTED : SPOT_PIN_SIZE;
  // The pin's tip must land on the coordinate whichever side the label is on, so the anchor is the
  // pin's centre measured from the marker's left edge: past the label when it's on the left, at the
  // start when it's on the right, and dead centre when there's no label (or it isn't measured yet).
  const labelShown = labelSide !== 'none' && labelW > 0;
  const totalW = labelShown ? labelW + SPOT_LABEL_GAP + bubbleSize : bubbleSize;
  const anchorX = !labelShown ? 0.5
    : labelSide === 'left' ? (labelW + SPOT_LABEL_GAP + bubbleSize / 2) / totalW
    : (bubbleSize / 2) / totalW;
  // Satellite imagery is a busy, mid-tone photo — the standard basemap's dark-text/white-halo
  // label reads poorly on it, so this flips to white text with a black halo instead. Same
  // reasoning as the destination pill/border colors elsewhere in this file also branching on
  // mapType === 'satellite'.
  const labelColor = isSatellite ? 'white' : '#111827';
  const labelHaloColor = isSatellite ? 'black' : 'white';
  const labelEl = labelSide === 'none' ? null : (
    <View
      style={styles.spotPinLabelWrap}
      onLayout={e => setLabelW(e.nativeEvent.layout.width)}
      pointerEvents="none"
    >
      <Text style={[styles.spotPinLabel, styles.spotPinLabelOutline, { color: labelHaloColor, transform: [{ translateX: -0.75 }, { translateY: -0.75 }] }]}>{spot.name}</Text>
      <Text style={[styles.spotPinLabel, styles.spotPinLabelOutline, { color: labelHaloColor, transform: [{ translateX: 0.75 }, { translateY: -0.75 }] }]}>{spot.name}</Text>
      <Text style={[styles.spotPinLabel, styles.spotPinLabelOutline, { color: labelHaloColor, transform: [{ translateX: -0.75 }, { translateY: 0.75 }] }]}>{spot.name}</Text>
      <Text style={[styles.spotPinLabel, styles.spotPinLabelOutline, { color: labelHaloColor, transform: [{ translateX: 0.75 }, { translateY: 0.75 }] }]}>{spot.name}</Text>
      <Text style={[styles.spotPinLabel, { color: labelColor }]}>{spot.name}</Text>
    </View>
  );

  return (
    <MapboxGL.MarkerView
      coordinate={[spot.coordinates.longitude, spot.coordinates.latitude]}
      anchor={{ x: anchorX, y: 1 }}
      // MarkerView defaults to allowOverlap={false}: Mapbox then HIDES any marker that collides
      // with another one on screen. Zooming out brings pills/photos/other spots onto the selected
      // spot, and it was being dropped by that collision pass — the "sometimes disappears while
      // zooming out" bug. Spot pins are placed deliberately, so they never take part in it.
      allowOverlap
    >
      <FadePin exiting={exiting} instant={instant}>
        <Pressable disabled={exiting} onPress={onPress} hitSlop={6}>
          <View style={styles.spotMarkerRow}>
            {labelSide === 'left' && labelEl}
            <View style={styles.spotPinWrap}>
              <Svg
                width={pinR * 2} height={pinR * 2 + tailL}
                style={{ position: 'absolute', top: 0, left: 0 }}
              >
                <Path
                  d={`M ${pinR} ${pinR} L ${pinR - tanX} ${pinR + tanY} L ${pinR} ${pinR + tipD} L ${pinR + tanX} ${pinR + tanY} Z`}
                  fill={ringColor}
                />
              </Svg>
              <View style={[styles.spotPinBubble, { width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2, borderColor: ringColor }]}>
                <View style={[styles.spotPinImgClip, { width: bubbleSize - 4, height: bubbleSize - 4, borderRadius: (bubbleSize - 4) / 2 }]}>
                  {photoUrl && (
                    <PinPhoto
                      instant={photoWasCachedRef.current}
                      source={{ uri: photoUrl }}
                      style={StyleSheet.absoluteFill as any}
                      resizeMode="cover"
                    />
                  )}
                </View>
              </View>
              <View style={{ height: tailL }} />
            </View>
            {labelSide === 'right' && labelEl}
          </View>
        </Pressable>
      </FadePin>
    </MapboxGL.MarkerView>
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
  // Selected: a white halo (green for a visited destination, set inline) in place of the dark drop shadow.
  circleSelectedGlow: {
    shadowColor: '#FFFFFF', shadowOpacity: 0.95, shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  // Inner circle: clips photo/emoji to round shape.
  circleClip: {
    width: PIN_SIZE - PIN_BORDER * 2,
    height: PIN_SIZE - PIN_BORDER * 2,
    borderRadius: (PIN_SIZE - PIN_BORDER * 2) / 2,
    overflow: 'hidden',
    backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
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

// ─── Pin fade in/out infrastructure ───────────────────────────────────────────
// Pins never pop in or out. Every MarkerView-based pin (country pills, destination photo
// pins) renders inside a FadePin, and additions/removals to a pin plan flow through
// useExitingItems: newly planned pins mount at opacity 0 and fade in; pins dropped from the
// plan stay mounted for PIN_EXIT_MS fading to 0, then unmount. This is what turns the
// stamp↔photo promotions and pill collision wins/losses from sudden appearance changes into
// gradual cross-fades, matching how Apple/Google Maps POI labels resolve density changes.
const PIN_FADE_IN_MS = 240;
const PIN_EXIT_MS    = 200;

function FadePin({ exiting, instant, children }: { exiting: boolean; instant?: boolean; children: React.ReactNode }) {
  // `instant`: mounts fully opaque (no fade-in) — for a duplicate that sits exactly over an
  // identical, already-visible pin, where fading in would just dim the overlap.
  const opacity = useRef(new Animated.Value(instant ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: exiting ? 0 : 1,
      duration: exiting ? PIN_EXIT_MS : PIN_FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  }, [exiting, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

// Tracks a keyed item list across renders, holding removed items in an "exiting" state for
// PIN_EXIT_MS (so FadePin can animate them out) before pruning. Re-added keys cancel their
// pending removal and simply fade back in.
function useExitingItems<T>(items: T[], keyOf: (t: T) => string): { item: T; key: string; exiting: boolean }[] {
  const [rendered, setRendered] = useState<{ item: T; key: string; exiting: boolean }[]>(
    () => items.map(item => ({ item, key: keyOf(item), exiting: false })),
  );
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    setRendered(prev => {
      const liveKeys = new Set(items.map(keyOf));
      const next: { item: T; key: string; exiting: boolean }[] = [];
      for (const item of items) {
        const key = keyOf(item);
        const t = timersRef.current.get(key);
        if (t) { clearTimeout(t); timersRef.current.delete(key); }
        next.push({ item, key, exiting: false });
      }
      for (const r of prev) {
        if (liveKeys.has(r.key)) continue;
        next.push({ ...r, exiting: true });
        if (!timersRef.current.has(r.key)) {
          timersRef.current.set(r.key, setTimeout(() => {
            timersRef.current.delete(r.key);
            setRendered(cur => cur.filter(c => c.key !== r.key));
          }, PIN_EXIT_MS + 40));
        }
      }
      return next;
    });
  }, [items]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const t of timersRef.current.values()) clearTimeout(t); }, []);
  return rendered;
}

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


// Spot counts per destination (static — SPOTS never changes at runtime)
const SPOT_COUNT_BY_DEST: Record<string, number> = {};
for (const s of SPOTS) SPOT_COUNT_BY_DEST[s.destinationId] = (SPOT_COUNT_BY_DEST[s.destinationId] ?? 0) + 1;

// Radius (in latitude-equivalent degrees) of each destination's own spot spread — how far
// its farthest spot sits from the destination coordinate, padded. Used to decide when the
// camera is "inside" a destination at spot zoom: within this radius, the destination's own
// marker disappears entirely (photo AND dot) and its spot pins alone represent it — the
// bottom level of the country-pill → destination-photo → spot-pin handoff hierarchy.
// Destinations with no spots get no entry and never hide (nothing to hand off to).
const DEST_SPOT_RADIUS: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const s of SPOTS) {
    const d = DESTINATIONS.find(dd => dd.id === s.destinationId);
    if (!d) continue;
    const dLat = s.coordinates.latitude - d.coordinates.latitude;
    const dLng = (s.coordinates.longitude - d.coordinates.longitude)
      * Math.cos((d.coordinates.latitude * Math.PI) / 180);
    const r = Math.hypot(dLat, dLng);
    if (!(s.destinationId in out) || r > out[s.destinationId]) out[s.destinationId] = r;
  }
  // Pad the spread and enforce a floor (~6km) so tight clusters still get a usable radius.
  for (const id of Object.keys(out)) out[id] = Math.max(0.055, out[id] * 1.3);
  return out;
})();

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
// App.tsx's bottom Tab.Navigator reserves this much layout space below the map (no
// `position: absolute` on the tab bar) — matches the identical constant already duplicated
// across CountrySheet/DestinationSheet/SpotSheet/ExploreSheet for their own pillOffsetSV math.
const BOTTOM_TAB_H = Platform.OS === 'ios' ? 88 : 64;
// Mirrors the sheets' own PEEK_STRIP_H — the height of the thin bottom-screen sliver they
// leave above the tab bar. Used to work out how much map is actually visible while a sheet is
// peeking, for fitCountryDefaultView's 'full' framing.
const PEEK_STRIP_H = 90;
// Mirrors the sheets' own SNAP_CONFIG duration. When a sheet's snap re-frames the map (see
// handleSheetSnapStateChange), the camera runs for exactly this long so the two land together
// — the sheet reports its new snap on the same tick it starts its own timing, so matching the
// duration is what makes the map track the sheet rather than trail it.
const SHEET_SNAP_MS = 280;

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
// The world-view zoom every "back out to the world" animation targets. latDeltaToZoom(90)
// === zoomLevel 1 — exactly the initial camera's zoom (see the Camera defaultSettings),
// where the globe's edges nearly touch the screen sides. Previously these animations used
// 120+, over-zooming out well past the app's own opening view.
const WORLD_HOME_LATDELTA = 90;
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
// A country's pill disappears once the camera is zoomed in to (or past) that country's own
// default view — at that point the user is "inside" the country and its destination pins
// are the relevant context; the pill would only duplicate what the map already shows. And
// at any wider zoom the pill always appears (unless the country is selected, or it loses a
// collision), making pill visibility a simple, predictable function of zoom per country.
// 1.35 mirrors fitCoords' screen-edge padding (raw lng span → the default view's camera
// longitudeDelta); the extra 1.1 is a small buffer so the pill doesn't flap when the camera
// rests exactly at the default view (e.g. right after deselecting the country there).
function getCountryPillCutoffLngDelta(countryCode: string): number {
  const bounds = getCountryBounds(countryCode);
  if (!bounds) return 0; // unknown bounds → never cut off
  return (bounds.ne.longitude - bounds.sw.longitude) * 1.35 * 1.1;
}

type DestItem = { type: 'pin'; dest: Destination };

type MapStyleKey = 'standard' | 'satellite';
export type MapState = 'world' | 'context' | 'sheet';

const MAP_TYPES: { key: MapStyleKey; label: string }[] = [
  { key: 'standard',  label: 'Standard'  },
  { key: 'satellite', label: 'Satellite' },
];

// Module-level (not inline in JSX) so this is the SAME object reference across every
// render. Camera's `defaultSettings` was previously a fresh object literal each render —
// @rnmapbox/maps re-applies it (resetting the camera to [10,20]/zoomLevel 1) whenever the
// reference changes, which fires onCameraChanged → setRegion → re-render → a new literal →
// reset again, an infinite "Maximum update depth exceeded" loop under any state change that
// re-renders MapScreen while the camera is live (e.g. panning/zooming).
const CAMERA_DEFAULT_SETTINGS = { centerCoordinate: [10, 20] as [number, number], zoomLevel: 1 };

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


// Returns the SAME Set/array instance as last time whenever its contents haven't changed. The
// camera reports a new zoom/position every few ms while pinching, and memos that rebuild a
// collection from it would otherwise hand every downstream memo (stamp GeoJSON, pin lists, marker
// elements) a brand-new identity each frame even when nothing actually changed — real work on the
// JS thread that showed up as pins only being reassessed once the gesture had ended.
function useStableSet(next: Set<string>): Set<string> {
  const ref = useRef(next);
  const prev = ref.current;
  if (prev !== next) {
    let same = prev.size === next.size;
    if (same) next.forEach(v => { if (!prev.has(v)) same = false; });
    if (!same) ref.current = next;
  }
  return ref.current;
}
function useStableList<T>(next: T[], key: (t: T) => string): T[] {
  const ref = useRef<{ k: string; list: T[] }>({ k: next.map(key).join('|'), list: next });
  const k = next.map(key).join('|');
  if (k !== ref.current.k) ref.current = { k, list: next };
  return ref.current.list;
}

export default function MapScreen({ onMapReady }: { onMapReady?: () => void } = {}) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  // The MapView's real rendered height (shorter than the device height — App.tsx's bottom tab
  // bar reserves its own layout space below it). Measured rather than assumed so
  // fitCountryDefaultView's bottom padding is exact on every device; see its own comment.
  const mapViewHRef = useRef(0);
  // Country framing, once resolved, is reusable: the camera the window fit lands on is a plain centre+zoom,
  // so every later visit to that country can go straight there without recomputing (and the country close
  // reads its zoom for its half-zoom step-back). Keyed by country code and stamped with the geometry it was
  // derived under, so a rotation or safe-area change invalidates it rather than replaying a stale frame.
  const countryCamCacheRef = useRef<Record<string, {
    lng: number; lat: number; zoom: number; mapH: number;
  }>>({});
  // Set while a country fit is in flight, telling handleMapIdle to capture the result.
  const countryCacheArmRef = useRef<{ code: string; key: string; at: number } | null>(null);

  const savedDestinations = useStore(s => s.savedDestinations);
  const savedSpots        = useStore(s => s.savedSpots);

  // Per-destination count of individually-visited spots (presence in savedSpots, not the
  // destination's own visited flag — see saveSpotVisited: marking a spot visited also marks
  // its parent destination visited, but not every visited destination has any spots
  // individually checked off, so this can legitimately be 0 even while isVisited is true).
  const visitedSpotCountByDest = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ss of Object.values(savedSpots)) {
      counts[ss.destinationId] = (counts[ss.destinationId] ?? 0) + 1;
    }
    return counts;
  }, [savedSpots]);

  const [mapType,        setMapType       ] = useState<MapStyleKey>('standard');
  // A single stable base style. Satellite is layered on top as a toggleable raster (see
  // render) rather than swapping this — swapping the MapView style reloads the native map
  // and drops all MarkerView pins, which is exactly what we must avoid.
  const [baseStyle, setBaseStyle] = useState<string | null>(null);
  // The map isn't mounted until the style fetch above has settled (success or failure). It used to
  // mount on the default Light style and then swap to the fetched one; every layer's props were
  // updated during that swap, before the new style had them — "updateLayer CircleLayer.
  // destStampCircles Layer destStampCircles is not in style". The loading screen covers the wait.
  const [styleResolved, setStyleResolved] = useState(false);
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
  // Exact distance from the screen bottom to the top of the destination compact card,
  // reported live by DestinationSheet once it measures itself — lets the back-nav pill
  // reproduce the same real gap above it, rather than guessing a fixed offset that drifts
  // from whatever that card actually renders at.
  const [destCardTop,     setDestCardTop    ] = useState(164 + (Platform.OS === 'ios' ? 88 : 64));
  // A Reanimated shared value (not core Animated) — both DestinationSheet and SpotSheet
  // write to it directly and continuously (DestinationSheet from its own UI-thread reaction,
  // SpotSheet from a core-Animated listener since its slideAnim isn't a Reanimated value)
  // while open, so the pill glides in lockstep with whichever sheet is currently driving it.
  const upPillBottomSV = useSharedValue(insets.bottom + 90);
  // Guards against DestinationSheet's continuous writes fighting the spot-carousel effect's
  // own target while a spot is selected on top of an still-mounted destination sheet.
  const spotOwnsPillSV = useSharedValue(false);
  // The back/close pill is shown ONLY while the open sheet is in its bottom-screen (peek)
  // state — at half/full screen the sheet itself names what's selected, so the pill is
  // redundant there. Declared here rather than next to setSheetSnapState (which writes it)
  // because upPillWrapStyle just below captures it: a `const` declared further down is still
  // in its temporal dead zone when the worklet closes over it, which surfaced as
  // "Cannot read property 'value' of undefined".
  const pillPeekSV = useSharedValue(0);
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
  // straight to full-screen ('full'), instead of the usual collapsed default.
  const [countryInitialSnap, setCountryInitialSnap] = useState<'peek' | 'collapsed' | 'full' | undefined>(undefined);
  // ── Back-navigation provenance ─────────────────────────────────────────────
  // Records HOW the current destination/spot was entered, so the back pill can return the
  // user to whatever context actually opened it instead of always climbing the hierarchy:
  //  · 'country'/'destination' — normal drill-down; back goes up one level (classic).
  //  · 'map'    — tapped a pin with no parent selected (free-zoomed); back just deselects
  //               and restores the pre-tap camera. No fabricated intermediate levels.
  //  · 'search' — jumped via search; back restores the pre-jump camera and view.
  // Lateral moves (carousel swipes) deliberately never touch these — browsing within a
  // level accumulates no "back debt."
  const [destOrigin, setDestOrigin] = useState<'country' | 'map' | 'search'>('country');
  const [spotOrigin, setSpotOrigin] = useState<'destination' | 'map' | 'search'>('destination');

  const [region,       setRegion      ] = useState<Region>({
    latitude: 20, longitude: 10, latitudeDelta: 180, longitudeDelta: 360,
  });
  // The camera's TRUE zoom level (from onCameraChanged/onMapIdle), updated on the same
  // throttle as `region`. Needed because `region`'s deltas are bounds-derived, and on the
  // 3D globe at wide zooms the reported bounds span most of the visible HEMISPHERE (~180°
  // of longitude), not the ~50–60° actually filling the screen — so every plan computation
  // keyed off region.longitudeDelta thought the camera was ~3× wider than what the user
  // sees, collapsing the planning px/deg scale and culling nearly every country pill as a
  // "collision" (the only-France-over-all-of-Europe bug). The camera zoom doesn't lie.
  const [camZoom, setCamZoom] = useState(0);
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
  // site — there are several: the button itself, the backdrop, search focus) so every path
  // that opens/closes the menu animates consistently.
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

  // ── Zoom / exit timers ───────────────────────────────────────────────────
  const [zoomedIntoDestination, setZoomedIntoDestination] = useState(false);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Search bar's right inset: clears the layers pill (the only pill remaining in this
  // corner now that the visited/wishlist filter pill is gone), same at every selection state.
  const searchWrapRight = 72;
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
  const searchFromSheetRef = useRef(false);
  // Where the Explore sheet was (shared snap vocabulary, plus its feed's scroll offset) — recorded from its own reports, and
  // captured into exploreRestore when search opens (the sheet unmounts while searching), so
  // closing search remounts it right where it was rather than at the bottom strip. Cleared once
  // search closes, and on picking a result (that leaves the sheet behind for a
  // country/destination/spot, after which the normal bottom-strip entrance applies).
  const exploreSnapRef = useRef<'peek' | 'collapsed' | 'full'>('peek');
  const exploreScrollYRef = useRef(0);
  const [exploreRestore, setExploreRestore] =
    useState<{ snap: 'peek' | 'collapsed' | 'full'; scrollY: number } | undefined>(undefined);
  useEffect(() => {
    if (searchFocused) setExploreRestore({ snap: exploreSnapRef.current, scrollY: exploreScrollYRef.current });
    else if (exploreRestore) setExploreRestore(undefined);
  }, [searchFocused]);
  // The bar's width and the layers pill swap instantly — no animation. Animating them (the bar
  // widening while the pill faded out) read as the two shapes merging into each other.
  useEffect(() => {
    searchWidthAnim.setValue(searchFocused ? searchExpandedWidth : searchCollapsedWidth);
  }, [searchFocused, searchCollapsedWidth, searchExpandedWidth]);

  // Hides the layers pill while the search bar is focused, since the expanded search bar (see
  // its own right-inset override) occupies the same top-right corner it normally does.
  // pointerEvents is toggled directly off searchFocused as well.
  const layersPillFadeStyle = useAnimatedStyle(() => ({
    opacity: searchFocused ? 0 : 1,
  }), [searchFocused]);

  // Solid white behind the focused search interface, hiding the map. This alone still fades
  // (map ↔ white) — it doesn't touch the bar or pill — except when opened from the Explore
  // sheet, whose own white/gray surface is already up: there it's instant to avoid a flash of map.
  const searchFocusProgress = useSharedValue(0);
  useEffect(() => {
    if (searchFocused && searchFromSheetRef.current) {
      searchFocusProgress.value = 1;
      return;
    }
    if (!searchFocused) searchFromSheetRef.current = false;
    searchFocusProgress.value = withTiming(searchFocused ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [searchFocused]);
  const searchBackdropStyle = useAnimatedStyle(() => ({
    opacity: searchFocusProgress.value,
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
  // Suppresses the "return to destination" arrow for the duration of the initial fly-to a
  // freshly-selected destination, and gates when destHomeRegion is allowed to be captured —
  // see the set-site comment in handleMarkerPress for the full reasoning.
  const suppressDestReturnPromptRef = useRef(false);
  const suppressDestReturnPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once the user has started a gesture (pan/pinch) WHILE the initial fly-to a
  // freshly-selected destination was still in flight — i.e. they interrupted it. The next
  // onMapIdle after that reflects wherever THEIR gesture ended, not the destination's real
  // home, so it must not be captured as destHomeRegion.
  const destFlightInterruptedRef = useRef(false);
  // Suppresses handleCameraChanged's gesture-derived side effects (specifically the
  // peek-on-pan push below) for the duration of a programmatic re-center that ISN'T tied to
  // a fresh selection — e.g. tapping the breadcrumb's "return to destination" arrow while
  // the sheet is already peeking. Mirrors the same suppression pattern already used for
  // other programmatic camera moves in this file (suppressDestReturnPromptRef,
  // suppressSouthLimitRef) — native camera-changed events fire throughout ANY animated
  // setCamera call, programmatic or not, and without this guard they can race ahead of/
  // interfere with gesture-state bookkeeping that assumes only real user gestures move the
  // camera, an interference already documented as a known risk elsewhere in this file.
  const suppressPeekPushRef = useRef(false);
  const suppressPeekPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while a snap change is a CONSEQUENCE of a map gesture rather than the user dragging
  // the sheet — see handleSheetSnapStateChange, which re-frames the country to match the new
  // snap and must not do so when the user is the one moving the map.
  const suppressFrameSyncRef = useRef(false);
  const suppressFrameSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCountryPressRef  = useRef(0);
  const lastMenuOpenRef      = useRef(0);
  // Bumped to imperatively collapse whichever sheet (country/destination) is currently
  // full-screen — driven by the back pill's down-arrow, which replaces the usual "back a
  // level" arrow while a sheet is full-screen.
  // Date.now() of the latest camera event of a live map gesture — handed to every sheet so a finger
  // resting on a sheet's strip during a map pinch can't be read as a swipe of the sheet.
  const mapGestureAtSV = useSharedValue(0);
  const mapGestureStampRef = useRef(0);
  const [collapseSheetSignal, setCollapseSheetSignal] = useState(0);
  // Mirrors whichever of DestinationSheet/SpotSheet is currently open, via their shared
  // onSnapStateChange prop — read inside handleCameraChanged (a gesture callback) to decide
  // whether a map pan/zoom should auto-peek the sheet, without needing that callback to
  // depend on (and re-create itself around) React state.
  const sheetSnapStateRef = useRef<'peek' | 'collapsed' | 'full'>('collapsed');
  // Every write to sheetSnapStateRef goes through this so pillPeekSV — one of the inputs to
  // the breadcrumb's visibility gate (see crumbGateStyle) — can never desync from the sheet.
  // The ref is set both reactively (onSnapStateChange) and synchronously at each site that
  // mounts/resets a sheet, and missing any one of those would strand the breadcrumb.
  const setSheetSnapState = useCallback((state: 'peek' | 'collapsed' | 'full') => {
    sheetSnapStateRef.current = state;
    const peeking = state === 'peek';
    pillPeekSV.value = withTiming(peeking ? 1 : 0, {
      duration: peeking ? 220 : 160,
      easing: Easing.out(Easing.quad),
    });
  }, []);
  // Bumped to imperatively drop whichever sheet is open down to its "peek" state — driven by
  // handleCameraChanged below, the moment the user starts panning/zooming the map.
  const [peekSheetSignal, setPeekSheetSignal] = useState(0);
  const wasMapGestureActiveRef = useRef(false);

  // ── Is the map being interacted with? ─────────────────────────────────────────────────────────────────
  // Timer-free and deterministic: true while at least one finger is down AND the map has actually moved since that
  // touch began, or while the map itself reports a gesture (which also covers momentum). The map's own flag alone
  // isn't enough — it flickers false between the steps of a slow pinch, so a selection landing in one of those gaps
  // looked like "no gesture" and pulled the sheet up while the user's fingers were still on the map.
  const fingersDownRef = useRef(0);
  const maxFingersRef = useRef(0);          // most fingers down at once in the current touch sequence
  const mapMovedThisTouchRef = useRef(false);
  const handleRootTouchStart = useCallback((e: { nativeEvent: { touches: unknown[] } }) => {
    const n = e.nativeEvent.touches.length;
    if (n <= 1) { maxFingersRef.current = 1; mapMovedThisTouchRef.current = false; }   // a new touch sequence begins
    else maxFingersRef.current = Math.max(maxFingersRef.current, n);
    fingersDownRef.current = n;
  }, []);
  const handleRootTouchEnd = useCallback((e: { nativeEvent: { touches: unknown[] } }) => {
    fingersDownRef.current = e.nativeEvent.touches.length;
  }, []);
  const isMapInteracting = useCallback(
    () => wasMapGestureActiveRef.current || (fingersDownRef.current > 0 && mapMovedThisTouchRef.current),
    [],
  );
  // A press on a pin, pill, spot or the back pill that is really part of a pinch — a finger of the pinch lifting over
  // it, which iOS delivers as a tap — is not a selection. A pinch by definition has a second finger, and a real tap
  // only ever has one, so that is all this checks. It must NOT also look at whether the map is "interacting": the
  // map's gesture flag stays true after the last camera event until the map goes idle, so a genuine tap made right
  // after a zoom was swallowed and the user had to tap twice (seen on device: pressBlocked=true with
  // mapMovedThisTouch=false, isMapInteracting=true, then the second tap 0.7s later went through).
  const pressBlocked = useCallback(() => maxFingersRef.current >= 2, []);
  const showMapMenuRef       = useRef(false);
  // Keep ref in sync so MapView's native onPress/onCameraChanged can read current menu
  // state synchronously without needing it in those callbacks' own dependency arrays.
  showMapMenuRef.current    = showMapMenu;

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

  // Gate for the TOP breadcrumb ("Australia | Sydney"): visible only once the user has panned
  // or zoomed away from the selected country/destination, OR the sheet has dropped to its
  // bottom-screen state. Otherwise the sheet's own header already names what's selected, so
  // the breadcrumb is redundant there. Every input is ALREADY an animated 0..1 value — the
  // two return-prompt progress values and the peek value — so taking their max inherits those
  // existing eases and needs no timing of its own. Declared here, below all three, since a
  // worklet capturing a `const` declared further down hits its temporal dead zone.
  const crumbGateStyle = useAnimatedStyle(() => ({
    opacity: Math.max(
      returnPromptProgress.value,
      destReturnPromptProgress.value,
      pillPeekSV.value,
    ),
  }));
  // Keeps touch handling in lockstep with that opacity, whichever path drove it — the
  // destination prompt is written from BOTH a memo and handleCameraChanged's raw camera
  // events, so watching the rendered value is the only way to catch every case. Without this
  // an invisible breadcrumb keeps swallowing taps at the top of the map.
  const [crumbInteractive, setCrumbInteractive] = useState(false);
  useAnimatedReaction(
    () => Math.max(returnPromptProgress.value, destReturnPromptProgress.value, pillPeekSV.value) > 0.05,
    (visible, prev) => { if (visible !== prev) runOnJS(setCrumbInteractive)(visible); },
  );

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
    if (!selectedDest || !destHomeRegion || suppressDestReturnPromptRef.current) return false;
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
  // The longitude-span actually visible across the screen at its centre — the zoom measure
  // ALL pin planning keys off. Derived from the camera's true zoom (world width = 512·2^z
  // pt, so visible span = W·360/(512·2^z)) rather than the bounds-derived
  // region.longitudeDelta, which the 3D globe inflates to most of the hemisphere at wide
  // zooms (see camZoom's comment). min() keeps the two in agreement at flat/deep zooms
  // (where bounds are accurate) and guards the zoom=0 initial state.
  const planLngDelta = useMemo(() => Math.min(
    region.longitudeDelta,
    SCREEN_W_GLOBAL * 360 / (512 * Math.pow(2, camZoom)),
  ), [region.longitudeDelta, camZoom]);

  // The TRUE visible span (256-convention zoom mapping, which matches what's actually on
  // screen) — used ONLY for the country-pill default-view cutoff, where "has the user
  // zoomed in past this country's default view?" must be answered against reality. The
  // destination dot/photo logic deliberately stays on planLngDelta's scale: its thresholds
  // were tuned against that scale and read well in practice (recalibrating them made dots
  // appear far too late — e.g. none at France's default view).
  const pillVisibleLngDelta = useMemo(() => Math.min(
    region.longitudeDelta,
    SCREEN_W_GLOBAL * 360 / (256 * Math.pow(2, camZoom)),
  ), [region.longitudeDelta, camZoom]);

  // Pan-invariant: derived from longitudeDelta (see panInvariantLatDelta) so panning north/
  // south never flips the rank tier — which would otherwise reshuffle eligibleDests and the
  // photo-promotion plan mid-pan and glitch the pins.
  const visibleRank = useMemo(() => getVisibleRank(panInvariantLatDelta(planLngDelta)), [planLngDelta]);

  // ── Planning set (pan-invariant) ────────────────────────────────────────────
  // Every destination ELIGIBLE to be shown at the current zoom — rank tier + selection
  // rules — but WITHOUT any viewport-bounds culling. This deliberately does not depend on
  // the camera centre, only on `visibleRank` (a zoom step-function), so it stays a stable
  // reference while panning. The photo-promotion plan is computed over THIS set, so the
  // greedy collision resolution sees the same destinations every frame during a pan and can
  // never flip a visible pin's state just because an off-screen neighbour scrolled in or out
  // of a viewport-culled candidate list (the root cause of the pan glitching).
  const eligibleDests = useMemo(() => {
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
      results.push(d);
      added.add(d.id);
    }
    return results;
  }, [visibleRank, savedDestinations, selectedCountry, selectedDest]);

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
  // Four rules govern which pins actually get shown:
  //  1. The selected country's (or selected destination's country's) own pin never shows —
  //     the breadcrumb pill at the top of the screen already names it.
  //  2. A country's pin only shows while zoomed OUT wider than that country's own default
  //     view (getCountryPillCutoffLngDelta) — zoomed in past it, the user is "inside" the
  //     country and its destination pins are the relevant context instead.
  //  3. Remaining countries are prioritized by real-world tourism prominence
  //     (getCountryPopularity) — more famous countries keep their pin over less famous ones.
  //  4. As many pins as possible are shown at once: a greedy placement (same pan-invariant
  //     mercatorPx projection destPinPlan uses, so this is stable while panning) walks the
  //     priority order and only rejects a candidate if it would genuinely overlap an
  //     already-placed, higher-priority pin (rectangular pill-footprint test).
  const countryPills = useMemo(() => {
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

    // Rule 1: the selected country's pill persists while zoomed OUT (it doesn't need the
    // breadcrumb's duplicate role there: the pill is what marks where the country is), takes
    // precedence over every other pill (see Rule 2/3), and is hidden at or past the country's
    // own default view (its cutoff below, with a margin so the default view itself counts) —
    // there the sheet/breadcrumb already say it, and the pill would just sit over the country.
    // A selected destination's country that ISN'T itself selected (a lateral entry) keeps the
    // old behaviour of showing no pill.
    const candidates: CountryCluster[] = [];
    for (const g of COUNTRY_GROUPS) {
      const isSelectedCountry = selectedCountry?.countryCode === g.countryCode;
      if (!isSelectedCountry && selectedDest?.countryCode === g.countryCode) continue;
      // Zoomed in past this country's own default view → its pill never shows (see
      // getCountryPillCutoffLngDelta). Smaller neighbouring countries keep their pills a
      // while longer (their own default views sit deeper), which preserves useful edge
      // context when zoomed into a larger neighbour. Compared against the calibrated
      // pillVisibleLngDelta (true on-screen span), not planLngDelta — the planning scale
      // runs ~2× deep, which hid pills long before their default view was reached.
      const cutoff = getCountryPillCutoffLngDelta(g.countryCode);
      if (pillVisibleLngDelta < (isSelectedCountry ? cutoff * 1.1 : cutoff)) continue;
      candidates.push(toCluster(g));
    }

    // Rule 2: priority order — real-world fame, then a fixed tiebreak for determinism.
    const byPriority = (a: CountryCluster, b: CountryCluster) => {
      // The selected country always sorts first, so it wins every collision below.
      const aSel = a.countryCode === selectedCountry?.countryCode;
      const bSel = b.countryCode === selectedCountry?.countryCode;
      if (aSel !== bSel) return aSel ? -1 : 1;
      const pop = getCountryPopularity(a.countryCode) - getCountryPopularity(b.countryCode);
      if (pop !== 0) return pop;
      return a.countryCode < b.countryCode ? -1 : 1;
    };
    const ordered = [...candidates].sort(byPriority);

    // Rule 3: greedy collision resolution using the same pan-invariant Mercator projection
    // destPinPlan uses (scaled off the true visible span only), so results don't shift
    // while panning.
    const pxPerDegLng = Dimensions.get('window').width / planLngDelta;
    // A pill is a WIDE, SHORT shape (flag circle + name card, ~110×26pt), so collision is a
    // rectangle test on the center deltas, not a circular radius. The old 70px circular
    // radius treated two pills stacked ~60px apart VERTICALLY as colliding even though they
    // don't overlap at all (the pill is only ~26pt tall) — which is why dense regions like
    // Europe lost almost every pill at continent zoom, leaving just the top-priority one.
    const PILL_MIN_DX = 100; // ~average pill width: closer than this AND vertically close = overlap
    const PILL_MIN_DY = 30;  // pill height + breathing room

    const placed: { x: number; y: number }[] = [];
    const pills: CountryCluster[] = [];
    // The selected spot's pin always wins space: a pill that would sit on it is dropped.
    const spotPx = selectedSpot
      ? mercatorPx(selectedSpot.coordinates.longitude, selectedSpot.coordinates.latitude, pxPerDegLng)
      : null;
    // Likewise the selected destination's own pin (it persists at any zoom out to its default view).
    const destPx = selectedDest
      ? mercatorPx(selectedDest.coordinates.longitude, selectedDest.coordinates.latitude, pxPerDegLng)
      : null;
    for (const c of ordered) {
      const p = mercatorPx(c.longitude, c.latitude, pxPerDegLng);
      if (spotPx && Math.abs(p.x - spotPx.x) < 85 && Math.abs(p.y - spotPx.y) < 45) continue;
      if (destPx && Math.abs(p.x - destPx.x) < 85 && Math.abs(p.y - destPx.y) < 50) continue;
      let collides = false;
      for (const o of placed) {
        if (Math.abs(p.x - o.x) < PILL_MIN_DX && Math.abs(p.y - o.y) < PILL_MIN_DY) { collides = true; break; }
      }
      if (collides) continue;
      placed.push(p);
      pills.push(c);
    }

    return pills;
    // Depends on planLngDelta/pillVisibleLngDelta only (pan-invariant zoom) — NOT
    // latitudeDelta, which drifts on pan and would otherwise recompute this and re-resolve
    // pill collisions mid-pan.
  }, [savedDestinations, selectedCountry, selectedDest, selectedSpot, planLngDelta, pillVisibleLngDelta]);

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
    // Pan-invariant Web-Mercator projection scaled off the true visible span only (see
    // mercatorPx + planLngDelta). NO camera centre, NO latitudeDelta — both drift under pan.
    const pxPerDegLng = SCREEN_W / planLngDelta;

    // Plan over the pan-invariant ELIGIBLE set (not the viewport-culled render set), so the
    // greedy collision resolution sees a stable roster while panning.
    const dests = eligibleDests;
    const positions = new Map<string, { x: number; y: number }>();
    for (const d of dests) positions.set(d.id, mercatorPx(d.coordinates.longitude, d.coordinates.latitude, pxPerDegLng));

    // The selected destination always wins a photo, unconditionally (even outside the photo
    // zoom range); its MarkerView is hidden separately while its sheet is open.
    const isForced = (d: Destination) => selectedDest?.id === d.id;

    // Rank-STAGGERED promotion gates (pan-invariant latDelta): the most prominent
    // destinations (rank 1) blossom into photo pins first, at a much wider zoom, and each
    // lower rank tier earns its photo progressively deeper — so zooming in gradually
    // reveals photos in order of prominence (Apple/Google Maps-style), instead of every
    // destination flipping to a photo at one shared threshold. Saved destinations get a
    // one-tier head start: a place you've marked matters more to you than its global rank.
    const PROMOTE_LATDELTA_BY_RANK: Record<number, number> = { 1: 24, 2: 14, 3: 9, 4: 5, 5: 2.5 };
    const panLatDelta = panInvariantLatDelta(planLngDelta);
    // While a country is drilled into (explicitly, or implicitly via a selected
    // destination), its own destinations bypass the rank gates within the country's own
    // zoom range — a country's default view MUST show its destination pins (the whole point
    // of selecting it is exploring what's inside), and some countries' default views sit
    // wider than any global gate. Capped at the same per-country threshold the stamp fade
    // uses so the bypass ends once the user zooms far out toward continent/world view.
    const selCountryCode = selectedCountry?.countryCode ?? selectedDest?.countryCode;
    const inSelectedCountryRange =
      !!selCountryCode && panLatDelta <= getCountryStampThreshold(selCountryCode);
    const canPromote = (d: Destination) => {
      if (inSelectedCountryRange && d.countryCode === selCountryCode) return true;
      // Pill→photo handoff, selection or not: once the camera is inside a country's own
      // default view (pillVisibleLngDelta past its cutoff — the same rule that just hid
      // that country's pill), its destinations become the primary markers there and bypass
      // the global rank gates, exactly as if the country had been selected. Without this,
      // browsing into a country without tapping its pill left only dots at zooms where the
      // pill was already gone (e.g. Los Angeles/Grand Canyon still dots with the western
      // US filling the screen). Eligibility (visibleRank/saved) and the photo-vs-photo and
      // pill collision rules still apply on top.
      if (pillVisibleLngDelta < getCountryPillCutoffLngDelta(d.countryCode)) return true;
      const effRank = Math.max(1, d.rank - (savedDestinations[d.id] ? 1 : 0));
      return panLatDelta <= (PROMOTE_LATDELTA_BY_RANK[effRank] ?? 2.5);
    };

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

    // Country pills always win space over destination photos — they're the higher-level
    // context, and the pills' own visibility rule already guarantees they disappear once
    // the user zooms past a country's default view. Any destination whose photo would
    // overlap a currently-shown pill simply stays a dot until the camera is deep enough
    // that the two no longer collide (or the pill has hit its own default-view cutoff).
    // Same pan-invariant projection/scale as the photo collision test below.
    const pillBlocks = countryPills.map(c => mercatorPx(c.longitude, c.latitude, pxPerDegLng));
    const PILL_BLOCK_DX = 75; // ~half pill width + photo pin radius
    const PILL_BLOCK_DY = 42; // ~half pill height + photo pin radius + label headroom

    const photoIds = new Set<string>();
    const placed: { x: number; y: number }[] = [];
    // The selected spot's pin always wins space over a destination photo: one that would sit on
    // it (including the selected destination's own) stays a stamp instead. This, not draw order,
    // is what keeps the spot uncovered — MarkerViews are stacked by when they were mounted, so a
    // destination photo that fades in after the spot pin would land on top of it.
    const spotPx = selectedSpot
      ? mercatorPx(selectedSpot.coordinates.longitude, selectedSpot.coordinates.latitude, pxPerDegLng)
      : null;
    for (const d of ordered) {
      const forced = isForced(d);
      if (!forced && !canPromote(d)) continue;            // stays a stamp at wide zoom
      const p = positions.get(d.id)!;
      // Applies to the selected destination's own (forced) photo too — that's the pin that most
      // often sits right on top of its own spot.
      if (spotPx && Math.abs(p.x - spotPx.x) < 75 && Math.abs(p.y - spotPx.y) < 60) continue;
      if (!forced) {
        let blockedByPill = false;
        for (const o of pillBlocks) {
          if (Math.abs(p.x - o.x) < PILL_BLOCK_DX && Math.abs(p.y - o.y) < PILL_BLOCK_DY) { blockedByPill = true; break; }
        }
        if (blockedByPill) continue;
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
    // Pure function of zoom (planLngDelta) + eligible set + selection + saved state +
    // the (equally pan-invariant) country pill plan.
    // No camera centre → recompute produces an identical plan while panning at fixed zoom.
  }, [eligibleDests, planLngDelta, pillVisibleLngDelta, selectedCountry, selectedDest, selectedSpot, savedDestinations, countryPills]);

  // Stamps are rendered via CircleLayer (not MarkerView) so Mapbox renders all of them
  // regardless of proximity. Every filter-passing destination gets a stamp — INCLUDING ones
  // currently promoted to photo pins: the opaque photo circle simply covers its own stamp,
  // so a promotion or demotion is a pure photo fade-in/out over a continuously-present dot,
  // with no frame where the destination has no marker at all.
  //
  // Appearance is governed by a NATIVE zoom-interpolated, RANK-STAGGERED opacity fade (see
  // the CircleLayer style below), not by feature-list membership — the most prominent
  // destinations' dots materialize first as the user zooms in from world view, each lower
  // tier following ~0.6 zoom levels later, so the map populates gradually in order of
  // prominence rather than every dot blinking in at one shared boundary. Each feature
  // carries its fade `tier` (1 = earliest); saved destinations get a one-tier head start,
  // and the selected country's own destinations always use tier 1.
  // Destinations the camera is currently "inside" at spot zoom (within their own spot
  // spread — see DEST_SPOT_RADIUS). Their markers vanish entirely: with their spot pins on
  // screen, a parent marker among its own children is clutter, and a demoted dot would
  // wrongly read as ranking below the spots. Deliberately camera-centre-dependent (unlike
  // the pan-invariant pin plans) — it's a single local rule active only at spot zoom, and
  // the FadePin/exit system turns boundary crossings into cross-fades rather than flicker.
  const zoomedIntoDestIdsRaw = useMemo(() => {
    const ids = new Set<string>();
    if (region.latitudeDelta >= SPOT_THRESHOLD) return ids;
    const cosLat = Math.cos((region.latitude * Math.PI) / 180);
    for (const d of DESTINATIONS) {
      const radius = DEST_SPOT_RADIUS[d.id];
      if (radius === undefined) continue;
      const dLat = d.coordinates.latitude - region.latitude;
      const dLng = (d.coordinates.longitude - region.longitude) * cosLat;
      if (Math.hypot(dLat, dLng) < radius) ids.add(d.id);
    }
    // The SELECTED destination is hidden for as long as its spot pins are showing, wherever the
    // camera is: it now opts out of Mapbox's marker collision (so it can persist zooming out), and
    // that same collision pass used to be what quietly hid it once its spots overlapped it.
    if (selectedDest && DEST_SPOT_RADIUS[selectedDest.id] !== undefined) ids.add(selectedDest.id);
    return ids;
  }, [region.latitude, region.longitude, region.latitudeDelta, selectedDest]);
  const zoomedIntoDestIds = useStableSet(zoomedIntoDestIdsRaw);

  // Destinations the camera has zoomed DEEPER than their own default view (the depth
  // fitDestinationDefaultView lands on): their pin/dot never shows past that point, selected or
  // not — the spot pins take over. A small margin so the default view itself still shows it.
  const zoomedPastDefaultIdsRaw = useMemo(() => {
    const ids = new Set<string>();
    for (const d of DESTINATIONS) {
      if (camZoom > latDeltaToZoom(getZoomDelta(d.category)) + 0.15) ids.add(d.id);
    }
    return ids;
  }, [camZoom]);
  const zoomedPastDefaultIds = useStableSet(zoomedPastDefaultIdsRaw);
  const hiddenDestIdsRaw = useMemo(() => {
    if (zoomedPastDefaultIds.size === 0) return zoomedIntoDestIds;
    const ids = new Set(zoomedIntoDestIds);
    zoomedPastDefaultIds.forEach(id => ids.add(id));
    return ids;
  }, [zoomedIntoDestIds, zoomedPastDefaultIds]);
  const hiddenDestIds = useStableSet(hiddenDestIdsRaw);

  const stampFadeBaseZoom = useMemo(() => {
    // Fade origin: the world-view boundary normally, or the selected country's own
    // per-country threshold (see getCountryStampThreshold) — a geographically wide country
    // (Australia, US...) needs a wider view than the flat world cutoff allows before its
    // own stamps should appear.
    const countryCode = selectedCountry?.countryCode ?? selectedDest?.countryCode;
    const threshold = countryCode ? getCountryStampThreshold(countryCode) : WORLD_VIEW_LATDELTA;
    return Math.max(0, latDeltaToZoom(threshold) - 0.35);
  }, [selectedCountry, selectedDest]);
  const STAMP_TIER_STEP = 0.6; // zoom levels between successive tiers' fade-ins

  // Highest tier currently switched on — a discrete step function of the camera zoom.
  // Tier n activates once the camera crosses stampFadeBaseZoom + (n-1)·STAMP_TIER_STEP.
  const activeStampTier = useMemo(() => (
    camZoom < stampFadeBaseZoom
      ? 0
      : Math.min(5, Math.floor((camZoom - stampFadeBaseZoom) / STAMP_TIER_STEP) + 1)
  ), [camZoom, stampFadeBaseZoom]);

  const stampGeoJSON = useMemo(() => {
    const selCountryCode = selectedCountry?.countryCode ?? selectedDest?.countryCode;

    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const dest of DESTINATIONS) {
      const saved = savedDestinations[dest.id];
      // Camera is inside this destination at spot zoom → no marker at all (its spot pins
      // represent it; see zoomedIntoDestIds).
      if (hiddenDestIds.has(dest.id)) continue;
      const tier = dest.countryCode === selCountryCode
        ? 1
        : Math.max(1, dest.rank - (saved ? 1 : 0));
      // Cull features more than one tier beyond the active one — purely so far-from-
      // visible dots can't swallow taps meant for the map. One tier of headroom stays
      // mounted (at opacity 0) so an incoming tier fades IN from an already-present
      // feature, and an outgoing one stays mounted long enough to fade OUT.
      if (tier > activeStampTier + 1) continue;
      features.push({
        type: 'Feature',
        id: dest.id,
        geometry: { type: 'Point', coordinates: [dest.coordinates.longitude, dest.coordinates.latitude] },
        properties: {
          id: dest.id,
          tier,
          color: saved?.type === 'visited' ? VISITED_COLOR : '#6B7280',
        },
      });
    }
    return { type: 'FeatureCollection' as const, features };
  }, [savedDestinations, selectedCountry, selectedDest, activeStampTier, hiddenDestIds]);

  // Discrete tier activation + native style TRANSITION (not a continuous zoom
  // interpolation): the opacity expression only ever targets exactly 0 or 1 per dot, and
  // the 300ms circleOpacityTransition on the layer cross-fades a tier's dots whenever it
  // flips on or off. A continuous zoom-interpolated ramp was tried first, but the camera
  // can settle anywhere inside a ramp, leaving dots stuck half-faded at rest — with
  // discrete targets every dot is always either fully solid or fully hidden once the
  // transition finishes, while zooming still reads as a staggered, gradual reveal.
  const stampOpacityExpr = useMemo(() =>
    ['case', ['<=', ['get', 'tier'], activeStampTier], 1, 0] as any,
  [activeStampTier]);

  // All spots in the selected destination — the set the spot carousel pages through.
  const spotsInDest = useMemo(
    () => (selectedDest ? SPOTS.filter(s => s.destinationId === selectedDest.id) : []),
    [selectedDest],
  );

  const visibleSpots = useMemo(() => {
    // Binary gate at SPOT_THRESHOLD — under the old continuous zoom-fade this was
    // SPOT_THRESHOLD + 0.1 of mount headroom for the fade band, but pins were already
    // fully transparent past the threshold; now FadePin's exit fade covers removal.
    const belowSpotZoom = region.latitudeDelta < SPOT_THRESHOLD;

    // While a destination is selected — its own sheet open, or drilled into one of its
    // spots — show that destination's full, small, static spot set rather than a live
    // camera-viewport bbox query. A bbox tied to the live pan/zoom produces a brand-new
    // render array on every throttled camera frame, and fitSpotView deliberately centres the
    // camera SOUTH of the selected spot (so the spot lands in the visible top-half window
    // above the sheet, not at the screen's true optical centre) — once that settles, the
    // spot can end up outside the bbox's own padding and silently drop out of the set. Same
    // pan-invariance fix already applied to destination pins (see the NOTE above
    // stampGeoJSON) — a destination's spot count is small enough that this is free.
    //
    // That static set is only for the SELECTED destination's own spots. Spots of any other
    // destination the camera has since moved over still come from the viewport query and are
    // appended, so zooming into a neighbouring destination while one is selected shows ITS pins
    // too rather than leaving that area bare.
    // The selected spot itself is added back below whatever else this decides, so it stays on the
    // map at any zoom.
    // Past the spot zoom cutoff only the selected spot persists — not its whole destination's set.
    if (!belowSpotZoom) return selectedSpot ? [selectedSpot] : [];

    const others: Spot[] = [];
    if (belowSpotZoom) {
      const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
      const pad = 0.15;
      const minLat = latitude - latitudeDelta * (0.5 + pad);
      const maxLat = latitude + latitudeDelta * (0.5 + pad);
      const minLng = longitude - longitudeDelta * (0.5 + pad);
      const maxLng = longitude + longitudeDelta * (0.5 + pad);
      for (const s of SPOTS) {
        if (selectedDest && s.destinationId === selectedDest.id) continue;
        const { latitude: lat, longitude: lng } = s.coordinates;
        if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) others.push(s);
      }
    }
    const result = selectedDest ? [...spotsInDest, ...others] : others;
    if (selectedSpot && !result.some(sp => sp.id === selectedSpot.id)) result.push(selectedSpot);
    return result;
  }, [region, selectedSpot, selectedDest, spotsInDest]);
  // Exit-fade tracking for spot pins (same treatment as pills/photos): pins leaving the
  // set linger for PIN_EXIT_MS fading out, new ones mount at 0 and fade in.
  const renderedSpots = useExitingItems(useStableList(visibleSpots, s => s.id), s => s.id);

  // Which side of each spot pin its name goes on — or none. Names default to the LEFT of the pin;
  // when that would run into another pin or an already-placed name the label flips to the right, and
  // when neither side is clear it's dropped altogether (the pin itself always stays). Spots claim
  // space in priority order — the selected spot, then ones the user has visited, then the more
  // popular (earlier in the spots data, which is also the order the destination's carousel uses) —
  // so the names that survive a crowd are the ones that matter most. Pixel geometry comes from the
  // true on-screen scale, so this is what the eye actually sees; only relative offsets matter, so
  // the projection needs no camera centre.
  const spotLabelPlan = useMemo(() => {
    const plan = new Map<string, 'left' | 'right' | 'none'>();
    const live = renderedSpots.filter(r => !r.exiting).map(r => r.item);
    if (live.length === 0) return plan;
    const pxPerDegLng = SCREEN_W_GLOBAL / pillVisibleLngDelta;
    type Rect = { l: number; r: number; t: number; b: number };
    const geo = new Map<string, { pin: Rect; cy: number; cx: number; half: number; w: number }>();
    for (const sp of live) {
      const m = mercatorPx(sp.coordinates.longitude, sp.coordinates.latitude, pxPerDegLng);
      const x = m.x, y = -m.y;                         // screen y grows downward, mercator's grows north
      const sel = selectedSpot?.id === sp.id;
      const bubble = sel ? SPOT_PIN_SIZE_SELECTED : SPOT_PIN_SIZE;
      const tail = sel ? 14 : 10;
      geo.set(sp.id, {
        pin: { l: x - bubble / 2, r: x + bubble / 2, t: y - bubble - tail, b: y },
        cx: x, cy: y - (bubble + tail) / 2, half: bubble / 2,   // the row centres the label on bubble + tail
        w: sp.name.length * 6.6 + 4,                   // 12px bold: ~6.6px per character
      });
    }
    const PAD = 3;
    const hits = (a: Rect, b: Rect) =>
      a.l < b.r + PAD && a.r > b.l - PAD && a.t < b.b + PAD && a.b > b.t - PAD;
    const order = [...live].sort((a, b) => {
      const rank = (sp: Spot) =>
        (selectedSpot?.id === sp.id ? -2_000_000 : 0) + (savedSpots[sp.id] ? -1_000_000 : 0) + (SPOT_ORDER.get(sp.id) ?? 0);
      return rank(a) - rank(b);
    });
    const placedLabels: Rect[] = [];
    for (const sp of order) {
      const g = geo.get(sp.id)!;
      const labelRect = (side: 'left' | 'right'): Rect => {
        const l = side === 'left' ? g.cx - g.half - SPOT_LABEL_GAP - g.w : g.cx + g.half + SPOT_LABEL_GAP;
        return { l, r: l + g.w, t: g.cy - 8, b: g.cy + 8 };
      };
      const clear = (rect: Rect) => {
        for (const other of live) if (other.id !== sp.id && hits(rect, geo.get(other.id)!.pin)) return false;
        for (const lab of placedLabels) if (hits(rect, lab)) return false;
        return true;
      };
      const left = labelRect('left');
      if (clear(left)) { plan.set(sp.id, 'left'); placedLabels.push(left); continue; }
      const right = labelRect('right');
      if (clear(right)) { plan.set(sp.id, 'right'); placedLabels.push(right); continue; }
      plan.set(sp.id, 'none');
    }
    return plan;
  }, [renderedSpots, pillVisibleLngDelta, selectedSpot, savedSpots]);

  // ── Search results ────────────────────────────────────────────────────────
  const searchResults = useMemo(() => computeSearchResults(searchQuery), [searchQuery]);
  // Text typed into the search bar never outlives the search: whenever the bar isn't focused,
  // any query is dropped — including one that arrives late (the native field can re-report its
  // old text through onChangeText when it's blurred in the same tick it's emptied, which is
  // how a picked result's query used to linger). Runs on searchQuery too, not just
  // searchFocused, so a stray late change is caught as well.
  useEffect(() => {
    if (!searchFocused && searchQuery) {
      setSearchQuery('');
      searchInputRef.current?.clear();
    }
  }, [searchFocused, searchQuery]);

  // TEMPORARY diagnostic for a bug where the destination sheet vanishes (instantly, not a slide)
  // while zooming out, leaving the back pill: logs every change of the state that decides which
  // sheet is mounted, so the console shows which one flips at that moment.
  useEffect(() => {
    if (!__DEV__) return;
    console.log('[sheet-trace]', JSON.stringify({
      mapState, dest: selectedDest?.id ?? null, spot: selectedSpot?.id ?? null,
      country: selectedCountry?.countryCode ?? null, searchFocused,
    }));
  }, [mapState, selectedDest, selectedSpot, selectedCountry, searchFocused]);

  // Detect when selected country/destination has drifted out of the visible viewport




  // ── Fetch the single base style once on mount ─────────────────────────────
  useEffect(() => {
    // Capped so a hung request can't leave the map unmounted: after 4s it mounts on the default style.
    const cap = setTimeout(() => setStyleResolved(true), 4000);
    fetchStyleNoLabels('mapbox/standard')
      .then(json => { if (json) setBaseStyle(json); })
      .catch(() => {})
      .finally(() => { clearTimeout(cap); setStyleResolved(true); });
    return () => clearTimeout(cap);
  }, []);

  // ── Breadcrumb helpers ────────────────────────────────────────────────────
  const showBreadcrumb = useCallback((show: boolean) => {
    Animated.parallel([
      Animated.spring(worldPillAnim, { toValue: show ? 0 : 1, damping: 22, stiffness: 280, useNativeDriver: true }),
      Animated.spring(breadcrumbAnim, { toValue: show ? 1 : 0, damping: 22, stiffness: 280, useNativeDriver: true }),
    ]).start();
  }, [worldPillAnim, breadcrumbAnim]);

  // ── Camera helpers ────────────────────────────────────────────────────────
  // `mode` defaults to 'easeTo' (center + zoom interpolate linearly together — the right
  // choice for most moves here, including the country-fit transitions above). A big
  // pan-distance-AND-zoom-in-depth move (selecting a destination from a wide country view)
  // reads badly under pure linear interpolation though: early in the animation the pan is a
  // tiny fraction of the (still zoomed-out) screen, so it's imperceptible, while the zoom
  // itself is very visible — then as zoom deepens near the end, that same linear-in-degrees
  // pan suddenly covers a huge number of screen pixels, reading as "zooms into the country's
  // middle, THEN rapidly pans to the destination" even though the interpolation itself was
  // smooth throughout. 'flyTo' (Mapbox's van Wijk/Nuij curve, purpose-built for exactly this
  // combination) keeps the destination visually converging throughout instead, so callers
  // doing a big zoom-in-toward-a-point pass 'flyTo' explicitly.
  // Drops the pending capture of a country fit's final camera (see countryCacheArmRef). Called from the
  // shared camera entry points, so ANY subsequent camera move — selecting a destination, backing out to
  // the world, a search jump — stops the idle that follows it from being recorded as that country's default
  // camera.
  const cancelCountryCapture = useCallback(() => {
    countryCacheArmRef.current = null;
  }, []);
  useEffect(() => () => {
    if (suppressFrameSyncTimerRef.current) clearTimeout(suppressFrameSyncTimerRef.current);
  }, []);

  const animateCamera = useCallback((reg: Region, duration = 500, mode: 'easeTo' | 'flyTo' = 'easeTo') => {
    cancelCountryCapture();
    cameraRef.current?.setCamera({
      centerCoordinate: [reg.longitude, reg.latitude],
      zoomLevel: latDeltaToZoom(reg.latitudeDelta),
      animationDuration: duration,
      animationMode: mode,
    });
  }, [cancelCountryCapture]);

  // Computes an explicit centerCoordinate + zoomLevel ourselves (the exact same primitives
  // animateCamera uses) rather than handing raw coordinates to setCamera's `bounds` field —
  // 'flyTo' fixed the zoom-IN destination-select transition (see animateCamera's own
  // comment) but did NOT fix the equivalent zoom-OUT case (destination→country) as long as
  // it went through `bounds`: bounds-fitting appears to run its own internal path-finding
  // regardless of the requested animationMode, so 'flyTo' silently had no effect there and
  // it kept reading as "pan to centre, then zoom" instead of one continuous swoop. Computing
  // center/zoom in JS and passing them as plain centerCoordinate/zoomLevel — the same fields
  // animateCamera already proved 'flyTo' works correctly with — sidesteps that entirely.
  //
  // The math: latDeltaToZoom expects a full-SCREEN-HEIGHT-equivalent degree span (that's
  // what a Region's own latitudeDelta means everywhere else in this file); panInvariantLatDelta
  // converts a longitude span into that same height-equivalent unit (see its own comment).
  // So: inflate the raw lng/lat span by how much of the screen the padding eats on each
  // axis, convert both to the height-equivalent unit, and the LARGER of the two (whichever
  // axis is the binding constraint) determines the zoom. The camera's centerCoordinate then
  // has to be offset from the raw bounds' own center by half the padding imbalance (e.g. a
  // much taller bottom padding than top, for the sheet below, means the framed content
  // should sit higher on screen — achieved by placing the camera center SOUTH of the raw
  // center, not AT it), converted from px to degrees using the resolved zoom's scale.
  const fitCoords = useCallback((
    coords: { latitude: number; longitude: number }[],
    padding: { top: number; right: number; bottom: number; left: number },
    duration = 500,
    mode: 'easeTo' | 'flyTo' = 'easeTo',
  ) => {
    if (!coords.length) return;
    cancelCountryCapture();
    const lngs = coords.map(c => c.longitude);
    const lats = coords.map(c => c.latitude);
    const ne = { longitude: Math.max(...lngs), latitude: Math.max(...lats) };
    const sw = { longitude: Math.min(...lngs), latitude: Math.min(...lats) };
    const lngSpan = Math.max(ne.longitude - sw.longitude, 0.0001);
    const latSpan = Math.max(ne.latitude  - sw.latitude,  0.0001);

    const availW = Math.max(40, SCREEN_W_GLOBAL - padding.left - padding.right);
    const availH = Math.max(40, H - padding.top - padding.bottom);

    const effLngSpan = lngSpan * (SCREEN_W_GLOBAL / availW);
    const effLatSpan = latSpan * (H / availH);
    const bindingLatDelta = Math.max(panInvariantLatDelta(effLngSpan), effLatSpan);
    const zoomLevel = latDeltaToZoom(bindingLatDelta);

    // Actual (unpadded) full-height-equivalent latDelta at the resolved zoom — inverts
    // latDeltaToZoom — used to get the px-per-degree scale for the center offset below.
    const settledLatDelta = 360 / Math.pow(2, zoomLevel + 1);
    const scale = H / settledLatDelta; // px per degree, both axes (pan-invariant approximation)

    const dxPx = (padding.left - padding.right) / 2;
    const dyPx = (padding.top - padding.bottom) / 2;
    const rawCenterLng = (ne.longitude + sw.longitude) / 2;
    const rawCenterLat = (ne.latitude  + sw.latitude)  / 2;

    cameraRef.current?.setCamera({
      centerCoordinate: [rawCenterLng - dxPx / scale, rawCenterLat + dyPx / scale],
      zoomLevel,
      animationDuration: duration,
      animationMode: mode,
    });
  }, [cancelCountryCapture]);

  // Default framing for a freshly-selected country. The vertical window runs from the very
  // top of the screen down to wherever the sheet's top edge will settle, and the country is
  // centred in it; horizontal bounds are the full screen width, edge to edge. Whichever axis
  // the bounding box touches first (wide countries hit left/right, tall ones hit top/bottom)
  // is backed off by 10% so the borders never sit flush.
  //
  // `framing` picks the bottom of that window, which has to match the snap state the sheet
  // will actually open in — frame for a full screen against a half-screen sheet and the
  // country's lower half ends up hidden behind it:
  //   • 'topHalf' — sheet opens at half-screen (the usual case). Window is y 0..H/2, H/2
  //     being CountrySheet's own COLLAPSED_Y.
  //   • 'full'    — sheet opens in bottom-screen/peek (returning up from a destination via
  //     the breadcrumb). Window runs to the top of the peek strip, i.e. everything the user
  //     can actually see.
  //
  // The top bound is a plain 0 — no room is reserved for the breadcrumb pill, since that pill
  // fades out whenever it would overlap (see crumbGateStyle). An earlier version reserved the
  // pill's height at the top; that's deliberately gone.
  //
  // ONE camera animation, computed natively by patches/@rnmapbox+maps+10.3.1.patch (`fitWindow`).
  //
  // This used to be two moves — Mapbox's bounds fit, then a corrective moveBy — and each of the two halves of
  // the job is wrong under projection="globe" on its own:
  //   • The stock bounds fit (camera(for:padding:)) is documented as unsupported on Globe. Measured on a
  //     simulator: it ignores the sheet padding at globe zooms (Sweden, Norway, France, Japan all landed
  //     ~175px low, i.e. centred on the whole map), respects it only once the map has flattened into
  //     ordinary Mercator (Switzerland), and returns a wrong camera for very large extents (Chile).
  //   • The corrective moveBy is a synthetic drag, which isn't exact on a globe: it left Sweden 41px and
  //     Norway 56px off, and — because it assumed the fit had ignored the padding — overshot Switzerland by
  //     161px, cutting its top off.
  // Two sequential animations also read as two motions however short the second is (see git history).
  //
  // The native mode instead uses Mapbox's own renderer as the oracle: it applies trial cameras instantly (no
  // frame is drawn between them), projects the country's outline with Mapbox's own point(for:), and corrects
  // zoom and centre from where the points actually land, then restores the original camera and returns the
  // final one. No latitude/projection maths of ours is involved. We then animate to it once.
  //
  // Verified on the simulator across Switzerland, Sweden, Norway, France, Japan, the US, Australia,
  // Indonesia and Chile: outline centred in the window to within 0.4px (equal space above and below, equal
  // left and right), 90% fill on the binding axis, nothing off-screen, and a single ~515ms motion with no
  // pause or second movement — for both easeTo and flyTo. Needs a native rebuild (`expo run:ios`) since the
  // patch changes native code.
  const fitCountryDefaultView = useCallback((
    cluster: CountryCluster,
    mode: 'easeTo' | 'flyTo' = 'easeTo',
    framing: 'topHalf' | 'full' = 'topHalf',
    durationMs = 500,
  ) => {
    cancelCountryCapture();

    const bounds = getCountryBounds(cluster.countryCode);
    if (!bounds) {
      const dests = DESTINATIONS.filter(d => d.country === cluster.country);
      if (dests.length > 0) {
        fitCoords(dests.map(d => d.coordinates), { top: 120, right: 120, bottom: 300, left: 120 }, 500, mode);
      }
      return;
    }

    const SHRINK = 0.9;                     // final size = 90% of the "borders touch" fit
    const FIT_MS = durationMs;

    // The MapView is absoluteFill inside MapScreen's root, whose top edge IS the screen's top
    // edge — so screen-y and map-y coincide and the bounds below need no rebasing. Its HEIGHT
    // is shorter than the device's, though: App.tsx's bottom Tab.Navigator reserves layout
    // space below it (the tab bar isn't absolutely positioned), the same fact the sheets' own
    // pillOffsetSV reactions account for. Measured via onLayout, falling back to the same
    // BOTTOM_TAB_H constant those sheets use.
    const mapViewH = mapViewHRef.current || (H - BOTTOM_TAB_H);

    // Already resolved this country at this geometry — go straight to the known camera, skipping the
    // recompute. A plain centre+zoom stop, so 'flyTo' works here just as it does for the fit below.
    // Keyed by framing too — the same country resolves to a different camera in each window.
    const cacheKey = `${cluster.countryCode}:${framing}`;
    const cached = countryCamCacheRef.current[cacheKey];
    if (cached && cached.mapH === mapViewH) {
      cameraRef.current?.setCamera({
        centerCoordinate: [cached.lng, cached.lat],
        zoomLevel: cached.zoom,
        animationDuration: FIT_MS,
        animationMode: mode,
      });
      return;
    }

    const topBound = 0;                     // the very top of the screen
    const bottomBound = framing === 'full'
      ? Math.max(40, mapViewH - PEEK_STRIP_H) // top of the peek strip — all the visible map
      : H / 2;                                // matches CountrySheet's own COLLAPSED_Y

    // Padding describing the same window. The fitWindow mode ignores it, but a build that predates the native
    // patch (it needs `expo run:ios`) falls back to the stock fit, which does size correctly from it — so an
    // app running new JS on old native lands the right size rather than an arbitrary one.
    const availH = Math.max(40, bottomBound - topBound);
    const insetV = availH * (1 - SHRINK) / 2;
    const insetH = SCREEN_W_GLOBAL * (1 - SHRINK) / 2;

    cameraRef.current?.setCamera({
      bounds: {
        ne: [bounds.ne.longitude, bounds.ne.latitude],
        sw: [bounds.sw.longitude, bounds.sw.latitude],
        paddingTop:    topBound + insetV,
        paddingBottom: Math.max(0, mapViewH - bottomBound) + insetV,
        paddingLeft:   insetH,
        paddingRight:  insetH,
        // Fields added by the @rnmapbox/maps patch (not in its types): frame the bounds inside this screen
        // window at `shrink` of its size. See the block comment above.
        mode: 'fitWindow',
        windowTop: topBound,
        windowBottom: bottomBound,
        shrink: SHRINK,
      } as any,
      animationDuration: FIT_MS,
      animationMode: mode,
    });

    // Arm the capture of the camera this lands on, so later visits (and the country close's half-zoom) can
    // use it. The map idle that follows this single move holds the final camera; handleMapIdle accepts it
    // once FIT_MS has elapsed.
    countryCacheArmRef.current = { code: cluster.countryCode, key: cacheKey, at: Date.now() + FIT_MS };
  }, [fitCoords, cancelCountryCapture]);

  // Destination equivalent of fitCountryDefaultView, and much simpler for two reasons: a
  // destination is a POINT rather than a bounding box, so there's nothing to size — the zoom
  // is just getZoomDelta's — and its zoom is deep enough to be squarely in mercator, so the
  // vertical placement solves in closed form (see mercY). No bounds fit, no settle, no cache:
  // one camera stop that lands exactly right the first time.
  //
  // `framing` picks the window the destination is centred in, and must track the snap state
  // the sheet is in, exactly as for countries:
  //   • 'topHalf' — sheet at half-screen. Window y 0..H/2.
  //   • 'full'    — sheet in bottom-screen/peek. Window runs to the top of the peek strip.
  const fitDestinationDefaultView = useCallback((
    dest: Destination,
    mode: 'easeTo' | 'flyTo' = 'easeTo',
    framing: 'topHalf' | 'full' = 'topHalf',
    durationMs = 500,
    // Multiplies the zoom LEVEL (not the visible span): 0.5 lands on half the destination's own
    // default zoom, the same "half the zoom level" step-back the country close uses.
    zoomFactor = 1,
  ) => {
    cancelCountryCapture();
    const zoomLevel = latDeltaToZoom(getZoomDelta(dest.category)) * zoomFactor;
    const worldSize = 512 * Math.pow(2, zoomLevel);
    const mapViewH = mapViewHRef.current || (H - BOTTOM_TAB_H);
    const bottomBound = framing === 'full'
      ? Math.max(40, mapViewH - PEEK_STRIP_H)
      : H / 2;
    const targetY = bottomBound / 2;   // top bound is 0, so the centre is just half of it
    // Offset the CAMERA centre so the DESTINATION lands at targetY: the camera centre renders
    // at the map view's own middle, so placing the destination higher means centring south of
    // it. Negative (targetY - mapViewH/2) therefore pushes mercY down-screen, i.e. southward.
    const centerLat = invMercY(
      mercY(dest.coordinates.latitude) - (targetY - mapViewH / 2) / worldSize,
    );
    cameraRef.current?.setCamera({
      centerCoordinate: [dest.coordinates.longitude, centerLat],
      zoomLevel,
      animationDuration: durationMs,
      animationMode: mode,
    });
  }, [cancelCountryCapture]);

  // Spot equivalent of fitDestinationDefaultView — same closed-form point-centring math, but
  // fixed at spot zoom (latitudeDelta 0.02) and always framed for the half-screen carousel
  // window (topHalf) rather than a caller-supplied framing. Plain animateCamera centred a
  // spot's coordinate at the MAP VIEW's own middle, which sits well below the carousel
  // sheet's top edge (COLLAPSED_Y = H/2) — so the pin landed hidden behind the sheet instead
  // of in the visible top half, reading as the pin having disappeared.
  const fitSpotView = useCallback((spot: Spot, mode: 'easeTo' | 'flyTo' = 'easeTo', durationMs = 500) => {
    cancelCountryCapture();
    const zoomLevel = latDeltaToZoom(0.02);
    const worldSize = 512 * Math.pow(2, zoomLevel);
    const mapViewH = mapViewHRef.current || (H - BOTTOM_TAB_H);
    const targetY = (H / 2) / 2; // topHalf window: top bound 0, bottom bound H/2
    const centerLat = invMercY(
      mercY(spot.coordinates.latitude) - (targetY - mapViewH / 2) / worldSize,
    );
    cameraRef.current?.setCamera({
      centerCoordinate: [spot.coordinates.longitude, centerLat],
      zoomLevel,
      animationDuration: durationMs,
      animationMode: mode,
    });
  }, [cancelCountryCapture]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  // Drops the selected country when the destination being opened belongs to a DIFFERENT one. The
  // selection is kept on purpose while drilling into a destination of the same country (so the
  // country pill doesn't flash back before the zoom lands), but carried over to another country's
  // destination it left that country's border highlight, glow and pin ranking switched on around
  // a place that isn't in it — e.g. Austria still outlined while Venice's sheet was open.
  const dropCountryIfForeign = useCallback((destCountry: string) => {
    const sel = selectedCountryRef.current;
    if (!sel || sel.country === destCountry) return;
    selectedCountryRef.current = null;
    setSelectedCountry(null);
    countryHomeRegionRef.current = null;
    setCountryHomeRegion(null);
  }, []);

  const handleMarkerPress = useCallback((dest: Destination) => {
    // Provenance: a normal drill-down only when the tapped destination actually belongs to
    // the currently selected country — not just "is *some* country selected". Rank-1
    // "anchor" destinations from OTHER countries are deliberately shown (as stamps) even
    // while a country is selected, so every country pill can keep forming on the world map;
    // tapping one of those isn't a drill-down into the selected country at all. Otherwise
    // the back pill would falsely claim "‹ Country A" for a destination that's actually in
    // Country B. Anything that doesn't match — including no country selected — is treated
    // as a free-zoom tap: the X pill zooms out to the country's default view instead of
    // reopening a country sheet the user never visited. handleSearchSelect overrides to
    // 'search' right after calling this. (Ref, not the selectedCountry closure — handleSearchSelect
    // sets the ref synchronously before calling here.)
    if (selectedCountryRef.current?.country === dest.country) {
      setDestOrigin('country');
    } else {
      setDestOrigin('map');
    }
    // Keep selectedCountry set — we're drilling into a destination within the country.
    // Clearing it would briefly re-show the country pill before the zoom animation lands.
    // CountrySheet is suppressed by the !selectedDest guard on its render condition.
    lastCountryPressRef.current = Date.now(); // prevent auto-dismiss during destination zoom
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    prevRegionRef.current = regionRef.current;
    prevCountryRef.current = selectedCountry;
    dropCountryIfForeign(dest.country);
    selectedDestRef.current = dest;
    setSelectedDest(dest);
    // Kick off DestinationSheet's own hero-photo fetch right now, in parallel with the sheet's
    // slide-up/camera animation, instead of waiting for it to mount a render cycle later.
    prefetchWikiThumbnail(dest.id, photoCache, dest.name, 900);
    setMapState('context');
    setZoomedIntoDestination(true);
    showBreadcrumb(true);
    // Opening a destination clears any spot drilldown.
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
    // Set synchronously (not left to DestinationSheet's own mount effect to report back) —
    // that report is a passive useEffect, which can flush AFTER a native camera-changed
    // event already landed and read this ref for its own peek-on-pan gate. If the user
    // pans right after tapping (very plausible), that gate could see a STALE value left
    // over from whatever was open before (even 'peek', if the previous sheet was peeking)
    // and skip bumping peekSignal entirely — the new sheet then never dropped to peek on
    // that first pan, reading as "jumps back to collapsed instead of going to peek."
    // DestinationSheet always opens 'collapsed' by default (initialSnap only ever requests
    // otherwise from a caller that doesn't run through this path).
    setSheetSnapState(isMapInteracting() ? 'peek' : 'collapsed');
    // destHomeRegion itself is captured LAZILY from the real, settled camera bounds once the
    // fly-to below actually lands (see handleMapIdle) — NOT fabricated synchronously from
    // this target region. A synthetic guess (this same latitudeDelta/longitudeDelta pair)
    // was tried, but it doesn't match what the camera actually reports once settled: real
    // longitude span is a function of zoom+screen-width alone, while real latitude span
    // (Mercator) additionally depends on the destination's own latitude, an effect no simple
    // formula here reproduces closely enough — the mismatch made the "panned away" check
    // misfire a moment after landing dead-centered on the destination. Observing the real,
    // settled bounds sidesteps that error entirely, at the cost of needing to guard against
    // the user interrupting the flight before it settles (see destFlightInterruptedRef and
    // handleCameraChanged/handleMapIdle) — otherwise the first idle after an interruption
    // would capture wherever the user's OWN pan ended as "home" instead.
    destHomeRegionRef.current = null;
    setDestHomeRegion(null);
    destReturnPromptProgress.value = 0; destReturnPromptVisibleRef.current = false;
    // Suppresses prompt evaluation and gates home-capture until the flight settles (or the
    // fallback below gives up) — see destFlightInterruptedRef's own comment for the other
    // half of this mechanism.
    destFlightInterruptedRef.current = false;
    suppressDestReturnPromptRef.current = true;
    if (suppressDestReturnPromptTimerRef.current) clearTimeout(suppressDestReturnPromptTimerRef.current);
    suppressDestReturnPromptTimerRef.current = setTimeout(() => { suppressDestReturnPromptRef.current = false; }, 650);
    // 'flyTo' — see animateCamera's own comment. Selecting a destination is exactly the
    // big-pan-plus-deep-zoom-in case pure easeTo reads badly for. 'topHalf' because the sheet
    // opens at half-screen here (see the synchronous snap reset above).
    fitDestinationDefaultView(dest, 'flyTo', 'topHalf');
    // Reads region via regionRef (not a dep) so this callback stays stable across pans and
    // doesn't bust the memoized destination-pin marker list.
  }, [selectedCountry, showBreadcrumb, animateCamera, dropCountryIfForeign]);

  const handleSheetExpand = useCallback(() => setMapState('sheet'), []);
  const handleCloseSheet = useCallback(() => {
    setMapState('context');
  }, []);


  // Shared by CountrySheet, DestinationSheet, SpotSheet AND ExploreSheet (see its own
  // onSnapStateChange, remapped to this shared vocabulary) — only one sheet is ever mounted
  // at a time, so a single ref tracks "is whichever sheet is currently open peeking."
  //
  // When the sheet's snap changes between peek (bottom-screen) and collapsed (half-screen),
  // the map SHIFTS by exactly as many screen pixels as the visible-window's centre moved —
  // it does NOT re-frame to any destination/country's default view. That distinction is the
  // whole point: a re-frame has a target (computed from the selection, or "world" if there
  // is none for Explore) and can relocate the map to somewhere the user didn't ask to go — a
  // shift has no target at all, it just keeps whatever the user was already looking at
  // centred in the new window. It literally cannot send the user home, because it never
  // computes where "home" is. That also means it's blind to what's selected, so it applies
  // uniformly to all four sheets and needs no `selectedX ? ... : ...` branching.
  //
  // "Window centre" here is the vertical midpoint of the map that's actually visible below
  // the sheet: y 0 to H/2 at half-screen (matching every sheet's own COLLAPSED_Y), y 0 to
  // (mapViewH − PEEK_STRIP_H) at bottom-screen. moveBy takes raw screen pixels (it's a
  // synthetic drag internally), which is exactly the right primitive for a pixel delta that
  // has no geographic meaning of its own.
  const handleSheetSnapStateChange = useCallback((state: 'peek' | 'collapsed' | 'full') => {
    const prev = sheetSnapStateRef.current;
    setSheetSnapState(state);

    // prev === state: sheets report their snap on mount too, and a fresh selection's initial
    // report always matches what was just set synchronously — without this guard, every new
    // selection would also trigger a (zero-magnitude, but still real) camera animation.
    // prev/state === 'full': no map is visible at full-screen, so there's nothing to shift.
    if (prev === state || prev === 'full' || state === 'full') return;
    // The snap was a SIDE EFFECT of the user's own map gesture (panning auto-peeks the open
    // sheet) — shifting the camera here would fight the pan already in their hand.
    if (suppressFrameSyncRef.current) return;
    // The user has already deliberately panned/zoomed away from home (either return-prompt is
    // currently showing) — skip the shift entirely rather than just protecting `home` from
    // it. Two reasons:
    //  1. The shift is a real, non-trivial camera displacement (a few tenths of a degree at
    //     destination zoom — a meaningful fraction of the 45%-of-screen pan-away threshold),
    //     so even leaving `home` untouched, applying it can nudge `region` back close enough
    //     to `home` to silently cross back under the threshold and hide the arrow anyway —
    //     home never got cleared, the map just got walked back into agreeing with it.
    //  2. "Keep the visible content anchored as the window resizes" only makes sense while
    //     the camera is still showing what the sheet opened to. Once the user has taken the
    //     camera somewhere themselves, any further automatic nudge is itself the map moving
    //     without being asked — which is exactly what "the location of the map shouldn't
    //     move" was meant to rule out, not just re-framing to a default view.
    if (returnPromptVisibleRef.current || destReturnPromptVisibleRef.current) return;

    const mapViewH = mapViewHRef.current || (H - BOTTOM_TAB_H);
    const windowCentreY = (s: 'peek' | 'collapsed') =>
      (s === 'peek' ? Math.max(40, mapViewH - PEEK_STRIP_H) : H / 2) / 2;
    const dy = windowCentreY(state as 'peek' | 'collapsed') - windowCentreY(prev as 'peek' | 'collapsed');
    if (Math.abs(dy) < 1) return;

    // Not away (checked above), so home is still accurate to shed and let the next idle
    // recapture wherever this settles — see fitCountryDefaultView's callers for the same
    // reasoning.
    countryHomeRegionRef.current = null;
    setCountryHomeRegion(null);
    destHomeRegionRef.current = null;
    setDestHomeRegion(null);
    destFlightInterruptedRef.current = false;

    cameraRef.current?.moveBy({ x: 0, y: dy, animationMode: 'easeTo', animationDuration: SHEET_SNAP_MS });
  }, [setSheetSnapState]);

  // ── Spot selection ──────────────────────────────────────────────────────────
  const handleSpotPress = useCallback((spot: Spot) => {
    const dest = DESTINATIONS.find(d => d.id === spot.destinationId);
    if (!dest) return;
    // Provenance: entered from an open destination context → back goes up to it. Entered by
    // free-zooming to spot level and tapping a teardrop with nothing selected → the X pill
    // zooms out to the destination's default view instead (the parent destination still gets
    // selected below as internal bookkeeping — SpotSheet needs it — but the user never
    // visited it, so back must not open its sheet). handleSearchSelect overrides after.
    if (!selectedDestRef.current) {
      setSpotOrigin('map');
    } else {
      setSpotOrigin('destination');
    }
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    // Keep the parent destination selected so the country/destination breadcrumb stays present.
    if (selectedDestRef.current?.id !== dest.id) {
      dropCountryIfForeign(dest.country);
      selectedDestRef.current = dest;
      setSelectedDest(dest);
    }
    // Re-tapping the ALREADY-focused spot's own pin (e.g. after panning away, which auto-peeks
    // the sheet) doesn't change spotFocusId — SpotSheet's carousel-jump effect is keyed off
    // that prop, so it never fires, and the sheet stays peeking instead of coming back to
    // half-screen. Bump collapseSignal explicitly to cover exactly that case (SpotSheet reacts
    // to it from 'peek' too, not just 'full' — see its own comment).
    if (spotFocusId === spot.id) setCollapseSheetSignal(c => c + 1);
    selectedSpotRef.current = spot;
    setSelectedSpot(spot);
    // Kick off SpotSheet's own hero-photo fetch right now, in parallel with the sheet's
    // slide-up/camera animation, instead of waiting for it to mount a render cycle later.
    prefetchWikiThumbnail(`spot_${spot.id}`, photoCache, spot.name, 900);
    setSpotFocusId(spot.id);
    setMapState('context');
    setZoomedIntoDestination(true);
    showBreadcrumb(true);
    // Synchronous reset — see handleMarkerPress's own comment for why this can't wait on
    // SpotSheet's mount effect to report back. Mirrors the snap it will choose: peeked if the map is being interacted with.
    setSheetSnapState(isMapInteracting() ? 'peek' : 'collapsed');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // 280ms (down from 500) — tapping a new spot pin, the carousel itself is also sliding to
    // match (see SpotSheet's own focusSpotId effect), and the slower of the two dominates how
    // sluggish the combined transition reads.
    fitSpotView(spot, 'easeTo', 280);
  }, [showBreadcrumb, fitSpotView, spotFocusId, dropCountryIfForeign]);

  // Fired as the user swipes the spot carousel. Follows the focused spot with the map
  // (pan + pin highlight) WITHOUT touching spotFocusId, so the carousel isn't reset.
  const handleActiveSpotChange = useCallback((spot: Spot) => {
    selectedSpotRef.current = spot;
    setSelectedSpot(spot);
    // 200ms (down from 400) — this fires continuously as the carousel settles on each card,
    // so it needs to keep pace with a quick swipe rather than visibly trail behind it.
    fitSpotView(spot, 'easeTo', 200);
  }, [fitSpotView]);

  // Provenance back for a laterally-entered spot ('map'/'search' origins, i.e. the back pill
  // shows a bare X rather than "‹ Name"): tear down the whole selection stack WITHOUT opening
  // the intermediate destination sheet the user never visited, but zoom out to the parent
  // destination's own default view rather than the pre-jump camera — "step back one level",
  // matching the drilled-down (‹ Name) case's zoom target even though no sheet reopens here.
  // The Explore sheet remounts (slide-up entrance) once the deferred clear below lands.
  const handleCloseSpotToDestinationView = useCallback(() => {
    const spot = selectedSpotRef.current;
    const dest = selectedDestRef.current
      ?? (spot ? DESTINATIONS.find(d => d.id === spot.destinationId) : undefined);
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
    setMapState('world');
    setZoomedIntoDestination(false);
    showBreadcrumb(false);
    selectedCountryRef.current = null;
    // Cleared synchronously — see handleCloseCountry for the full reasoning. In short: this
    // state gates the sheet, the border highlight and the Explore sheet that replaces them,
    // so deferring it made the whole exit read as laggy. The 280ms was there to let the back
    // pill fade out first, but the pill is a far smaller thing to lose than a responsive
    // dismiss, and ExploreSheet animates itself in over the swap regardless.
    selectedDestRef.current = null;
    setSelectedDest(null);
    setSelectedCountry(null);
    if (dest) fitDestinationDefaultView(dest, 'easeTo', 'topHalf');
  }, [showBreadcrumb, fitDestinationDefaultView]);

  // Closing the spot sheet INTO its parent destination sheet (still selected), re-centering
  // the camera on the destination's default zoomed-in view. `toCollapsed` (set when this
  // fires from a swipe-down while the spot carousel was itself collapsed) lands the
  // destination sheet in its own collapsed view too. Only ever called for deliberate
  // upward navigation — the provenance router below decides whether "close" means this.
  const handleCloseSpotToDestination = useCallback((toCollapsed?: boolean, landOnFull?: boolean) => {
    // Deliberate upward move from a laterally-entered spot: the destination inherits the
    // lateral provenance, so its own X pill zooms out to the country's default view instead
    // of reopening a country sheet the user never visited.
    if (spotOrigin !== 'destination') setDestOrigin('map');
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
    setMapState('context');
    if (toCollapsed) setDestInitialSnap('collapsed');
    // Synchronous reset — see handleMarkerPress's own comment for why. Mirrors whatever
    // snap state the remounting DestinationSheet will actually open to: 'full' only for
    // handleGoToListView's landOnFull case (which also sets destInitialSnap='full' itself,
    // just as React state — this ref needs the answer synchronously, before that commits).
    setSheetSnapState(landOnFull ? 'full' : 'collapsed');
    if (selectedDest) {
      // Neither snap this can land on leaves the bottom-screen strip showing, so 'topHalf'.
      fitDestinationDefaultView(selectedDest, 'easeTo', 'topHalf');
    }
  }, [spotOrigin, selectedDest, fitDestinationDefaultView, setSheetSnapState]);

  // Spot close/back, provenance-routed: entered from the destination → return to it;
  // entered laterally (map tap at spot zoom, or search) → back to the map as it was.
  const handleCloseSpot = useCallback((toCollapsed?: boolean) => {
    if (spotOrigin === 'destination') handleCloseSpotToDestination(toCollapsed);
    else handleCloseSpotToDestinationView();
  }, [spotOrigin, handleCloseSpotToDestination, handleCloseSpotToDestinationView]);

  // "List view" from the spot carousel — swap it for the destination sheet, opened straight
  // to its full-screen Spots grid rather than the usual collapsed compact card. Always a
  // deliberate move INTO the destination, so it bypasses the provenance router.
  const handleGoToListView = useCallback(() => {
    setDestInitialTab('spots');
    setDestInitialSnap('full');
    handleCloseSpotToDestination(undefined, true);
  }, [handleCloseSpotToDestination]);

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

  // Tells DestinationSheet's own continuous writer (still mounted underneath, possibly still
  // moving) to back off while SpotSheet owns the pill's position instead — SpotSheet now
  // writes to upPillBottomSV directly and continuously itself (see its own pillOffsetSV prop
  // below), matching DestinationSheet's own lockstep-with-the-drag behavior.
  useEffect(() => {
    spotOwnsPillSV.value = !!selectedSpot;
  }, [selectedSpot]);


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
    // handleCountryPress clears selectedDest, mapState, and zoomedIntoDestination directly.
    // 'flyTo' — same big-pan/deep-zoom-out case as handleCloseDestinationSheetToCountry.
    // openPeeked — this is the breadcrumb's back-return, so the country sheet comes up in
    // bottom-screen and the map is framed for the whole visible screen rather than its top
    // half. (The breadcrumb is only even visible in that state; see crumbGateStyle.)
    handleCountryPress(cluster, 'flyTo', true);
  }, [selectedDest, handleCountryPress]);

  // Provenance back for a laterally-entered destination ('map'/'search' origin, i.e. the back
  // pill shows a bare X rather than "‹ Country"): tear down the whole selection stack, and
  // zoom out to the parent country's own default view — same "step back one level" as the
  // spot equivalent above, and the same cluster-rebuilding handleCloseDestinationSheetToCountry
  // uses, just without actually selecting the country (no sheet reopens here).
  const handleCloseDestinationToCountryView = useCallback(() => {
    if (!selectedDest) return;
    const dest = selectedDest;
    setMapState('world');
    setZoomedIntoDestination(false);
    showBreadcrumb(false);
    selectedSpotRef.current = null;
    setSelectedSpot(null);
    setSpotFocusId(null);
    if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
    // Synchronous, same reasoning as handleCloseCountry.
    selectedDestRef.current = null;
    setSelectedDest(null);
    // Search (unlike a drilled-down entry) fabricates a selected country to key pin
    // eligibility while the destination is open — see handleSearchSelect. Left set, it makes
    // the country sheet reappear here (this path deliberately opens no sheet) with the
    // breadcrumb already hidden and the map's search bar visible but untouchable. Cleared
    // the same way handleCloseSpotToDestinationView does; the Explore sheet remounts instead.
    selectedCountryRef.current = null;
    setSelectedCountry(null);
    // Suppress the south-limit glide-back while this zooms out — see suppressSouthLimitRef's own
    // comment (and handleCloseCountry, which does the same) for why it'd otherwise stall the zoom-out.
    suppressSouthLimitRef.current = true;
    if (suppressSouthLimitTimerRef.current) clearTimeout(suppressSouthLimitTimerRef.current);
    suppressSouthLimitTimerRef.current = setTimeout(() => { suppressSouthLimitRef.current = false; }, 650);
    // Not a fit to the parent country: countries vary too much in size (closing the Grand Canyon
    // would fling out to the whole USA, closing a Monaco-sized place to barely anything). Instead
    // zoom out to HALF the destination's own default zoom level, centred on the destination in the
    // area above the Explore sheet's bottom strip ('full' framing) — the same step-back rule the
    // country close uses, applied one level down.
    fitDestinationDefaultView(dest, 'easeTo', 'full', 600, 0.5);
  }, [selectedDest, showBreadcrumb, fitDestinationDefaultView]);

  // Closing the destination sheet INTO its country view. `toCollapsed` (set when this
  // fires from a swipe-down while the destination sheet was itself collapsed) lands the
  // country sheet in its own collapsed view too. Only ever called for deliberate upward
  // navigation — the provenance router below decides whether "close" means this.
  const handleCloseDestinationSheetToCountry = useCallback((toCollapsed?: boolean) => {
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
    // handleCountryPress clears selectedDest/mapState/zoomedIntoDestination and calls
    // fitCoords. 'flyTo' — a destination zooming back out to its full country's bounds is
    // the same big-pan/deep-zoom combination pure easeTo reads badly for (see
    // animateCamera's own comment on the equivalent zoom-IN case).
    handleCountryPress(cluster, 'flyTo');
  }, [selectedDest, savedDestinations, handleCountryPress]);

  // Destination close/back, provenance-routed: drilled down from the country → back up to it;
  // entered laterally (map pin tap with nothing selected, or search) → zoom out to half the
  // destination's own zoom level instead, no fabricated country sheet in between.
  const handleCloseDestinationSheet = useCallback((toCollapsed?: boolean) => {
    if (destOrigin === 'country') handleCloseDestinationSheetToCountry(toCollapsed);
    else handleCloseDestinationToCountryView();
  }, [destOrigin, handleCloseDestinationSheetToCountry, handleCloseDestinationToCountryView]);

  // The breadcrumb's own back-return while a country (and no destination) is selected: just
  // re-centre the camera, leaving the sheet exactly where it is. So the framing has to follow
  // the sheet's CURRENT snap rather than assume one — in practice that's bottom-screen, since
  // panning the map (the thing that reveals this control) also peeks the sheet, but reading
  // the live state keeps the two in agreement however the user got here.
  const handleResetToCountry = useCallback(() => {
    if (!selectedCountryRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // "Home" was captured under whichever framing the country was first opened in, and the
    // two framings settle on cameras a good ~120px apart. Drop it so the next idle recaptures
    // wherever we actually land, otherwise every later pan-away check measures against a
    // position the user is no longer at. Safe to null: showReturnPrompt reads false while
    // it's unset, which is right — we're returning home — and the breadcrumb itself stays put
    // because the peeking sheet holds its gate open independently.
    countryHomeRegionRef.current = null;
    setCountryHomeRegion(null);
    fitCountryDefaultView(
      selectedCountryRef.current,
      'easeTo',
      sheetSnapStateRef.current === 'peek' ? 'full' : 'topHalf',
    );
  }, [fitCountryDefaultView]);

  const handleResetToDest = useCallback(() => {
    if (!selectedDest) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Deliberately a no-op on whatever sheet is currently showing (spot or destination) —
    // this breadcrumb segment only recenters the camera. It used to also close an open spot
    // sheet back to its destination, but that coupled an unrelated camera control to sheet
    // navigation and could leave the destination sheet failing to remount cleanly underneath.
    // This re-centers the camera WITHOUT changing what's selected — the sheet (peeking or
    // not) should stay exactly as it is. Suppress handleCameraChanged's peek-push for the
    // duration so the camera-changed events this animation itself fires can't be misread as
    // a fresh user gesture and shift the sheet's snap state as a side effect.
    suppressPeekPushRef.current = true;
    if (suppressPeekPushTimerRef.current) clearTimeout(suppressPeekPushTimerRef.current);
    suppressPeekPushTimerRef.current = setTimeout(() => { suppressPeekPushRef.current = false; }, 650);
    // Framing follows the sheet's CURRENT snap, since this handler deliberately doesn't move
    // it — same reasoning as handleResetToCountry. Home is dropped so the next idle recaptures
    // at whatever framing we land in, otherwise later pan-away checks measure against a
    // position the camera has left; destFlightInterruptedRef is cleared so that capture is
    // actually allowed to happen.
    destHomeRegionRef.current = null;
    setDestHomeRegion(null);
    destFlightInterruptedRef.current = false;
    fitDestinationDefaultView(
      selectedDest,
      'easeTo',
      sheetSnapStateRef.current === 'peek' ? 'full' : 'topHalf',
    );
  }, [selectedDest, fitDestinationDefaultView]);

  const handleCloseCountry = useCallback(() => {
    if (!selectedCountryRef.current) return;
    const cluster = selectedCountryRef.current;
    selectedCountryRef.current = null;
    showBreadcrumb(false);
    // Without this, mapState could be left at 'sheet' (set by onExpand whenever the country
    // sheet was viewed full-screen) with nothing to reset it back — the search bar's
    // pointerEvents gate (`mapState === 'world' && !selectedCountry`) would then stay
    // 'none' even after the country closes, making it look unresponsive/never came back.
    setMapState('world');
    // Cleared synchronously, not on a 280ms timer as this used to be. That delay existed to
    // let a sheet slide out first, but nothing slides on this path: the X pill calls straight
    // in here rather than going through CountrySheet's own dismiss, so those 280ms were dead
    // latency — and `selectedCountry` gates all three things the user sees at once (the
    // border highlight, the country sheet, and the Explore sheet that replaces it), so the
    // whole close read as laggy. ExploreSheet still animates itself up from off-screen on
    // mount, which covers the swap.
    setSelectedCountry(null);
    // Suppress the south-limit glide-back for the duration of this animation — see
    // suppressSouthLimitRef's own comment for why it'd otherwise stall the zoom-out.
    suppressSouthLimitRef.current = true;
    if (suppressSouthLimitTimerRef.current) clearTimeout(suppressSouthLimitTimerRef.current);
    suppressSouthLimitTimerRef.current = setTimeout(() => { suppressSouthLimitRef.current = false; }, 650);
    // Zoom out to HALF the zoom level of the country's own default (topHalf-framed) view,
    // rather than always the fixed world/globe home view — reads as "step back from this
    // country" rather than "reset the whole map", matching the destination/spot X cases'
    // "zoom out to the parent's default view" rule one level further (there's no parent above
    // a country, so this halves the zoom instead of jumping to a specific level).
    // fitCountryDefaultView's own bounds-fit is native and doesn't expose a JS zoom value
    // directly, but by the time X is pressed on an open country sheet, that fit has already
    // settled and been cached (see fitCountryDefaultView/handleMapIdle) — read the exact
    // value from there. The world-view fallback below only matters in the practically
    // unreachable case where the cache is missing (e.g. mapViewH changed underneath it).
    const mapViewH = mapViewHRef.current || (H - BOTTOM_TAB_H);
    const cached = countryCamCacheRef.current[`${cluster.countryCode}:topHalf`];
    if (cached && cached.mapH === mapViewH) {
      cameraRef.current?.setCamera({
        centerCoordinate: [cached.lng, cached.lat],
        zoomLevel: cached.zoom / 2,
        animationDuration: 600,
        animationMode: 'easeTo',
      });
      return;
    }
    animateCamera({ latitude: 20, longitude: regionRef.current.longitude, latitudeDelta: WORLD_HOME_LATDELTA, longitudeDelta: WORLD_HOME_LATDELTA }, 600);
  }, [showBreadcrumb, animateCamera]);

  // `openPeeked` is for returning UP to a country from a destination via the breadcrumb: the
  // sheet opens in bottom-screen/peek instead of half-screen, and the map is framed for the
  // whole visible screen to match. The two must move together — see fitCountryDefaultView.
  const handleCountryPress = useCallback((
    cluster: CountryCluster,
    cameraMode: 'easeTo' | 'flyTo' = 'easeTo',
    openPeeked = false,
  ) => {
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
    // Synchronous reset — see handleMarkerPress's own comment for why this can't wait on
    // CountrySheet's own mount effect to report back.
    setCountryInitialSnap(openPeeked ? 'peek' : undefined);
    setSheetSnapState(openPeeked || isMapInteracting() ? 'peek' : 'collapsed');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fitCountryDefaultView(cluster, cameraMode, openPeeked ? 'full' : 'topHalf');
    // Kick off CountrySheet's own header-photo fetch right now, in parallel with the sheet's
    // slide-up/camera animation, instead of waiting for CountrySheet to mount and run its own
    // effect a render cycle later — same top-destination lookup CountrySheet uses for its
    // header (its own article is almost always just the flag, not a real photo; see its
    // header-photo effect's comment).
    const topDest = DESTINATIONS
      .filter(d => d.country === cluster.country)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))[0];
    const cacheKey = `country_${cluster.countryCode}`;
    if (topDest) prefetchWikiThumbnail(cacheKey, photoCache, topDest.name, 900, cluster.country);
    else prefetchWikiThumbnail(cacheKey, photoCache, cluster.country, 900);
  }, [showBreadcrumb, animateCamera, fitCountryDefaultView, setSheetSnapState]);

  // Closing from the back pill's X while a sheet is half-screen or bottom-screen: let it slide
  // off the bottom first (exitSignal → the sheets' own slide-out), and only then run the actual
  // close — which unmounts it — so it leaves rather than vanishing. Full-screen never gets here
  // (the pill collapses instead), but run immediately if it ever does.
  const [sheetExitSignal, setSheetExitSignal] = useState(0);
  const sheetExitingRef = useRef(false);
  const SHEET_EXIT_MS = 180;
  const closeWithSheetExit = useCallback((action: () => void) => {
    if (sheetExitingRef.current) return;
    if (sheetSnapStateRef.current === 'full') { action(); return; }
    sheetExitingRef.current = true;
    setSheetExitSignal(c => c + 1);
    setTimeout(() => { sheetExitingRef.current = false; action(); }, SHEET_EXIT_MS + 20);
  }, []);

  // Back pill: one level up — spot → destination, destination → country, country → world
  const handleBackNav = useCallback(() => {
    if (pressBlocked()) return;   // a pinch finger lifting over the X is not a close
    closeWithSheetExit(() => {
      if (selectedSpot) {
        handleCloseSpot();
      } else if (selectedDest) {
        handleCloseDestinationSheet();
      } else {
        handleCloseCountry();
      }
    });
  }, [selectedSpot, selectedDest, handleCloseSpot, handleCloseDestinationSheet, handleCloseCountry, closeWithSheetExit]);

  // Back pill, while the country/destination sheet is full-screen: instead of navigating up
  // a level, just collapse the currently open sheet to its bottom-screen carousel view.
  const handlePillCollapse = useCallback(() => {
    setCollapseSheetSignal(c => c + 1);
  }, []);

  // Builds the same CountryCluster shape handleCountryPress uses, for a given country —
  // shared by the destination/spot branches below so selectedCountry always reflects the
  // result's actual parent country before its pins/highlight are rendered.
  const buildCountryCluster = useCallback((country: string, countryCode: string): CountryCluster => {
    const dests = DESTINATIONS.filter(d => d.countryCode === countryCode);
    const center = getCountryCenter(countryCode);
    return {
      country,
      countryCode,
      latitude:     center?.latitude  ?? dests[0]?.coordinates.latitude  ?? 0,
      longitude:    center?.longitude ?? dests[0]?.coordinates.longitude ?? 0,
      count:        dests.length,
      minRank:      dests.length > 0 ? Math.min(...dests.map(d => d.rank)) : 1,
      visitedCount: dests.filter(d => savedDestinations[d.id]?.type === 'visited').length,
    };
  }, [savedDestinations]);

  const handleSearchSelect = useCallback((item: SearchResult) => {
    setExploreRestore(undefined);
    setSearchQuery('');
    setSearchFocused(false);
    // clear() as well as the state reset: the native field's own text can otherwise linger (or
    // be re-reported through onChangeText) when it's blurred in the same tick it's emptied.
    searchInputRef.current?.clear();
    searchInputRef.current?.blur();
    // Search is a lateral jump from wherever the user was — a destination/spot picked this
    // way has no country/destination sheet to climb back up into, so its own X pill zooms
    // out to the parent's default view instead, same as a map-tapped lateral entry.

    if (item.type === 'country') {
      prevCountryRef.current = selectedCountry;
      handleCountryPress(buildCountryCluster(item.country, item.countryCode));
    } else if (item.type === 'destination') {
      // handleMarkerPress (unlike handleCountryPress) never sets selectedCountry — it
      // relies on the country already being selected, which is only true for a real pin
      // tap (destination pins only show once their country is selected). Search can jump
      // straight to a destination from the world view, so without this, selectedCountry
      // stays stale/null and the country-scoped destination-pin-eligibility and boundary-
      // highlight logic elsewhere in this file ends up keyed to the wrong (or no) country.
      const cluster = buildCountryCluster(item.destination.country, item.destination.countryCode);
      selectedCountryRef.current = cluster;
      setSelectedCountry(cluster);
      handleMarkerPress(item.destination);
      // Override the origin handleMarkerPress just computed ('country', since the cluster
      // ref was set above) — this was a search jump, and back should restore the pre-jump
      // view captured at the top of this handler.
      setDestOrigin('search');
    } else {
      // Spot: same reasoning as the destination branch above — handleSpotPress never sets
      // selectedCountry either.
      const cluster = buildCountryCluster(item.destination.country, item.destination.countryCode);
      selectedCountryRef.current = cluster;
      setSelectedCountry(cluster);
      prevRegionRef.current = region;
      handleSpotPress(item.spot);
      setSpotOrigin('search');
    }
  }, [handleCountryPress, handleMarkerPress, handleSpotPress, region, selectedCountry, savedDestinations, buildCountryCluster]);

  // Tapping a destination card in the Explore feed (ExploreSheet/DiscoverScreen). Deliberately
  // does NOT set selectedCountry the way handleSearchSelect's destination branch does — that
  // was only ever there to keep country-scoped pin-eligibility logic elsewhere in this file
  // fed a real country instead of null, and every one of those call sites already falls back
  // to selectedDest's own country/countryCode when selectedCountry is unset (see eligibleDests
  // etc.). The one thing setting it ALSO does, as an unavoidable side effect, is draw the
  // country boundary highlight (that block renders on selectedCountry alone, independent of
  // whether a destination is also selected) — which reads as "picking a destination selected
  // its whole country" for what's really just a direct jump to one place. Leaving it unset
  // avoids that without losing the pin-eligibility behavior. selectedCountryRef.current is
  // already null here regardless (ExploreSheet only mounts while nothing is selected), so
  // handleMarkerPress's own provenance check naturally resolves to 'map'; overriding to
  // 'search' below (same as the actual search flow) is what makes back restore this exact
  // view instead of climbing a hierarchy never descended.
  const handleExploreSelect = useCallback((dest: Destination) => {
    handleMarkerPress(dest);
    setDestOrigin('search');
  }, [handleMarkerPress]);

  // The Explore sheet's props are all STABLE on purpose. MapScreen re-renders every ~50ms while the
  // camera moves, and the sheet (with its ~50 photo cards) re-rendering each time was real JS
  // work competing with the map's own pin updates — inline arrow props here defeated React.memo.
  const exploreRestoreRef = useRef(exploreRestore);
  exploreRestoreRef.current = exploreRestore;
  const handleExploreSnapChange = useCallback((state: 'peek' | 'collapsed' | 'full') => {
    exploreSnapRef.current = state;
    handleSheetSnapStateChange(state);
  }, [handleSheetSnapStateChange]);
  const handleExploreMountSnap = useCallback((state: 'peek' | 'collapsed' | 'full') => {
    exploreSnapRef.current = state;
    // A fresh (non-restored) sheet starts at the top of its feed.
    if (!exploreRestoreRef.current) exploreScrollYRef.current = 0;
  }, []);
  const handleExploreScrollY = useCallback((y: number) => { exploreScrollYRef.current = y; }, []);
  const handleExploreSearchPress = useCallback(() => {
    // Opened from the sheet's own bar (which sits exactly where this one does, already
    // full-width): skip the width/fade animations so the hand-off is seamless.
    searchFromSheetRef.current = true;
    searchInputRef.current?.focus();
  }, []);

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

    // The user just started panning/pinching the map — drop whichever destination/spot
    // sheet is open down to its "peek" state (if it isn't already), so it gets out of the
    // way while still showing what's selected via the thin hero-image strip.
    if (isGestureActive && !wasMapGestureActiveRef.current && sheetSnapStateRef.current !== 'peek'
        && !suppressPeekPushRef.current) {
      setPeekSheetSignal(c => c + 1);
      // This peek is a side effect of the user's own map gesture, NOT them dragging the
      // sheet — so the framing sync in handleSheetSnapStateChange must sit it out, or it
      // would fly the camera back to the country's default view mid-pan.
      suppressFrameSyncRef.current = true;
      if (suppressFrameSyncTimerRef.current) clearTimeout(suppressFrameSyncTimerRef.current);
      suppressFrameSyncTimerRef.current = setTimeout(() => {
        suppressFrameSyncRef.current = false;
        suppressFrameSyncTimerRef.current = null;
      }, 700);
    }
    // Rising-edge check — minimize the layers pill if it's expanded, so it doesn't sit
    // open over the map while the user navigates.
    if (isGestureActive && !wasMapGestureActiveRef.current) {
      if (showMapMenuRef.current) { showMapMenuRef.current = false; setShowMapMenu(false); }
      // The user grabbed the map while a destination's initial fly-to was still in flight —
      // mark it so the next onMapIdle (which will reflect wherever THEIR gesture ends, not
      // the destination's real home) doesn't get captured as destHomeRegion.
      if (suppressDestReturnPromptRef.current) destFlightInterruptedRef.current = true;
      // Likewise for a country fit still in flight — the user owns the camera now, so drop the pending capture
      // rather than have the idle after THEIR pan recorded as the country's default camera.
      countryCacheArmRef.current = null;
    }
    if (isGestureActive) {
      // Throttled off a plain ref: READING a shared value's .value on the JS thread waits on the UI
      // runtime, which is busy with the gesture itself — doing that on every camera event would
      // stall this handler.
      const t = Date.now();
      if (t - mapGestureStampRef.current > 100) {
        mapGestureStampRef.current = t;
        mapGestureAtSV.value = t;
      }
    }
    wasMapGestureActiveRef.current = isGestureActive;
    if (isGestureActive) mapMovedThisTouchRef.current = true;

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

    // This is the PRIMARY path driving the arrow — it fires on every raw native
    // camera-changed event (unthrottled, straight from the animation), well before the
    // throttled `region` state (and the showDestReturnPrompt memo that reads it) ever
    // updates. destHomeRegionRef is now set synchronously at tap-time (see
    // handleMarkerPress), so without this same suppression check, the very first
    // camera-changed frame of the fly-to — reporting a live position still near the OLD
    // camera, nowhere near the brand-new destHomeRegionRef target yet — read as
    // "zoomed out"/"panned away" and fired the arrow on immediately. Gating
    // showDestReturnPrompt alone (the fallback effect below) wasn't enough, since this
    // block runs first and independently writes to the same shared value.
    const dh = destHomeRegionRef.current;
    if (selectedDestRef.current && dh && !suppressDestReturnPromptRef.current) {
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
    setCamZoom(state.properties.zoom);
  }, [returnPromptProgress, destReturnPromptProgress, mapGestureAtSV]);

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
    setCamZoom(state.properties.zoom);

    // Captures the camera a country fit landed on, so later visits can go straight there (see
    // fitCountryDefaultView). Only accepted once the fit's duration has elapsed, and only while that country
    // is still the selection, so an idle that actually reflects a user pan or a newer navigation never
    // poisons the cache.
    const arm = countryCacheArmRef.current;
    if (arm && Date.now() >= arm.at && selectedCountryRef.current?.countryCode === arm.code
        && !selectedDestRef.current && !selectedSpotRef.current) {
      countryCacheArmRef.current = null;
      countryCamCacheRef.current[arm.key] = {
        lng: center[0], lat: center[1], zoom: state.properties.zoom,
        mapH: mapViewHRef.current || (H - BOTTOM_TAB_H),
      };
    }

    // Captures the REAL settled camera bounds as destHomeRegion — see handleMarkerPress's
    // own comment for why this is observed rather than synthesized. Only accepted when this
    // idle plausibly reflects the destination's OWN fly-to settling naturally: not yet
    // captured, not a wide country-view idle, and — critically — the user didn't grab the
    // map before it landed (destFlightInterruptedRef), which would make this idle reflect
    // their gesture's end position instead of the destination's real home.
    if (selectedDestRef.current && !destHomeRegionRef.current && newRegion.latitudeDelta < 2
        && !destFlightInterruptedRef.current) {
      destHomeRegionRef.current = newRegion;
      setDestHomeRegion(newRegion);
      // Belt-and-suspenders: force arrow hidden immediately when home is captured.
      destReturnPromptProgress.value = 0; destReturnPromptVisibleRef.current = false;
      suppressDestReturnPromptRef.current = false;
      if (suppressDestReturnPromptTimerRef.current) {
        clearTimeout(suppressDestReturnPromptTimerRef.current);
        suppressDestReturnPromptTimerRef.current = null;
      }
    }

    // Capture the settled camera position as the "home" for the current country view.
    //
    // Not while a country fit is still in flight (its capture is armed but not yet due), so this can't
    // record a home the camera is still travelling toward — home must be the resting position, or the
    // breadcrumb's return arrow measures pan-away against a point the camera never rested on. The fit's own
    // completion fires another idle, which captures the real resting position.
    //
    // Deliberately NOT gated on mapState === 'world' (unlike the lastWorldRegionRef capture
    // below) — collapsing the country sheet from full-screen sets mapState to 'context' (see
    // handleCloseSheet) and nothing ever moves it back to 'world' while the country stays
    // selected with no destination drilled into, so gating this on it too meant home never
    // got (re-)captured for the rest of that country session — anything panned/zoomed away
    // afterward never showed the return arrow at all, since the check below reads it from
    // countryHomeRegionRef and just no-ops while that's still null. !selectedDest alone is
    // exactly what should scope this to "country selected, no destination" — selectedSpot
    // always implies selectedDest is also set, so it's covered by the same check.
    const capturePending = countryCacheArmRef.current !== null && Date.now() < countryCacheArmRef.current.at;
    if (selectedCountryRef.current && !selectedDest && !countryHomeRegionRef.current && !capturePending) {
      countryHomeRegionRef.current = newRegion;
      setCountryHomeRegion(newRegion);
    }

    if (mapState === 'world' && !selectedDest) {
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

  // Exit-fade tracking: pills/photos dropped from the plan linger for PIN_EXIT_MS fading
  // out (see useExitingItems/FadePin) instead of vanishing on the next frame.
  const renderedCountryPills = useExitingItems(countryPills, c => c.country);

  const countryPillMarkers = useMemo(() => renderedCountryPills.map(({ item: cluster, exiting }) => {
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
    // An unvisited country's pill has no border until it is selected; then it wears a light-gray wrap-around border
    // (a visited pill's is green), plus a white glow; a selected VISITED country's glow is green.
    const isUnvisitedPlain = !isClusterVisited && isSelectedPill;
    return (
      <MapboxGL.MarkerView
        key={cluster.country}
        coordinate={[cluster.longitude, cluster.latitude]}
        // The selected country's pill must not be hidden by Mapbox's marker-collision pass (the
        // default). Others keep it: their overlaps are resolved by the plan, and this way a pill
        // the selected one sits on can still be dropped natively as a backstop.
        allowOverlap={isSelectedPill}
      >
        <FadePin exiting={exiting}>
          {/* The selected country's pill is inert: it persists while zoomed out, so a pinch or pan
              that ends over it would otherwise count as a tap and re-select the country — resetting
              its sheet to half-screen and flying the camera back. (Same reason the selected
              destination's pin is inert.) The breadcrumb's return button is the way back. */}
          <Pressable
            disabled={exiting || isSelectedPill}
            onPressIn={() => { lastCountryPressRef.current = Date.now(); }}
            onPress={() => { if (pressBlocked()) return; prevCountryRef.current = selectedCountry; handleCountryPress(cluster); }}
          >
            <View style={styles.countryPill}>
              {/* Card first so circle (declared last) renders on top */}
              <View style={[
                styles.countryPillCard,
                isSelectedPill && (isClusterVisited ? styles.countryPillCardGlow : styles.countryPillCardGlowWhite),
                isVisitedHighlighted && styles.countryPillCardBorder,
                isUnvisitedPlain && styles.countryPillCardBorderGray,
              ]}>
                <Text style={styles.countryPillName} numberOfLines={1}>{cluster.country}</Text>
              </View>
              <View style={[
                styles.countryPillCircle,
                isSelectedPill && (isClusterVisited ? styles.countryPillCircleGlow : styles.countryPillCircleGlowWhite),
              ]}>
                <View style={styles.countryPillFlagClip}>
                  <Image
                    source={{ uri: `https://flagcdn.com/w160/${cluster.countryCode.toLowerCase()}.png` }}
                    style={styles.countryPillFlagImg}
                    resizeMode="cover"
                  />
                </View>
                {(isSelectedPill || isVisitedHighlighted || isUnvisitedPlain) && (
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
                      <View style={isUnvisitedPlain ? styles.countryPillFlagRingCirclePlain : styles.countryPillFlagRingCircle} />
                    </View>
                    <View style={isUnvisitedPlain ? styles.countryPillFlagRingBarTopPlain : styles.countryPillFlagRingBarTop} />
                    <View style={isUnvisitedPlain ? styles.countryPillFlagRingBarBottomPlain : styles.countryPillFlagRingBarBottom} />
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
        </FadePin>
      </MapboxGL.MarkerView>
    );
  }), [renderedCountryPills, selectedCountry, handleCountryPress, visitedCountryCodeSet]);

  // Promoted photo destinations, excluding any destination the camera is currently inside
  // of at spot zoom (its spot pins represent it instead; zoomedIntoDestIds) — selected or
  // not. The selected destination is NOT separately excluded here: destPinPlan's own
  // isForced already puts it in photoIds unconditionally, so once the camera zooms back out
  // past zoomedIntoDestIds' range it naturally falls through to a normal photo pin, same as
  // any other destination — rather than the old blanket "selected ⇒ never a photo pin"
  // exclusion, which left it stuck as a plain stamp dot at every zoom past that range (there
  // was no path back to a photo pin once zoomedIntoDestIds no longer covered it).
  const promotedDests = useMemo(() => destItems
    .filter(item => !hiddenDestIds.has(item.dest.id) && destPinPlan.photoIds.has(item.dest.id))
    .map(item => item.dest)
    .sort((a, b) => b.rank - a.rank), // rank=1 renders last (on top)
  [destItems, destPinPlan, hiddenDestIds]);
  const renderedPhotoDests = useExitingItems(promotedDests, d => d.id);

  const destPhotoMarkers = useMemo(() => renderedPhotoDests
    .map(({ item: dest, exiting }) => {
      const saved = savedDestinations[dest.id];
      const isVisited  = saved?.type === 'visited';
      const spotCount  = visitedSpotCountByDest[dest.id] ?? 0;
      const isSelectedDest = selectedDest?.id === dest.id;
      return (
        <MapboxGL.MarkerView
          key={dest.id}
          coordinate={[dest.coordinates.longitude, dest.coordinates.latitude]}
          // Only the SELECTED destination's pin opts out of Mapbox's marker-collision pass (the
          // default, allowOverlap={false}, hides whichever marker collides), so it can't drop out
          // and pop back while zooming out. Every other photo pin MUST keep that pass: destPinPlan
          // resolves collisions on its own planning scale, which runs wider than the real screen
          // scale, so it lets through overlaps that native collision was quietly cleaning up —
          // turning it off for all of them filled the map with overlapping pins.
          allowOverlap={isSelectedDest}
        >
          <FadePin exiting={exiting}>
            {/* The selected destination's own pin is inert: it persists while zooming out, so a
                pinch that ends over it would otherwise "re-select" it, resetting its sheet to
                half-screen and flying the camera back. */}
            <Pressable disabled={exiting || isSelectedDest} onPress={() => { if (pressBlocked()) return; handleMarkerPress(dest); }}>
              <DestPin
                dest={dest} spotCount={spotCount}
                isVisited={isVisited}
                isSelected={isSelectedDest} pinState="photo"
              />
            </Pressable>
          </FadePin>
        </MapboxGL.MarkerView>
      );
    }),
  [renderedPhotoDests, selectedDest, savedDestinations, visitedSpotCountByDest, handleMarkerPress]);

  // Which sliding sheet is mounted right now. When it changes from one level to another, the incoming sheet is a
  // replacement for the one that was showing and starts where that one rested (see sheetPose) rather than from below
  // the screen. Read during render (the ref is only advanced after the commit), so it is a stable answer for the
  // render that mounts the new sheet.
  const sheetKind: 'country' | 'dest' | 'spot' | null =
    selectedSpot && selectedDest && spotFocusId ? 'spot'
    : mapState !== 'world' && selectedDest && !selectedSpot ? 'dest'
    : selectedCountry && !selectedDest ? 'country'
    : null;
  const prevSheetKindRef = useRef(sheetKind);
  const enterFromPrevious = prevSheetKindRef.current !== null && prevSheetKindRef.current !== sheetKind;
  useEffect(() => { prevSheetKindRef.current = sheetKind; }, [sheetKind]);


  return (
    <View
      style={styles.root}
      onLayout={e => { mapViewHRef.current = e.nativeEvent.layout.height; }}
      onTouchStart={handleRootTouchStart}
      onTouchEnd={handleRootTouchEnd}
      onTouchCancel={handleRootTouchEnd}
    >

      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      {styleResolved && (
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        // Globe at every zoom, never swapped. Mapbox's iOS SDK applies setProjection
        // instantly with no animated globe↔mercator transition (RNMBXMapView.swift), so
        // toggling this prop reads as a hard visual snap mid-flight. fitCountryDefaultView
        // is built around keeping this constant — see its own comment.
        projection="globe"
        rotateEnabled={false}
        pitchEnabled={false}
        {...(baseStyle
          ? { styleJSON: baseStyle }
          : { styleURL: MapboxGL.StyleURL.Light }
        )}
        onDidFinishLoadingMap={() => {
          setMapReady(true);
          // onDidFinishLoadingMap fires once the STYLE has loaded, but the globe's own
          // atmosphere/lighting shader keeps visibly settling for a bit after that — the
          // "shines white, then flashes" effect this delay is masking. There's no public event
          // for "the globe has visually settled," so a short fixed delay (chosen by eye,
          // comfortably past where the flash was observed to end) is the pragmatic fix, at the
          // cost of the app-loading screen staying up briefly after the map is technically
          // ready rather than exactly as long as necessary.
          if (onMapReady) setTimeout(onMapReady, 500);
        }}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onPress={() => {
          searchInputRef.current?.blur();
          setSearchFocused(false);
          if (showMapMenuRef.current) { showMapMenuRef.current = false; setShowMapMenu(false); }
        }}
        logoEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        attributionEnabled={false}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={CAMERA_DEFAULT_SETTINGS}
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
            Fill color depends on whether the selected country has been visited: the default
            emerald if so, gray if not. The BORDER (line) color keeps that
            same emerald for a VISITED country in both map views (it already reads clearly
            against satellite imagery) — only the unvisited gray border switches to white in
            satellite view, where the dark imagery leaves gray hard to see; standard map view
            keeps the existing gray border unchanged either way. */}
        {selectedCountry && (() => {
          const selectedIsVisited = visitedCountryCodeSet.has(selectedCountry.countryCode);
          const fillColor = selectedIsVisited ? '#22C55E' : '#FFFFFF';
          const lineColor = selectedIsVisited
            ? '#16A34A'
            : (mapType === 'satellite' ? '#FFFFFF' : '#4B5563');
          // A 10% tint over the whole country: emerald if visited, white if not.
          const fillOpacity = 0.10;
          // Unvisited in standard map view: the outline itself is white (as in satellite view) with a dark slate casing
          // drawn just under it, so it stays readable against the light land, water and green of the map. The halo (glow)
          // is white as well.
          const whiteCasedOutline = !selectedIsVisited && mapType !== 'satellite';
          const outlineColor = whiteCasedOutline ? '#FFFFFF' : lineColor;
          const glowColor = whiteCasedOutline ? '#FFFFFF' : lineColor;
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
                style={{ fillColor, fillOpacity }}
              />
              <MapboxGL.LineLayer
                id="countryGlowOuter"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ lineColor: glowColor, lineWidth: whiteCasedOutline ? 14 : 12, lineOpacity: whiteCasedOutline ? 0.22 : 0.08 }}
              />
              <MapboxGL.LineLayer
                id="countryGlowInner"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ lineColor: glowColor, lineWidth: whiteCasedOutline ? 7 : 6, lineOpacity: whiteCasedOutline ? 0.45 : 0.18 }}
              />
              <MapboxGL.LineLayer
                id="countryOutlineCasing"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ lineColor: '#1F2937', lineWidth: 2.6, lineOpacity: whiteCasedOutline ? 0.55 : 0 }}
              />
              <MapboxGL.LineLayer
                id="countryOutline"
                sourceLayerID="country_boundaries"
                filter={['==', ['get', 'iso_3166_1'], selectedCountry.countryCode]}
                belowLayerID="destStampCircles"
                style={{ lineColor: outlineColor, lineWidth: whiteCasedOutline ? 1.5 : 2, lineOpacity: whiteCasedOutline ? 1 : 0.7 }}
              />
            </MapboxGL.VectorSource>
          );
        })()}

        {/* Stamp pins — always shown, single source regardless of selection state */}
        <MapboxGL.ShapeSource
          id="destStamps"
          shape={stampGeoJSON}
          onPress={(e) => {
            const id = e.features[0]?.properties?.id as string | undefined;
            if (!id) return;
            const dest = DESTINATIONS.find(d => d.id === id);
            if (dest && !pressBlocked()) handleMarkerPress(dest);
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
              // Rank-staggered reveal (see stampOpacityExpr): targets are always exactly
              // 0 or 1, and these native transitions cross-fade a tier's dots over 300ms
              // whenever it flips — so dots are never left half-faded once the camera
              // settles, but tiers still fade in/out gradually rather than blinking.
              circleOpacity: stampOpacityExpr,
              circleStrokeOpacity: stampOpacityExpr,
              circleOpacityTransition: { duration: 300, delay: 0 } as any,
              circleStrokeOpacityTransition: { duration: 300, delay: 0 } as any,
            }}
          />
        </MapboxGL.ShapeSource>

        {/* All MarkerViews require the map style to be loaded before Mapbox can
            project coordinates to screen positions. Gate on mapReady. */}
        {mapReady && <>

{/* Country cluster pills — a stable, always-on layer for every country except the one
            currently selected (replaced by its breadcrumb pill instead). Memoized above so
            the marker instances are reused verbatim across pan re-renders. */}
        {countryPillMarkers}

        {/* Destination photo pins — the finalized priority+collision plan from destPinPlan.
            Everything else already has a stamp (CircleLayer above); nothing is ever hidden.
            Memoized above so pins don't re-sync (and flicker) on every pan frame. */}
        {destPhotoMarkers}

        {/* Spot pins — teardrop markers whose pointed tip sits on the exact coordinate.
            Solid-or-hidden like every other pin: visibility is a binary zoom cutoff
            (visibleSpots' SPOT_THRESHOLD gate) and the appearance/disappearance itself is
            the FadePin mount/exit cross-fade — never a continuous zoom-tied opacity, which
            could leave pins resting half-faded when the camera settled mid-ramp.
            Rendered after the country pills and destination photos. Not reordered when the
            selection changes: moving a keyed MarkerView means removing and re-adding its native view,
            which made pins blink. */}
        {renderedSpots.map(({ item: spot, exiting }) => {
          const isSelectedSpot = selectedSpot?.id === spot.id;
          const isVisitedSpot = !!savedSpots[spot.id];
          return (
            <SpotMarker
              key={spot.id}
              spot={spot}
              isVisited={isVisitedSpot}
              isSelected={isSelectedSpot}
              exiting={exiting}
              isSatellite={mapType === 'satellite'}
              labelSide={spotLabelPlan.get(spot.id) ?? 'left'}
              onPress={() => { if (pressBlocked()) return; handleSpotPress(spot); }}
            />
          );
        })}
        {/* The selected spot is drawn a second time on top of everything else. MarkerViews stack by when
            they were MOUNTED, not by JSX order, and reordering the keyed list would remove and
            re-add native views (the pins blinked when that was tried). So instead this identical
            copy is mounted after the rest — and re-keyed whenever the set of spot pins changes, so
            a pin that appears later can never end up over it. The original stays put underneath, so
            a re-mount of the copy is never visible. */}
        {selectedSpot && renderedSpots.some(r => r.item.id === selectedSpot.id && !r.exiting) && (
          <SpotMarker
            key={`top-${selectedSpot.id}-${renderedSpots.length}`}
            spot={selectedSpot}
            isVisited={!!savedSpots[selectedSpot.id]}
            isSelected
            exiting={false}
            instant
            isSatellite={mapType === 'satellite'}
            labelSide={spotLabelPlan.get(selectedSpot.id) ?? 'left'}
            onPress={() => handleSpotPress(selectedSpot)}
          />
        )}


        </>}
      </MapboxGL.MapView>
      )}

      {/* ── Search backdrop — white fill behind the focused search bar + results, so the
          search interface is the same whether opened from here or from the Explore sheet.
          Tapping the blank area closes search. Below the search wrap (zIndex 20). ────────── */}
      <Reanimated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'white', zIndex: 19 }, searchBackdropStyle]}
        pointerEvents={searchFocused ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { searchInputRef.current?.blur(); setSearchFocused(false); setSearchQuery(''); }}
        />
      </Reanimated.View>

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
              placeholder="Search countries, destinations, spots"
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => { setSearchFocused(true); setShowMapMenu(false); }}
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
        {searchFocused && (searchResults.length > 0 || searchQuery.trim().length > 0) && (
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
            <SearchResultRows query={searchQuery} results={searchResults} onSelect={handleSearchSelect} />
          </ScrollView>
        )}
      </Animated.View>

      {/* ── Breadcrumb (country + destination modes) ─────────────────────── */}
      {(selectedCountry || selectedDest) && (
        // Two nested views on purpose: the outer carries the Reanimated gate (panned-away /
        // peeking) and the inner keeps the existing core-Animated, native-driven entrance
        // fade. Merging a Reanimated style and a native-driven core-Animated style onto one
        // view throws "Attempting to run JS driven animation on animated node that has been
        // moved to native" — the same reason the back pill below is split in two.
        <Reanimated.View
          style={[styles.breadcrumbBar, { top: insets.top + 10 }, crumbGateStyle]}
          pointerEvents={crumbInteractive ? 'box-none' : 'none'}
        >
        <Animated.View
          style={{
            opacity: breadcrumbAnim,
            transform: [{ scale: breadcrumbScale }],
            alignItems: 'center',
          }}
          pointerEvents="box-none"
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
        </Reanimated.View>
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

{/* ── Explore sheet — the world-view default, replacing the old standalone Explore tab.
          Shown whenever nothing is selected; hidden the instant the user drills into a
          country/destination/spot, exactly like the other sheets are mutually exclusive
          with each other. ─────────────────────────────────────────────────────────────── */}
      {!selectedCountry && !selectedDest && !selectedSpot && !searchFocused && (
        <ExploreSheet
          collapseSignal={peekSheetSignal}
          onSnapStateChange={handleExploreSnapChange}
          onSelectDestination={handleExploreSelect}
          initialSnap={exploreRestore?.snap}
          onMountSnap={handleExploreMountSnap}
          initialScrollY={exploreRestore?.scrollY}
          mapGestureAtSV={mapGestureAtSV}
          onScrollYChange={handleExploreScrollY}
          onSearchPress={handleExploreSearchPress}
        />
      )}

{/* ── Country sheet ─────────────────────────────────────────────────── */}
      {selectedCountry && !selectedDest && (
        <CountrySheet
          cluster={selectedCountry}
          onClose={handleCloseCountry}
          onSelectDestination={handleMarkerPress}
          onExpand={handleSheetExpand}
          onCollapse={handleCloseSheet}
          pillOffsetSV={upPillBottomSV}
          pillOffsetLockedSV={spotOwnsPillSV}
          collapseSignal={collapseSheetSignal}
          peekSignal={peekSheetSignal}
          exitSignal={sheetExitSignal}
          isMapInteracting={isMapInteracting}
          isPressBlocked={pressBlocked}
          enterFromPrevious={enterFromPrevious}
          mapGestureAtSV={mapGestureAtSV}
          initialTab={countryInitialTab}
          initialSnap={countryInitialSnap}
          // Wasn't wired before — sheetSnapStateRef (shared with DestinationSheet/SpotSheet's
          // own peek-on-pan gate) went stale at whatever it last was BEFORE the country sheet
          // opened, and stayed stale for as long as the country sheet was shown (it has no
          // 'peek' state itself, so nothing ever corrected the ref back). The next
          // destination/spot sheet opened afterward could then read that stale value and
          // silently skip its own first peek-on-pan bump. CountrySheet already implements
          // and calls onSnapStateChange with its own 'collapsed'/'full' states — just never
          // had anywhere to report to.
          onSnapStateChange={handleSheetSnapStateChange}
        />
      )}

      {/* ── Unified destination sheet — hidden while a spot sheet is open on top */}
      {mapState !== 'world' && selectedDest && !selectedSpot && (
        <DestinationSheet
          destination={selectedDest}
          onClose={handleCloseDestinationSheet}
          onExpand={handleSheetExpand}
          onCollapse={handleCloseSheet}
          onSelectSpot={handleSpotPress}
          onCollapsedTopChange={setDestCardTop}
          pillOffsetSV={upPillBottomSV}
          pillOffsetLockedSV={spotOwnsPillSV}
          collapseSignal={collapseSheetSignal}
          peekSignal={peekSheetSignal}
          exitSignal={sheetExitSignal}
          isMapInteracting={isMapInteracting}
          isPressBlocked={pressBlocked}
          enterFromPrevious={enterFromPrevious}
          mapGestureAtSV={mapGestureAtSV}
          onSnapStateChange={handleSheetSnapStateChange}
          initialTab={destInitialTab}
          initialSnap={destInitialSnap}
        />
      )}

      {/* ── Spot sheet — swipeable carousel of the destination's spots, expandable to full */}
      {selectedSpot && selectedDest && spotFocusId && (
        <SpotSheet
          spots={spotsInDest}
          focusSpotId={spotFocusId}
          destination={selectedDest}
          onClose={handleCloseSpot}
          onExpand={handleSheetExpand}
          onCollapse={handleCloseSheet}
          onActiveSpotChange={handleActiveSpotChange}
          pillOffsetSV={upPillBottomSV}
          peekSignal={peekSheetSignal}
          exitSignal={sheetExitSignal}
          isMapInteracting={isMapInteracting}
          isPressBlocked={pressBlocked}
          enterFromPrevious={enterFromPrevious}
          mapGestureAtSV={mapGestureAtSV}
          onSnapStateChange={handleSheetSnapStateChange}
          onGoToList={handleGoToListView}
          onGoToDestination={handleCloseSpotToDestination}
          collapseSignal={collapseSheetSignal}
        />
      )}

      {/* ── Back pill — visible through collapsed/full for the country, destination, AND
          spot sheets now (each one's own close button was removed in favor of this pill
          gliding to take its place at full screen — see each sheet's own pillOffsetSV
          reaction). Rendered after the sheets above (not before) so it reliably paints on
          top of them, reinforcing its zIndex rather than depending on it alone. */}
      {(selectedCountry || selectedDest) && (
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
              style={mapState === 'sheet' ? styles.upPillBare : styles.upPill}
              onPress={mapState === 'sheet' ? handlePillCollapse : handleBackNav}
              hitSlop={6}
            >
              {mapState === 'sheet' ? (
                // Full-screen: a simple down arrow that collapses the sheet back to its
                // bottom-screen carousel view, instead of navigating up a level.
                <ChevronDown size={24} color="#374151" strokeWidth={2.5} />
              ) : (
                (() => {
                  // Provenance-aware target (see destOrigin/spotOrigin): a NAMED level
                  // renders "← Name"; a plain return-to-map (lateral entries, or a
                  // selected country whose only "up" is the world) renders a bare X —
                  // there's no meaningful level to name, it's just "dismiss this".
                  const backName = selectedSpot
                    ? (spotOrigin === 'destination'
                        ? (selectedDest?.name ?? selectedCountry?.country ?? null)
                        : null)
                    : selectedDest
                      ? (destOrigin === 'country' ? selectedDest.country : null)
                      : null;
                  return backName ? (
                    <>
                      <Text style={styles.upPillArrow}>←</Text>
                      <Text style={styles.upPillTxt}>{backName}</Text>
                    </>
                  ) : (
                    <X size={15} color="#374151" strokeWidth={2.5} />
                  );
                })()
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
  // Selected but unvisited: the same split glow as above, white (the gray border comes from countryPillCardBorderGray).
  countryPillCardGlowWhite: {
    shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 10,
    shadowOffset: { width: 6, height: 0 },
  },
  countryPillCircleGlowWhite: {
    shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 10,
    shadowOffset: { width: -6, height: 0 },
  },
  // Same border color as countryPillCardGlow, minus the shadow — used for every OTHER
  // visited country's pill, always (the selected country keeps the full glow above instead).
  countryPillCardBorder: { borderWidth: 1.5, borderColor: 'rgba(22,163,74,0.85)' },
  // Unvisited and selected: the same border and flag ring as a visited pill, in a light gray.
  countryPillCardBorderGray: { borderWidth: 1.5, borderColor: 'rgba(188,193,202,0.95)' },
  countryPillFlagRingCirclePlain: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(188,193,202,0.95)',
  },
  countryPillFlagRingBarTopPlain: {
    position: 'absolute', top: 0, left: 12,
    width: 12, height: 1.5, backgroundColor: 'rgba(188,193,202,0.95)',
  },
  countryPillFlagRingBarBottomPlain: {
    position: 'absolute', bottom: 0, left: 12,
    width: 12, height: 1.5, backgroundColor: 'rgba(188,193,202,0.95)',
  },
  countryPillName: { fontSize: 11, fontWeight: '600', color: '#111827', maxWidth: 90 },



  // Detached state chip ("Return to …")


  // Teardrop spot pin: rounded bubble atop a downward triangle whose tip marks the coordinate.
  // A bit more shadow than before (radius 4→6, opacity 0.22→0.28) so a white unvisited pin —
  // which no longer has a colored ring to separate it from a light basemap — still stands out.
  spotPinWrap: {
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  // Size/border-radius/border-color are all resolved per-pin (visited/selected) and passed
  // inline — see SpotPin.
  spotPinBubble: {
    backgroundColor: 'white', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  // Clips the fetched photo to the bubble's own round shape, inset by the border.
  spotPinImgClip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  // Row holding [label, pin] as normal flex siblings inside SpotMarker's one MarkerView —
  // see SpotMarker's own comment for why this replaced two earlier, more fragile attempts.
  spotMarkerRow: { flexDirection: 'row', alignItems: 'center', columnGap: SPOT_LABEL_GAP },
  spotPinLabelWrap: {},
  spotPinLabel: {
    fontSize: 12, fontWeight: '700', color: '#111827',
  },
  // Absolute white copies offset ±0.75px in each diagonal — halo trace, same trick as
  // DestPin's labelOutline (inverted colors: dark text needs a light halo here, not vice
  // versa, since this label sits directly over the map rather than inside a solid pin).
  spotPinLabelOutline: {
    position: 'absolute', top: 0, left: 0, right: 0,
    color: 'white',
  },

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
  // Gray on the focused state's white backdrop (matching the Explore sheet's own bar).
  searchBarFocused: { backgroundColor: '#E5E7EB' },
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
  // Full-screen's collapse arrow — a translucent circular outline around the icon, no
  // solid fill/shadow like the regular pill.
  upPillBare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
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
