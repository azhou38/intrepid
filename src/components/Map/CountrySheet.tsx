import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
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
import { Check, Plus, Users, Languages, Coins, Trash2, Maximize, Landmark } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useStore } from '../../store';
import type { Destination, CountryCluster } from '../../types';
import { DESTINATIONS } from '../../data/destinations';
import { SPOTS } from '../../data/spots';
import { photoCache, getOrFetchWikiThumbnail } from '../../utils/photoCache';
import CircleFlag from '../CircleFlag';
import { sheetPose } from './sheetPose';
import EntityPhoto from './EntityPhoto';
import DestinationCard from './DestinationCard';

interface Props {
  cluster: CountryCluster;
  onClose: () => void;
  onSelectDestination: (dest: Destination) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  // Written to continuously (every frame, not just at snap boundaries) with the exact
  // "bottom" offset the back-to-world pill should sit at *right now* — computed here (this
  // sheet owns slideAnim and its snap-point constants) by piecewise-interpolating between
  // the collapsed/full resting targets as slideAnim moves — identical mechanism to
  // DestinationSheet's. A shared value (not a JS callback) so the write happens directly on
  // the UI thread with zero JS-thread hop, letting the pill track the sheet's top edge in
  // true lockstep while dragging.
  pillOffsetSV?: SharedValue<number>;
  // While true, some other UI owns the pill's position instead — this sheet's writes to
  // pillOffsetSV are suppressed so the two don't fight.
  pillOffsetLockedSV?: SharedValue<boolean>;
  // Fires on every snap transition — lets the caller know when this sheet is collapsed vs.
  // full-screen. Identical to DestinationSheet's.
  onSnapStateChange?: (state: CountrySnapState) => void;
  // Mount-time only — lets a caller open straight to a specific tab (e.g. the destination
  // sheet's collapsed carousel "List" button reopening this sheet on the Destinations tab).
  // Identical to DestinationSheet's own initialTab.
  initialTab?: CountryTab;
  // Mount-time only — lets a caller open straight to a specific snap point (e.g. swiping
  // down from DestinationSheet's own collapsed carousel lands here collapsed too, instead
  // of the usual full-screen default). Identical to DestinationSheet's own initialSnap.
  initialSnap?: CountrySnapState;
  // Bump this (e.g. an incrementing counter) to imperatively collapse the sheet from the
  // parent — used by the back pill's down-arrow while the sheet is full-screen.
  collapseSignal?: number;
  // Bump this to imperatively drop the sheet to its "peek" (bottom-screen) state — used by
  // the parent when the user pans/zooms the map. Identical to DestinationSheet's own
  // peekSignal.
  peekSignal?: number;
  // Set by MapScreen to Date.now() on every camera event of a live map gesture. Zooming the map
  // with a finger resting on this sheet's strip used to be read as a swipe of the sheet itself —
  // the finger travels upward during a pinch-in — so lifting it snapped the sheet to half-screen.
  mapGestureAtSV?: SharedValue<number>;
  // True while the user is interacting with the map (fingers down and the map moving); a selection change or new
  // sheet during that interaction stays peeked. Read on the JS thread only.
  isMapInteracting?: () => boolean;
  enterFromPrevious?: boolean;   // this sheet replaces another one that was showing: start where it rested, not below the screen
  isPressBlocked?: () => boolean;   // a press that is really a finger of a map gesture (see MapScreen.pressBlocked)
  // Increments when the parent is about to close this sheet (the back pill's X): slide it off
  // the bottom of the screen first, so it leaves rather than vanishing. Parent then unmounts it.
  exitSignal?: number;
}

const { height: H, width: W } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;
// Same bottom-tab-bar reservation App.tsx's Tab.Navigator uses for its own tabBarStyle
// height — the country sheet lives inside that "Map" tab's screen, so anything it shows
// must end above this, not at the raw device bottom edge.
const BOTTOM_TAB_H = Platform.OS === 'ios' ? 88 : 64;
// Collapsed ("half-screen") sits at exactly the screen's vertical midpoint — same fixed
// point DestinationSheet/SpotSheet use — so the bottom-screen/half-screen heights match
// exactly across every sliding sheet in the app (spot, destination, country, explore).
const COLLAPSED_Y = H / 2;
// Total budget available for the header (cropped) + tab bar between the sheet's collapsed
// top edge and the app's own tab bar.
const COMPACT_H   = Math.max(0, (H - BOTTOM_TAB_H) - COLLAPSED_Y);
// How far the tab bar's own top edge tucks up UNDER the header's rounded bottom corner
// (its marginTop below, in styles) — mirrors DestinationSheet's own TAB_BAR_TUCK mechanism,
// just matched to THIS sheet's own tab bar corner radius/tuck amount (20, not 24).
const TAB_BAR_TUCK = 20;
// Matches DestinationSheet's own HERO_H so both sheets' full-screen headers read as the
// same size instead of the country header looking noticeably shorter.
const HEADER_H    = Math.round(H * 0.52);
// How far the header's content stack slides down as the sheet reaches half-screen (0 at
// full-screen) — see headerContentShiftStyle.
const HALF_CONTENT_SHIFT = 25;
// Peek ("bottom-screen") — slid down further than collapsed, so only a thin strip with the
// country's own photo, name, and destination/spot counts sticks up above the tab bar.
// Entered automatically (not by user drag) whenever the map is panned/zoomed, exactly like
// DestinationSheet/SpotSheet's own peek strip — same fixed height (90) so every sheet's
// bottom-screen view matches.
const PEEK_STRIP_H = 90;
const PEEK_Y = Math.max(COLLAPSED_Y, (H - BOTTOM_TAB_H) - PEEK_STRIP_H);
// Snap transitions ease to their target with no overshoot at all — a plain duration+curve
// tween instead of a physical spring, since any spring (even lightly underdamped) reads as
// "bouncy" here given how large a distance these snaps travel.
const SNAP_CONFIG  = { duration: 280, easing: Easing.out(Easing.cubic) };
const QUICK_CONFIG = { duration: 150, easing: Easing.out(Easing.cubic) };
// 2-column destinations grid — same math as DestinationSheet's own spot grid.
const GRID_GAP    = 14;
const GRID_CARD_W = (W - 32 - GRID_GAP) / 2;
const TAB_CONFIG   = { duration: 220, easing: Easing.out(Easing.cubic) };

