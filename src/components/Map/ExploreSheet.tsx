import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Platform } from 'react-native';
// Sheet drag is driven entirely by Reanimated + Gesture Handler (UI thread), identical
// mechanism to CountrySheet/DestinationSheet's own three-state (collapsed/half/full) drag —
// see those files for the fuller rationale on why this beats core Animated/PanResponder.
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, withTiming, runOnJS, interpolate, Extrapolation, Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import { SEARCH_PLACEHOLDER } from './SearchResults';
import DiscoverScreen, { SEARCH_BAR_H, SEARCH_BAR_TOP_GAP } from '../../screens/DiscoverScreen';
import type { Destination } from '../../types';

const { height: H } = Dimensions.get('window');
const FULL_POS  = 0;
const CLOSE_POS = H + 40;
// Fixed (not measured) — this sheet's collapsed state shows the *same* content as
// half/full, just cropped shorter, rather than a separate summary card, so there's nothing
// to measure via onLayout the way DestinationSheet/CountrySheet's own compact cards do.
// Tall enough to reveal the feed's own "Explore" title + destination count.
const COMPACT_H = 90;
// Same bottom-tab-bar reservation the other map sheets use — this one lives inside the
// "Map" tab's own screen too, so anything it shows must end above the app's own tab bar.
const BOTTOM_TAB_H = Platform.OS === 'ios' ? 88 : 64;
const COLLAPSED_Y = Math.max(0, H - BOTTOM_TAB_H - COMPACT_H);
// Half-screen — identical mechanics to the sheets' own former half-screen snap: sheet top
// sits at the vertical midpoint. Small nudge down matches their own tuning.
const HALF_SHIFT = 1;
const HALF_POS   = H / 2 + HALF_SHIFT;
const SNAP_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };

type ExploreSnapState = 'collapsed' | 'half' | 'full';

// Sits on top of the map (world view) as a bottom sheet with the same collapsed/half/full
// mechanics DestinationSheet/CountrySheet use — always mounted while nothing is selected,
// defaulting to collapsed (bottom-screen), so the map stays the primary interactive surface
// unless the user actively pulls this open. Unlike those sheets, there's no separate
// compact-card/half-preview content here — every snap state shows the exact same Explore
// feed, just with more or less of it visible depending on how tall the sheet currently is.
interface Props {
  // Increments every time the user starts a map pan/pinch (MapScreen's peekSheetSignal).
  // If the sheet is sitting at half-screen, that gesture means the user wants the map —
  // collapse down to bottom-screen so it gets out of the way. No effect at collapsed
  // (already out of the way) or full (the map is covered, so map gestures can't happen).
  collapseSignal?: number;
  // Reported in the SHARED vocabulary the other sheets use, not this one's internal names —
  // what this file calls 'collapsed' is the bottom-screen strip every other sheet calls
  // 'peek', and what it calls 'half' is their 'collapsed'. MapScreen shifts the map to match
  // whichever sheet is open, so the names have to line up.
  onSnapStateChange?: (state: 'peek' | 'collapsed' | 'full') => void;
  // Forwarded straight to DiscoverScreen's own prop of the same name — see its comment.
  // Tapping a card should select the destination on the actual map (camera, country
  // selection, back-navigation state), not open a detached preview local to this feed.
  onSelectDestination: (dest: Destination) => void;
  // Forwarded to DiscoverScreen's own prop of the same name — tapping its search bar opens
  // MapScreen's search interface.
  onSearchPress?: () => void;
  // Read once, at mount, in the shared vocabulary (see onSnapStateChange): come back already
  // at this position, with no slide-in, instead of sliding up to the bottom strip. MapScreen
  // sets this when closing search so the sheet returns to where it was before search opened.
  initialSnap?: 'peek' | 'collapsed' | 'full';
  // Read once, at mount: restore the feed to this scroll offset (see initialSnap), and the
  // matching report of the current offset so MapScreen knows what to restore next time.
  initialScrollY?: number;
  onScrollYChange?: (y: number) => void;
  // Fired once at mount with where the sheet starts (shared vocabulary). Separate from
  // onSnapStateChange on purpose: that one drives camera shifts, which a fresh mount at the
  // default position must not trigger, but MapScreen still needs to know where a new sheet is.
  onMountSnap?: (state: 'peek' | 'collapsed' | 'full') => void;
  // Set by MapScreen to Date.now() on every camera event of a live map gesture. Zooming the map
  // with a finger resting on this sheet's strip used to be read as a swipe of the sheet itself —
  // the finger travels upward during a pinch-in — so lifting it snapped the sheet to half-screen.
  mapGestureAtSV?: SharedValue<number>;
}

