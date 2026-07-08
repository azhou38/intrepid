import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, TextInput,
  Dimensions, Platform,
} from 'react-native';
// Sheet drag is driven entirely by Reanimated + Gesture Handler (UI thread) rather than the
// core Animated/PanResponder APIs — PanResponder's move events are computed on the JS thread,
// which round-trips through the bridge on every touch-move frame and was the real cause of
// drag jank (switching the sheet's positioning from `top` to `transform` alone didn't fix it,
// since the bottleneck was the gesture pipeline itself, not which style property it drove).
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, runOnJS,
  interpolate, Extrapolation, Easing,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
// ScrollView specifically comes from gesture-handler (not core RN) — only a gesture-handler-
// aware component can actually participate in `simultaneousWithExternalGesture` below; a
// plain core ScrollView's native pan silently claims every touch first regardless of that
// call, which is what was still blocking the full-screen swipe-down.
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Heart, Plus, Users, Languages, Coins, Trash2, Map } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useStore } from '../../store';
import { CONTINENT_COLORS, CATEGORY_ICONS } from '../../types';
import type { Destination, CountryCluster, DestinationCategory } from '../../types';
import { DESTINATIONS } from '../../data/destinations';
import { SPOTS } from '../../data/spots';
import { photoCache, thumbCache, fetchWikiThumbnail } from '../../utils/photoCache';
import CircleFlag from '../CircleFlag';

interface Props {
  cluster: CountryCluster;
  onClose: () => void;
  onSelectDestination: (dest: Destination) => void;
  // "Map view" from the Destinations tab's grid — jumps to that destination's own
  // collapsed/bottom-screen sliding carousel, not the usual half-screen sheet.
  onGoToDestinationsMap: (dest: Destination) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  // Written to continuously (every frame, not just at snap boundaries) with the exact
  // "bottom" offset the back-to-world pill should sit at *right now* — computed here (this
  // sheet owns slideAnim and its snap-point constants) by piecewise-interpolating between
  // the collapsed/half/full resting targets as slideAnim moves — identical mechanism to
  // DestinationSheet's. A shared value (not a JS callback) so the write happens directly on
  // the UI thread with zero JS-thread hop, letting the pill track the sheet's top edge in
  // true lockstep while dragging.
  pillOffsetSV?: SharedValue<number>;
  // While true, some other UI owns the pill's position instead — this sheet's writes to
  // pillOffsetSV are suppressed so the two don't fight.
  pillOffsetLockedSV?: SharedValue<boolean>;
  // Fires on every snap transition (tap, swipe, or an imperative collapseSignal below) —
  // lets the caller know when this sheet is at half-screen, e.g. to auto-collapse it if the
  // user starts panning the map underneath it. Identical to DestinationSheet's.
  onSnapStateChange?: (state: CountrySnapState) => void;
  // Bump this (e.g. an incrementing counter) to imperatively collapse the sheet from the
  // parent — used when the user pans the map while this sheet is at half-screen. No-ops
  // unless the sheet is currently at half.
  collapseSignal?: number;
  // Mount-time only — lets a caller open straight to a specific tab (e.g. the destination
  // sheet's collapsed carousel "List" button reopening this sheet on the Destinations tab).
  // Identical to DestinationSheet's own initialTab.
  initialTab?: CountryTab;
  // Mount-time only — lets a caller open straight to a specific snap point (e.g. swiping
  // down from DestinationSheet's own collapsed carousel lands here collapsed too, instead
  // of the usual half-screen default). Identical to DestinationSheet's own initialSnap.
  initialSnap?: CountrySnapState;
}

const { height: H, width: W } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;
const COMPACT_H   = 164;
// Same bottom-tab-bar reservation App.tsx's Tab.Navigator uses for its own tabBarStyle
// height — the country sheet lives inside that "Map" tab's screen, so anything it shows
// must end above this, not at the raw device bottom edge.
const BOTTOM_TAB_H = Platform.OS === 'ios' ? 88 : 64;
const COLLAPSED_Y = Math.max(0, H - BOTTOM_TAB_H - COMPACT_H);
const HEADER_H    = 200;
// Snap transitions ease to their target with no overshoot at all — a plain duration+curve
// tween instead of a physical spring, since any spring (even lightly underdamped) reads as
// "bouncy" here given how large a distance these snaps travel.
const SNAP_CONFIG  = { duration: 280, easing: Easing.out(Easing.cubic) };
const QUICK_CONFIG = { duration: 150, easing: Easing.out(Easing.cubic) };
// 2-column destinations grid — same math as DestinationSheet's own spot grid.
const GRID_GAP    = 14;
const GRID_CARD_W = (W - 32 - GRID_GAP) / 2;
const TAB_CONFIG   = { duration: 220, easing: Easing.out(Easing.cubic) };
// Half-screen snap — identical mechanics to DestinationSheet's: sheet top sits at the
// vertical midpoint, showing only the (cropped) header and the tab bar, with everything
// below the tab bar falling below the app's own bottom Map/Explore/Profile bar.
// Small nudge down from the exact midpoint so the tab row's bottom edge (My Visit/About/
// Destinations) lines up exactly with the top of the bottom bar — mirrors
// DestinationSheet's own HALF_SHIFT tuning.
const HALF_SHIFT  = 1;
const HALF_POS    = H / 2 + HALF_SHIFT;
const TAB_BAR_H   = 50; // approx rendered height of st.tabBar (paddingVertical 15 × 2 + text)
// A tiny bit of extra clearance above the bottom tab bar — identical fix to
// DestinationSheet's HALF_BOTTOM_GAP: landing the tab row's bottom edge exactly flush with
// the bottom bar left the sliding underline's bottom sliver covered by it, since TAB_BAR_H
// is only an approximation of the real rendered height.
const HALF_BOTTOM_GAP = 0;
// tabBar overlaps the header's bottom edge by 20 (its own -20 marginTop, vs
// DestinationSheet's -24 — this file's tabBar uses a slightly smaller overlap), so the
// header only needs to shrink enough that header-bottom + tabBar-height - 20 lands just
// above BOTTOM_TAB_H (plus the small gap above).
const HALF_HEADER_H = HALF_POS - TAB_BAR_H + 20 - BOTTOM_TAB_H - HALF_BOTTOM_GAP;

