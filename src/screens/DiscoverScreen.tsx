import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
// Gesture-handler's ScrollView (not core RN) — only a gesture-handler-aware ScrollView can
// participate in `simultaneousWithExternalGesture` on the parent ExploreSheet's own drag
// gesture, which is what lets that sheet tell "scroll the feed" apart from "drag the sheet
// itself" once this is embedded inside it instead of standing alone as its own tab.
import { ScrollView } from 'react-native-gesture-handler';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, interpolate, Extrapolation, SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import * as Location from 'expo-location';
import { useStore } from '../store';
import type { Destination } from '../types';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS } from '../data/spots';
import DestinationCard from '../components/Map/DestinationCard';

// The search bar mirrors MapScreen's own search bar exactly (same top offset, height, padding,
// radius, font) — this sheet's full-screen state is the same screen position, so tapping it
// hands straight off to that bar with nothing visibly moving. Only the fill differs (gray, to
// show against this sheet's white background) and the right inset (12, since the layers pill
// the map bar makes room for isn't shown here).
export const SEARCH_BAR_H = 44;
export const SEARCH_BAR_TOP_GAP = 10;   // below the safe-area top inset
const SEARCH_BELOW_GAP = 0;      // feed starts this far below the bar (the first section header adds its own top padding)
const SEARCH_FADE_H = 16;        // scrolled content fades out over this strip under the bar

// Distinct countries across the destination data (static, computed once).
const COUNTRY_COUNT = new Set(DESTINATIONS.map(d => d.countryCode)).size;


// ── Feed section definitions ───────────────────────────────────────────────
const FEED_SECTIONS: {
  id: string;
  title: string;
  emoji: string;
  filter: (d: Destination) => boolean;
}[] = [
  {
    id: 'cities',
    title: 'Iconic Cities',
    emoji: '🏙',
    filter: d => d.category === 'city',
  },
  {
    id: 'nature',
    title: 'Natural Wonders',
    emoji: '🏔️',
    filter: d => ['park', 'mountain', 'nature', 'lake', 'desert'].includes(d.category),
  },
  {
    id: 'beach',
    title: 'Beach Escapes',
    emoji: '🏖',
    filter: d => d.category === 'beach' || d.category === 'island',
  },
  {
    id: 'history',
    title: 'Historic Places',
    emoji: '🏛',
    filter: d => d.category === 'ruin' || d.category === 'landmark',
  },
];

// ── Near You — the destinations closest to the user, replacing the old "Trending Now" row.
// Kept module-level so the feed remounting (the Explore sheet unmounts while search is open)
// doesn't refetch the location or make the row pop in again.
type Coords = { latitude: number; longitude: number };
let cachedUserCoords: Coords | null = null;