// A handful of at-a-glance facts, scoped to just the countries that actually appear here
// (every CountryCluster is built from this app's curated destinations, so this list only
// ever needs to cover those countries' codes) — not a general-purpose country database.
const COUNTRY_FACTS: Record<string, { population: string; languages: string[]; currency: string; area: string; capital: string }> = {
  US: { population: '332 million',  languages: ['English'],                                    currency: 'US Dollar',          area: '9,834,000 km²', capital: 'Washington, D.C.' },
  FR: { population: '68 million',   languages: ['French'],                                      currency: 'Euro',               area: '551,700 km²',   capital: 'Paris' },
  GB: { population: '67.5 million', languages: ['English'],                                      currency: 'British Pound',      area: '243,600 km²',   capital: 'London' },
  IT: { population: '59 million',   languages: ['Italian'],                                      currency: 'Euro',               area: '301,300 km²',   capital: 'Rome' },
  ES: { population: '47.4 million', languages: ['Spanish'],                                      currency: 'Euro',               area: '505,990 km²',   capital: 'Madrid' },
  NL: { population: '17.8 million', languages: ['Dutch'],                                        currency: 'Euro',               area: '41,850 km²',    capital: 'Amsterdam' },
  DE: { population: '83.2 million', languages: ['German'],                                       currency: 'Euro',               area: '357,600 km²',   capital: 'Berlin' },
  PT: { population: '10.3 million', languages: ['Portuguese'],                                   currency: 'Euro',               area: '92,210 km²',    capital: 'Lisbon' },
  CH: { population: '8.7 million',  languages: ['German', 'French', 'Italian', 'Romansh'],        currency: 'Swiss Franc',        area: '41,290 km²',    capital: 'Bern' },
  AT: { population: '9 million',    languages: ['German'],                                       currency: 'Euro',               area: '83,880 km²',    capital: 'Vienna' },
  BE: { population: '11.6 million', languages: ['Dutch', 'French', 'German'],                    currency: 'Euro',               area: '30,690 km²',    capital: 'Brussels' },
  IE: { population: '5.1 million',  languages: ['Irish', 'English'],                              currency: 'Euro',               area: '70,270 km²',    capital: 'Dublin' },
  SE: { population: '10.5 million', languages: ['Swedish'],                                       currency: 'Swedish Krona',      area: '450,300 km²',   capital: 'Stockholm' },
  NO: { population: '5.4 million',  languages: ['Norwegian'],                                     currency: 'Norwegian Krone',    area: '385,200 km²',   capital: 'Oslo' },
  DK: { population: '5.9 million',  languages: ['Danish'],                                        currency: 'Danish Krone',       area: '43,090 km²',    capital: 'Copenhagen' },
  FI: { population: '5.5 million',  languages: ['Finnish', 'Swedish'],                            currency: 'Euro',               area: '338,500 km²',   capital: 'Helsinki' },
  IS: { population: '380 thousand', languages: ['Icelandic'],                                     currency: 'Icelandic Krona',    area: '103,000 km²',   capital: 'Reykjavik' },
  GR: { population: '10.4 million', languages: ['Greek'],                                         currency: 'Euro',               area: '131,960 km²',   capital: 'Athens' },
  CZ: { population: '10.5 million', languages: ['Czech'],                                         currency: 'Czech Koruna',       area: '78,870 km²',    capital: 'Prague' },
  JP: { population: '124 million',  languages: ['Japanese'],                                      currency: 'Japanese Yen',       area: '377,970 km²',   capital: 'Tokyo' },
  AU: { population: '26 million',   languages: ['English'],                                       currency: 'Australian Dollar',  area: '7,692,000 km²', capital: 'Canberra' },
};

type CountryTab = 'visit' | 'about' | 'destinations';
type CountrySnapState = 'peek' | 'collapsed' | 'full';

