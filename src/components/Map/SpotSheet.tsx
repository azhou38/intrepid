import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert,
  Dimensions, Platform, Linking,
} from 'react-native';
// Aliased — only the horizontal carousel below is swapped to this GH-aware ScrollView, so
// its native pan can properly arbitrate (via the vertical `pan` gesture's own
// activeOffsetY/failOffsetX) against the vertical expand-to-full gesture instead of racing
// it. The rest of the file's ScrollViews stay plain RN ones.
import { ScrollView as GHScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
// The whole sheet's drag/settle system is Reanimated + Gesture Handler worklets now, matching
// DestinationSheet exactly (see slideAnim's own comment) — aliased to `Reanimated` rather than
// importing a plain `Animated` name, since `View`/`Pressable`/etc above already come from core
// react-native and mixing the two default-export namings would be confusing.
import Reanimated, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, runOnJS,
  interpolate, Extrapolation, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { Check, Star, Clock, MapPin, Pencil, ChevronUp, ChevronDown, LayoutGrid, Plus,
         DollarSign, ExternalLink } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store';
import type { Destination, PhotoEntry } from '../../types';
import type { Spot } from '../../data/spots';
import { DAY_NAMES, hoursForDay, formatSpotCost, formatVisitTime } from '../../data/spots';
import { photoCache, thumbCache, getOrFetchWikiThumbnail } from '../../utils/photoCache';
import CircleFlag from '../CircleFlag';
import FadeInImage from './FadeInImage';
import { sheetPose } from './sheetPose';
import EntityPhoto from './EntityPhoto';
import {
  parseDateStr, fmtDatePart,
  DatePickerModal, PhotoCollage, ReviewEditModal,
} from './sheetShared';

const { height: H, width: W } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;  // fully off-screen
// Sheet settle curve — matches DestinationSheet's own SNAP_CONFIG exactly (same duration,
// same ease-out-cubic, no spring), so this sheet's back pill behaves identically to
// DestinationSheet's rather than the bouncier feel a damped spring gives. A single config now
// (not two, one per animation system) — the whole sheet runs on Reanimated, same as
// DestinationSheet, so there's no more core-Animated/Reanimated Easing split to keep in sync.
const SNAP_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };
// Tab-panel slide — matches DestinationSheet's own TAB_SLIDE_CONFIG (a plain tween, not the
// spring this used before switching to Reanimated): no overshoot on switching or settling.
const TAB_SLIDE_CONFIG = { duration: 220, easing: Easing.out(Easing.cubic) };
const HERO_H      = Math.round(H * 0.52);
const GRAD_H_TOTAL = 400;
// Matches DestinationSheet's own hero gradient exactly (t^1.8 × 0.94 curve, sampled at 13
// points) — a real SVG gradient rather than a flat-opacity stripe, which used to band
// visibly where the flat rect's edge cut off.
const GRADIENT_STOPS = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return { offset: t, opacity: +(t ** 1.8 * 0.94).toFixed(4) };
});
// Collapsed (bottom-screen carousel) always sits at exactly the screen's vertical midpoint —
// a fixed height, not one that hugs the carousel's own content — so its bottom edge stays
// flush just above the app's own Map/Explore/Profile tab bar.
const BOTTOM_TAB_H = Platform.OS === 'ios' ? 88 : 64;
const COLLAPSED_Y = H / 2;
const COMPACT_H   = Math.max(0, (H - BOTTOM_TAB_H) - COLLAPSED_Y);
const COLLAPSED_GAP = 12;    // breathing room between the collapsed card's bottom edge and the tab bar
// Peek — slid down further than collapsed, so only a thin strip of the hero image (with the
// spot's name) sticks up above the tab bar. Entered automatically (not by user drag) whenever
// the map itself is panned/zoomed, so the sheet gets out of the way while still showing what's
// selected. Identical mechanics to DestinationSheet's own peek.
const PEEK_STRIP_H = 90;
const PEEK_Y = Math.max(COLLAPSED_Y, (H - BOTTOM_TAB_H) - PEEK_STRIP_H);

// Carousel card metrics — one card centered, neighbors peeking on both sides.
const CARD_W    = W - 64;
const CARD_GAP  = 12;
const CARD_SNAP = CARD_W + CARD_GAP;
const SIDE_PAD  = (W - CARD_W) / 2;

// ── Star rating (tappable) ────────────────────────────────────────────────────
function StarRating({ value, onChange, size = 30 }: {
  value: number; onChange?: (v: number) => void; size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={6}>
          <Star
            size={size}
            color={n <= value ? '#16A34A' : '#D1D5DB'}
            fill={n <= value ? '#16A34A' : 'none'}
            strokeWidth={2}
          />
        </Pressable>
      ))}
    </View>
  );
}