function ExploreSheet({ collapseSignal, onSnapStateChange, onSelectDestination, onSearchPress, initialSnap, initialScrollY, onScrollYChange, onMountSnap, mapGestureAtSV }: Props) {
  // Internal names (see ExploreSnapState) differ from the shared vocabulary: shared 'peek' is
  // this sheet's 'collapsed', shared 'collapsed' is its 'half'.
  const startSnap = useRef<ExploreSnapState | null>(
    initialSnap === 'full' ? 'full' : initialSnap === 'collapsed' ? 'half' : initialSnap === 'peek' ? 'collapsed' : null,
  ).current;
  const startPos = startSnap === 'full' ? FULL_POS : startSnap === 'half' ? HALF_POS : COLLAPSED_Y;
  const snapStateRef = useRef<ExploreSnapState>(startSnap ?? 'collapsed');
  const snapStateSV  = useSharedValue<ExploreSnapState>(startSnap ?? 'collapsed');
  // Mirrors snapStateRef but as real React state, so render-time conditionals (scrollEnabled
  // below) can react to it — the ref alone only matters to the UI-thread gesture worklets.
  const [snapState, setSnapState] = useState<ExploreSnapState>(startSnap ?? 'collapsed');
  // Starts off-screen (CLOSE_POS) rather than already settled at COLLAPSED_Y — see the
  // mount effect below, which slides it up into place. This sheet remounts fresh (MapScreen
  // conditionally renders it) every time the user returns to world view, so this produces
  // the same "sliding/appearing in from the bottom" entrance CountrySheet/DestinationSheet
  // use when a country/destination is selected.
  const slideAnim    = useSharedValue(startSnap ? startPos : CLOSE_POS);
  const lastPos      = useSharedValue(startPos);

  // Reads/writes for the feed's own ScrollView (rendered inside DiscoverScreen), forwarded
  // down via props — this is what lets the drag gesture below tell "the user is scrolling
  // the feed" apart from "the user is dragging the sheet itself" once full-screen, exactly
  // like CountrySheet/DestinationSheet coordinate with their own full-content ScrollView.
  const scrollRef = useRef<any>(null);
  // False from mount until a restored scroll offset has actually been applied.
  const [feedReady, setFeedReady] = useState(!initialScrollY);
  const scrollY    = useSharedValue(0);

  // Drives the feed's own search bar in/out — 1 right at full-screen, ramping to 0 within the
  // first 80px of dragging away from it, so the bar slides/fades continuously alongside the
  // sheet itself rather than popping in only once the drag has fully settled.
  const searchProgress = useDerivedValue(() =>
    interpolate(slideAnim.value, [FULL_POS, FULL_POS + 80], [1, 0], Extrapolation.CLAMP)
  );
  // The sheet's search bar is NOT part of the sliding sheet: it sits at a fixed screen position
  // (exactly where MapScreen's own bar is, behind the sheet) and simply dissolves in on top of
  // it over the whole half→full drag. Sliding it up with the sheet instead reads as the bar
  // emerging from below rather than the map's bar turning into the sheet's.
  const insets = useSafeAreaInsets();
  //
  // Its width matches the map's own bar (right inset 72, leaving room for the layers pill)
  // until the sheet's top edge has swept past the pill's row, and only then widens to the full
  // 12px inset — widening earlier showed a gray strip poking out past the map's bar toward the
  // still-visible pill, which read as the bar and pill merging.
  const pillRowTop = insets.top + SEARCH_BAR_TOP_GAP;
  const searchBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, HALF_POS], [1, 0], Extrapolation.CLAMP),
    right: interpolate(slideAnim.value, [FULL_POS, pillRowTop], [12, 72], Extrapolation.CLAMP),
  }));
  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }],
  }));

  // Collapsed/half are a fixed, non-scrollable crop of the top of the feed — if the feed was
  // scrolled while full-screen, dropping down would otherwise leave that stale offset in place
  // and show the middle of the feed (no title) in the crop. Snap back to the top whenever the
  // sheet leaves full-screen.
  useEffect(() => {
    if (snapState !== 'full') scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [snapState]);

  const snapToFullRef = useRef(() => {});
  snapToFullRef.current = () => {
    snapStateRef.current = 'full';
    snapStateSV.value = 'full';
    lastPos.value = FULL_POS;
    setSnapState('full');
    onSnapStateChange?.('full');
    slideAnim.value = withTiming(FULL_POS, SNAP_CONFIG);
  };
  const snapToHalfRef = useRef(() => {});
  snapToHalfRef.current = () => {
    snapStateRef.current = 'half';
    snapStateSV.value = 'half';
    lastPos.value = HALF_POS;
    setSnapState('half');
    onSnapStateChange?.('collapsed');   // 'half' here === the others' 'collapsed'
    slideAnim.value = withTiming(HALF_POS, SNAP_CONFIG);
  };
  const snapToCollapsedRef = useRef(() => {});
  snapToCollapsedRef.current = () => {
    snapStateRef.current = 'collapsed';
    snapStateSV.value = 'collapsed';
    lastPos.value = COLLAPSED_Y;
    setSnapState('collapsed');
    onSnapStateChange?.('peek');        // bottom-screen === the others' 'peek'
    slideAnim.value = withTiming(COLLAPSED_Y, SNAP_CONFIG);
  };

  const callSnapToFull      = () => snapToFullRef.current();
  const callSnapToHalf      = () => snapToHalfRef.current();
  const callSnapToCollapsed = () => snapToCollapsedRef.current();
  const callSnapBack = () => {
    const st = snapStateRef.current;
    if (st === 'full') snapToFullRef.current();
    else if (st === 'half') snapToHalfRef.current();
    else snapToCollapsedRef.current();
  };

  // Slide in on mount — matches CountrySheet/DestinationSheet's own entrance: slideAnim
  // starts off-screen (CLOSE_POS, set above) and animates up to the collapsed resting
  // position with the same SNAP_CONFIG curve, so returning to world view (or backing out of
  // a country/destination sheet, which unmounts and remounts this one) produces the
  // identical slide-up-from-bottom transition.
  useEffect(() => {
    onMountSnap?.(initialSnap ?? 'peek');
    // The feed reveals itself via DiscoverScreen's onInitialScrollApplied; this is only a
    // failsafe so it can never stay hidden if that never fires.
    if (initialScrollY) setTimeout(() => setFeedReady(true), 250);
    if (startSnap) { onSnapStateChange?.(initialSnap!); return; }
    lastPos.value = COLLAPSED_Y;
    slideAnim.value = withTiming(COLLAPSED_Y, SNAP_CONFIG);
  }, []);

  // Map interaction started (see Props.collapseSignal) → drop from half back to collapsed,
  // mirroring how the destination/spot sheets peek on the same signal. Ref-diffed so the
  // initial mount value never triggers a phantom collapse.
  const lastCollapseSignalRef = useRef(collapseSignal);
  useEffect(() => {
    if (collapseSignal === undefined || collapseSignal === lastCollapseSignalRef.current) return;
    lastCollapseSignalRef.current = collapseSignal;
    if (snapStateRef.current === 'half') snapToCollapsedRef.current();
  }, [collapseSignal]);

  const dragEngagedSV = useSharedValue(false);

  let pan = Gesture.Pan()
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
      // Mirrors CountrySheet/DestinationSheet's own gate: while full-screen, only let this
      // gesture pull the sheet down once the feed's own ScrollView is already scrolled to
      // the top — otherwise an ordinary downward scroll inside the feed would also drag the
      // whole sheet down, which is exactly what made it feel "impossible to slide down"
      // before this was wired up (the sheet's own pan gesture never even had a chance to
      // activate, since DiscoverScreen's ScrollView claimed every vertical touch first).
      if (snapStateSV.value === 'full' && !(scrollY.value <= 1 && e.translationY > 6)) return;
      dragEngagedSV.value = true;
      const clampMax = snapStateSV.value === 'collapsed' ? CLOSE_POS : COLLAPSED_Y;
      slideAnim.value = Math.max(FULL_POS, Math.min(clampMax, lastPos.value + e.translationY));
    })
    .onEnd(e => {
      if (mapGestureAtSV && Date.now() - mapGestureAtSV.value < 400) { runOnJS(callSnapBack)(); return; }
      const pos = lastPos.value + e.translationY;

      if (snapStateSV.value === 'collapsed') {
        // Swiping up from collapsed lands at half, unless the drag has already been carried
        // past the halfway point, in which case it commits straight to full. Swiping down
        // just settles back at collapsed — there's no level above world view to dismiss to.
        if (pos <= HALF_POS) { runOnJS(callSnapToFull)(); return; }
        if (e.velocityY < -500 || pos < COLLAPSED_Y - 60) runOnJS(callSnapToHalf)();
        else runOnJS(callSnapToCollapsed)();
        return;
      }

      if (snapStateSV.value === 'full') {
        if (!dragEngagedSV.value) return;
        if (pos >= HALF_POS) { runOnJS(callSnapToCollapsed)(); return; }
        runOnJS(callSnapToHalf)();
        return;
      }

      // From half: swipe up continues to full, swipe down continues to collapsed, anything
      // smaller settles back at half.
      if (e.velocityY < -500 || pos < HALF_POS - 60) runOnJS(callSnapToFull)();
      else if (e.velocityY > 500 || pos > HALF_POS + 60) runOnJS(callSnapToCollapsed)();
      else runOnJS(callSnapToHalf)();
    });
  // Without this, the feed's own native scroll pan claims the touch outright while
  // full-screen, so our gesture never even starts recognizing — letting both recognize
  // simultaneously means the feed keeps scrolling normally, while our onUpdate's own
  // `scrollY.value <= 1` check (above) decides whether a downward drag should also move
  // the sheet.
  pan = pan.simultaneousWithExternalGesture(scrollRef);

  return (
    <View style={st.backdrop} pointerEvents="box-none">
      <Animated.View
        pointerEvents={snapStateRef.current === 'full' ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToCollapsedRef.current()} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[st.sheet, sheetAnimStyle]}>
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F9FAFB' }]}>
            {/* Drag handle — always visible at the very top, since there's no separate
                compact card to carry its own. Not draggable itself; the whole sheet already
                is via the gesture wrapping it. */}
            <View pointerEvents="none" style={st.pillRow}>
              <View style={st.pill} />
            </View>

            {/* The Explore feed — the exact same content at every snap state. Collapsed and
                half just show less of it (cropped by the sheet's own shorter height above);
                only full-screen lets it actually scroll, matching the other sheets'
                collapsed/half being a fixed, non-scrollable preview of their own content. */}
            <View style={{ flex: 1, opacity: feedReady ? 1 : 0 }}>
              <DiscoverScreen
                initialScrollY={initialScrollY}
                onInitialScrollApplied={() => setFeedReady(true)}
                scrollRef={scrollRef}
                scrollEnabled={snapState === 'full'}
                topPadding={snapState === 'full' ? undefined : 0}
                searchProgress={searchProgress}
                searchVisible={snapState === 'full'}
                onScroll={e => { scrollY.value = e.nativeEvent.contentOffset.y; onScrollYChange?.(e.nativeEvent.contentOffset.y); }}
                onSelectDestination={onSelectDestination}
              />
            </View>

            {/* Bottom-screen (collapsed) is just a cropped sliver of the feed — tapping
                anywhere on it should open the sheet to half-screen rather than letting the
                tap fall through to whatever feed content happens to be showing, matching
                CountrySheet/DestinationSheet's own tap-to-expand header. */}
            {snapState === 'collapsed' && (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToHalfRef.current()} />
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Display-only: tapping hands off to MapScreen's own search bar (focus, white
          backdrop, results dropdown). Same top offset/height/radius/padding/font/shadow as
          that bar; gray fill so it shows on this sheet's white, and a 12px right inset since
          the layers pill it makes room for isn't shown here. */}
      <Animated.View
        pointerEvents={snapState === 'full' ? 'auto' : 'none'}
        style={[st.searchBarWrap, { top: insets.top + SEARCH_BAR_TOP_GAP }, searchBarStyle]}
      >
        <Pressable style={st.searchBar} onPress={onSearchPress}>
          <Search size={15} color="#9CA3AF" />
          <Text style={st.searchPlaceholder} numberOfLines={1}>{SEARCH_PLACEHOLDER}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  searchBarWrap: { position: 'absolute', left: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: SEARCH_BAR_H, backgroundColor: '#E5E7EB', borderRadius: SEARCH_BAR_H / 2,
    paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  searchPlaceholder: { flex: 1, fontSize: 14, color: '#9CA3AF' },
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 90, elevation: 90 } as any,

  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0, height: H,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F9FAFB',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },

  pillRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4, zIndex: 1 },
  pill:    { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)' },
});

// Memoized: MapScreen re-renders on every camera frame, and this sheet (feed of photo cards) has no
// business re-rendering with it. Its props are kept stable by MapScreen for exactly this reason.
export default React.memo(ExploreSheet);