// A handful of at-a-glance facts, scoped to just the countries that actually appear here
// (every CountryCluster is built from this app's curated destinations, so this list only
// ever needs to cover those countries' codes) — not a general-purpose country database.
const COUNTRY_FACTS: Record<string, { population: string; languages: string[]; currency: string }> = {
  US: { population: '332 million',  languages: ['English'],                                    currency: 'US Dollar' },
  FR: { population: '68 million',   languages: ['French'],                                      currency: 'Euro' },
  GB: { population: '67.5 million', languages: ['English'],                                      currency: 'British Pound' },
  IT: { population: '59 million',   languages: ['Italian'],                                      currency: 'Euro' },
  ES: { population: '47.4 million', languages: ['Spanish'],                                      currency: 'Euro' },
  NL: { population: '17.8 million', languages: ['Dutch'],                                        currency: 'Euro' },
  DE: { population: '83.2 million', languages: ['German'],                                       currency: 'Euro' },
  PT: { population: '10.3 million', languages: ['Portuguese'],                                   currency: 'Euro' },
  CH: { population: '8.7 million',  languages: ['German', 'French', 'Italian', 'Romansh'],        currency: 'Swiss Franc' },
  AT: { population: '9 million',    languages: ['German'],                                       currency: 'Euro' },
  BE: { population: '11.6 million', languages: ['Dutch', 'French', 'German'],                    currency: 'Euro' },
  IE: { population: '5.1 million',  languages: ['Irish', 'English'],                              currency: 'Euro' },
  SE: { population: '10.5 million', languages: ['Swedish'],                                       currency: 'Swedish Krona' },
  NO: { population: '5.4 million',  languages: ['Norwegian'],                                     currency: 'Norwegian Krone' },
  DK: { population: '5.9 million',  languages: ['Danish'],                                        currency: 'Danish Krone' },
  FI: { population: '5.5 million',  languages: ['Finnish', 'Swedish'],                            currency: 'Euro' },
  IS: { population: '380 thousand', languages: ['Icelandic'],                                     currency: 'Icelandic Krona' },
  GR: { population: '10.4 million', languages: ['Greek'],                                         currency: 'Euro' },
  CZ: { population: '10.5 million', languages: ['Czech'],                                         currency: 'Czech Koruna' },
  JP: { population: '124 million',  languages: ['Japanese'],                                      currency: 'Japanese Yen' },
  AU: { population: '26 million',   languages: ['English'],                                       currency: 'Australian Dollar' },
};

type CountryTab = 'visit' | 'about' | 'destinations';
type CountrySnapState = 'collapsed' | 'half' | 'full';

// ── Destination grid card — same visual language as DestinationSheet's own spot grid
// cards (photo, category badge, name, meta line), flex-basis'd for a 2-column grid.
function DestinationGridCard({
  dest, isVisited, isWishlist, onPress,
}: {
  dest: Destination;
  isVisited: boolean;
  isWishlist: boolean;
  onPress: () => void;
}) {
  const color = CONTINENT_COLORS[dest.continent];
  const cacheKey = dest.id;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);

  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(dest.name, 400).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [dest.id]);

  return (
    <Pressable style={st.destGridCard} onPress={onPress}>
      <View style={st.destGridImageWrap}>
        {photoUrl
          ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[st.destGridPlaceholder, { backgroundColor: color + '22' }]}>
              <Text style={st.destGridPlaceholderIcon}>{dest.icon ?? CATEGORY_ICONS[dest.category]}</Text>
            </View>
        }
        <View style={st.destGridBadge}>
          <Text style={st.destGridBadgeIcon}>{CATEGORY_ICONS[dest.category]}</Text>
        </View>
        {isVisited && (
          <View style={[st.destGridStatusPill, st.destGridStatusPillVisited]}>
            <Check size={9} color="white" strokeWidth={2.5} />
            <Text style={st.destGridStatusPillTxt}>Visited</Text>
          </View>
        )}
        {!isVisited && isWishlist && (
          <View style={[st.destGridStatusPill, st.destGridStatusPillWishlist]}>
            <Heart size={9} color="white" strokeWidth={2.5} fill="white" />
            <Text style={st.destGridStatusPillTxt}>Wishlist</Text>
          </View>
        )}
      </View>
      <Text style={st.destGridName} numberOfLines={1}>{dest.name}</Text>
      <Text style={st.destGridMeta} numberOfLines={2}>{dest.tagline ?? dest.category}</Text>
    </Pressable>
  );
}