// ── Destinations panel — grid of the country's destinations, identical pattern to
// DestinationSheet's own SpotsPanel.
function DestinationsPanel({
  dests, savedDestinations, onSelectDestination,
}: {
  dests: Destination[];
  savedDestinations: Record<string, { type?: string }>;
  onSelectDestination: (dest: Destination) => void;
}) {
  return (
    <View style={{ gap: 16 }}>
      {dests.length > 0 ? (
        <View style={st.destGrid}>
          {dests.map(dest => {
            const saved      = savedDestinations[dest.id];
            const isVisited  = saved?.type === 'visited';
            return (
              <DestinationCard
                key={dest.id}
                dest={dest}
                isVisited={isVisited}
                width={GRID_CARD_W}
                showCountry={false}
                onPress={() => onSelectDestination(dest)}
              />
            );
          })}
        </View>
      ) : (
        <Text style={st.gridEmptyTxt}>No destinations yet.</Text>
      )}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function CountrySheet({
  cluster, onClose, onSelectDestination, onExpand, onCollapse,
  pillOffsetSV, pillOffsetLockedSV, onSnapStateChange, initialTab, initialSnap, collapseSignal, peekSignal, exitSignal, mapGestureAtSV, isMapInteracting, isPressBlocked, enterFromPrevious,
}: Props) {
  // Collapsed (bottom-screen carousel) is the default view whenever a country is selected —
  // callers only pass initialSnap explicitly for the other case (e.g. the destination sheet's
  // own "List view" button wants 'full').
  const resolvedInitialSnap: CountrySnapState = initialSnap ?? 'collapsed';
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

  const spotsCount = useMemo(() => {
    const destIds = new Set(dests.map(d => d.id));
    return SPOTS.filter(s => destIds.has(s.destinationId)).length;
  }, [dests]);

  const savedCountry       = savedCountries[cluster.countryCode];
  // A country counts as visited by default as soon as any of its destinations is (marking a spot
  // visited already marks its destination — see saveSpotVisited), without needing its own
  // saved entry. Only a country visit the user marked directly can be removed here; one implied
  // by a visited destination goes away when that destination does.
  const hasVisitedDest       = useMemo(
    () => dests.some(d => savedDestinations[d.id]?.type === 'visited'),
    [dests, savedDestinations],
  );
  const isCountryVisited     = !!savedCountry?.visitDate || hasVisitedDest;
  const facts = COUNTRY_FACTS[cluster.countryCode];

  const handleToggleVisited = useCallback(() => {
    if (hasVisitedDest) return;
    if (isCountryVisited) {
      unsaveCountry(cluster.countryCode);
    } else {
      saveCountryVisited(cluster.countryCode, { visitDate: new Date().toISOString().slice(0, 10) });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [isCountryVisited, hasVisitedDest, cluster.countryCode, saveCountryVisited, unsaveCountry]);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TAB_ORDER: CountryTab[] = useMemo(
    () => isCountryVisited ? ['visit', 'about', 'destinations'] : ['about', 'destinations'],
    [isCountryVisited],
  );
  const defaultTab: CountryTab = isCountryVisited ? 'visit' : 'about';
  const startTab: CountryTab = (initialTab && TAB_ORDER.includes(initialTab)) ? initialTab : defaultTab;
  const [activeTab, setActiveTab] = useState<CountryTab>(startTab);
  const isTabSelected = (tab: CountryTab) => activeTab === tab;
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

  // Measured natural height of each tab's panel, indexed to TAB_ORDER. The panels sit in a
  // flexDirection:'row', so without this the track's height is the TALLEST of them and the
  // ScrollView's scroll extent is governed by whichever tab is longest rather than the one
  // actually on screen — France's About tab, for instance, scrolled down into ~160px of blank
  // space left over from its taller Destinations tab. Driving the track's height off the same
  // shared value as the horizontal slide keeps the two in lockstep, so the height eases across
  // during a tab swipe rather than jumping when the swipe settles.
  const panelHeightsSV  = useSharedValue<number[]>([]);
  const panelHeightsRef = useRef<number[]>([]);
  const measurePanel = useCallback((index: number, h: number) => {
    if (index < 0 || !h) return;
    if (Math.abs((panelHeightsRef.current[index] ?? 0) - h) < 1) return;
    const next = panelHeightsRef.current.slice();
    next[index] = h;
    panelHeightsRef.current = next;
    panelHeightsSV.value = next;
  }, []);
  const slideTrackStyle = useAnimatedStyle(() => {
    const hs = panelHeightsSV.value;
    // Before the first layout pass, fall through to auto height rather than collapsing to 0.
    if (hs.length === 0) return { height: undefined };
    const last = hs.length - 1;
    // tabSlideAnim runs 0, -W, -2W… per tab index, and is fractional mid-drag.
    const progress = -tabSlideAnim.value / W;
    const i0 = Math.max(0, Math.min(last, Math.floor(progress)));
    const i1 = Math.max(0, Math.min(last, i0 + 1));
    const t  = Math.max(0, Math.min(1, progress - i0));
    const h0 = hs[i0] || 0;
    const h1 = hs[i1] || h0;
    const h  = h0 + (h1 - h0) * t;
    return { height: h > 0 ? h : undefined };
  });

  // If the country's visited-state flips while the sheet is open (marking/unmarking visited
  // adds or removes the "My Visit" tab), keep the slide position matched to whichever tab is
  // still active instead of leaving it misaligned.
  useEffect(() => {
    // Panel indices are positional within TAB_ORDER, so adding/removing "My Visit" shifts
    // every measurement by one — drop them and let the panels re-report on the next layout
    // (the track falls back to auto height for that single frame).
    panelHeightsRef.current = [];
    panelHeightsSV.value = [];
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
  }, []);

  // ── Sheet animation ──────────────────────────────────────────────────────────
  const snapStateRef = useRef<CountrySnapState>(resolvedInitialSnap);
  // Mirrors snapStateRef but readable from the UI-thread gesture worklets below.
  const snapStateSV  = useSharedValue<CountrySnapState>(resolvedInitialSnap);
  // Real React state mirror (unlike the ref above, mutating it DOES trigger a re-render) —
  // needed for scrollEnabled below, which must flip the instant the sheet reaches
  // full-screen. Identical mechanism/reasoning to DestinationSheet's own snapStateReact.
  const [snapStateReact, setSnapStateReact] = useState<CountrySnapState>(resolvedInitialSnap);
  const reportSnapState = useCallback((state: CountrySnapState) => {
    setSnapStateReact(state);
    onSnapStateChange?.(state);
  }, [onSnapStateChange]);
  const slideAnim    = useSharedValue(enterFromPrevious ? (sheetPose.get() ?? CLOSE_POS) : CLOSE_POS);
  const lastPos      = useSharedValue(
    resolvedInitialSnap === 'full' ? FULL_POS : COLLAPSED_Y,
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
  // Matches DestinationSheet's own fullHeroH (HERO_H - insets.bottom) — so the tab bar,
  // which sits directly below the header in both sheets, lands at the same y-position
  // in full-screen view for both.
  const fullHeaderH = HEADER_H - insets.bottom;
  const headerFullHRef  = useRef(fullHeaderH);
  const headerFullHAnim = useSharedValue(fullHeaderH);
  // Measured live (tab bar height varies slightly by tab count/font rendering) — mirrors
  // DestinationSheet's own tabBarHAnim exactly.
  const tabBarHAnim = useSharedValue(50);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [1, 0], Extrapolation.CLAMP),
  }));

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }],
  }));

  // Header height animates CONTINUOUSLY with the drag — one single element that grows from
  // its collapsed-height crop up to its measured full height, rather than a separate
  // duplicate compact card sliding away to reveal the header underneath. Identical
  // mechanism/reasoning to DestinationSheet's own heroAnimStyle: collapsed crop = the
  // available budget (COMPACT_H) minus the tab bar's own net footprint beyond its
  // TAB_BAR_TUCK overlap, so the tab bar (with its underline) always lands fully inside the
  // collapsed/half-screen visible window instead of being clipped at its edge. Clamped past
  // COLLAPSED_Y so it holds steady while peeking (the peek strip overlay takes over there).
  const headerAnimStyle = useAnimatedStyle(() => {
    const collapsedHeaderH = COMPACT_H - Math.max(0, tabBarHAnim.value - TAB_BAR_TUCK);
    return {
      height: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [headerFullHAnim.value, collapsedHeaderH], Extrapolation.CLAMP),
    };
  });

  // Top offset animates continuously with the drag — same reasoning as DestinationSheet's
  // own heroTopRowStyle: at full-screen the row needs to clear the status bar, but at
  // collapsed the sheet's own top edge already sits well below it.
  const headerTopRowStyle = useAnimatedStyle(() => ({
    top: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [insets.top + 20, 20], Extrapolation.CLAMP),
  }));
  // Nudges the flag/name/continent/stats stack down as the sheet approaches half-screen, and
  // only there — at full-screen the offset is 0, so that view is untouched. The content wrap
  // keeps its full natural height and is bottom-anchored inside the header, so the header's
  // animated crop removes space off the TOP; without this the stack ends up sitting tight
  // against that cropped edge at half-screen. A transform (not padding) so it can't perturb
  // the wrap's onLayout measurement, which feeds headerFullHAnim.
  const headerContentShiftStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(
        slideAnim.value, [FULL_POS, COLLAPSED_Y], [0, HALF_CONTENT_SHIFT], Extrapolation.CLAMP,
      ),
    }],
  }));
  // Invisible right at full-screen, fading in over the first 40pt of dragging away from it —
  // mirrors DestinationSheet's own dragPillStyle.
  const dragPillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, FULL_POS + 40], [0, 1], Extrapolation.CLAMP),
  }));
  // Peek strip: fades in only once the sheet drops past collapsed toward peek — mirrors
  // DestinationSheet's own peekAnimStyle.
  const peekAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [COLLAPSED_Y, PEEK_Y], [0, 1], Extrapolation.CLAMP),
  }));

  // Continuously writes the back-to-world pill's target "bottom" offset as slideAnim moves,
  // so the parent's pill mirrors this sheet's own top edge frame-for-frame while dragging
  // between collapsed/full, instead of only re-targeting once a drag settles. Written
  // directly to the shared value passed in via pillOffsetSV — no runOnJS/JS-thread hop, since
  // both this sheet and the pill are UI-thread Reanimated values.
  //
  // Now that the header's own close button is gone, the pill takes over that exact spot for
  // as long as the sheet is full screen — identical mechanism (and identical bugfix) to
  // DestinationSheet's own reaction: the FULL_POS leg mirrors headerTopRowStyle's
  // top-position formula, converted to "bottom" terms against the pill's *actual* container
  // (MapScreen's root, which is shorter than the full device height by BOTTOM_TAB_H, since
  // App.tsx's tab bar reserves its own layout space rather than floating over the content).
  // The collapsed leg is untouched — same tuned resting target as before.
  useAnimatedReaction(
    () => slideAnim.value,
    (value) => {
      if (!pillOffsetSV || pillOffsetLockedSV?.value) return;
      const PILL_H = 36;
      const SCREEN_H = H - BOTTOM_TAB_H;
      const FULL_TOP_ABS = FULL_POS + (insets.top + 20);
      const FULL_TARGET = SCREEN_H - FULL_TOP_ABS - PILL_H;
      // Collapsed: float a fixed gap above the header's own measured top (collapsedYAnim.value),
      // same convention as DestinationSheet's own reaction.
      const COLLAPSED_PILL_GAP = 16;
      const COLLAPSED_TOP_ABS = collapsedYAnim.value - COLLAPSED_PILL_GAP - PILL_H;
      const COLLAPSED_TARGET = SCREEN_H - COLLAPSED_TOP_ABS - PILL_H;
      // Peek: same fixed-gap-above-the-visible-top idea, now against the peek strip's own
      // (fixed) top instead of the collapsed header's measured one.
      const PEEK_TOP_ABS = PEEK_Y - COLLAPSED_PILL_GAP - PILL_H;
      const PEEK_TARGET = SCREEN_H - PEEK_TOP_ABS - PILL_H;
      pillOffsetSV.value = interpolate(
        value,
        [FULL_POS, collapsedYAnim.value, PEEK_Y],
        [FULL_TARGET, COLLAPSED_TARGET, PEEK_TARGET],
        Extrapolation.CLAMP,
      );
    },
    [insets.bottom, insets.top],
  );

  // ── Sheet position: one authority ─────────────────────────────────────────────────────────────────────
  // Same design as DestinationSheet (see the long comment there): snapStateRef / snapStateSV hold the snap this
  // sheet is meant to be in, and every position change except the user's own finger drag goes through
  // transitionTo. Selecting another country used to snap the sheet to CLOSE_POS and slide it back up to
  // half-screen, which fought the map gesture's peek; it now goes straight to the right snap.
  const didMountRef = useRef(false);
  const closingRef = useRef(false);
  const transitionToRef = useRef<(next: CountrySnapState, reason: string) => void>(() => {});
  transitionToRef.current = (next, reason) => {
    // Once the parent has told this sheet to leave, only a NEW selection may bring it back.
    if (closingRef.current && reason !== 'selectionChange') return;
    closingRef.current = false;
    const prev = snapStateRef.current;
    const target = next === 'full' ? FULL_POS : next === 'peek' ? PEEK_Y : collapsedYRef.current;
    if (__DEV__) console.log('[sheet] Country', cluster.countryCode, prev, '->', next, `reason=${reason}`, 'mapInteracting=', isMapInteracting?.() ?? false);
    snapStateRef.current = next;
    snapStateSV.value = next;
    lastPos.value = target;
    // Mounting straight into 'collapsed' never told the parent to collapse; 'peek' and 'full' always did.
    if (next === 'full') onExpand?.(); else if (reason !== 'mount' || next === 'peek') onCollapse?.();
    sheetPose.set(next === 'full' ? null : target);
    slideAnim.value = withTiming(target, SNAP_CONFIG);
    reportSnapState(next);
  };

  // Slide in on mount — collapsed (half-screen) by default whenever a country is selected, unless initialSnap
  // requests otherwise: 'full' for the destination sheet's own "List view" button, 'peek' when returning up from a
  // destination via the breadcrumb (the map is framed for a fully-visible screen there, so the sheet has to stay
  // out of the way), or peeked from the start when the map is being interacted with.
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    transitionToRef.current(
      resolvedInitialSnap === 'peek' ? 'peek'
        : resolvedInitialSnap === 'full' ? 'full'
        : isMapInteracting?.() ? 'peek' : 'collapsed',
      'mount',
    );
  }, []);

  // A different country was selected while this sheet is up (it isn't remounted). Straight to the snap it should
  // be in now: half-screen for an ordinary tap, peeked if the user is mid map gesture. Not the first mount, which
  // already applied initialSnap above.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    transitionToRef.current(isMapInteracting?.() ? 'peek' : 'collapsed', 'selectionChange');
  }, [cluster.country]);

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
  //
  // Rendered by <EntityPhoto> (see EntityPhoto.tsx), keyed on the country, so the photo can only ever be this
  // country's and its loading never re-renders this sheet. getOrFetchWikiThumbnail (rather than a bare
  // fetchWikiThumbnail) shares whatever request handleCountryPress already kicked off via prefetchWikiThumbnail
  // at pin-tap time.
  const countryPhotoKey = `country_${cluster.countryCode}`;
  const loadCountryPhoto = () => {
    const topDest = dests[0];
    return topDest
      ? getOrFetchWikiThumbnail(countryPhotoKey, photoCache, topDest.name, 900, cluster.country)
      : getOrFetchWikiThumbnail(countryPhotoKey, photoCache, cluster.country, 900);
  };

  // Use refs so the gesture worklets (created once) always call the latest version
  const snapToFullRef = useRef(() => {});
  snapToFullRef.current = () => transitionToRef.current('full', 'user');
  const snapToCollapsedRef = useRef(() => {});
  snapToCollapsedRef.current = () => transitionToRef.current('collapsed', 'user');
  const snapToPeekRef = useRef(() => {});
  snapToPeekRef.current = () => transitionToRef.current('peek', 'user');

  // Imperatively collapse from the parent — used by the back pill's down-arrow while this
  // sheet is full-screen. No-ops on mount (only reacts to actual increments).
  const lastCollapseSignalRef = useRef(collapseSignal);
  useEffect(() => {
    if (collapseSignal === undefined || collapseSignal === lastCollapseSignalRef.current) return;
    lastCollapseSignalRef.current = collapseSignal;
    if (snapStateRef.current === 'full') transitionToRef.current('collapsed', 'backPill');
  }, [collapseSignal]);

  // Slide off the bottom, quickly, when the parent signals it's closing this sheet.
  const lastExitSignalRef = useRef(exitSignal);
  useEffect(() => {
    if (exitSignal === undefined || exitSignal === lastExitSignalRef.current) return;
    lastExitSignalRef.current = exitSignal;
    closingRef.current = true;
    if (__DEV__) console.log('[sheet] Country', cluster.countryCode, snapStateRef.current, '-> closed', 'reason=exit');
    sheetPose.set(null);
    slideAnim.value = withTiming(CLOSE_POS, { duration: 180, easing: Easing.in(Easing.cubic) });
  }, [exitSignal]);

  // Imperatively drop to peek from the parent — used when the user pans/zooms the map.
  // No-ops if already peeking or dismissed. Identical to DestinationSheet's own peekSignal.
  const lastPeekSignalRef = useRef(peekSignal);
  useEffect(() => {
    if (peekSignal === undefined || peekSignal === lastPeekSignalRef.current) return;
    lastPeekSignalRef.current = peekSignal;
    if (snapStateRef.current === 'collapsed' || snapStateRef.current === 'full') transitionToRef.current('peek', 'mapGesture');
  }, [peekSignal]);

  const dismissSheetRef = useRef(() => {});
  dismissSheetRef.current = () => {
    sheetPose.set(null);
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
  const callSnapToCollapsed = useCallback(() => snapToCollapsedRef.current(), []);
  const callSnapToPeek      = useCallback(() => snapToPeekRef.current(), []);
  const callSnapBack = useCallback(() => {
    const st = snapStateRef.current;
    if (st === 'peek') snapToPeekRef.current();
    else if (st === 'full') snapToFullRef.current();
    else snapToCollapsedRef.current();
  }, []);
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
    .maxPointers(1)   // a two-finger map pinch that lands on the sheet is never a drag of it
    //Only activates once the drag is decisively vertical, ceding horizontal drags to the
    // tab-swipe gesture below instead of racing it for every touch.
    .activeOffsetY([-10, 10])
    .failOffsetX([-10, 10])
    .onStart(() => {
      dragEngagedSV.value = false;
      lastPos.value = slideAnim.value;
    })
    .onUpdate(e => {
      // A map pinch/pan in progress (or just finished) owns this touch: a finger that lands on this
      // sheet during a two-finger map gesture must not drag it (see mapGestureAtSV).
      if (mapGestureAtSV && Date.now() - mapGestureAtSV.value < 400) return;
      if (Math.abs(e.translationX) >= Math.abs(e.translationY)) return;
      // Mirrors the old onMoveShouldSetPanResponderCapture gate: while full-screen, only
      // let this gesture pull the sheet down once its inner ScrollView is already at top.
      if (snapStateSV.value === 'full' && !(scrollY.value <= 1 && e.translationY > 6)) return;
      dragEngagedSV.value = true;
      const raw = lastPos.value + e.translationY;
      if (snapStateSV.value === 'collapsed' || snapStateSV.value === 'peek') {
        // Peek is the lowest point — swiping down from either collapsed or peek can no
        // longer dismiss the sheet (exit to world view instead happens via the back pill).
        // Past PEEK_Y it still visually drags, just heavily damped (rubber-band), so it's
        // clear the gesture registered without actually being able to pull further down.
        // Identical mechanism to DestinationSheet's own onUpdate.
        slideAnim.value = raw > PEEK_Y
          ? Math.max(FULL_POS, PEEK_Y + (raw - PEEK_Y) * 0.35)
          : Math.max(FULL_POS, raw);
      } else {
        slideAnim.value = Math.max(FULL_POS, Math.min(collapsedYAnim.value, raw));
      }
    })
    .onEnd(e => {
      if (mapGestureAtSV && Date.now() - mapGestureAtSV.value < 400) { runOnJS(callSnapBack)(); return; }
      const pos = lastPos.value + e.translationY;
      const cy  = collapsedYAnim.value;

      if (snapStateSV.value === 'peek') {
        // One continuous swipe can run the whole way from peek to full-screen: the sheet already follows the finger
        // across every snap, so settle on the snap the release lands nearest to — a hard fling up, or a drag past
        // halfway between collapsed and full, goes straight to full; a lighter fling or drag past halfway between peek
        // and collapsed stops at collapsed; anything less settles back at peek (the lowest point, no dismissing).
        const cyPeek = cy;
        if (e.velocityY < -1500 || pos < (FULL_POS + cyPeek) / 2) runOnJS(callSnapToFull)();
        else if (e.velocityY < -500 || pos < (cyPeek + PEEK_Y) / 2) runOnJS(callSnapToCollapsed)();
        else runOnJS(callSnapToPeek)();
        return;
      }

      if (snapStateSV.value === 'collapsed') {
        // Swiping up from collapsed goes straight to full-screen; swiping down now drops to
        // peek instead of dismissing; anything smaller settles back at collapsed.
        if (e.velocityY < -500 || pos < cy - 60) runOnJS(callSnapToFull)();
        else if (e.velocityY > 500 || pos > cy + 40) runOnJS(callSnapToPeek)();
        else runOnJS(callSnapToCollapsed)();
        return;
      }

      // Full-screen: a gesture that never actually engaged (e.g. an upward scroll)
      // shouldn't change the sheet's snap state at all — leave it exactly at full.
      if (!dragEngagedSV.value) return;
      // Haptic fires right here, at the moment of release, not during the drag itself —
      // "the user swipes down from full-screen view" is this release, regardless of
      // whether it ends up landing at collapsed or snapping back.
      runOnJS(triggerHaptic)();
      if (e.velocityY > 500 || pos > H * 0.25) runOnJS(callSnapToCollapsed)();
      else runOnJS(callSnapToFull)();
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
              // Tapping a subtab from half/bottom-screen expands to full, same as
              // DestinationSheet's own tab bar — the tab bar is only fully readable at
              // full-screen, so tapping it signals "show me this content".
              if (snapStateRef.current !== 'full') snapToFullRef.current();
              switchTab(tab);
            }}
          >
            {tab === 'destinations' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[st.tabBtnTxt, isTabSelected('destinations') && st.tabBtnTxtActive]}>
                  Destinations
                </Text>
                {dests.length > 0 && (
                  <View style={st.tabDestsBadge}>
                    <Text style={st.tabDestsBadgeTxt}>{dests.length}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[st.tabBtnTxt, isTabSelected(tab) && st.tabBtnTxtActive]}>
                {tab === 'visit' ? 'My Visit' : 'About'}
              </Text>
            )}
          </Pressable>
        </React.Fragment>
      ))}
      <Animated.View
        style={[
          st.tabIndicatorTrack,
          { width: `${100 / TAB_ORDER.length}%` },
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
            // Only scrollable at full-screen — while collapsed/peeking there's nothing to
            // scroll TO (the header itself is cropped shorter, not scrolled). Identical
            // mechanism/reasoning to DestinationSheet's own scrollEnabled fix: leaving this
            // always-true let the ScrollView's own native pan recognize simultaneously with
            // the sheet's drag gesture at every snap state, so a fast half→full swipe could
            // have its own residual motion already captured mid-flight as a scroll.
            scrollEnabled={snapStateReact === 'full'}
            bounces={false}
            showsVerticalScrollIndicator={false}
            onScroll={e => { scrollY.value = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            // The sheet runs behind the app's own bottom tab bar (BOTTOM_TAB_H, which already
            // includes the safe area), so the last content has to be able to clear it — the old
            // insets.bottom + 36 stopped short of the bar and left the end of the tab hidden. The 16
            // is deliberately modest: the About tab's facts card is sized to fit above the bar
            // with this padding and no scroll, and longer tabs still get a clear gap at the end.
            contentContainerStyle={{ paddingBottom: BOTTOM_TAB_H + 16 }}
          >
            {/* ── HEADER ───────────────────────────────────────────────────
                Shared, single element for every snap state (photo/name/stats crop
                continuously, exactly like DestinationSheet's own hero) — tapping the
                background (not the buttons) expands to full-screen while collapsed/peeking. */}
            <Pressable onPress={() => { if (snapStateRef.current !== 'full') snapToFullRef.current(); }}>
            <Animated.View style={[st.header, { backgroundColor: '#111827' }, headerAnimStyle]}>
              {/* Country photo background */}
              {/* The dark scrim (for text legibility over the photo) is part of EntityPhoto, drawn only while
                  there's a photo — the header's own backgroundColor is already dark enough without one. */}
              <EntityPhoto
                cacheKey={countryPhotoKey}
                cache={photoCache}
                load={loadCountryPhoto}
                scrim="rgba(0,0,0,0.45)"
                style={StyleSheet.absoluteFill as any}
              />

              {/* Drag-handle pill — visible while collapsed/peeking, fades out approaching
                  full-screen. Identical mechanism to DestinationSheet's own drag pill. */}
              <Animated.View pointerEvents="none" style={[st.headerDragPillRow, dragPillStyle]}>
                <View style={st.pill} />
              </Animated.View>

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
                </View>
              </Animated.View>

              {/* Measured via onLayout (natural, unclipped size) to drive headerAnimStyle's
                  "full" anchor — this wrapper's own padding accounts for the whole header's
                  total natural height, so no extra math is needed at the measurement site. */}
              <Animated.View
                style={[
                  st.headerContentWrap,
                  { paddingTop: insets.top + 16, minHeight: fullHeaderH },
                  headerContentShiftStyle,
                ]}
                onLayout={e => {
                  const h = e.nativeEvent.layout.height;
                  if (h < 50 || Math.abs(h - headerFullHRef.current) < 2) return;
                  headerFullHRef.current = h;
                  headerFullHAnim.value = h;
                }}
              >
                <CircleFlag countryCode={cluster.countryCode} size={40} ring style={st.headerFlag} />
                <Text style={st.headerName}>{cluster.country}</Text>
                <Text style={st.headerContinent}>{continent}</Text>
                <View style={st.headerStats}>
                  <View style={st.headerStat}>
                    <Text style={st.headerStatNum}>{dests.length}</Text>
                    <Text style={st.headerStatLbl}>Destination{dests.length !== 1 ? 's' : ''}</Text>
                  </View>
                  {spotsCount > 0 && (
                    <>
                      <View style={st.headerStatDivider} />
                      <View style={st.headerStat}>
                        <Text style={st.headerStatNum}>{spotsCount}</Text>
                        <Text style={st.headerStatLbl}>Spot{spotsCount !== 1 ? 's' : ''}</Text>
                      </View>
                    </>
                  )}
                </View>
              </Animated.View>
            </Animated.View>
            </Pressable>

            {/* ── TAB BAR ──────────────────────────────────────────────── */}
            <View
              style={st.tabBar}
              onLayout={e => { tabBarHAnim.value = e.nativeEvent.layout.height; }}
            >
              {renderTabBarRow()}
            </View>

            {/* ── CONTENT ──────────────────────────────────────────────── */}
            <GestureDetector gesture={tabSwipeGesture}>
            <Animated.View style={[st.slideTrack, slideTrackStyle]}>
              <Animated.View style={[st.slideRow, { width: W * TAB_ORDER.length }, slideRowStyle]}>

                {/* ── MY VISIT PANEL — visited countries only ─────────── */}
                {isCountryVisited && (
                  <View
                    style={st.slidePanel}
                    onLayout={e => measurePanel(TAB_ORDER.indexOf('visit'), e.nativeEvent.layout.height)}
                  >
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
                        {!hasVisitedDest && (
                          <Pressable style={st.memRemoveBtn} onPress={handleToggleVisited} hitSlop={8}>
                            <Trash2 size={13} color="#EF4444" />
                            <Text style={st.memRemoveBtnTxt}>Remove</Text>
                          </Pressable>
                        )}
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
                <View
                  style={st.slidePanel}
                  onLayout={e => measurePanel(TAB_ORDER.indexOf('about'), e.nativeEvent.layout.height)}
                >
                  <View style={st.glanceCard}>
                    {facts ? (
                      <>
                        <View style={st.glanceRow}>
                          <View style={st.glanceIconWrap}><Landmark size={15} color="#374151" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.glanceLbl}>Capital</Text>
                            <Text style={st.glanceVal}>{facts.capital}</Text>
                          </View>
                        </View>
                        <View style={st.glanceDivider} />
                        <View style={st.glanceRow}>
                          <View style={st.glanceIconWrap}><Users size={15} color="#374151" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.glanceLbl}>Population</Text>
                            <Text style={st.glanceVal}>{facts.population}</Text>
                          </View>
                        </View>
                        <View style={st.glanceDivider} />
                        <View style={st.glanceRow}>
                          <View style={st.glanceIconWrap}><Maximize size={15} color="#374151" /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.glanceLbl}>Area</Text>
                            <Text style={st.glanceVal}>{facts.area}</Text>
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
                <View
                  style={st.slidePanel}
                  onLayout={e => measurePanel(TAB_ORDER.indexOf('destinations'), e.nativeEvent.layout.height)}
                >
                  <DestinationsPanel
                    dests={dests}
                    savedDestinations={savedDestinations}
                    onSelectDestination={onSelectDestination}
                  />
                </View>

              </Animated.View>
            </Animated.View>
            </GestureDetector>
          </ScrollView>

          {/* ── PEEK STRIP — a thin sliver of the header image with the country's name,
              shown only once the sheet has been dropped down past collapsed (via peekSignal,
              fired when the user pans/zooms the map). Tapping it returns to collapsed. ── */}
          <Animated.View
            pointerEvents="box-none"
            style={[{
              position: 'absolute', left: 0, right: 0, top: 0, height: PEEK_STRIP_H, overflow: 'hidden',
              backgroundColor: '#111827',
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
            }, peekAnimStyle]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (isPressBlocked?.()) return; snapToCollapsedRef.current(); }}>
              <EntityPhoto instant cacheKey={countryPhotoKey} cache={photoCache} load={loadCountryPhoto} style={StyleSheet.absoluteFill as any} />
              <View pointerEvents="none" style={st.peekScrim} />
              <View pointerEvents="none" style={st.peekPillRow}>
                <View style={st.peekPill} />
              </View>
              <View pointerEvents="none" style={st.peekNameRow}>
                <View style={st.peekTitleRow}>
                  <CircleFlag countryCode={cluster.countryCode} size={18} style={st.peekFlag} />
                  <Text style={st.peekNameTxt} numberOfLines={1}>{cluster.country}</Text>
                </View>
                <Text style={st.peekStatsTxt} numberOfLines={1}>
                  {dests.length} destination{dests.length !== 1 ? 's' : ''}
                  {spotsCount > 0 ? ` · ${spotsCount} spot${spotsCount !== 1 ? 's' : ''}` : ''}
                </Text>
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
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 200, elevation: 200 },

  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0, height: H,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F9FAFB',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    overflow: 'hidden',
    // Bottom-anchors headerContentWrap (which stays its own natural/full height
    // regardless of this outer box's animated crop) so that as the header shrinks toward
    // collapsed/peek, the crop eats into the wrap's TOP — keeping the name/stats row (the
    // wrap's last line) visible instead of it sliding out the bottom uncropped.
    justifyContent: 'flex-end',
  },
  // Holds the actual flow content (flag/name/continent/stats) — its own natural height
  // (unaffected by the outer header's animated crop) is what's measured via onLayout to
  // drive headerFullHAnim, mirroring DestinationSheet's hero-height approach.
  headerContentWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
    minHeight: HEADER_H,
  },
  // Placement and style copied directly from DestinationSheet's heroTopRow: close button on
  // the left, visit pill grouped on the right via headerActionsRight.
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
  headerVisitPillActive: { backgroundColor: '#059669', borderColor: 'rgba(16,185,129,0.5)' },
  headerVisitPillTxt: { fontSize: 13, fontWeight: '700', color: 'white' },
  headerFlag:      { marginBottom: 10, marginTop: 8 },
  // Matches DestinationSheet's heroName exactly (size/face/tracking), so the two sheets'
  // titles read as one treatment. No fontWeight alongside fontFamily — the Playfair face
  // already carries the bold, and specifying both invites faux-bold/substitution on Android.
  headerName:      { fontSize: 42, fontFamily: 'PlayfairDisplay_700Bold', color: 'white', letterSpacing: -0.5, textAlign: 'center', marginBottom: 4 },
  headerContinent: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.78)', marginBottom: 16 },
  // alignItems:'center' (rather than the row's flex default of 'stretch') so the divider's
  // own fixed height centers it vertically against the stat blocks either side, instead of
  // being stretched to match whichever one happens to be tallest.
  headerStats:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  headerStatDivider: { width: 1.5, height: 34, backgroundColor: 'rgba(255,255,255,0.35)' },
  // Fixed minWidth (rather than sizing to each label's own text) so "Destination" and "Spot" —
  // different lengths — don't skew the column widths and pull their numbers off-centre from the
  // divider; both numbers land the same distance from it since both columns are the same width.
  headerStat:      { alignItems: 'center', minWidth: 72 },
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
  // Destination count — identical treatment to DestinationSheet's own tabSpotsBadge (plain
  // gray rounded-square, doesn't switch color when the tab is selected).
  tabDestsBadge:    { minWidth: 20, height: 20, borderRadius: 6, backgroundColor: '#E5E7EB',
                      paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  tabDestsBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#6B7280', lineHeight: 14 },
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
    backgroundColor: 'white', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#F0F1F3',
  },
  glanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  glanceIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  glanceLbl: { fontSize: 11.5, color: '#9CA3AF', fontWeight: '600' },
  glanceVal: { fontSize: 14.5, color: '#111827', fontWeight: '700', marginTop: 1 },
  glanceDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F1F3', marginVertical: 10 },
  glanceEmpty: { fontSize: 13, color: '#9CA3AF' },

  // ── Destinations grid — identical pattern to DestinationSheet's own SpotsPanel/grid. ──
  gridEmptyTxt:    { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },

  // paddingBottom leaves room for the cards' shadows: the tab panel clips whatever falls
  // outside its measured height, which showed as a shadow cut off in a straight line.
  destGrid:              { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingTop: 4, paddingBottom: 16 },

  // Header's own drag-handle pill row — absolute so it stays pinned to the very top of the
  // header regardless of the header's flex layout.
  headerDragPillRow: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },

  // Peek strip — thin header-image sliver with the country's name, shown while peeking.
  peekScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  peekPillRow: { alignItems: 'center', paddingTop: 8 },
  peekPill: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(229,231,235,0.85)' },
  peekNameRow: { position: 'absolute', left: 16, right: 16, bottom: 8, gap: 2 },
  peekTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  peekFlag: { borderWidth: 1, borderColor: 'rgba(156,163,175,0.7)', borderRadius: 9 },
  peekNameTxt: { fontSize: 30, fontFamily: 'PlayfairDisplay_700Bold', color: 'white', letterSpacing: -0.4, flexShrink: 1 },
  peekStatsTxt: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
});

// Memoized: the map screen re-renders continuously while the camera moves, and a re-render of the sheet is a React
// commit on its animated views for no reason. With stable props it now renders only when its own inputs change.
export default React.memo(CountrySheet);