function distanceKm(a: Coords, b: Coords) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Null until permission is granted and a fix arrives; the row is simply omitted until then
// (and for good if permission is denied) rather than showing something unrelated in its place.
function useUserCoords(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(cachedUserCoords);
  useEffect(() => {
    if (cachedUserCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = (await Location.getLastKnownPositionAsync())
          ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!pos || cancelled) return;
        cachedUserCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(cachedUserCoords);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  return coords;
}

interface Props {
  // Forwarded to the feed's own ScrollView so a parent sheet (ExploreSheet) can coordinate
  // its own vertical drag gesture with this content's scrolling — same
  // ref-plus-onScroll pattern CountrySheet/DestinationSheet use for their own full-screen
  // content ScrollView.
  scrollRef?: React.RefObject<any>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  // Lets a parent sheet (ExploreSheet) disable the feed's own scrolling while it's shown at
  // collapsed/half — those states are a fixed, non-interactive crop of the feed, so an
  // errant vertical touch there shouldn't also scroll content the user can't fully see.
  scrollEnabled?: boolean;
  // Top padding above the "Discover" header. Defaults to clearing the status bar, which is
  // correct when this fills the whole screen (full-screen state) but wildly overshoots when
  // embedded in ExploreSheet at collapsed/half — there the sheet's own top already sits well
  // below the status bar, so a parent can override this with a small fixed value instead.
  topPadding?: number;
  // 0 → 1 continuous value (driven by the parent sheet's own drag position, not a discrete
  // per-state boolean) that reveals the search bar as the sheet nears full-screen. Continuous
  // rather than snap-state-driven so the bar slides in/out smoothly mid-drag instead of
  // popping — see ExploreSheet's own compact/half-preview opacity fix for why a discrete
  // React-state boolean alone isn't smooth enough here.
  searchProgress?: SharedValue<number>;
  // Discrete gate for interaction (pointerEvents/editable) — only true once actually settled
  // at full-screen, so the bar can't be typed into mid-transition or while cropped out of view.
  searchVisible?: boolean;
  // iOS: starts the feed already scrolled here on first render, rather than at the top and then
  // jumping — see ExploreSheet's initialScrollY.
  initialScrollY?: number;
  // Fired once, the moment the feed's content has laid out and initialScrollY has been applied.
  onInitialScrollApplied?: () => void;
  // Tapping a card hands the destination up to MapScreen (via ExploreSheet) rather than this
  // screen opening its own detached DestinationSheet — that older popup never touched the
  // actual map: no camera move, no country selection, no shared back-navigation state. This
  // screen only ever renders embedded in ExploreSheet/MapScreen, so the callback is the sole
  // path now rather than an optional extra.
  onSelectDestination: (dest: Destination) => void;
}

export default function DiscoverScreen({
  scrollRef, onScroll, scrollEnabled = true, topPadding, searchProgress, searchVisible = true,
  onSelectDestination, initialScrollY, onInitialScrollApplied,
}: Props) {
  const initialScrollDoneRef = useRef(!initialScrollY);
  const insets            = useSafeAreaInsets();
  const savedDestinations = useStore(s => s.savedDestinations);
  const fallbackProgress  = useSharedValue(1);
  const progress          = searchProgress ?? fallbackProgress;

  // Full-screen: the feed's own "Explore · N countries…" header gives way to the search bar
  // (which sits where the map's own search bar does). Collapses in height as well as fading, so
  // no dead space is left above the feed. Natural height is measured once, since the wrapper's
  // animated height would otherwise hide it from onLayout.
  const feedHeaderH = useSharedValue(0);
  const feedHeaderStyle = useAnimatedStyle(() => {
    if (!feedHeaderH.value) return {};
    return {
      height: interpolate(progress.value, [0, 1], [feedHeaderH.value, 0], Extrapolation.CLAMP),
      opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP),
    };
  });

  const searchBarTop = insets.top + SEARCH_BAR_TOP_GAP;
  const feedTopAtFull = searchBarTop + SEARCH_BAR_H + SEARCH_BELOW_GAP;

  // The fade under the bar only matters once content has scrolled beneath it — at rest it would
  // wash out the top of the first section, so it ramps in over the first few px of scroll.
  const feedScrollY = useSharedValue(0);
  const searchFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP)
      * interpolate(feedScrollY.value, [0, 12], [0, 1], Extrapolation.CLAMP),
  }));

  // The feed's scroll frame starts below the bar as it appears, so scrolled content is
  // clipped at that line rather than sliding behind the bar.
  const scrollFrameStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(progress.value, [0, 1], [0, feedTopAtFull], Extrapolation.CLAMP),
  }));

  const userCoords = useUserCoords();
  const sections = useMemo(() => {
    const base = FEED_SECTIONS
      .map(sec => ({ ...sec, items: DESTINATIONS.filter(sec.filter).slice(0, 10) }))
      .filter(sec => sec.items.length > 0);
    const all = userCoords
      ? [{
          id: 'nearby', title: 'Near You', emoji: '📍',
          items: [...DESTINATIONS]
            .map(d => ({ d, km: distanceKm(userCoords, d.coordinates) }))
            .sort((a, b) => a.km - b.km)
            .slice(0, 10)
            .map(x => x.d),
        }, ...base]
      : base;
    // Visited destinations go to the far right of each row, the rest keeping their order
    // (Array.sort is stable, so returning 0 for two of the same kind preserves it).
    const visited = (d: Destination) => savedDestinations[d.id]?.type === 'visited';
    return all.map(sec => ({
      ...sec,
      items: [...sec.items].sort((a, b) => Number(visited(a)) - Number(visited(b))),
    }));
  }, [userCoords, savedDestinations]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.scroll, scrollFrameStyle]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: topPadding ?? 0, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        onScroll={e => { feedScrollY.value = e.nativeEvent.contentOffset.y; onScroll?.(e); }}
        scrollEventThrottle={16}
        contentOffset={initialScrollY ? { x: 0, y: initialScrollY } : undefined}
        onContentSizeChange={(_, h) => {
          // Content has laid out — apply the restored offset now, exactly when it's possible,
          // instead of guessing a number of frames to wait.
          if (initialScrollDoneRef.current || !initialScrollY || h <= 0) return;
          initialScrollDoneRef.current = true;
          scrollRef?.current?.scrollTo({ x: 0, y: initialScrollY, animated: false });
          onInitialScrollApplied?.();
        }}
        scrollEnabled={scrollEnabled}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        <Animated.View style={[{ overflow: 'hidden' }, feedHeaderStyle]}>
          <View
            style={styles.feedHeader}
            onLayout={e => { if (!feedHeaderH.value) feedHeaderH.value = e.nativeEvent.layout.height; }}
          >
            <Text style={styles.feedTitle}>Explore</Text>
            <Text style={styles.feedSub}>
              {COUNTRY_COUNT} countries · {DESTINATIONS.length} destinations · {SPOTS.length} spots
            </Text>
          </View>
        </Animated.View>

        {sections.map(section => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>{section.emoji}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardRow}
            >
              {section.items.map(dest => (
                <DestinationCard
                  key={dest.id}
                  dest={dest}
                  isVisited={savedDestinations[dest.id]?.type === 'visited'}
                  onPress={() => onSelectDestination(dest)}
                />
              ))}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
      </Animated.View>

      {/* Soft fade where scrolled content passes under the bar. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.searchFade, { top: feedTopAtFull, height: SEARCH_FADE_H }, searchFadeStyle]}
      >
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="searchFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F9FAFB" stopOpacity={1} />
              <Stop offset="1" stopColor="#F9FAFB" stopOpacity={0} />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#searchFade)" />
        </Svg>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { flex: 1 },

  // Feed header
  feedHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  feedTitle:  { fontSize: 28, fontWeight: '800', color: '#111827' },
  feedSub:    { fontSize: 13, color: '#9CA3AF', marginTop: 2 },

  searchFade: { position: 'absolute', left: 0, right: 0, zIndex: 4 },

  // Section
  section:       { marginBottom: 6 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  sectionEmoji: { fontSize: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  cardRow: { paddingHorizontal: 16, gap: 12, paddingTop: 2, paddingBottom: 14 },
});