// ── Destinations panel — grid of the country's destinations with category filter tags
// and a "Map view" button, identical pattern to DestinationSheet's own SpotsPanel.
function DestinationsPanel({
  dests, savedDestinations, onSelectDestination, onGoToDestinationsMap,
}: {
  dests: Destination[];
  savedDestinations: Record<string, { type?: string; isWishlisted?: boolean }>;
  onSelectDestination: (dest: Destination) => void;
  onGoToDestinationsMap: (dest: Destination) => void;
}) {
  const [filter, setFilter] = useState<DestinationCategory | 'all'>('all');

  const categories = useMemo(() => {
    const seen = new Set<DestinationCategory>();
    dests.forEach(d => seen.add(d.category));
    return Array.from(seen);
  }, [dests]);

  const filteredDests = filter === 'all' ? dests : dests.filter(d => d.category === filter);

  return (
    <View style={{ gap: 16 }}>
      {dests.length > 0 && (
        <Pressable style={st.mapViewBtn} onPress={() => onGoToDestinationsMap(dests[0])} hitSlop={6}>
          <Map size={13} color="#6B7280" />
          <Text style={st.mapViewBtnTxt}>Map view</Text>
        </Pressable>
      )}

      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
          <Pressable
            style={[st.filterTag, filter === 'all' && st.filterTagActive]}
            onPress={() => setFilter('all')}>
            <Text style={[st.filterTagTxt, filter === 'all' && st.filterTagTxtActive]}>All</Text>
          </Pressable>
          {categories.map(cat => {
            const active = filter === cat;
            return (
              <Pressable key={cat} style={[st.filterTag, active && st.filterTagActive]} onPress={() => setFilter(cat)}>
                <Text style={st.filterTagIcon}>{CATEGORY_ICONS[cat]}</Text>
                <Text style={[st.filterTagTxt, active && st.filterTagTxtActive]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {filteredDests.length > 0 ? (
        <View style={st.destGrid}>
          {filteredDests.map(dest => {
            const saved      = savedDestinations[dest.id];
            const isVisited  = saved?.type === 'visited';
            const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');
            return (
              <DestinationGridCard
                key={dest.id}
                dest={dest}
                isVisited={isVisited}
                isWishlist={isWishlist}
                onPress={() => onSelectDestination(dest)}
              />
            );
          })}
        </View>
      ) : (
        <Text style={st.gridEmptyTxt}>No destinations in this category yet.</Text>
      )}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CountrySheet({
  cluster, onClose, onSelectDestination, onGoToDestinationsMap, onExpand, onCollapse,
  pillOffsetSV, pillOffsetLockedSV, onSnapStateChange, collapseSignal, initialTab, initialSnap,
}: Props) {
  // Half-screen is the default view whenever a country is selected — callers only pass
  // initialSnap explicitly for other cases (e.g. swiping down from DestinationSheet's own
  // collapsed carousel wants 'collapsed').
  const resolvedInitialSnap: CountrySnapState = initialSnap ?? 'half';
  const insets            = useSafeAreaInsets();
  const savedDestinations = useStore(s => s.savedDestinations);
  const savedCountries    = useStore(s => s.savedCountries);
  const saveCountryVisited = useStore(s => s.saveCountryVisited);
  const unsaveCountry      = useStore(s => s.unsaveCountry);
  const updateSavedCountry = useStore(s => s.updateSavedCountry);

  const dests = useMemo(
    () => DESTINATIONS.filter(d => d.country === cluster.country)
                      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    [cluster.country],
  );

  const continent   = dests[0]?.continent ?? 'Europe';
  const accentColor = CONTINENT_COLORS[continent];

  const wishlistCount = dests.filter(d =>
    savedDestinations[d.id]?.isWishlisted || savedDestinations[d.id]?.type === 'wishlist'
  ).length;
  const isAnyVisited  = dests.some(d => savedDestinations[d.id]?.type === 'visited');
  const isAnyWishlist = wishlistCount > 0;
  const spotsCount = useMemo(() => {
    const destIds = new Set(dests.map(d => d.id));
    return SPOTS.filter(s => destIds.has(s.destinationId)).length;
  }, [dests]);

  const savedCountry       = savedCountries[cluster.countryCode];
  // Presence of a visitDate specifically (not just any saved-country record at all) — a
  // country can have a record that's only isWishlisted, which shouldn't count as visited.
  const isCountryVisited     = !!savedCountry?.visitDate;
  const isCountryWishlisted  = !!savedCountry?.isWishlisted;
  const facts = COUNTRY_FACTS[cluster.countryCode];

  const handleToggleVisited = useCallback(() => {
    if (isCountryVisited) {
      if (isCountryWishlisted) {
        updateSavedCountry(cluster.countryCode, { visitDate: undefined });
      } else {
        unsaveCountry(cluster.countryCode);
      }
    } else {
      saveCountryVisited(cluster.countryCode, { visitDate: new Date().toISOString().slice(0, 10) });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isCountryVisited, isCountryWishlisted, cluster.countryCode, saveCountryVisited, unsaveCountry, updateSavedCountry]);

  // Wishlisting only makes sense before a visit is logged — once visited, the country has
  // already been "gotten to" — mirrors DestinationSheet's identical handleWishlist.
  const handleToggleWishlist = useCallback(() => {
    if (isCountryWishlisted) {
      if (isCountryVisited) updateSavedCountry(cluster.countryCode, { isWishlisted: false });
      else unsaveCountry(cluster.countryCode);
    } else {
      saveCountryVisited(cluster.countryCode, { isWishlisted: true });
    }
  }, [isCountryVisited, isCountryWishlisted, cluster.countryCode, saveCountryVisited, unsaveCountry, updateSavedCountry]);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TAB_ORDER: CountryTab[] = useMemo(
    () => isCountryVisited ? ['visit', 'about', 'destinations'] : ['about', 'destinations'],
    [isCountryVisited],
  );
  const defaultTab: CountryTab = isCountryVisited ? 'visit' : 'about';
  const startTab: CountryTab = (initialTab && TAB_ORDER.includes(initialTab)) ? initialTab : defaultTab;
  const [activeTab, setActiveTab] = useState<CountryTab>(startTab);
  // Plain React state (like DestinationSheet's) so the compact card overlay and tab-bar
  // highlighting can react and re-render — refs alone wouldn't trigger that.
  const [isHalfState, setIsHalfState] = useState(resolvedInitialSnap === 'half');
  // Half-screen shows no tab as "selected" by default (it's a preview, not a picked view) —
  // but once the user has actually tapped or swiped a tab (in full screen), that choice
  // sticks even after dropping back down to half. Identical rule to DestinationSheet.
  const [hasUserPickedTab, setHasUserPickedTab] = useState(false);
  const isTabSelected = (tab: CountryTab) => (hasUserPickedTab || !isHalfState) && activeTab === tab;
  const tabSlideFor = (tab: CountryTab) => -Math.max(0, TAB_ORDER.indexOf(tab)) * W;
  const tabSlideAnim = useSharedValue(tabSlideFor(startTab));
  // A Reanimated shared value, not a plain ref — mutating a plain ref's `.current` from
  // inside a UI-thread worklet (onStart/onUpdate/onEnd below) doesn't reliably persist
  // across separate worklet invocations the way a shared value's `.value` does, which was
  // corrupting the recorded drag-start position and making the swipe-back transition snap
  // instantly instead of animating.
  const tabSwipeBaseSV = useSharedValue(0);

  const tabIndicatorStyle = useAnimatedStyle(() => ({
    left: `${interpolate(
      tabSlideAnim.value,
      TAB_ORDER.map((_, i) => -i * W).reverse(),
      TAB_ORDER.map((_, i) => (i * 100) / TAB_ORDER.length).reverse(),
      Extrapolation.CLAMP,
    )}%` as `${number}%`,
  }));
  const slideRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabSlideAnim.value }],
  }));

  // If the country's visited-state flips while the sheet is open (marking/unmarking visited
  // adds or removes the "My Visit" tab), keep the slide position matched to whichever tab is
  // still active instead of leaving it misaligned.
  useEffect(() => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx === -1) {
      setActiveTab(TAB_ORDER[0]);
      tabSlideAnim.value = 0;
    } else {
      tabSlideAnim.value = -idx * W;
    }
  }, [isCountryVisited]);

  const switchTab = useCallback((tab: CountryTab) => {
    setActiveTab(tab);
    tabSlideAnim.value = withTiming(tabSlideFor(tab), TAB_CONFIG);
  }, [TAB_ORDER]);

  const setActiveTabJS = useCallback((tab: CountryTab) => {
    setActiveTab(tab);
    // A deliberate swipe to a tab is just as much a "pick" as tapping it — matches
    // DestinationSheet's identical fix (otherwise isTabSelected, which requires
    // hasUserPickedTab while in half-screen, never updates for the swiped-to tab).
    setHasUserPickedTab(true);
  }, []);

  // ── Sheet animation ──────────────────────────────────────────────────────────
  const snapStateRef = useRef<CountrySnapState>(resolvedInitialSnap);
  // Mirrors snapStateRef but readable from the UI-thread gesture worklets below.
  const snapStateSV  = useSharedValue<CountrySnapState>(resolvedInitialSnap);
  const slideAnim    = useSharedValue(CLOSE_POS);
  const lastPos      = useSharedValue(
    resolvedInitialSnap === 'full' ? FULL_POS : resolvedInitialSnap === 'half' ? HALF_POS : COLLAPSED_Y,
  );
  const scrollRef    = useRef<ScrollView>(null);
  const scrollY      = useSharedValue(0);

  // Single shared value doing double duty as both the "clamp ceiling while collapsed" bound
  // and the compact card's own resting position — replaces the old collapsedYRef (JS-only,
  // unreadable from a worklet) and collapsedYAnimV (a separate core-Animated node).
  const collapsedYAnim = useSharedValue(COLLAPSED_Y);
  // Plain JS mirror — a few call sites (mount/reset effects, onLayout) need a synchronous JS
  // read of "the last known collapsed Y" without waiting a frame for the shared value.
  const collapsedYRef  = useRef(COLLAPSED_Y);

  // Natural (unclipped) header height, measured via onLayout on an inner, unconstrained
  // content view (see the header JSX below) — needed since the header's real content
  // height varies by device (insets.top) and isn't a fixed constant the way
  // DestinationSheet's photo hero height is.
  const headerFullHRef  = useRef(HEADER_H);
  const headerFullHAnim = useSharedValue(HEADER_H);

  const compactAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(-H, Math.min(0, slideAnim.value - collapsedYAnim.value)) }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [1, 0], Extrapolation.CLAMP),
  }));

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }],
  }));

  // Header shrinks as the sheet passes through half-screen, so header + tab bar together
  // still fit within the half of the screen the sheet occupies there. Three points (not
  // two), same reasoning as DestinationSheet's heroAnimStyle: a plain two-point clamp would
  // keep the shrunk height for every value beyond HALF_POS too, including collapsed.
  const headerAnimStyle = useAnimatedStyle(() => ({
    height: interpolate(
      slideAnim.value,
      [FULL_POS, HALF_POS, Math.max(HALF_POS + 1, collapsedYAnim.value)],
      [headerFullHAnim.value, HALF_HEADER_H, headerFullHAnim.value],
      Extrapolation.CLAMP,
    ),
  }));

  // Full-screen keeps the top row (X/wishlist/visit) below the status bar, as before. In
  // half-screen the header is already cropped short and doesn't overlap the status bar at
  // all, so nudge them up as the sheet passes through half-screen — identical formula to
  // DestinationSheet's heroTopRowStyle.
  const headerTopRowStyle = useAnimatedStyle(() => ({
    top: interpolate(slideAnim.value, [FULL_POS, HALF_POS], [insets.top + 20, 28], Extrapolation.CLAMP),
  }));

  // Continuously writes the back-to-world pill's target "bottom" offset as slideAnim moves,
  // so the parent's pill mirrors this sheet's own top edge frame-for-frame while dragging
  // between collapsed/half/full, instead of only re-targeting once a drag settles. Written
  // directly to the shared value passed in via pillOffsetSV — no runOnJS/JS-thread hop, since
  // both this sheet and the pill are UI-thread Reanimated values.
  //
  // Now that the header's own close button is gone, the pill takes over that exact spot for
  // half/full screen — identical mechanism (and identical bugfix) to DestinationSheet's own
  // reaction: the [FULL_POS, HALF_POS] leg mirrors headerTopRowStyle's top-position formula,
  // converted to "bottom" terms against the pill's *actual* container (MapScreen's root,
  // which is shorter than the full device height by BOTTOM_TAB_H, since App.tsx's tab bar
  // reserves its own layout space rather than floating over the content), with slideAnim's
  // own contribution added in (headerTopRowStyle's `top` is relative to the header's own
  // origin, which itself sits at slideAnim.value in the screen's frame, not at 0). The
  // collapsed leg is untouched — same tuned resting target as before.
  useAnimatedReaction(
    () => slideAnim.value,
    (value) => {
      if (!pillOffsetSV || pillOffsetLockedSV?.value) return;
      const PILL_H = 36;
      const SCREEN_H = H - BOTTOM_TAB_H;
      const FULL_TOP_ABS = FULL_POS + (insets.top + 20);
      // Half-screen is the one exception to "pill sits inside the header row": here it
      // instead floats a fixed gap above the sheet's own top edge (HALF_POS), like the
      // collapsed pill floats above its card, rather than overlapping the header.
      const HALF_PILL_GAP = 16;
      const HALF_TOP_ABS = HALF_POS - HALF_PILL_GAP - PILL_H;
      const FULL_TARGET = SCREEN_H - FULL_TOP_ABS - PILL_H;
      const HALF_TARGET = SCREEN_H - HALF_TOP_ABS - PILL_H;
      const COLLAPSED_TARGET = insets.bottom + 90;
      pillOffsetSV.value = interpolate(
        value,
        [FULL_POS, HALF_POS, collapsedYAnim.value],
        [FULL_TARGET, HALF_TARGET, COLLAPSED_TARGET],
        Extrapolation.CLAMP,
      );
    },
    [insets.bottom, insets.top],
  );

  // Slide in on mount — half-screen by default (matches DestinationSheet, which also opens
  // to half rather than collapsed whenever the user first selects something), unless
  // initialSnap requests otherwise (e.g. swiping down from DestinationSheet's own collapsed
  // carousel wants 'collapsed'; its own "List view" button wants 'full').
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resolvedInitialSnap === 'collapsed') {
      snapStateRef.current = 'collapsed';
      snapStateSV.value = 'collapsed';
      lastPos.value = collapsedYRef.current;
      slideAnim.value = withTiming(collapsedYRef.current, SNAP_CONFIG);
      onSnapStateChange?.('collapsed');
    } else if (resolvedInitialSnap === 'full') {
      snapStateRef.current = 'full';
      snapStateSV.value = 'full';
      lastPos.value = FULL_POS;
      onExpand?.();
      slideAnim.value = withTiming(FULL_POS, SNAP_CONFIG);
      onSnapStateChange?.('full');
    } else {
      snapStateRef.current = 'half';
      snapStateSV.value = 'half';
      lastPos.value = HALF_POS;
      setIsHalfState(true);
      slideAnim.value = withTiming(HALF_POS, SNAP_CONFIG);
      onSnapStateChange?.('half');
    }
  }, []);

  // Reset when country changes — but not on the very first mount, which already applied
  // initialSnap above (otherwise this would immediately override e.g. a 'collapsed'
  // initialSnap back to half, since this effect's own dependency also "changes" on mount).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    snapStateRef.current = 'half';
    snapStateSV.value = 'half';
    slideAnim.value = CLOSE_POS;
    lastPos.value = HALF_POS;
    slideAnim.value = withTiming(HALF_POS, SNAP_CONFIG);
    setIsHalfState(true);
    setHasUserPickedTab(false);
    onSnapStateChange?.('half');
  }, [cluster.country]);

  // Imperatively collapse from the parent (e.g. the user started panning the map while this
  // sheet sat at half-screen) — no-ops unless actually at half, so it's safe to bump this
  // regardless of the sheet's current state.
  const lastCollapseSignalRef = useRef(collapseSignal);
  useEffect(() => {
    if (collapseSignal === undefined || collapseSignal === lastCollapseSignalRef.current) return;
    lastCollapseSignalRef.current = collapseSignal;
    if (snapStateRef.current === 'half') snapToCollapsedRef.current();
  }, [collapseSignal]);

  // Country photo from Wikipedia — full-screen header — request a size bounded to what a
  // phone screen actually needs, instead of downloading Wikipedia's (sometimes huge,
  // multi-MB) original image.
  //
  // Deliberately NOT a lookup of the country's own Wikipedia article: that article's lead
  // image is almost always its national flag (the standard {{Infobox country}} layout leads
  // with flag_image), which is exactly the "flag as photo" look this is meant to replace.
  // The country's top-ranked destination (dests is already sorted by rank, so dests[0] is
  // its most iconic place) gives an actual landscape/cityscape/landmark photo instead —
  // the same lookup DestinationSheet already uses successfully for its own hero images.
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    photoCache.get(`country_${cluster.countryCode}`) ?? null,
  );
  useEffect(() => {
    const cacheKey = `country_${cluster.countryCode}`;
    if (photoCache.has(cacheKey)) {
      setPhotoUrl(photoCache.get(cacheKey)!);
      return;
    }
    setPhotoUrl(null);
    const topDest = dests[0];
    const lookup = topDest
      ? fetchWikiThumbnail(topDest.name, 900, cluster.country)
      : fetchWikiThumbnail(cluster.country, 900);
    lookup.then(url => {
      if (url) { photoCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [cluster.countryCode, cluster.country, dests]);

  const snapToFullRef = useRef(() => {});
  snapToFullRef.current = () => {
    snapStateRef.current = 'full';
    snapStateSV.value = 'full';
    lastPos.value = FULL_POS;
    onExpand?.();
    setIsHalfState(false);
    slideAnim.value = withTiming(FULL_POS, SNAP_CONFIG);
    onSnapStateChange?.('full');
  };

  // Half-screen — deliberately does NOT call onExpand (that flips the map's mapState to
  // 'sheet', which hides the back-to-world pill; half-screen wants the pill to stay
  // visible, just repositioned above the sheet's new top edge). It DOES call onCollapse,
  // though — not to actually collapse anything, just because that's what reverts mapState
  // back to 'context' if the previous state was full (identical to DestinationSheet).
  const snapToHalfRef = useRef(() => {});
  snapToHalfRef.current = () => {
    snapStateRef.current = 'half';
    snapStateSV.value = 'half';
    lastPos.value = HALF_POS;
    onCollapse?.();
    setIsHalfState(true);
    slideAnim.value = withTiming(HALF_POS, SNAP_CONFIG);
    onSnapStateChange?.('half');
  };

  const snapToCollapsedRef = useRef(() => {});
  snapToCollapsedRef.current = () => {
    const cy = collapsedYRef.current;
    snapStateRef.current = 'collapsed';
    snapStateSV.value = 'collapsed';
    lastPos.value = cy;
    onCollapse?.();
    setIsHalfState(false);
    slideAnim.value = withTiming(cy, SNAP_CONFIG);
    onSnapStateChange?.('collapsed');
  };

  const dismissSheetRef = useRef(() => {});
  dismissSheetRef.current = () => {
    slideAnim.value = withTiming(CLOSE_POS, { duration: 280 }, finished => {
      if (finished) runOnJS(onClose)();
    });
  };

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Fires the "hit the top" haptic the instant slideAnim actually reaches FULL_POS, rather
  // than waiting on withTiming's completion callback — that callback only fires once the
  // full animation duration has elapsed, which lags slightly behind the moment the value
  // itself lands on target (the perceptible "small delay" this replaces). Watching the
  // value directly also means this fires immediately if the user's own drag pushes the
  // sheet all the way to the clamp (genuinely hitting the top edge), not only after a
  // separate settle animation gets there. Guarded on the previous value so it only fires
  // once per arrival, not on every frame the sheet happens to sit at FULL_POS. Placed after
  // triggerHaptic's own declaration — worklets capture their closure by value at creation
  // time, so referencing triggerHaptic here before it's assigned would bake in `undefined`.
  useAnimatedReaction(
    () => slideAnim.value,
    (value, prevValue) => {
      if (value <= FULL_POS && (prevValue === null || prevValue > FULL_POS)) {
        runOnJS(triggerHaptic)();
      }
    },
  );

  const callSnapToFull      = useCallback(() => snapToFullRef.current(), []);
  const callSnapToHalf      = useCallback(() => snapToHalfRef.current(), []);
  const callSnapToCollapsed = useCallback(() => snapToCollapsedRef.current(), []);
  const callDismissSheet    = useCallback(() => dismissSheetRef.current(), []);

  // True only once onUpdate has actually moved the sheet at least one frame during the
  // current gesture — while full-screen, onUpdate legitimately no-ops for most vertical
  // touches (anything that isn't "already scrolled to top and dragging down"), e.g. an
  // ordinary upward scroll. Without this flag, onEnd would still run its snap-decision logic
  // for that scroll gesture purely off its raw translation/velocity (identical reasoning,
  // and identical fix, to DestinationSheet's).
  const dragEngagedSV = useSharedValue(false);

  // Runs entirely on the UI thread — onUpdate fires every touch-move frame with zero
  // JS-thread/bridge round trip, which is what actually eliminates the drag jank (merely
  // switching the sheet's own positioning from `top` to `transform` wasn't enough, since the
  // old PanResponder computed every frame's position on the JS thread regardless of which
  // style property consumed it).
  const pan = Gesture.Pan()
    // Only activates once the drag is decisively vertical, ceding horizontal drags to the
    // tab-swipe gesture below instead of racing it for every touch.
    .activeOffsetY([-10, 10])
    .failOffsetX([-10, 10])
    .onStart(() => {
      dragEngagedSV.value = false;
      lastPos.value = slideAnim.value;
    })
    .onUpdate(e => {
      if (Math.abs(e.translationX) >= Math.abs(e.translationY)) return;
      // Mirrors the old onMoveShouldSetPanResponderCapture gate: while full-screen, only
      // let this gesture pull the sheet down once its inner ScrollView is already at top.
      if (snapStateSV.value === 'full' && !(scrollY.value <= 1 && e.translationY > 6)) return;
      dragEngagedSV.value = true;
      const clampMax = snapStateSV.value === 'collapsed' ? CLOSE_POS : collapsedYAnim.value;
      slideAnim.value = Math.max(FULL_POS, Math.min(clampMax, lastPos.value + e.translationY));
    })
    .onEnd(e => {
      const pos = lastPos.value + e.translationY;
      const cy  = collapsedYAnim.value;

      if (snapStateSV.value === 'collapsed') {
        // Swiping up from collapsed lands at half — UNLESS the drag has actually been
        // carried past the halfway point of the screen, in which case it commits straight
        // to full instead of locking at half first. Identical rule to DestinationSheet.
        if (pos <= HALF_POS) { runOnJS(callSnapToFull)(); return; }
        if (e.velocityY < -500 || pos < cy - 60) runOnJS(callSnapToHalf)();
        else if (e.velocityY > 500 || pos > cy + 40) runOnJS(callDismissSheet)();
        else runOnJS(callSnapToCollapsed)();
        return;
      }

      if (snapStateSV.value === 'full') {
        // A gesture that never actually engaged (e.g. an upward scroll) shouldn't change
        // the sheet's snap state at all — leave it exactly at full.
        if (!dragEngagedSV.value) return;
        // Haptic fires right here, at the moment of release, not during the drag itself —
        // "the user swipes down from full-screen view" is this release, regardless of
        // whether it ends up landing at half or collapsed.
        runOnJS(triggerHaptic)();
        // Swiping down from full lands at half — UNLESS the drag has actually been carried
        // past the halfway point of the screen, in which case it commits straight to
        // collapsed instead of locking at half first.
        if (pos >= HALF_POS) { runOnJS(callSnapToCollapsed)(); return; }
        runOnJS(callSnapToHalf)();
        return;
      }

      // From half: swipe up continues to full, swipe down continues to collapsed,
      // anything smaller settles back at half.
      if (e.velocityY < -500 || pos < HALF_POS - 60) runOnJS(callSnapToFull)();
      else if (e.velocityY > 500 || pos > HALF_POS + 60) runOnJS(callSnapToCollapsed)();
      else runOnJS(callSnapToHalf)();
    })
    // Without this, the inner ScrollView's own native pan claims the touch outright while
    // full-screen, so our gesture never even starts recognizing — letting both recognize
    // simultaneously means the ScrollView keeps scrolling normally, while our onUpdate's own
    // `scrollY.value <= 1` check (above) decides whether a drag should also move the sheet.
    .simultaneousWithExternalGesture(scrollRef);

  // Horizontal tab-swipe gesture — a Reanimated/Gesture-Handler gesture (not core
  // PanResponder), since a plain PanResponder wrapping a gesture-handler ScrollView doesn't
  // reliably win touches from it. activeOffsetX/failOffsetY give this gesture priority for
  // horizontal drags while ceding vertical ones to the ScrollView (or the vertical `pan`
  // gesture above) instead.
  const tabSwipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onStart(() => {
      tabSwipeBaseSV.value = tabSlideAnim.value;
    })
    .onUpdate(e => {
      const next = Math.max(-(TAB_ORDER.length - 1) * W, Math.min(0, tabSwipeBaseSV.value + e.translationX));
      tabSlideAnim.value = next;
    })
    .onEnd(e => {
      const projected = tabSwipeBaseSV.value + e.translationX;
      let targetIdx = 0;
      let nearestDist = Infinity;
      TAB_ORDER.forEach((t, i) => {
        const d = Math.abs(-i * W - projected);
        if (d < nearestDist) { nearestDist = d; targetIdx = i; }
      });
      if (Math.abs(e.velocityX) > 400) {
        // Derived from the UI-thread-only tabSwipeBaseSV rather than the React state
        // `activeTab` — reading React state from inside a worklet risks a stale snapshot.
        const curIdx = Math.round(-tabSwipeBaseSV.value / W);
        const dir = e.velocityX < 0 ? 1 : -1;
        targetIdx = Math.max(0, Math.min(TAB_ORDER.length - 1, curIdx + dir));
      }
      tabSlideAnim.value = withTiming(-targetIdx * W, TAB_CONFIG);
      // Always sync JS state rather than trying to skip a no-op by comparing against the
      // (potentially stale, worklet-read) `activeTab` — setActiveTabJS is a harmless no-op
      // on the JS thread if the tab hasn't actually changed.
      runOnJS(setActiveTabJS)(TAB_ORDER[targetIdx]);
    })
    .simultaneousWithExternalGesture(scrollRef);

  const renderTabBarRow = () => (
    <>
      {TAB_ORDER.map((tab, i) => (
        <React.Fragment key={tab}>
          {i > 0 && <View style={st.tabDivider} />}
          <Pressable
            style={st.tabBtn}
            onPress={() => {
              switchTab(tab);
              setHasUserPickedTab(true);
              if (isHalfState) snapToFullRef.current();
            }}
          >
            <Text style={[st.tabBtnTxt, isTabSelected(tab) && st.tabBtnTxtActive]}>
              {tab === 'visit' ? 'My Visit' : tab === 'about' ? 'About' : 'Destinations'}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
      <Animated.View
        style={[
          st.tabIndicatorTrack,
          { width: `${100 / TAB_ORDER.length}%`, opacity: (hasUserPickedTab || !isHalfState) ? 1 : 0 },
          tabIndicatorStyle,
        ]}
      >
        <View style={st.tabIndicator} />
      </Animated.View>
    </>
  );

  return (
    <View style={st.backdrop} pointerEvents="box-none">
      {/* Dark overlay */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }, backdropStyle]}
      />
      {/* Tap to collapse */}
      <Animated.View
        pointerEvents={snapStateRef.current === 'full' ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToCollapsedRef.current()} />
      </Animated.View>

      {/* Positioned via transform (not top) so dragging only recomposites instead of forcing a
          native layout pass every touch-move frame — top is a layout property and was part of
          the drag jank. The gesture itself is now a Reanimated/Gesture-Handler worklet (see
          `pan` above), which is the bigger fix: it runs on the UI thread with no per-frame
          JS-thread round trip at all. */}
      <GestureDetector gesture={pan}>
      <Animated.View style={[st.sheet, sheetAnimStyle]}>
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28 }]}>

          {/* ── FULL CONTENT ─────────────────────────────────────────────── */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            // Half-screen is a fixed crop (header + tab bar, nothing else) — not a
            // scrollable preview — so the only way out of it is the drag gesture (swipe up
            // to full, down to collapsed), not an internal scroll. Identical to
            // DestinationSheet.
            scrollEnabled={!isHalfState}
            bounces={false}
            showsVerticalScrollIndicator={false}
            onScroll={e => { scrollY.value = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
          >
            {/* ── HEADER ───────────────────────────────────────────────── */}
            <Animated.View style={[st.header, { backgroundColor: accentColor }, headerAnimStyle]}>
              {/* Country photo background */}
              {photoUrl && (
                <Image
                  source={{ uri: photoUrl }}
                  style={StyleSheet.absoluteFill as any}
                  resizeMode="cover"
                />
              )}
              {/* Dark scrim for text legibility */}
              <View style={[StyleSheet.absoluteFill as any, {
                backgroundColor: photoUrl ? 'rgba(0,0,0,0.45)' : `${accentColor}CC`,
              }]} />

              {/* Drag handle — the compact card has its own (pillRow/pill below), but that
                  card is hidden entirely in half-screen, so half needs its own visible
                  handle at the sheet's own top-center to signal it's draggable. */}
              {isHalfState && (
                <View pointerEvents="none" style={st.halfHandleRow}>
                  <View style={st.halfHandle} />
                </View>
              )}

              {/* Close button removed — the back-navigation pill (rendered by the map
                  screen, not this sheet) now glides to sit in that same top-left spot
                  instead, identical to DestinationSheet's own hero top row. */}
              <Animated.View style={[st.headerTopRow, headerTopRowStyle, { justifyContent: 'flex-end' }]}>
                <View style={st.headerActionsRight}>
                  <Pressable
                    style={[st.headerVisitPill, isCountryVisited && st.headerVisitPillActive]}
                    onPress={handleToggleVisited} hitSlop={10}
                  >
                    {isCountryVisited
                      ? <Check size={15} color="white" strokeWidth={2.75} />
                      : <Plus size={15} color="white" strokeWidth={2.75} />}
                    <Text style={st.headerVisitPillTxt}>{isCountryVisited ? 'Visited' : 'Add Visit'}</Text>
                  </Pressable>
                  {/* Wishlisting only makes sense before a visit is logged — once visited,
                      the country has already been "gotten to", so the option disappears. */}
                  {!isCountryVisited && (
                    <Pressable
                      style={[st.headerWishlistBtn, isCountryWishlisted && st.headerWishlistBtnActive]}
                      onPress={handleToggleWishlist} hitSlop={10}>
                      <Heart size={16} color="white" fill={isCountryWishlisted ? 'white' : 'none'} strokeWidth={isCountryWishlisted ? 0 : 2.25} />
                    </Pressable>
                  )}
                </View>
              </Animated.View>

              {/* Measured via onLayout (natural, unclipped size) to drive headerAnimStyle's
                  "full" anchor — this wrapper's own padding accounts for the whole header's
                  total natural height, so no extra math is needed at the measurement site. */}
              <View
                style={[st.headerContentWrap, { paddingTop: insets.top + 16 }]}
                onLayout={e => {
                  const h = e.nativeEvent.layout.height;
                  if (h < 50 || Math.abs(h - headerFullHRef.current) < 2) return;
                  headerFullHRef.current = h;
                  headerFullHAnim.value = h;
                }}
              >
                <CircleFlag countryCode={cluster.countryCode} size={60} ring style={st.headerFlag} />
                <Text style={st.headerName}>{cluster.country}</Text>
                <Text style={st.headerContinent}>{continent}</Text>
                <View style={st.headerStats}>
                  <View style={st.headerStat}>
                    <Text style={st.headerStatNum}>{dests.length}</Text>
                    <Text style={st.headerStatLbl}>destination{dests.length !== 1 ? 's' : ''}</Text>
                  </View>
                  {spotsCount > 0 && (
                    <View style={st.headerStat}>
                      <Text style={st.headerStatNum}>{spotsCount}</Text>
                      <Text style={st.headerStatLbl}>spot{spotsCount !== 1 ? 's' : ''}</Text>
                    </View>
                  )}
                  {wishlistCount > 0 && (
                    <View style={st.headerStat}>
                      <Text style={st.headerStatNum}>{wishlistCount}</Text>
                      <Text style={st.headerStatLbl}>wishlisted</Text>
                    </View>
                  )}
                </View>
              </View>
            </Animated.View>

            {/* ── TAB BAR ──────────────────────────────────────────────── */}
            <View style={st.tabBar}>
              {renderTabBarRow()}
            </View>

            {/* ── CONTENT ──────────────────────────────────────────────── */}
            <GestureDetector gesture={tabSwipeGesture}>
            <View style={st.slideTrack}>
              <Animated.View style={[st.slideRow, { width: W * TAB_ORDER.length }, slideRowStyle]}>

                {/* ── MY VISIT PANEL — visited countries only ─────────── */}
                {isCountryVisited && (
                  <View style={st.slidePanel}>
                    <View style={st.memCard}>
                      <View style={st.memTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={st.memDateCaption}>VISITED</Text>
                          <Text style={st.memDateVal}>
                            {savedCountry?.visitDate
                              ? new Date(savedCountry.visitDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                              : 'Date unknown'}
                          </Text>
                        </View>
                        <Pressable style={st.memRemoveBtn} onPress={handleToggleVisited} hitSlop={8}>
                          <Trash2 size={13} color="#EF4444" />
                          <Text style={st.memRemoveBtnTxt}>Remove</Text>
                        </Pressable>
                      </View>
                      <View style={st.memDivider} />
                      <Text style={st.memSectionLabel}>NOTES</Text>
                      <TextInput
                        style={st.memNotesInput}
                        placeholder="Write about your trip…"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        value={savedCountry?.notes ?? ''}
                        onChangeText={(text) => updateSavedCountry(cluster.countryCode, { notes: text })}
                      />
                    </View>
                  </View>
                )}

                {/* ── ABOUT PANEL ──────────────────────────────────────── */}
                <View style={st.slidePanel}>
                  <View style={st.glanceCard}>
                    <Text style={st.glanceTitle}>At a Glance</Text>
                    {facts ? (
                      <>
                        <View style={st.glanceRow}>
                          <View style={st.glanceIconWrap}><Users size={15} color="#374151" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.glanceLbl}>Population</Text>
                            <Text style={st.glanceVal}>{facts.population}</Text>
                          </View>
                        </View>
                        <View style={st.glanceDivider} />
                        <View style={st.glanceRow}>
                          <View style={st.glanceIconWrap}><Languages size={15} color="#374151" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.glanceLbl}>Language{facts.languages.length > 1 ? 's' : ''}</Text>
                            <Text style={st.glanceVal}>{facts.languages.join(', ')}</Text>
                          </View>
                        </View>
                        <View style={st.glanceDivider} />
                        <View style={st.glanceRow}>
                          <View style={st.glanceIconWrap}><Coins size={15} color="#374151" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.glanceLbl}>Currency</Text>
                            <Text style={st.glanceVal}>{facts.currency}</Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <Text style={st.glanceEmpty}>No details available yet.</Text>
                    )}
                  </View>
                </View>

                {/* ── DESTINATIONS PANEL ───────────────────────────────── */}
                <View style={st.slidePanel}>
                  <DestinationsPanel
                    dests={dests}
                    savedDestinations={savedDestinations}
                    onSelectDestination={onSelectDestination}
                    onGoToDestinationsMap={onGoToDestinationsMap}
                  />
                </View>

              </Animated.View>
            </View>
            </GestureDetector>
          </ScrollView>

          {/* ── COMPACT CARD (slides off as sheet opens) ─────────────── */}
          {/* Force-hidden in half-screen mode: compactAnimStyle's clamp only fully clears
              it once the sheet has passed the collapsed card's own height above HALF_POS,
              which isn't reliably true at exactly the screen midpoint. Identical reasoning
              to DestinationSheet. */}
          <Animated.View
            pointerEvents={isHalfState ? 'none' : 'auto'}
            style={[
              st.compactCard,
              isAnyVisited && st.compactCardVisited,
              !isAnyVisited && isAnyWishlist && st.compactCardWishlist,
              { opacity: isHalfState ? 0 : 1 },
              compactAnimStyle,
            ]}
            onLayout={e => {
              const h = e.nativeEvent.layout.height;
              if (h < 20) return;
              const newCY = Math.max(0, H - BOTTOM_TAB_H - h);
              if (Math.abs(newCY - collapsedYRef.current) < 2) return;
              collapsedYRef.current = newCY;
              collapsedYAnim.value = newCY;
              if (snapStateRef.current === 'collapsed') {
                lastPos.value = newCY;
                slideAnim.value = withTiming(newCY, QUICK_CONFIG);
              }
            }}
          >
            <View pointerEvents="none" style={st.pillRow}>
              <View style={st.pill} />
            </View>
            <Pressable style={st.compactRow} onPress={() => snapToFullRef.current()}>
              <View style={[st.compactThumb, { backgroundColor: accentColor + '22' }]}>
                {photoUrl
                  ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                  : <CircleFlag countryCode={cluster.countryCode} size={40} />
                }
              </View>
              <View style={st.compactInfo}>
                <View style={st.compactNameRow}>
                  <CircleFlag countryCode={cluster.countryCode} size={16} />
                  <Text style={st.compactName} numberOfLines={1}>{cluster.country}</Text>
                  {isCountryVisited && (
                    <View style={[st.compactStatusPill, st.compactStatusPillVisited]}>
                      <Check size={9} color="white" strokeWidth={2.5} />
                      <Text style={st.compactStatusPillTxt}>Visited</Text>
                    </View>
                  )}
                  {!isCountryVisited && isAnyWishlist && (
                    <View style={[st.compactStatusPill, st.compactStatusPillWishlist]}>
                      <Heart size={9} color="white" strokeWidth={2.5} fill="white" />
                      <Text style={st.compactStatusPillTxt}>Wishlist</Text>
                    </View>
                  )}
                </View>
                <Text style={st.compactMeta}>
                  {dests.length} destination{dests.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={st.openBtn}>
                <Text style={st.openBtnTxt}>Open</Text>
              </View>
            </Pressable>
          </Animated.View>

        </View>
      </Animated.View>
      </GestureDetector>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 200, elevation: 200 },

  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0, height: H,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F9FAFB',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    overflow: 'hidden',
  },
  // Holds the actual flow content (flag/name/continent/stats) — its own natural height
  // (unaffected by the outer header's animated crop) is what's measured via onLayout to
  // drive headerFullHAnim, mirroring DestinationSheet's hero-height approach.
  headerContentWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
    minHeight: HEADER_H,
  },
  // Half-screen's own drag handle — shown over the cropped header, mirroring
  // DestinationSheet's halfHandleRow/halfHandle.
  halfHandleRow: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  halfHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.65)' },
  // Placement and style copied directly from DestinationSheet's heroTopRow: close button on
  // the left, visit pill + wishlist button grouped on the right via headerActionsRight.
  headerTopRow: {
    position: 'absolute', left: 14, right: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10,
  },
  headerActionsRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  headerVisitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 36, borderRadius: 18, paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  headerVisitPillActive: { backgroundColor: '#059669', borderColor: 'transparent' },
  headerVisitPillTxt: { fontSize: 13, fontWeight: '700', color: 'white' },
  headerWishlistBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  headerWishlistBtnActive: { backgroundColor: '#DB2777', borderColor: 'transparent' },
  headerFlag:      { marginBottom: 10, marginTop: 8 },
  headerName:      { fontSize: 28, fontWeight: '800', color: 'white', textAlign: 'center', marginBottom: 4 },
  headerContinent: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.78)', marginBottom: 16 },
  headerStats:     { flexDirection: 'row', gap: 24 },
  headerStat:      { alignItems: 'center' },
  headerStatNum:   { fontSize: 20, fontWeight: '800', color: 'white' },
  headerStatLbl:   { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  // ── Tab bar ─────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    marginTop: -20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  tabBtn:    { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabBtnTxt: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },
  tabBtnTxtActive: { color: '#111827' },
  tabDivider: { width: StyleSheet.hairlineWidth, marginVertical: 14, backgroundColor: '#E5E7EB' },
  tabIndicatorTrack: { position: 'absolute', bottom: 0, alignItems: 'center' },
  tabIndicator: { width: 28, height: 2.5, backgroundColor: '#111827', borderRadius: 2 },

  // ── Tab content slide track ─────────────────────────────────────────────────
  slideTrack: { overflow: 'hidden', width: W },
  slideRow:   { flexDirection: 'row', alignItems: 'flex-start' },
  slidePanel: { width: W, paddingHorizontal: 16, paddingTop: 16, gap: 16 },

  // ── My Visit panel ──────────────────────────────────────────────────────────
  memCard: {
    backgroundColor: 'white', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F0F1F3', gap: 4,
  },
  memTopRow: { flexDirection: 'row', alignItems: 'center' },
  memDateCaption: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  memDateVal: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 2 },
  memRemoveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: '#FEF2F2',
  },
  memRemoveBtnTxt: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  memDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F1F3', marginVertical: 12 },
  memSectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 6 },
  memNotesInput: {
    fontSize: 14, color: '#111827', minHeight: 60, textAlignVertical: 'top',
  },

  // ── About panel — At a Glance ───────────────────────────────────────────────
  glanceCard: {
    backgroundColor: 'white', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F0F1F3',
  },
  glanceTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  glanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  glanceIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  glanceLbl: { fontSize: 11.5, color: '#9CA3AF', fontWeight: '600' },
  glanceVal: { fontSize: 14.5, color: '#111827', fontWeight: '700', marginTop: 1 },
  glanceDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F1F3', marginVertical: 12 },
  glanceEmpty: { fontSize: 13, color: '#9CA3AF' },

  // ── Destinations grid — identical pattern to DestinationSheet's own SpotsPanel/grid. ──
  mapViewBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
                     backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
                     borderWidth: 1, borderColor: '#F0F1F3' },
  mapViewBtnTxt:   { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterRow:       { gap: 8, paddingBottom: 2, paddingRight: 4 },
  filterTag:       { flexDirection: 'row', alignItems: 'center', gap: 6,
                     backgroundColor: '#F3F4F6', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  filterTagActive: { backgroundColor: '#059669' },
  filterTagIcon:   { fontSize: 13 },
  filterTagTxt:    { fontSize: 13.5, fontWeight: '600', color: '#4B5563' },
  filterTagTxtActive: { color: 'white' },
  gridEmptyTxt:    { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },

  destGrid:              { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  destGridCard:          { width: GRID_CARD_W, gap: 8 },
  destGridImageWrap:     { width: GRID_CARD_W, height: GRID_CARD_W * 0.87, borderRadius: 16,
                           overflow: 'hidden', backgroundColor: '#F3F4F6' },
  destGridPlaceholder:   { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  destGridPlaceholderIcon: { fontSize: 36 },
  destGridBadge:         { position: 'absolute', bottom: 10, left: 10, width: 38, height: 38, borderRadius: 19,
                           backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  destGridBadgeIcon:     { fontSize: 17 },
  destGridStatusPill:    { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
                           borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  destGridStatusPillVisited:  { backgroundColor: '#059669' },
  destGridStatusPillWishlist: { backgroundColor: '#DB2777' },
  destGridStatusPillTxt: { fontSize: 10, fontWeight: '700', color: 'white' },
  destGridName:          { fontSize: 15, fontWeight: '800', color: '#111827', lineHeight: 19 },
  destGridMeta:          { fontSize: 12.5, color: '#6B7280', lineHeight: 17 },

  // ── Compact card ────────────────────────────────────────────────────────────
  compactCard: {
    position: 'absolute', left: 0, right: 0, top: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10, shadowRadius: 16, elevation: 12,
  },
  compactCardVisited:  {},
  compactCardWishlist: {},

  pillRow: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  pill:    { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },

  compactRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingTop: 28, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F1F3',
  },
  compactThumb: {
    width: 66, height: 66, borderRadius: 14,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  compactInfo: { flex: 1, paddingHorizontal: 12, paddingTop: 2 },
  compactNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  compactName: { fontSize: 20, fontWeight: '800', color: '#111827', flexShrink: 1 },
  compactMeta: { fontSize: 12, color: '#6B7280' },

  openBtn: {
    backgroundColor: '#111827', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9,
    flexShrink: 0, alignSelf: 'center',
  },
  openBtnTxt: { fontSize: 13, fontWeight: '700', color: 'white' },

  // Visited/wishlist status — an inline pill right of the country name, instead of a tab
  // overlaid on top of the compact card.
  compactStatusPill:         { flexDirection: 'row', alignItems: 'center', gap: 3,
                                borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  compactStatusPillVisited:  { backgroundColor: '#059669' },
  compactStatusPillWishlist: { backgroundColor: '#DB2777' },
  compactStatusPillTxt:      { fontSize: 10, fontWeight: '700', color: 'white' },
});