// ── Carousel preview card (one per spot in the collapsed carousel) ───────────
function CarouselCard({ spot, destinationId, isActive, onPress, gradId }: {
  spot: Spot; destinationId: string; isActive: boolean; onPress: () => void;
  // Unique PER RENDERED CARD (not just per spot) — the endless-scroll illusion renders
  // clones of the first/last spot alongside the real ones, so multiple simultaneously-
  // mounted cards can share the same spot.id. Reusing spot.id as the SVG gradient's <Defs>
  // id then collides across those instances, which silently breaks the gradient fill on
  // whichever card lost the collision — this is why it was "missing" on short carousels
  // (few real spots means clones are visible at the same time as the originals).
  gradId: string;
}) {
  // Own cache namespace (not the shared `spot_${id}` key other components use) — this
  // card's image now fills roughly the full card width, so it needs a much sharper source
  // than the smaller 400px thumbnails used elsewhere; a distinct key avoids reusing a
  // lower-res image that happened to get cached first under the shared key (e.g. a map pin
  // or search result thumbnail, both requested at ~120px).
  const cacheKey = `spotcard_${spot.id}`;
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  const thumbWasCachedRef = useRef(thumbCache.has(cacheKey));
  useEffect(() => {
    if (thumbCache.has(cacheKey)) {
      thumbWasCachedRef.current = true;
      setThumb(thumbCache.get(cacheKey)!);
      return;
    }
    thumbWasCachedRef.current = false;
    getOrFetchWikiThumbnail(cacheKey, thumbCache, spot.name, 960).then(u => { if (u) setThumb(u); });
  }, [spot.id]);

  const savedSpot  = useStore(s => s.savedSpots[spot.id]);
  const isVisited  = !!savedSpot;
  const saveSpotVisited = useStore(s => s.saveSpotVisited);

  return (
    <Pressable
      style={[
        st.card,
        isActive && (isVisited ? st.cardActive : st.cardActiveUnvisited),
        { width: CARD_W, marginRight: CARD_GAP, height: '100%' },
      ]}
      onPress={onPress}
    >
      <View style={[st.cardInner, { flex: 1 }]}>
        {/* Image — taller now that the name lives on top of it instead of in their
            own row below, so the card doesn't grow overall despite the extra image height. */}
        <View style={st.cardImageWrap}>
          {thumb && (
            <FadeInImage instant={thumbWasCachedRef.current} source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {/* Replaces the old always-present bookmark — a green tag only when actually
              visited, matching the "Visited" status pills used elsewhere in the app. */}
          {isVisited ? (
            <View style={st.cardVisitedTag}>
              <Check size={13} color="white" strokeWidth={3} />
              <Text style={st.cardVisitedTagTxt}>Visited</Text>
            </View>
          ) : (
            <Pressable
              style={st.cardAddVisitTag}
              onPress={() => {
                saveSpotVisited(spot.id, destinationId);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              hitSlop={6}
            >
              <Plus size={13} color="white" strokeWidth={3} />
              <Text style={st.cardAddVisitTagTxt}>Add Visit</Text>
            </Pressable>
          )}
          {/* Bottom-left overlay: just the name now, on a dark scrim so it stays legible
              over any photo. Time-to-spend and cost sit below the image. */}
          <View pointerEvents="none" style={st.cardImageGradWrap}>
            <Svg style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id={`cardGrad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                  {GRADIENT_STOPS.map(({ offset, opacity }) => (
                    <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                  ))}
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#cardGrad-${gradId})`} />
            </Svg>
          </View>
          <View pointerEvents="none" style={st.cardImageInfo}>
            <Text style={st.cardName} numberOfLines={1}>{spot.name}</Text>
          </View>
        </View>
        {/* Below the image — time/cost, then the description with room for at least
            two lines. */}
        <View style={st.cardInfo}>
          <View style={st.cardStatRow}>
            <View style={st.cardTimeRow}>
              <Clock size={12} color="#16A34A" strokeWidth={2.5} />
              <Text style={st.cardTimeTxt}>{formatVisitTime(spot.visitHours)}</Text>
            </View>
            <View style={st.cardTimeRow}>
              <Text style={st.cardTimeTxt}>{formatSpotCost(spot)}</Text>
            </View>
          </View>
          <Text style={st.cardBio} numberOfLines={3}>{spot.bio}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
interface Props {
  spots: Spot[];
  focusSpotId: string;
  destination: Destination;
  // `toCollapsed` is true when this fires from a swipe-down while the carousel itself was
  // collapsed (bottom-screen), so the caller can land the destination sheet underneath in
  // its own collapsed/bottom-screen view instead of the usual half-screen default. False
  // (or omitted) for the other dismiss path — the hero's back-pill, tapped while expanded.
  onClose: (toCollapsed?: boolean) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onActiveSpotChange?: (spot: Spot) => void;
  // Reports how far the collapsed carousel's top edge sits from the very bottom of the
  // screen, so callers (the back-navigation pill) can sit exactly above it instead of
  // guessing a fixed offset that breaks if the carousel's measured height changes.
  onCollapsedTopChange?: (distanceFromBottom: number) => void;
  // Written to continuously (every frame the drag/settle animation moves, not just at snap
  // boundaries) with the exact "bottom" offset the back-to-destination pill should sit at
  // *right now* — identical mechanism and formula to DestinationSheet's own pillOffsetSV
  // reaction, now that slideAnim below is a Reanimated shared value too (see its own comment).
  // Replaces the old settle-only onCollapsedTopChange-driven retarget, which visibly lagged
  // behind the sheet's own drag.
  pillOffsetSV?: SharedValue<number>;
  // Fires on every snap transition — lets the caller know when this sheet is peeking (e.g.
  // to avoid re-triggering peek while already there). Identical to DestinationSheet's.
  onSnapStateChange?: (state: 'peek' | 'collapsed' | 'full') => void;
  // Bump this to imperatively drop the carousel to its "peek" state — a thin strip of the
  // active spot's hero image with its name, slid down further than collapsed. Used by the
  // parent when the user pans/zooms the map, so the sheet gets out of the way. No-ops if
  // already peeking or the sheet has been dismissed.
  peekSignal?: number;
  // Set by MapScreen to Date.now() on every camera event of a live map gesture. Zooming the map
  // with a finger resting on this sheet's strip used to be read as a swipe of the sheet itself —
  // the finger travels upward during a pinch-in — so lifting it snapped the sheet to half-screen.
  mapGestureAtSV?: SharedValue<number>;
  // True while the user is interacting with the map (fingers down and the map moving); a spot change or new sheet
  // during that interaction stays peeked. Read on the JS thread only.
  isMapInteracting?: () => boolean;
  enterFromPrevious?: boolean;   // this sheet replaces another one that was showing: start where it rested, not below the screen
  isPressBlocked?: () => boolean;   // a press that is really a finger of a map gesture (see MapScreen.pressBlocked)
  // Increments when the parent is about to close this sheet (the back pill's X): slide it off
  // the bottom of the screen first, so it leaves rather than vanishing. Parent then unmounts it.
  exitSignal?: number;
  // "Go to list view" — swaps this carousel for the destination sheet's full-screen Spots
  // grid, which is often easier to scan than swiping card-by-card.
  onGoToList?: () => void;
  // Deliberate upward navigation INTO the parent destination sheet, regardless of where
  // back would go — wired to the tappable "in {destination}" hero meta row, so a user who
  // free-zoomed straight to a spot still has a one-tap path up to its destination.
  onGoToDestination?: () => void;
  // Bump this to imperatively collapse from the parent — used by the shared back pill's
  // down-arrow while this sheet is full-screen (the hero's own close button was removed in
  // favor of that pill, same as DestinationSheet).
  collapseSignal?: number;
}

function SpotSheet({
  spots, focusSpotId, destination, onClose, onExpand, onCollapse, onActiveSpotChange, onCollapsedTopChange,
  pillOffsetSV, onSnapStateChange, peekSignal, exitSignal, mapGestureAtSV, isMapInteracting, isPressBlocked, enterFromPrevious, onGoToList, onGoToDestination, collapseSignal,
}: Props) {
  const insets       = useSafeAreaInsets();
  const saveSpotVisited = useStore(s => s.saveSpotVisited);
  const updateSpot   = useStore(s => s.updateSpot);
  const unsaveSpot   = useStore(s => s.unsaveSpot);

  // ── Which spot is focused in the carousel ────────────────────────────────────
  const initialIndex = useMemo(
    () => Math.max(0, spots.findIndex(s => s.id === focusSpotId)),
    [focusSpotId, spots],
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // Render-phase sync ("adjusting state when a prop changes"), not a useEffect — a NEW spot
  // tapped on the map while this sheet is already open changes focusSpotId on an EXISTING
  // instance (no remount), and updating activeIndex from an effect landed one render late:
  // the collapsed carousel briefly showed the PREVIOUS spot as active (its card highlighted,
  // "X/Y" counter unchanged) before snapping to the right one on the next frame — exactly the
  // "shows stale state, then spins to the right spot" complaint. Setting it here instead lands
  // in the SAME commit as the prop change, so activeIndex (and everything derived from it,
  // like isActive highlighting and the counter) is never stale. The actual scroll animation
  // still can't happen here — imperative ScrollView calls stay in the effect below — but that
  // scroll catching up visually a moment later reads as an intentional glide, not a glitch,
  // once the CONTENT is already correct from the first frame.
  const [syncedFocusSpotId, setSyncedFocusSpotId] = useState(focusSpotId);
  if (focusSpotId !== syncedFocusSpotId) {
    setSyncedFocusSpotId(focusSpotId);
    setActiveIndex(initialIndex);
  }
  const activeSpot = spots[activeIndex] ?? spots[0];

  const savedSpot = useStore(s => s.savedSpots[activeSpot.id]);
  const isVisited = !!savedSpot;
  const photos: PhotoEntry[] = savedSpot?.photos ?? [];

  const carouselRef = useRef<ScrollView>(null);
  const scrollRef    = useRef<GHScrollView>(null);
  // Endless-scroll illusion: a clone of the last spot is prepended and a clone of the first
  // is appended, so scrolling past either real end reveals a card that looks identical to
  // wrapping around — then the moment that clone settles, we silently (non-animated)
  // reposition to the matching real card at the opposite end, which is imperceptible since
  // the two render identically. Only worth doing with 2+ spots.
  const loopOffset = spots.length > 1 ? 1 : 0;
  const extendedSpots = useMemo(() => {
    if (spots.length <= 1) return spots.map((s, i) => ({ spot: s, realIndex: i }));
    return [
      { spot: spots[spots.length - 1], realIndex: spots.length - 1 },
      ...spots.map((s, i) => ({ spot: s, realIndex: i })),
      { spot: spots[0], realIndex: 0 },
    ];
  }, [spots]);
  const [activeTab, setActiveTab] = useState<'visit' | 'about'>('visit');
  const [showDP,    setShowDP   ] = useState(false);
  const [showReview,setShowReview] = useState(false);

  // Tab slide position: 0 = visit tab, -W = about tab. A Reanimated shared value (not core
  // Animated) — matches DestinationSheet's own tabSlideAnim exactly, including dropping the
  // spring this used before migration for the same plain-tween, no-overshoot feel SNAP_CONFIG
  // already gives the sheet's own position (see that migration's own reasoning).
  const tabSlideAnim    = useSharedValue(0);
  const activeTabRef    = useRef<'visit' | 'about'>('visit');
  const tabSwipeBaseRef = useSharedValue(0);
  const tabIndicatorLeft = useAnimatedStyle(() => ({
    left: `${interpolate(tabSlideAnim.value, [-W, 0], [50, 0], Extrapolation.CLAMP)}%` as `${number}%`,
  }));
  const slideRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabSlideAnim.value }],
  }));

  const switchTabRef = useRef<(tab: 'visit' | 'about') => void>(() => {});
  switchTabRef.current = (newTab: 'visit' | 'about') => {
    if (activeTabRef.current === newTab) return;
    activeTabRef.current = newTab;
    setActiveTab(newTab);
    tabSlideAnim.value = withTiming(newTab === 'visit' ? 0 : -W, TAB_SLIDE_CONFIG);
  };
  // Marked 'worklet' — its only call site is inside tabSwipeGesture's onFinalize below, which
  // runs as a genuine UI-thread worklet (no `.runOnJS(true)` on this gesture). A plain JS
  // function referenced by name from inside a worklet isn't automatically workletized just
  // because the CALLING code is — Reanimated's babel plugin only auto-workletizes the gesture
  // callbacks themselves, not other functions they happen to call — so without this directive
  // calling it threw "Tried to synchronously call a non-worklet function on the UI thread."
  const snapTabToNearest = () => {
    'worklet';
    tabSlideAnim.value = withTiming(activeTabRef.current === 'visit' ? 0 : -W, TAB_SLIDE_CONFIG);
  };
  const setActiveTabJS = useCallback((tab: 'visit' | 'about') => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  }, []);
  // A real UI-thread worklet now (no `.runOnJS(true)`) — matches DestinationSheet's own
  // tabSwipeGesture exactly. onUpdate mutates tabSlideAnim directly with zero JS-thread hop
  // per frame; runOnJS is used only for the two JS-side effects at onEnd (updating React
  // state), not for the per-frame drag itself — this is the distinction that keeps it safe:
  // the earlier native crash (see the vertical `pan` gesture's own comment) came from wrapping
  // an entire per-frame callback in `runOnJS(freshClosure)(args)`, not from worklets that
  // directly write shared values and call runOnJS sparingly for discrete outcomes.
  const tabSwipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onStart(() => {
      tabSwipeBaseRef.value = tabSlideAnim.value;
    })
    .onUpdate(e => {
      tabSlideAnim.value = Math.max(-W, Math.min(0, tabSwipeBaseRef.value + e.translationX));
    })
    .onEnd(e => {
      const projected = tabSwipeBaseRef.value + e.translationX;
      const goTo: 'visit' | 'about' = (e.velocityX < -400 || projected < -W / 2) ? 'about' : 'visit';
      tabSlideAnim.value = withTiming(goTo === 'visit' ? 0 : -W, TAB_SLIDE_CONFIG);
      // Always sync JS state rather than trying to skip a no-op by comparing against
      // activeTabRef.current here — a plain JS ref read from inside a UI-thread worklet can
      // hold a stale snapshot (refs aren't live-synced across the JS/UI boundary the way a
      // shared value is). setActiveTabJS is a harmless no-op if the tab hasn't changed.
      runOnJS(setActiveTabJS)(goTo);
    })
    // Mirrors the old onPanResponderTerminate — if the gesture gets cancelled/interrupted
    // rather than ending cleanly, still settle the tab rather than leaving it mid-drag.
    .onFinalize((_, success) => {
      if (!success) snapTabToNearest();
    });

  // The hero and peek photos are <EntityPhoto> elements keyed on the active spot (see EntityPhoto.tsx): the URL is
  // derived from that spot's own cache key so it can't be another spot's, and loading it never re-renders this
  // sheet. getOrFetchWikiThumbnail (rather than a bare fetchWikiThumbnail) shares whatever request a pin-tap
  // prefetch already kicked off.
  const activePhotoKey = `spot_${activeSpot.id}`;
  const loadActivePhoto = () => getOrFetchWikiThumbnail(activePhotoKey, photoCache, activeSpot.name, 900);

  // Reset tab whenever the focused spot changes. (This used to sit at the end of the photo effect, after an early
  // return for a cached photo — so the tab only reset when the photo happened not to be cached.)
  useEffect(() => {
    activeTabRef.current = 'visit';
    setActiveTab('visit');
    tabSlideAnim.value = 0;
  }, [activeSpot.id]);

  // ── Unified sheet: three snap points ─────────────────────────────────────────
  const snapStateRef = useRef<'peek' | 'collapsed' | 'full'>('collapsed');
  // Shared-value mirror of snapStateRef, readable from the UI-thread gesture worklet below —
  // a plain ref can't be read reliably from a worklet (see the tab gesture's own comment on
  // why). Matches DestinationSheet's own snapStateSV.
  const snapStateSV  = useSharedValue<'peek' | 'collapsed' | 'full'>('collapsed');
  // React-state mirror too, for the one spot in the JSX below that needs to actually
  // RE-RENDER when the snap state changes (a plain ref/shared-value read at render time
  // doesn't trigger a re-render on its own). Set alongside the other two at every assignment.
  const [snapStateReact, setSnapStateReact] = useState<'peek' | 'collapsed' | 'full'>('collapsed');
  // The whole sheet position/drag system is Reanimated now (shared values + Gesture Handler
  // worklets), matching DestinationSheet's own slideAnim exactly — see the `pan` gesture's own
  // comment for why this is safe despite this file's documented history of a native crash from
  // an EARLIER, different worklet pattern. This directly replaced the pillTargetForPos/
  // syncPillToDragPos/timingPillToPos/pillTransitionToken machinery that used to live here: that
  // whole apparatus existed only to keep a Reanimated pill in sync with a core-Animated
  // slideAnim by hand (a JS-thread listener was too throttled, so it was replaced turn-by-turn
  // with matching duration/curve pairs and a token to guard stale completions) — once slideAnim
  // is itself a Reanimated shared value, the pill can just react to it directly (see the
  // useAnimatedReaction below), the same way DestinationSheet's own pill always has.
  const slideAnim    = useSharedValue(enterFromPrevious ? (sheetPose.get() ?? CLOSE_POS) : CLOSE_POS);
  const lastPos      = useSharedValue(0);
  // Worklet-readable scroll offset, for the drag gesture's full-screen capture gate (only let
  // a downward drag pull the sheet once its inner ScrollView is already at top) — a plain ref
  // can't be read reliably from a UI-thread worklet (see the tab gesture's own comment on why).
  const scrollYSV    = useSharedValue(0);

  // COLLAPSED_Y is a plain module constant (this sheet's carousel is always exactly
  // half-screen, never a dynamically measured height the way DestinationSheet's collapsed card
  // can grow) — no need for a ref/shared-value wrapper around it.
  const carouselTranslateY = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(slideAnim.value - COLLAPSED_Y, [-H, 0], [-H, 0], Extrapolation.CLAMP),
    }],
  }));
  // Carousel content fades out / peek strip fades in over the same [collapsed, peek] range,
  // so the two never overlap mid-transition — mirrors DestinationSheet's own compactAnimStyle
  // / peekAnimStyle opacity pair.
  const carouselOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [COLLAPSED_Y, PEEK_Y], [1, 0], Extrapolation.CLAMP),
  }));
  const peekOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [COLLAPSED_Y, PEEK_Y], [0, 1], Extrapolation.CLAMP),
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [1, 0], Extrapolation.CLAMP),
  }));
  // Shared by both st.sheet and its drop-shadow twin (sheetShadow) below — same style object
  // applied to two views, matching DestinationSheet's own sheetAnimStyle.
  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }],
  }));

  // Continuously writes the back-to-destination pill's target "bottom" offset as slideAnim
  // moves — same 3-point breakpoint formula DestinationSheet's own pillOffsetSV reaction uses.
  // Written directly to the shared value passed in via pillOffsetSV — no runOnJS/JS-thread hop
  // at all, since both this sheet and the pill are UI-thread Reanimated values now, which is
  // what keeps the pill's glide exactly as smooth as the sheet's own.
  useAnimatedReaction(
    () => slideAnim.value,
    (value) => {
      if (!pillOffsetSV) return;
      const PILL_H = 36;
      const SCREEN_H = H - BOTTOM_TAB_H;
      const FULL_TOP_ABS = FULL_POS + (insets.top + 14);
      const FULL_TARGET = SCREEN_H - FULL_TOP_ABS - PILL_H;
      const COLLAPSED_PILL_GAP = 16;
      const COLLAPSED_TOP_ABS = COLLAPSED_Y - COLLAPSED_PILL_GAP - PILL_H;
      const COLLAPSED_TARGET = SCREEN_H - COLLAPSED_TOP_ABS - PILL_H;
      const PEEK_TOP_ABS = PEEK_Y - COLLAPSED_PILL_GAP - PILL_H;
      const PEEK_TARGET = SCREEN_H - PEEK_TOP_ABS - PILL_H;
      pillOffsetSV.value = interpolate(
        value,
        [FULL_POS, COLLAPSED_Y, PEEK_Y],
        [FULL_TARGET, COLLAPSED_TARGET, PEEK_TARGET],
        Extrapolation.CLAMP,
      );
    },
    [insets.bottom, insets.top],
  );

  // ── Sheet position: one authority ─────────────────────────────────────────────────────────────────────
  // Same design as DestinationSheet (see the long comment there): snapStateRef / snapStateSV hold the snap this
  // sheet is meant to be in, and every position change except the user's own finger drag goes through
  // transitionTo. Focusing another spot used to call snapToCollapsed unconditionally, which pulled the sheet up
  // to half-screen in the middle of a map gesture that was holding it peeked.
  const closingRef = useRef(false);
  const transitionToRef = useRef<(next: 'peek' | 'collapsed' | 'full', reason: string, withHaptic?: boolean) => void>(() => {});
  transitionToRef.current = (next, reason, withHaptic = false) => {
    // Once the parent has told this sheet to leave, only a NEW selection may bring it back.
    if (closingRef.current && reason !== 'selectionChange') return;
    closingRef.current = false;
    const prev = snapStateRef.current;
    const target = next === 'full' ? FULL_POS : next === 'peek' ? PEEK_Y : COLLAPSED_Y;
    if (__DEV__) console.log('[sheet] Spot', activeSpot.id, prev, '->', next, `reason=${reason}`, 'mapInteracting=', isMapInteracting?.() ?? false);
    snapStateRef.current = next;
    snapStateSV.value = next;
    setSnapStateReact(next);
    lastPos.value = target;
    if (next === 'full') onExpand?.(); else if (reason !== 'mount') onCollapse?.();
    onSnapStateChange?.(next);
    if (next !== 'full') onCollapsedTopChange?.(H - target);
    // withHaptic fires a haptic exactly when the sheet's OWN animation lands on FULL_POS — via withTiming's
    // completion callback, a UI-thread worklet reanimated invokes the instant the value actually arrives. Only the
    // swipe-up gesture passes withHaptic=true; tap-triggered expands don't, matching this sheet's existing haptic
    // policy of ticking for drags, not taps.
    sheetPose.set(next === 'full' ? null : target);
    slideAnim.value = withTiming(target, SNAP_CONFIG, withHaptic && next === 'full' ? (finished) => {
      'worklet';
      if (finished) runOnJS(triggerHaptic)(Haptics.ImpactFeedbackStyle.Medium);
    } : undefined);
  };
  const snapToFullRef = useRef((withHaptic?: boolean) => {});
  snapToFullRef.current = (withHaptic = false) => transitionToRef.current('full', 'user', withHaptic);
  const snapToCollapsedRef = useRef(() => {});
  snapToCollapsedRef.current = () => transitionToRef.current('collapsed', 'user');
  const snapToPeekRef = useRef(() => {});
  snapToPeekRef.current = () => transitionToRef.current('peek', 'user');
  // JS-callable wrappers for the gesture worklet below (runOnJS needs a plain function
  // reference, not `() => xRef.current()` inlined every call) — matches DestinationSheet.
  const callSnapToFull      = useCallback(() => snapToFullRef.current(), []);
  const callSnapToFullWithHaptic = useCallback(() => snapToFullRef.current(true), []);
  const callSnapToCollapsed = useCallback(() => snapToCollapsedRef.current(), []);
  const callSnapToPeek      = useCallback(() => snapToPeekRef.current(), []);
  const callSnapBack = useCallback(() => {
    const st = snapStateRef.current;
    if (st === 'peek') snapToPeekRef.current();
    else if (st === 'full') snapToFullRef.current();
    else snapToCollapsedRef.current();
  }, []);
  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    Haptics.impactAsync(style);
  }, []);

  // Slide off the bottom, quickly, when the parent signals it's closing this sheet.
  const lastExitSignalRef = useRef(exitSignal);
  useEffect(() => {
    if (exitSignal === undefined || exitSignal === lastExitSignalRef.current) return;
    lastExitSignalRef.current = exitSignal;
    closingRef.current = true;
    if (__DEV__) console.log('[sheet] Spot', activeSpot.id, snapStateRef.current, '-> closed', 'reason=exit');
    sheetPose.set(null);
    slideAnim.value = withTiming(CLOSE_POS, { duration: 180, easing: Easing.in(Easing.cubic) });
  }, [exitSignal]);

  // Imperatively drop to peek from the parent — used when the user pans/zooms the map, from
  // either collapsed or full. No-ops if already peeking or dismissed.
  const lastPeekSignalRef = useRef(peekSignal);
  useEffect(() => {
    if (peekSignal === undefined || peekSignal === lastPeekSignalRef.current) return;
    lastPeekSignalRef.current = peekSignal;
    if (snapStateRef.current === 'collapsed' || snapStateRef.current === 'full') transitionToRef.current('peek', 'mapGesture');
  }, [peekSignal]);

  // Imperatively collapse from the parent — used by the shared back pill's down-arrow while
  // this sheet is full-screen, AND by re-tapping the already-focused spot's own pin while
  // peeking (that tap doesn't change focusSpotId, so the effect below never fires — this is
  // the only other way for MapScreen to tell this sheet "come back to half-screen"). No-ops
  // on mount (only reacts to actual increments). Reacts from 'peek' too, not just 'full' —
  // re-tapping a peeking spot's pin should bring it back to half-screen exactly like tapping
  // any other spot's pin does.
  const lastCollapseSignalRef = useRef(collapseSignal);
  useEffect(() => {
    if (collapseSignal === undefined || collapseSignal === lastCollapseSignalRef.current) return;
    lastCollapseSignalRef.current = collapseSignal;
    if (snapStateRef.current === 'full' || snapStateRef.current === 'peek') transitionToRef.current('collapsed', 'backPill');
  }, [collapseSignal]);

  // Slide in from off-screen on first mount.
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Collapsed, or already peeked if the map is being interacted with.
    transitionToRef.current(isMapInteracting?.() ? 'peek' : 'collapsed', 'mount');
  }, []);

  // When a NEW spot is tapped on the map (focusSpotId changes), jump the carousel to it and
  // return to the collapsed carousel view.
  //
  // The carousel jump is ALWAYS instant (animated:false), even past the first mount — an
  // animated scrollTo here visibly scrolls PAST every card in between the old and new spot
  // (its content genuinely isn't the target spot mid-flight, not just stale state), which is
  // exactly the "shows the wrong spot, then catches up" complaint this effect exists to fix.
  // activeIndex itself already updates synchronously in the same render as focusSpotId (see
  // its own comment above) — this scrollTo just needs to physically match that same instant,
  // rather than glide the ScrollView's real content offset over on its own schedule.
  //
  // hasHandledFocusRef still gates snapToCollapsedRef (the SHEET's own position, not the
  // carousel) — that transition (e.g. returning from peek/full to collapsed) is a different,
  // deliberately-animated motion nothing here has complained about. Kept on its own ref rather
  // than the "slide in on first mount" effect's — that effect is declared first, so React
  // already flushes it (setting ITS ref) before this effect's own very first run in the same
  // commit, which previously made this effect think it was never the first invocation.
  const hasHandledFocusRef = useRef(false);
  useEffect(() => {
    const isFirstFocus = !hasHandledFocusRef.current;
    hasHandledFocusRef.current = true;
    requestAnimationFrame(() => carouselRef.current?.scrollTo({ x: (initialIndex + loopOffset) * CARD_SNAP, animated: false }));
    if (!isFirstFocus) transitionToRef.current(isMapInteracting?.() ? 'peek' : 'collapsed', 'selectionChange');
  }, [focusSpotId]);

  const hapticFiredSV = useSharedValue(false);
  // True once a given gesture has actually been allowed to move the sheet (see the
  // full-screen gate in onUpdate below) — lets onEnd tell "a drag that genuinely engaged"
  // apart from "a touch that ended without ever being allowed to do anything".
  const dragEngagedSV = useSharedValue(false);
  // Migrated off the legacy PanResponder specifically to fix a race with the horizontal
  // carousel ScrollView below: PanResponder and a plain RN ScrollView negotiate ownership of
  // a touch through two independent systems (JS responder chain vs. native scroll
  // recognizer, with the JS side needing a bridge round-trip to decide) — an
  // intended-vertical swipe with a little early sideways jitter could get permanently
  // claimed by the carousel and never come back. `activeOffsetY`/`failOffsetX` make this a
  // native-level, deterministic decision instead, and it only works because the carousel was
  // also switched to GH's ScrollView (see GHScrollView below), putting both gestures in the
  // same recognition system.
  //
  // Runs as a genuine UI-thread worklet now (no `.runOnJS(true)`), matching DestinationSheet's
  // own vertical drag gesture exactly — onUpdate mutates slideAnim directly with zero JS-thread
  // round trip per frame, and runOnJS is used only for the DISCRETE JS-side effects at onEnd
  // (calling the snap-ref wrappers, firing haptics), not for the drag itself. This is NOT the
  // pattern that crashed the app in an earlier migration attempt: that crash came from wrapping
  // an ENTIRE per-frame callback body in `runOnJS(freshInlineClosure)(args)` — a brand-new
  // closure bridged through the JS queue 60+ times/sec. A worklet that writes shared values
  // directly and calls runOnJS(namedCallback)() only a few times per gesture (at onEnd, not
  // every frame) is the standard, safe Reanimated pattern — and it's already proven in this
  // exact app, since DestinationSheet has run on it the whole time.
  let pan = Gesture.Pan()
    .maxPointers(1)   // a two-finger map pinch that lands on the sheet is never a drag of it
    .activeOffsetY([-10, 10])
    .failOffsetX([-10, 10])
    .onStart(() => {
      hapticFiredSV.value = false;
      dragEngagedSV.value = false;
      lastPos.value = slideAnim.value;
    })
    .onUpdate(e => {
      // A map pinch/pan in progress (or just finished) owns this touch: a finger that lands on this
      // sheet during a two-finger map gesture must not drag it (see mapGestureAtSV).
      if (mapGestureAtSV && Date.now() - mapGestureAtSV.value < 400) return;
      // Defense-in-depth mirror of the old directional check — activeOffsetY/failOffsetX
      // should already guarantee this, but costs nothing to double-check.
      if (Math.abs(e.translationX) >= Math.abs(e.translationY)) return;
      // Full-screen: only let this gesture pull the sheet down once its inner ScrollView is
      // already scrolled to the top.
      if (snapStateSV.value === 'full' && !(scrollYSV.value <= 1 && e.translationY > 6)) return;
      dragEngagedSV.value = true;
      // No haptic for collapsed/peek drags — only full-screen ones still get the
      // "drag started" tick.
      if (Math.abs(e.translationY) > 8 && !hapticFiredSV.value
          && snapStateSV.value !== 'collapsed' && snapStateSV.value !== 'peek') {
        hapticFiredSV.value = true;
        runOnJS(triggerHaptic)(Haptics.ImpactFeedbackStyle.Light);
      }
      const raw = lastPos.value + e.translationY;
      if (snapStateSV.value === 'collapsed' || snapStateSV.value === 'peek') {
        // Peek is the lowest point now — swiping down from either collapsed or peek can no
        // longer dismiss the sheet (exit to the level above). Past PEEK_Y it still visually
        // drags, just heavily damped (rubber-band), so it's clear the gesture registered
        // without actually being able to pull the sheet any further down.
        slideAnim.value = raw > PEEK_Y
          ? Math.max(FULL_POS, PEEK_Y + (raw - PEEK_Y) * 0.35)
          : Math.max(FULL_POS, raw);
      } else {
        slideAnim.value = Math.max(FULL_POS, Math.min(COLLAPSED_Y, raw));
      }
    })
    .onEnd(e => {
      if (mapGestureAtSV && Date.now() - mapGestureAtSV.value < 400) { runOnJS(callSnapBack)(); return; }
      const pos = lastPos.value + e.translationY;
      if (snapStateSV.value === 'peek') {
        // Swiping up from peek goes back to collapsed; swiping down (or anything smaller)
        // just settles back at peek — it's the lowest point, no more dismissing from here.
        if (e.velocityY < -500 || pos < PEEK_Y - 60) runOnJS(callSnapToCollapsed)();
        else runOnJS(callSnapToPeek)();
      } else if (snapStateSV.value === 'collapsed') {
        // Swiping up from collapsed goes to full-screen; swiping down now drops to peek
        // instead of dismissing; anything smaller settles back at collapsed.
        if (e.velocityY < -500 || pos < COLLAPSED_Y - 60) runOnJS(callSnapToFullWithHaptic)();
        else if (e.velocityY > 500 || pos > COLLAPSED_Y + 40) runOnJS(callSnapToPeek)();
        else runOnJS(callSnapToCollapsed)();
      } else {
        // Full-screen: a gesture that never actually engaged (e.g. it never got past the
        // "scrolled to top" gate) shouldn't change the sheet's snap state at all.
        if (!dragEngagedSV.value) return;
        if (e.velocityY > 800 || pos > H * 0.25) runOnJS(callSnapToCollapsed)();
        else runOnJS(callSnapToFull)();
      }
    });
  // Needed for full-screen swipe-down-to-collapse: without this, the main content
  // ScrollView claims the touch outright once scrolled to top, and this gesture never even
  // starts recognizing. Unlike the carousel below (which needs EXCLUSIVE arbitration via
  // activeOffsetY/failOffsetX, since a horizontal carousel swipe and a vertical collapse are
  // mutually exclusive intents), this one needs SIMULTANEOUS recognition — a downward drag at
  // the top of the ScrollView is legitimately either "no-op scroll" or "start dragging the
  // sheet down", decided by `scrollYSV.value <= 1` inside onUpdate above, not by activeOffset
  // alone. Both this ScrollView and the carousel had to move to GH's ScrollView for their
  // respective fixes to work — GH can only arbitrate against gestures/views it manages.
  pan = pan.simultaneousWithExternalGesture(scrollRef);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleMarkVisited = () => {
    if (isVisited) {
      Alert.alert(
        'Remove visit?',
        'This will delete your rating, notes, and photos for this spot.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => unsaveSpot(activeSpot.id) },
        ]
      );
      return;
    }
    saveSpotVisited(activeSpot.id, destination.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const handleAddPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newEntries: PhotoEntry[] = result.assets.map(a => ({
        uri: a.uri, width: a.width, height: a.height, spotId: activeSpot.id, spotName: activeSpot.name,
      }));
      updateSpot(activeSpot.id, { photos: [...photos, ...newEntries] });
    }
  };
  const handleDeletePhoto = (index: number) => {
    updateSpot(activeSpot.id, { photos: photos.filter((_, i) => i !== index) });
  };

  const handleCarouselSettle = (offsetX: number) => {
    const extIdx = Math.round(offsetX / CARD_SNAP);
    // Landed on the leading clone (a copy of the last spot) — silently jump to the real
    // last card's position, which looks identical, completing the wrap-around.
    if (loopOffset && extIdx === 0) {
      const real = spots.length - 1;
      carouselRef.current?.scrollTo({ x: (real + loopOffset) * CARD_SNAP, animated: false });
      if (real !== activeIndex) { setActiveIndex(real); Haptics.selectionAsync(); onActiveSpotChange?.(spots[real]); }
      return;
    }
    // Landed on the trailing clone (a copy of the first spot) — same idea, other direction.
    if (loopOffset && extIdx === extendedSpots.length - 1) {
      carouselRef.current?.scrollTo({ x: loopOffset * CARD_SNAP, animated: false });
      if (activeIndex !== 0) { setActiveIndex(0); Haptics.selectionAsync(); onActiveSpotChange?.(spots[0]); }
      return;
    }
    const idx = Math.max(0, Math.min(spots.length - 1, extIdx - loopOffset));
    if (idx === activeIndex) return;
    setActiveIndex(idx);
    Haptics.selectionAsync();
    onActiveSpotChange?.(spots[idx]);
  };

  const heroTopRowTop = insets.top + 14;
  const visitDate = savedSpot?.visitDate ?? '';
  const vd = parseDateStr(visitDate);

  return (
    <View style={st.backdrop} pointerEvents="box-none">
      <Reanimated.View pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }, backdropStyle]} />
      <View
        pointerEvents={snapStateReact === 'full' ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToCollapsedRef.current()} />
      </View>

      <Reanimated.View pointerEvents="none" style={[st.sheetShadow, sheetAnimStyle]} />

      <GestureDetector gesture={pan}>
      <Reanimated.View style={[st.sheet, sheetAnimStyle]}>
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <GestureDetector gesture={tabSwipeGesture}>
        <View style={{ flex: 1 }}>
        <GHScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          scrollEnabled bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={e => { scrollYSV.value = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── HERO (active spot, shown when expanded) ─────────────────── */}
          <View style={[st.hero, { backgroundColor: '#111827', height: HERO_H - insets.bottom }]}>
            <EntityPhoto cacheKey={activePhotoKey} cache={photoCache} load={loadActivePhoto} />
            <View pointerEvents="none" style={st.heroScrim} />
            <View pointerEvents="none" style={st.gradWrap}>
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgLinearGradient id="spotHeroScrimGrad" x1="0" y1="0" x2="0" y2="1">
                    {GRADIENT_STOPS.map(({ offset, opacity }) => (
                      <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                    ))}
                  </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#spotHeroScrimGrad)" />
              </Svg>
            </View>

            {/* Top row — the back/collapse button that used to live here is gone; the
                shared back-navigation pill (rendered by the map screen, not this sheet) now
                glides to sit in that same top-left spot instead, identical to
                DestinationSheet. Only the visited-status pill stays, on the right. */}
            <View style={[st.heroTopRow, { top: heroTopRowTop, justifyContent: 'flex-end' }]}>
              <View style={st.heroActionsRight}>
                <Pressable
                  style={[st.heroVisitPill, isVisited && st.heroIconBtnVisited]}
                  onPress={handleMarkVisited} hitSlop={10}>
                  {isVisited
                    ? <Check size={15} color="white" strokeWidth={2.75} />
                    : <Plus size={15} color="white" strokeWidth={2.75} />}
                  <Text style={st.heroVisitPillTxt}>{isVisited ? 'Visited' : 'Add Visit'}</Text>
                </Pressable>
              </View>
            </View>

            <View style={st.heroBottomStack}>
              <View style={st.heroContent}>
                <Text style={st.heroName} numberOfLines={2}>{activeSpot.name}</Text>
                {/* Tappable when onGoToDestination is provided — the explicit upward path
                    into the destination sheet, kept separate from the back pill (which is
                    provenance-routed and may return to the map instead). */}
                <Pressable
                  style={st.heroMeta}
                  onPress={onGoToDestination}
                  disabled={!onGoToDestination}
                  hitSlop={8}
                >
                  <MapPin size={12} color="rgba(255,255,255,0.85)" />
                  <Text style={st.heroMetaTxt}>{destination.name}</Text>
                  <Text style={st.heroMetaDot}> · </Text>
                  <CircleFlag countryCode={destination.countryCode} size={13} />
                  <Text style={[st.heroMetaTxt, { marginLeft: 4 }]}>{destination.country}</Text>
                </Pressable>
                <Text style={st.heroBio} numberOfLines={3}>{activeSpot.bio}</Text>
              </View>
            </View>
          </View>

          {/* ── TAB BAR (visited only) ──────────────────────────────────── */}
          {isVisited && (
            <View style={st.tabBar}>
              <Pressable
                style={st.tabBtn}
                onPress={() => {
                  // Tapping a subtab from half/bottom-screen expands to full, same as the
                  // other sheets' own tab bars — the tab bar itself is only fully readable at
                  // full-screen, so tapping it signals "show me this content".
                  if (snapStateRef.current !== 'full') snapToFullRef.current();
                  switchTabRef.current('visit');
                }}
              >
                <Text style={[st.tabBtnTxt, activeTab === 'visit' && st.tabBtnTxtActive]}>My Visit</Text>
              </Pressable>
              <Pressable
                style={st.tabBtn}
                onPress={() => {
                  if (snapStateRef.current !== 'full') snapToFullRef.current();
                  switchTabRef.current('about');
                }}
              >
                <Text style={[st.tabBtnTxt, activeTab === 'about' && st.tabBtnTxtActive]}>About</Text>
              </Pressable>
              <Reanimated.View style={[st.tabIndicatorTrack, tabIndicatorLeft]}>
                <View style={st.tabIndicator} />
              </Reanimated.View>
            </View>
          )}

          {/* ── CONTENT ────────────────────────────────────────────────── */}
          <View style={[st.content, !isVisited && st.contentRounded]}>
            {isVisited ? (
              <View style={st.slideTrack}>
                <Reanimated.View style={[st.slideRow, slideRowStyle]}>
                  {/* ── MY VISIT PANEL ─────────────────────────────────── */}
                  <View style={st.slidePanel}>
                    <View style={st.card2}>
                      <Text style={st.cardLabel}>YOUR RATING</Text>
                      <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
                        <StarRating value={savedSpot?.rating ?? 0} onChange={r => updateSpot(activeSpot.id, { rating: r })} />
                      </View>
                    </View>

                    <View style={st.card2}>
                      <Text style={st.cardLabel}>VISIT DATE</Text>
                      <Pressable style={st.dateRow} onPress={() => setShowDP(true)}>
                        <Clock size={15} color="#6366F1" />
                        <Text style={vd ? st.dateVal : st.datePh}>
                          {vd ? fmtDatePart(visitDate) : 'Add the date you visited'}
                        </Text>
                        <Pencil size={12} color="#9CA3AF" />
                      </Pressable>
                    </View>

                    <View style={st.card2}>
                      <Text style={st.cardLabel}>YOUR PHOTOS</Text>
                      <PhotoCollage photos={photos} onAdd={handleAddPhoto} onDelete={handleDeletePhoto} />
                    </View>

                    <View style={st.card2}>
                      <Pressable onPress={() => setShowReview(true)}>
                        <Text style={st.cardLabel}>YOUR REVIEW</Text>
                        {savedSpot?.notes
                          ? <Text style={[st.reviewTxt, { marginTop: 6 }]}>{savedSpot.notes}</Text>
                          : <Text style={[st.reviewPh, { marginTop: 6 }]}>Tap to write about this spot…</Text>}
                      </Pressable>
                    </View>
                  </View>

                  {/* ── ABOUT PANEL ────────────────────────────────────── */}
                  <View style={st.slidePanel}>
                    <SpotAbout spot={activeSpot} />
                  </View>
                </Reanimated.View>
              </View>
            ) : (
              <SpotAbout spot={activeSpot} />
            )}
          </View>
        </GHScrollView>
        </View>
        </GestureDetector>{/* end tabSwipeGesture wrapper */}
        </View>{/* end full-content wrapper */}

        {/* ── CAROUSEL — collapsed overlay: all spots in this destination. Fixed height
            (COMPACT_H) rather than one measured from its own content — always exactly
            half the screen, top edge at the midpoint, bottom edge flush above the tab
            bar. ── */}
        <Reanimated.View
          style={[st.carouselWrap, { height: COMPACT_H }, carouselOpacityStyle, carouselTranslateY]}
        >
          <View pointerEvents="none" style={st.pillRow}>
            <View style={st.pill} />
          </View>

          {/* Heading — indicates you're browsing the spots within this destination */}
          <View style={st.carHeader}>
            <View style={{ flex: 1 }}>
              <Text style={st.carEyebrow}>SPOTS IN</Text>
              <Text style={st.carDest} numberOfLines={1}>{destination.name}</Text>
            </View>
            <Text style={st.carCounter}>{activeIndex + 1} / {spots.length}</Text>
            {!!onGoToList && (
              <Pressable style={st.carListBtn} onPress={onGoToList} hitSlop={8}>
                <LayoutGrid size={14} color="#6B7280" />
                <Text style={st.carListBtnTxt}>List</Text>
              </Pressable>
            )}
          </View>

          {/* flex:1 (new) — rather than sizing itself off content and leaving the exact
              remainder as unclaimed blank space, this now claims ALL the vertical room the
              carousel column has left after the header/hint rows, so the card (via its own
              flex:1 chain below) fills it automatically instead of needing a hand-tuned
              magic-number height that only happens to fit on some devices. */}
          <GHScrollView
            ref={carouselRef}
            horizontal
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_SNAP}
            decelerationRate="fast"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: SIDE_PAD, paddingTop: 8, paddingBottom: 4 }}
            onMomentumScrollEnd={e => handleCarouselSettle(e.nativeEvent.contentOffset.x)}
          >
            {extendedSpots.map((item, i) => (
              <CarouselCard
                key={`${item.spot.id}-${i}`}
                spot={item.spot}
                destinationId={destination.id}
                isActive={item.realIndex === activeIndex}
                gradId={`${i}`}
                onPress={() => {
                  if (item.realIndex !== activeIndex) {
                    setActiveIndex(item.realIndex);
                    carouselRef.current?.scrollTo({ x: (item.realIndex + loopOffset) * CARD_SNAP, animated: true });
                    onActiveSpotChange?.(spots[item.realIndex]);
                  }
                  snapToFullRef.current();
                }}
              />
            ))}
          </GHScrollView>

          {/* Sandwiched between the card's bottom edge and the tab bar below — a carousel-
              level hint (not tied to any one card) since the card itself was shrunk to make
              room for it here. */}
          <View pointerEvents="none" style={st.carouselHintRow}>
            <ChevronUp size={13} color="#16A34A" strokeWidth={2.5} />
            <Text style={st.carouselHintTxt}>Swipe up to explore</Text>
          </View>
        </Reanimated.View>

        {/* ── PEEK STRIP — a thin sliver of the active spot's hero image with its name,
            shown only once the sheet has been dropped down past collapsed (via peekSignal,
            fired when the user pans/zooms the map). Tapping it returns to collapsed. ── */}
        <Reanimated.View
          pointerEvents="box-none"
          style={[st.peekStrip, peekOpacityStyle]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (isPressBlocked?.()) return; snapToCollapsedRef.current(); }}>
            <EntityPhoto instant placeholderColor="#111827" cacheKey={activePhotoKey} cache={photoCache} load={loadActivePhoto} />
            <View pointerEvents="none" style={st.peekScrim} />
            <View pointerEvents="none" style={st.peekPillRow}>
              <View style={st.peekPill} />
            </View>
            <View pointerEvents="none" style={st.peekNameRow}>
              <Text style={st.peekNameTxt} numberOfLines={1}>{activeSpot.name}</Text>
            </View>
          </Pressable>
        </Reanimated.View>
      </Reanimated.View>
      </GestureDetector>

      {showDP && (
        <DatePickerModal
          value={visitDate}
          onDone={d => { updateSpot(activeSpot.id, { visitDate: d }); setShowDP(false); }}
          onCancel={() => setShowDP(false)}
        />
      )}
      {showReview && (
        <ReviewEditModal
          value={savedSpot?.notes ?? ''}
          onSave={text => { updateSpot(activeSpot.id, { notes: text || undefined }); setShowReview(false); }}
          onCancel={() => setShowReview(false)}
        />
      )}
    </View>
  );
}

// ── About panel (shared between visited/non-visited) ──────────────────────────
function SpotAbout({ spot }: { spot: Spot }) {
  const [hoursOpen, setHoursOpen] = useState(false);
  const today = new Date().getDay();

  return (
    <>
      <View style={st.section}>
        <Text style={st.sectionTitle}>AT A GLANCE</Text>
        <View style={st.glanceCard}>
          <View style={st.glanceItem}>
            <Clock size={20} color="#6366F1" />
            <Text style={st.glanceVal}>{spot.visitHours}h</Text>
            <Text style={st.glanceLbl}>Time needed</Text>
          </View>
          <View style={st.glanceDivider} />
          <View style={st.glanceItem}>
            <DollarSign size={20} color="#16A34A" />
            <Text style={[st.glanceVal, { fontSize: 14 }]} numberOfLines={1}>{formatSpotCost(spot)}</Text>
            <Text style={st.glanceLbl}>Cost</Text>
          </View>
        </View>
      </View>

      {/* Collapsed: just today's hours, since that's what a visitor actually needs right now.
          Expanding reveals the full week, with today's row picked out. */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>OPENING HOURS</Text>
        <Pressable style={st.hoursRow} onPress={() => setHoursOpen(o => !o)}>
          <Clock size={16} color="#16A34A" />
          <Text style={st.hoursTxt}>Today: {hoursForDay(spot, today)}</Text>
          <ChevronDown
            size={16} color="#9CA3AF"
            style={{ marginLeft: 'auto', transform: [{ rotate: hoursOpen ? '180deg' : '0deg' }] }}
          />
        </Pressable>
        {hoursOpen && (
          <View style={st.hoursWeekWrap}>
            {DAY_NAMES.map((day, i) => (
              <View key={day} style={[st.hoursWeekRow, i > 0 && st.hoursWeekRowBorder]}>
                <Text style={[st.hoursWeekDay, i === today && st.hoursWeekDayToday]}>{day}</Text>
                <Text style={[st.hoursWeekVal, i === today && st.hoursWeekDayToday]}>
                  {hoursForDay(spot, i)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {!!spot.ticketUrl && (
        <View style={st.section}>
          <Text style={st.sectionTitle}>TICKETS</Text>
          <Pressable style={st.ticketRow} onPress={() => Linking.openURL(spot.ticketUrl!)}>
            <ExternalLink size={16} color="#6366F1" />
            <Text style={st.ticketTxt}>Official ticket site</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 210, elevation: 210 } as any,
  // `top: 0` (fixed) + a `translateY` transform driving position, instead of animating
  // `top` directly — `top` is a layout property, so animating it forces a full layout pass
  // on the JS thread every frame; `transform` is GPU-composited and (critically) natively
  // drivable, which is what let the settle-spring animations below switch to
  // `useNativeDriver: true` — the actual fix for this sheet's drag/settle jank.
  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0, height: H, overflow: 'hidden',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F9FAFB',
  },
  sheetShadow: {
    position: 'absolute', left: 0, right: 0, top: 0, height: H,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F9FAFB',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },

  // ── Carousel overlay ──────────────────────────────────────────────────────
  carouselWrap: {
    position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden',
    backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  pillRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 3 },
  pill:    { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)' },
  carHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 3, paddingBottom: 9 },
  carEyebrow: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.3, marginBottom: 2 },
  carDest:    { fontSize: 19, fontFamily: 'PlayfairDisplay_700Bold', color: '#111827' },
  carCounter: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  carListBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4,
                   marginLeft: 12, paddingHorizontal: 8, paddingVertical: 5,
                   borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  carListBtnTxt: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },

  // Carousel card — portrait layout: a full-width image forming the top half, a plain white
  // content column (name, time/cost, blurb) forming the bottom half. The shadow/border
  // live on this outer element; a separate inner wrapper (cardInner) owns overflow:'hidden'
  // so the image's top corners get clipped to the card's rounded shape without also
  // clipping (and thereby hiding) this element's own shadow — iOS clips shadows on any view
  // that has overflow:'hidden' set directly on it.
  card: {
    backgroundColor: 'white', borderRadius: 18,
    borderWidth: 1.5, borderColor: '#DADEE3',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardActive: {
    borderColor: '#16A34A',
    shadowColor: '#16A34A', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  cardActiveUnvisited: {
    borderColor: '#9CA3AF',
    shadowColor: '#9CA3AF', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  // Radius is the outer card's (18) minus its borderWidth (1.5) — matching it exactly to 18
  // left a hairline of the card's white background showing at each corner, since the inner
  // rect (inset by the border) needs a slightly smaller radius to sit flush inside it.
  cardInner: { borderRadius: 16.5, overflow: 'hidden' },
  cardImageWrap: { width: '100%', flex: 1, backgroundColor: '#111827' },
  // Smooth gradient (matches the full-screen hero's own scrim) behind the bottom-left text
  // overlay, tall enough to cover the name block so it stays legible over any
  // photo — a flat rect banded visibly at its edge, which this replaced.
  cardImageGradWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  // Green "Visited" tag, top-right of the image — only rendered when actually visited.
  cardVisitedTag: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#059669', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  cardVisitedTagTxt: { fontSize: 12, fontWeight: '700', color: 'white' },
  // Same top-right slot as cardVisitedTag — shown instead of it for unvisited spots.
  cardAddVisitTag: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  cardAddVisitTagTxt: { fontSize: 12, fontWeight: '700', color: 'white' },
  // Bottom-left overlay on the image itself, sitting on the gradient (cardImageGradWrap).
  cardImageInfo: { position: 'absolute', left: 14, right: 14, bottom: 10, gap: 5 },
  cardName:    { fontSize: 25, fontFamily: 'PlayfairDisplay_700Bold', color: 'white', lineHeight: 28,
                 letterSpacing: -0.3,
                 textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  // Time-to-spend and cost, side by side below the image rather than overlaid on it.
  cardStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 8 },
  cardTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  cardTimeTxt: { fontSize: 12.5, fontWeight: '700', color: '#16A34A' },
  cardInfo:    { backgroundColor: 'white', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12 },
  cardBio:     { fontSize: 12.5, color: '#6B7280', lineHeight: 16, minHeight: 48 },
  // Sits below the carousel (a sibling of the ScrollView, not any one card) — sandwiched
  // between the active card's bottom edge and the tab bar underneath. marginTop:'auto'
  // pins it to the bottom of the now fixed-height carouselWrap even when the card content
  // above doesn't fill the whole half-screen.
  carouselHintRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 'auto',
    paddingTop: 3, paddingBottom: COLLAPSED_GAP,
  },
  carouselHintTxt: { fontSize: 12, fontWeight: '600', color: '#16A34A' },

  // Peek strip — thin hero-image sliver with the active spot's name, shown while peeking.
  peekStrip: {
    position: 'absolute', left: 0, right: 0, top: 0, height: PEEK_STRIP_H, overflow: 'hidden',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  peekScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  peekPillRow: { alignItems: 'center', paddingTop: 8 },
  peekPill: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(229,231,235,0.85)' },
  peekNameRow: { position: 'absolute', left: 16, right: 16, bottom: 10 },
  // Matches DestinationSheet's own peekNameTxt exactly — same serif face as the full-screen
  // hero name, just smaller to fit this thin bottom-screen strip.
  peekNameTxt: { fontSize: 30, fontFamily: 'PlayfairDisplay_700Bold', color: 'white', letterSpacing: -0.4 },

  // Hero
  hero: { width: '100%', height: HERO_H, overflow: 'hidden', justifyContent: 'flex-end' },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  gradWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: GRAD_H_TOTAL },
  heroTopRow: { position: 'absolute', left: 14, right: 14,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  backPill: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: W * 0.6,
              backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 22,
              paddingHorizontal: 12, paddingVertical: 9,
              shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  backPillArrow: { fontSize: 13, color: '#374151', fontWeight: '700' },
  backPillTxt: { fontSize: 13, fontWeight: '600', color: '#111827' },
  heroIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)',
                 alignItems: 'center', justifyContent: 'center',
                 borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  heroActionsRight:   { flexDirection: 'row', gap: 10, alignItems: 'center' },
  heroIconBtnVisited: { backgroundColor: '#059669', borderColor: 'rgba(16,185,129,0.5)' },
  heroVisitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 36, borderRadius: 18, paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  heroVisitPillTxt: { fontSize: 13, fontWeight: '700', color: 'white' },
  heroBottomStack: {},
  heroContent: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8, gap: 10 },
  heroName: { fontSize: 34, fontFamily: 'PlayfairDisplay_700Bold', color: 'white', letterSpacing: -0.5 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaTxt: { fontSize: 14, color: 'rgba(255,255,255,0.90)', fontWeight: '500' },
  heroMetaDot: { fontSize: 14, color: 'rgba(255,255,255,0.40)' },
  heroBio: { fontSize: 13.5, lineHeight: 19, color: 'rgba(255,255,255,0.88)', marginTop: 10,
             textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: 'white',
            borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB', zIndex: 1, overflow: 'hidden' },
  tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabBtnTxt: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },
  tabBtnTxtActive: { color: '#111827' },
  // Sliding underline — outer track keeps the existing per-tab left/width positioning; the
  // visible bar itself is a narrower, centered child so it doesn't span the full tab width.
  tabIndicatorTrack: { position: 'absolute', bottom: 0, width: '50%', alignItems: 'center' },
  tabIndicator: { width: 28, height: 2.5, backgroundColor: '#111827', borderRadius: 2 },

  // Content
  content: { backgroundColor: 'white', padding: 16, gap: 16 },
  contentRounded: { borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24 },
  slideTrack: { overflow: 'hidden', marginHorizontal: -16, width: W },
  slideRow: { flexDirection: 'row', alignItems: 'flex-start', width: W * 2 },
  slidePanel: { width: W, paddingHorizontal: 16, gap: 16 },

  // My Visit cards
  card2: { backgroundColor: 'white', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F0F1F3' },
  cardLabel: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dateVal: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  datePh:  { flex: 1, fontSize: 15, color: '#9CA3AF' },
  reviewTxt: { fontSize: 15, color: '#374151', lineHeight: 24 },
  reviewPh:  { fontSize: 15, color: '#C4C9D4', lineHeight: 24 },

  // About
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.4 },
  glanceCard: { backgroundColor: 'white', borderRadius: 16, flexDirection: 'row', borderWidth: 1, borderColor: '#F3F4F6' },
  glanceItem: { flex: 1, alignItems: 'center', paddingVertical: 20, gap: 5 },
  glanceDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginVertical: 14 },
  glanceVal: { fontSize: 20, fontWeight: '800', color: '#111827' },
  glanceLbl: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white',
              borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  hoursTxt: { fontSize: 15, fontWeight: '600', color: '#374151' },
  hoursWeekWrap:    { backgroundColor: 'white', borderRadius: 16, marginTop: 8,
                      borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden' },
  hoursWeekRow:     { flexDirection: 'row', justifyContent: 'space-between',
                      paddingHorizontal: 16, paddingVertical: 11 },
  hoursWeekRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6' },
  hoursWeekDay:     { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  hoursWeekVal:     { fontSize: 14, color: '#374151', fontWeight: '500' },
  hoursWeekDayToday: { color: '#16A34A', fontWeight: '800' },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white',
               borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  ticketTxt: { fontSize: 15, fontWeight: '600', color: '#6366F1' },
});

// Memoized: the map screen re-renders continuously while the camera moves, and a re-render of the sheet is a React
// commit on its animated views for no reason. With stable props it now renders only when its own inputs change.
export default React.memo(SpotSheet);
