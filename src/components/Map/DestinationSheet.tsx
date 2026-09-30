import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Alert,
  Animated, Dimensions, Modal, TextInput, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
// LinearGradient aliased to avoid colliding with Reanimated/core Animated naming below, and
// because `Stop`/`Defs`/`Rect` read fine unqualified. Powers the hero's legibility scrim —
// see GRADIENT_STOPS for why this replaced a stack of flat strips.
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
// The main vertical drag (collapsed/full) is driven by Reanimated + Gesture Handler
// (UI thread) instead of core Animated/PanResponder — PanResponder's move events are
// computed on the JS thread, round-tripping through the bridge every touch-move frame, which
// was the actual cause of drag jank. Aliased to `Reanimated` (rather than replacing the core
// `Animated` import) since the rest of this file — the tab swipe, small modals below, the
// scroll-driven tab bar overlay — still use core Animated and aren't part of this fix.
import Reanimated, {
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
import { X, Check, Calendar, MapPin, Camera, Pencil, Plus, ChevronRight, ChevronDown, Map } from 'lucide-react-native';
import { useStore } from '../../store';
import SpotCard from './SpotCard';
import type { Destination, PhotoEntry, Visit, GoodToKnowTip } from '../../types';
import { SPOTS, type Spot } from '../../data/spots';
import { photoCache, getOrFetchWikiThumbnail, fetchCommonsPhoto } from '../../utils/photoCache';
import CircleFlag from '../CircleFlag';
import { sheetPose } from './sheetPose';
import EntityPhoto from './EntityPhoto';
import ClimateDetailModal from './ClimateDetailModal';
import { MONTHS_SHORT } from '../../utils/travelData';
import { getCrowdMeta } from '../../utils/climateApi';
import {
  parseDateStr, DatePickerModal, PhotoGalleryModal,
  VisitCardList, VisitModuleSheet, type VisitSelectorItem,
} from './sheetShared';

const { height: H, width: W } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;  // fully off-screen
const HERO_H      = Math.round(H * 0.52);
// Same bottom-tab-bar reservation App.tsx's Tab.Navigator uses for its own tabBarStyle
// height — the destination sheet lives inside that "Map" tab's screen, so anything it
// shows must end above this, not at the raw device bottom edge, or the app's own
// Map/Explore/Profile bar covers it.
const BOTTOM_TAB_H = Platform.OS === 'ios' ? 88 : 64;
// Collapsed (bottom-screen carousel) always sits at exactly the screen's vertical midpoint —
// a fixed height, not one that hugs the carousel's own content — so its bottom edge stays
// flush just above the app's own Map/Explore/Profile tab bar.
const COLLAPSED_Y = H / 2;
const COMPACT_H   = Math.max(0, (H - BOTTOM_TAB_H) - COLLAPSED_Y);
// How far the tab bar's own top edge tucks up UNDER the hero's rounded bottom corner (its
// marginTop below, in styles) — the tab bar's on-screen footprint beyond that overlap is
// (measured height − this), which is exactly how much shorter the hero's own collapsed crop
// needs to be so the tab bar (including its bottom underline) fits fully within the fixed
// collapsed visible window instead of being cut off at its edge. See heroAnimStyle.
const TAB_BAR_TUCK = 24;
// Peek — slid down further than collapsed, so only a thin strip of the hero image (with the
// destination's name) sticks up above the tab bar. Entered automatically (not by user drag)
// whenever the map itself is panned/zoomed, so the sheet gets out of the way while still
// showing what's selected.
const PEEK_STRIP_H = 90;
const PEEK_Y = Math.max(COLLAPSED_Y, (H - BOTTOM_TAB_H) - PEEK_STRIP_H);
// Snap transitions ease to their target with no overshoot at all — a plain duration+curve
// tween instead of a physical spring, since any spring (even lightly underdamped) reads as
// "bouncy" here given how large a distance these snaps travel.
const SNAP_CONFIG  = { duration: 280, easing: Easing.out(Easing.cubic) };
const QUICK_CONFIG = { duration: 150, easing: Easing.out(Easing.cubic) };

// Legibility scrim over the hero photo: transparent at the top, darkening toward the bottom.
//
// Rendered as a real SVG gradient rather than the stack of 200 flat 2px strips this used to
// be. Each strip was a solid fill, so the "gradient" was really 200 discrete steps and the
// edges between them read as horizontal banding — most visible across smooth areas of a photo
// like sky. An SVG gradient is interpolated per-pixel on the GPU, so it's genuinely smooth.
const GRAD_H_TOTAL = 400;
// The original t^1.8 × 0.94 curve, sampled. SVG interpolates LINEARLY between stops, so the
// curve needs enough samples to trace it — 13 makes the piecewise error imperceptible, while
// the fill between them is still smoothly interpolated.
const GRADIENT_STOPS = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return { offset: t, opacity: +(t ** 1.8 * 0.94).toFixed(4) };
});



const ICON_CAT: Record<string, string> = {
  '🎭':'Entertainment', '🌳':'Nature & Parks', '🏙️':'City Landmark',
  '🎬':'Entertainment', '🎡':'Waterfront',      '🔭':'Science & Culture',
  '⛲':'Attraction',    '🏛️':'Historic Site',   '💡':'Street District',
  '🌅':'Scenic View',   '💨':'Natural Wonder',  '🌈':'Natural Wonder',
  '🐺':'Wildlife',      '🧗':'Adventure',        '⛰️':'Mountain',
  '💦':'Waterfall',     '📡':'Observatory',      '🦕':'Museum',
  '🍺':'Historic Area', '⛪':'Religious Site',   '🏰':'Castle / Fort',
  '🎨':'Art & Culture', '🐬':'Beach',            '🏝️':'Island',
  '🤿':'Underwater',    '🚡':'Cable Car View',   '🏖️':'Beach',
  '🎶':'Performing Arts','⚰️':'Cemetery',        '☀️':'Ruins',
  '🥾':'Hiking Trail',  '👁️':'Scenic View',      '🌿':'Nature & Parks',
};
const catLabel = (icon: string) => ICON_CAT[icon] ?? 'Point of Interest';

// ── Log Moment (first-visit quick-log) ────────────────────────────────────────
function LogMomentSheet({ destination, onDone, onDismiss }: {
  destination: Destination;
  onDone: (d: { visitDate?: string; notes?: string }) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [date, setDate]     = useState('');
  const [notes, setNotes]   = useState('');
  const [showDP, setShowDP] = useState(false);
  const slide = useRef(new Animated.Value(360)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue:0, damping:22, stiffness:260, useNativeDriver:true }).start();
  }, []);
  const dismiss = (fn: () => void) =>
    Animated.timing(slide, { toValue:360, duration:200, useNativeDriver:true }).start(fn);
  const dp = parseDateStr(date);
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={lS.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss(onDismiss)} />
        <Animated.View style={[lS.card, { paddingBottom: insets.bottom+20, transform:[{translateY:slide}] }]}>
          <View style={lS.pill2}><View style={lS.pillBar} /></View>
          <Text style={lS.title}>Log your visit</Text>
          <Text style={lS.sub}>{destination.name}</Text>
          <Pressable style={lS.row} onPress={() => setShowDP(true)}>
            <Calendar size={16} color="#6B7280" />
            <Text style={date ? lS.val : lS.ph}>{dp ? `${dp.monthLabel} ${dp.year}` : 'When did you visit?'}</Text>
          </Pressable>
          <View style={lS.divider} />
          <View style={lS.row}>
            <Text style={{ fontSize:16 }}>✏️</Text>
            <TextInput style={lS.notes} placeholder="Quick memory or note…" placeholderTextColor="#9CA3AF"
              value={notes} onChangeText={setNotes} multiline />
          </View>
          <View style={lS.buttons}>
            <Pressable style={lS.skipBtn} onPress={() => dismiss(onDismiss)}>
              <Text style={lS.skipTxt}>Skip</Text>
            </Pressable>
            <Pressable style={lS.doneBtn}
              onPress={() => dismiss(() => onDone({ visitDate: date||undefined, notes: notes||undefined }))}>
              <Text style={lS.doneTxt}>Done</Text>
            </Pressable>
          </View>
        </Animated.View>
        {showDP && <DatePickerModal value={date} onDone={d => { setDate(d); setShowDP(false); }} onCancel={() => setShowDP(false)} />}
      </View>
    </Modal>
  );
}
const lS = StyleSheet.create({
  overlay:  { flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' },
  card:     { backgroundColor:'white', borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:22, paddingTop:12 },
  pill2:    { alignItems:'center', marginBottom:18 },
  pillBar:  { width:36, height:4, borderRadius:2, backgroundColor:'#E5E7EB' },
  title:    { fontSize:19, fontWeight:'800', color:'#111827', marginBottom:2 },
  sub:      { fontSize:13, color:'#6B7280', marginBottom:22 },
  row:      { flexDirection:'row', alignItems:'flex-start', gap:12, paddingVertical:4 },
  val:      { flex:1, fontSize:15, color:'#111827', fontWeight:'500', marginTop:1 },
  ph:       { flex:1, fontSize:15, color:'#9CA3AF', marginTop:1 },
  divider:  { height:StyleSheet.hairlineWidth, backgroundColor:'#F3F4F6', marginVertical:14 },
  notes:    { flex:1, fontSize:15, color:'#111827', minHeight:56, lineHeight:22, marginTop:1 },
  buttons:  { flexDirection:'row', gap:10, marginTop:22 },
  skipBtn:  { flex:1, paddingVertical:13, borderRadius:14, alignItems:'center', backgroundColor:'#F3F4F6' },
  skipTxt:  { fontSize:15, fontWeight:'600', color:'#6B7280' },
  doneBtn:  { flex:2, paddingVertical:13, borderRadius:14, alignItems:'center', backgroundColor:'#059669' },
  doneTxt:  { fontSize:15, fontWeight:'700', color:'white' },
});



// ── "Why visit" — the destination's top 3 reasons as a sideways-paging carousel of large photo
// cards, each captioned with its reason (photos from destination.whyVisitPhotos). Cards are a bit
// narrower than the panel so the next one peeks in from the right, signalling there's more.
// Border for the About tab's boxes — same gray as the My Visit trip log card (memCard).
const ABOUT_BORDER = '#D8DBE0';
const WHY_GAP = 10;
const WHY_INSET = 16; // carousel's rest inset — matches the panel's own 16px side padding (whyRow)
// The carousel's actual visible width — since whyScroll bleeds to the screen edges
// (marginHorizontal:-16), the ScrollView's own rendered viewport is the FULL screen width, not
// W-32 as it was back when the carousel sat clipped inside the (now-removed) box. Centering math
// below was off by 32px (16 on each side) using the old, narrower value.
const WHY_VIEW_W = W;
// ~85% of the row's visible width (minus the left inset), so a sliver of the next card shows
// beside it.
const WHY_CARD_W = Math.round((WHY_VIEW_W - WHY_INSET) * 0.85);
const WHY_CARD_H = Math.round(WHY_CARD_W * 0.62); // rectangular
const WHY_STRIP_OPACITY = 0.68; // caption strip's black
const WHY_STRIP_FADE_H = 48;    // how far the strip's top edge fades up into the photo
// Eased (smoothstep) ramp from clear to the strip's opacity — a plain two-stop linear ramp leaves a
// visible line where it meets the solid strip, while easing in and out blends at both ends.
const STRIP_FADE_STOPS = Array.from({ length: 11 }, (_, i) => {
  const t = i / 10;
  return { offset: `${t}`, opacity: WHY_STRIP_OPACITY * t * t * (3 - 2 * t) };
});
// Snap stops: the first card at rest (left-aligned at the inset), the last flush to the right
// edge, and every card in between centered in the row.
function whySnapOffsets(count: number): number[] {
  const contentW = WHY_INSET * 2 + count * WHY_CARD_W + (count - 1) * WHY_GAP;
  const maxOffset = Math.max(0, contentW - WHY_VIEW_W);
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return 0;
    if (i === count - 1) return maxOffset;
    const center = WHY_INSET + i * (WHY_CARD_W + WHY_GAP) + WHY_CARD_W / 2 - WHY_VIEW_W / 2;
    return Math.min(maxOffset, Math.max(0, Math.round(center)));
  });
}

function WhyVisitCarousel({ destination, scrollRef }: {
  destination: Destination;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const reasons = destination.whyVisit ?? [];
  const snapOffsets = whySnapOffsets(reasons.length);
  // Opens on the middle card (centered), with the first and last peeking in on either side.
  const initialX = snapOffsets[Math.floor(reasons.length / 2)] ?? 0;
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      contentOffset={{ x: initialX, y: 0 }}
      snapToOffsets={snapOffsets}
      snapToStart
      snapToEnd
      style={st.whyScroll}
      contentContainerStyle={st.whyRow}
    >
      {reasons.map((reason, i) => {
        const file = destination.whyVisitPhotos?.[i];
        return (
          <View key={i} style={st.whyCard}>
            {file && (
              <EntityPhoto
                cacheKey={`why_${destination.id}_${i}`}
                cache={photoCache}
                load={() => fetchCommonsPhoto(file, 960)}
                placeholderColor="#E5E7EB"
              />
            )}
            {/* Caption on its own translucent dark strip across the bottom of the photo, whose top
                edge fades up into the image rather than cutting across it. Explicit numeric Svg size —
                percentage sizing inside react-native-svg has fallen short of its container before. */}
            <View pointerEvents="none" style={st.whyCaptionStrip}>
              <View style={st.whyStripFade}>
                <Svg width={WHY_CARD_W} height={WHY_STRIP_FADE_H}>
                  <Defs>
                    <SvgLinearGradient id={`whyStrip-${destination.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                      {STRIP_FADE_STOPS.map(({ offset, opacity }) => (
                        <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                      ))}
                    </SvgLinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width={WHY_CARD_W} height={WHY_STRIP_FADE_H} fill={`url(#whyStrip-${destination.id}-${i})`} />
                </Svg>
              </View>
              <Text style={st.whyCaption} numberOfLines={3}>{reason}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── "Good to know" — a heads-up travel tip with its own custom icon, a bold title, and a
// detail line underneath. One consistent icon-badge color for all tips (no per-tip tagging
// or color-coding) — rows within a single connected card, divided by hairlines.
function TipItem({ tip, isLast }: { tip: GoodToKnowTip; isLast: boolean }) {
  return (
    <View style={[st.tipRow, !isLast && st.tipRowDivider]}>
      <View style={st.tipIconBadge}>
        <Text style={st.tipIconTxt}>{tip.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.tipTitleTxt}>{tip.title}</Text>
        <Text style={st.tipDetailTxt}>{tip.detail}</Text>
      </View>
    </View>
  );
}

// ── "When to visit" — a best-time-to-go card (headline built from this destination's own
// numbers) plus a link into the full ClimateDetailModal breakdown.

// Builds the card's headline from THIS destination's own numbers, rather than the fixed
// "Pleasant weather and fewer crowds around {months}" every destination used to get. That
// template didn't just read generically, it could be plainly wrong — asserting pleasant
// weather and thin crowds for a tropical destination whose best window is still humid and
// busy, or for a rank-1 city that has no quiet month at all.
//
// Each clause is only included when the data supports it, so the sentence says less when
// there's less to say instead of overclaiming.
// A month/range is its own segment (coloured green on render); a joiner (", " or " and ",
// between multiple non-contiguous best windows) is its own separate segment so it stays plain
// text — only the actual months should read as green, not the word "and" sitting between them.
interface MonthSegment { text: string; isMonth: boolean }

// Split into the parts around the month range/name, so the render side can colour just the
// month segments — `before + months + after` reproduces the exact original sentence.
interface WhenToVisitSummary { before: string; months: MonthSegment[]; after: string }

// Months as RANGES, not a comma list. Good windows are usually contiguous, so a plain list
// produced things like "Jan, Feb, Mar, Apr, Sep, Oct, Nov and Dec" — technically right,
// impossible to read. Consecutive runs collapse to "Sep–Apr", including across the Dec→Jan
// boundary, which is exactly where a southern-hemisphere or tropical dry season sits.
function formatMonths(idx: number[]): MonthSegment[] {
  if (idx.length === 12) return [{ text: 'any time of year', isMonth: true }];
  const runs: number[][] = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else runs.push([i]);
  }
  // Dec and Jan both present → the year wraps, so fold the trailing run into the leading one.
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].slice(-1)[0] === 11) {
    runs[0] = [...runs.pop()!, ...runs[0]];
  }
  const label = (r: number[]) => r.length === 1
    ? MONTHS_SHORT[r[0]]
    : `${MONTHS_SHORT[r[0]]}–${MONTHS_SHORT[r[r.length - 1]]}`;
  const parts = runs.map(label);
  if (parts.length <= 1) return parts.length ? [{ text: parts[0], isMonth: true }] : [];
  // Each month/range segment stays its own span so only those render green — "," and " and "
  // are separate plain-text segments in between.
  const segments: MonthSegment[] = [];
  parts.slice(0, -1).forEach((p, i) => {
    segments.push({ text: p, isMonth: true });
    segments.push({ text: i < parts.length - 2 ? ', ' : ' and ', isMonth: false });
  });
  segments.push({ text: parts[parts.length - 1], isMonth: true });
  return segments;
}

// Freeform, not templated — the sentence is whatever the destination's own `bestTimeBlurb` says
// (general travel-guide consensus, written per destination rather than derived from this app's
// own crowd/weather numbers), with exactly one `{months}` placeholder swapped out for the actual
// coloured month range. A destination with no curated months/blurb yet falls back to a plain,
// generic line rather than the old crowd/weather-driven sentence-builder.
function buildWhenToVisitSummary(destination: Destination): WhenToVisitSummary {
  const bestIdx = [...(destination.bestMonths ?? [])].map(m => m - 1).sort((a, b) => a - b);
  const months = formatMonths(bestIdx);

  const blurb = destination.bestTimeBlurb;
  if (bestIdx.length && blurb?.includes('{months}')) {
    const [before, after] = blurb.split('{months}');
    return { before, months, after };
  }
  return bestIdx.length
    ? { before: '', months, after: ' is typically the best time to visit.' }
    : { before: 'Great to visit ', months: [{ text: 'year-round', isMonth: true }], after: '.' };
}

function WhenToVisitCard({ destination, onOpenClimateDetail }: {
  destination: Destination;
  onOpenClimateDetail?: () => void;
}) {
  // The headline no longer touches computed crowd/weather data at all — it's built purely from
  // the destination's own curated bestMonths/bestTimeBlurb (see buildWhenToVisitSummary).
  const summary = useMemo(() => buildWhenToVisitSummary(destination), [destination]);

  // The linked detail view only shows a visitors/crowds chart for Tier 1 destinations (real
  // tourism data) — label the button accordingly rather than promising data that isn't there.
  const hasVisitorData = getCrowdMeta(destination.id)?.[0]?.tier === 1;

  return (
    <View style={st.wtvCard}>
      {/* The recommendation IS the headline — the old "Best time to go" title sat above it
          saying the same thing twice, and the destination thumbnail repeated the hero photo
          a few hundred pixels up. Both gone; the sentence now leads at full contrast. No icon
          any more either — the green month range itself is now the visual anchor. */}
      <View style={st.wtvHeadRow}>
        <Text style={st.wtvLede}>
          {summary.before}
          {summary.months.map((seg, i) => (
            <Text key={i} style={seg.isMonth ? st.wtvLedeMonths : undefined}>{seg.text}</Text>
          ))}
          {summary.after}
        </Text>
      </View>

      <Pressable style={st.wtvGuideBtn} onPress={onOpenClimateDetail}>
        <Calendar size={16} color="#16A34A" />
        <Text style={st.wtvGuideBtnTxt} numberOfLines={1}>
          {hasVisitorData ? 'View climate and visitor data' : 'View climate data'}
        </Text>
        <ChevronRight size={16} color="#D1D5DB" />
      </Pressable>
    </View>
  );
}

// ── Spots panel — full grid of a destination's spots, with a
// button that jumps into the sliding spot carousel (SpotSheet, via onSelectSpot), which
// already receives the destination's full spot list regardless of which spot is passed.
function SpotsPanel({ spots, onSelectSpot }: {
  spots: typeof SPOTS;
  onSelectSpot?: (spot: Spot) => void;
}) {
  return (
    <View style={{ gap: 16 }}>
      {spots.length > 0 && (
        <Pressable style={st.mapViewBtn} onPress={() => onSelectSpot?.(spots[0])} hitSlop={6}>
          <Map size={14} color="#6B7280" />
          <Text style={st.mapViewBtnTxt}>Map view</Text>
        </Pressable>
      )}

      {spots.length > 0 ? (
        <View style={st.spotsGrid}>
          {spots.map(spot => (
            <SpotCard key={spot.id} spot={spot} width={GRID_CARD_W} onPress={() => onSelectSpot?.(spot)} />
          ))}
        </View>
      ) : (
        <Text style={st.gridEmptyTxt}>No spots yet.</Text>
      )}
    </View>
  );
}

// ── About panel (shared by visited "About" tab + non-visited view) ────────────
function AboutPanel({
  destination, spots, onSelectSpot, onOpenClimateDetail,
  onSeeAllSpots, hlScrollRef, whyScrollRef,
}: {
  destination: Destination;
  spots: typeof SPOTS;
  onSelectSpot?: (spot: Spot) => void;
  onOpenClimateDetail?: () => void;
  onSeeAllSpots?: () => void;
  hlScrollRef?: React.RefObject<ScrollView | null>;
  whyScrollRef?: React.RefObject<ScrollView | null>;
}) {
  return (
    <View style={st.aboutStack}>
      {(!!destination.whyVisit || !!destination.description) && (
        <View style={[st.section, st.aboutFirstSection]}>
          {!!destination.whyVisit && (
            <Text style={st.plainSectionHeader}>WHY VISIT {destination.name.toUpperCase()}?</Text>
          )}
          {/* Unbounded — bleeds to the panel's own edges rather than being clipped inside a box,
              so cards scroll in from the screen edge, not a box edge. */}
          {!!destination.whyVisit && <WhyVisitCarousel destination={destination} scrollRef={whyScrollRef} />}
          {!!destination.description && (
            <View style={st.glanceStack}>
              <Text style={[st.aboutTxt, st.glanceDescription]}>{destination.description}</Text>
            </View>
          )}
        </View>
      )}

      {spots.length > 0 && (
        <View style={st.section}>
          <View style={st.secHeadRow}>
            <Text style={st.plainSectionHeader}>POPULAR SPOTS</Text>
            <Pressable style={st.seeAllRow} onPress={onSeeAllSpots} hitSlop={8}>
              <Text style={st.seeAllTxt}>See all</Text>
              <ChevronRight size={15} color="#16A34A" />
            </Pressable>
          </View>
          <ScrollView ref={hlScrollRef} horizontal showsHorizontalScrollIndicator={false} style={st.hlScroll} contentContainerStyle={st.hlRow}>
            {spots.map(spot => (
              <SpotCard key={spot.id} spot={spot} width={GRID_CARD_W} onPress={() => onSelectSpot?.(spot)} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Full crowd/temperature/rainfall breakdown lives on its own page
          (ClimateDetailModal), opened from here via the "view full guide" row. */}
      <View style={st.section}>
        <Text style={st.plainSectionHeader}>WHEN TO VISIT</Text>
        <WhenToVisitCard
          destination={destination}
          onOpenClimateDetail={onOpenClimateDetail}
        />
      </View>

      {!!destination.goodToKnow && (
        <View style={[st.section, st.aboutLastSection]}>
          <View style={st.secHeadRow}>
            <View style={st.goodToKnowHeadRow}>
              <Text style={st.plainSectionHeader}>GOOD TO KNOW</Text>
            </View>
          </View>
          <View style={st.tipStack}>
            {destination.goodToKnow.map((tip, i) => (
              <TipItem key={i} tip={tip} isLast={i === destination.goodToKnow!.length - 1} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
type Tab = 'visit' | 'about' | 'spots';
type SnapState = 'peek' | 'collapsed' | 'full';

interface Props {
  destination: Destination;
  // Only ever fires from a swipe-down while collapsed (bottom-screen) — see dismissSheetRef
  // below — so `toCollapsed` is always true, letting the caller land the country sheet
  // underneath in its own collapsed view instead of the usual full-screen default.
  onClose: (toCollapsed?: boolean) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onSelectSpot?: (spot: Spot) => void;
  // Reports how far the collapsed compact card's top edge sits from the very bottom of the
  // screen, once measured — lets callers (e.g. the map's back-navigation pill) position
  // themselves an exact, matching distance above it instead of guessing a fixed height.
  onCollapsedTopChange?: (distanceFromBottom: number) => void;
  // Fires on every snap transition (tap or drag) — lets callers that care about collapsed vs.
  // full-screen state (e.g. repositioning the back-to-country pill) react without having to
  // reverse-engineer it from onExpand/onCollapse alone.
  onSnapStateChange?: (state: SnapState) => void;
  // Written to continuously (every frame, not just at snap boundaries) with the exact
  // "bottom" offset the back-to-country pill should sit at *right now* — computed here (this
  // sheet owns slideAnim and its snap-point constants) by piecewise-interpolating between the
  // two already-tuned resting targets as slideAnim moves. A shared value (not a JS callback)
  // so the write happens directly on the UI thread with zero JS-thread hop — that's what lets
  // the pill track the sheet's top edge in true lockstep while dragging, instead of lagging
  // behind it.
  pillOffsetSV?: SharedValue<number>;
  // While true, some other UI (the spot carousel) owns the pill's position instead — this
  // sheet's writes to pillOffsetSV are suppressed so the two don't fight.
  pillOffsetLockedSV?: SharedValue<boolean>;
  // Mount-time only — lets a caller open straight to a specific tab/snap point (e.g. the
  // spot carousel's "list view" button reopening this sheet full-screen on the Spots tab).
  // Ignored on subsequent destination switches, which always reset to the defaults below.
  initialTab?: Tab;
  initialSnap?: SnapState;
  // Bump this (e.g. an incrementing counter) to imperatively collapse the sheet from the
  // parent — used by the back pill's down-arrow while the sheet is full-screen.
  collapseSignal?: number;
  // Bump this to imperatively drop the sheet to its "peek" state — a thin strip of the
  // hero image with the destination's name, slid down further than collapsed. Used by the
  // parent when the user pans/zooms the map, so the sheet gets out of the way. No-ops if
  // already peeking or the sheet has been dismissed.
  peekSignal?: number;
  // Set by MapScreen to Date.now() on every camera event of a live map gesture. Zooming the map
  // with a finger resting on this sheet's strip used to be read as a swipe of the sheet itself —
  // the finger travels upward during a pinch-in — so lifting it snapped the sheet to half-screen.
  mapGestureAtSV?: SharedValue<number>;
  // True while the user is interacting with the map (fingers down and the map moving). A selection change or a new
  // sheet during that interaction stays peeked instead of popping up to half-screen. Read on the JS thread only.
  isMapInteracting?: () => boolean;
  // This instance is only the OUTGOING copy of a sheet that another level's sheet is replacing: it starts where the
  // sheet rested, slides off the bottom while the new one slides up, then calls onExited. It never reports snap state,
  // moves the back pill or records a pose.
  leaving?: boolean;
  onExited?: () => void;
  enterFromPrevious?: boolean;   // this sheet replaces another one that was showing: start where it rested, not below the screen
  isPressBlocked?: () => boolean;   // a press that is really a finger of a map gesture (see MapScreen.pressBlocked)
  // Increments when the parent is about to close this sheet (the back pill's X): slide it off
  // the bottom of the screen first, so it leaves rather than vanishing. Parent then unmounts it.
  exitSignal?: number;
}

function DestinationSheet({
  destination, onClose, onExpand, onCollapse, onSelectSpot, onCollapsedTopChange,
  onSnapStateChange, pillOffsetSV, pillOffsetLockedSV, initialTab, initialSnap,
  collapseSignal, peekSignal, exitSignal, mapGestureAtSV, isMapInteracting, isPressBlocked, enterFromPrevious, leaving, onExited,
}: Props) {
  const insets            = useSafeAreaInsets();
  const savedDestinations = useStore(s => s.savedDestinations);
  const saveDestination   = useStore(s => s.saveDestination);
  const unsaveDestination = useStore(s => s.unsaveDestination);
  const updateSaved       = useStore(s => s.updateSaved);
  const savedSpots        = useStore(s => s.savedSpots);
  const saveSpotVisited   = useStore(s => s.saveSpotVisited);

  const saved      = savedDestinations[destination.id];
  const spots      = SPOTS.filter(s => s.destinationId === destination.id);
  const isVisited  = saved?.type === 'visited';

  // Drives the standalone per-visit edit sheet for BOTH creating a new visit module
  // ('new') and editing one specific existing module (the Visit object) — never touches
  // any other module's entry in the array either way.
  const [editingVisitModule, setEditingVisitModule] = useState<Visit | 'new' | null>(null);
  const [showClimateDetail, setShowClimateDetail] = useState(false);
  // Which visit's full photo set is open in the standalone gallery page — separate from
  // editingVisitModule (which opens the EDIT sheet) since viewing all photos is read-only and
  // shouldn't also surface the date/spots/notes editing UI.
  const [galleryVisit, setGalleryVisit] = useState<Visit | null>(null);
  // The shared visit-log components' generic selector, one item per spot belonging to this
  // destination — thumbnail loading stays here (this file already owns getOrFetchWikiThumbnail
  // for spots elsewhere), the shared list/editor only ever sees id/name/renderThumb.
  const spotSelectorItems: VisitSelectorItem[] = useMemo(
    () => spots.map(spot => ({
      id: spot.id,
      name: spot.name,
      renderThumb: () => (
        <EntityPhoto
          cacheKey={`spot_${spot.id}`}
          cache={photoCache}
          load={() => getOrFetchWikiThumbnail(`spot_${spot.id}`, photoCache, spot.name, 300)}
          placeholderColor="#F3F4F6"
        />
      ),
    })),
    [spots],
  );

  // Collapsed (bottom-screen carousel) is the default view whenever a destination is
  // selected — callers only pass initialSnap explicitly for the other case (e.g. the spot
  // carousel's "list view" button wants 'full').
  const resolvedInitialSnap: SnapState = initialSnap ?? 'collapsed';
  // Non-visited destinations have no "My Visit" tab — About and Spots only.
  const TAB_ORDER: Tab[] = useMemo(() => isVisited ? ['visit', 'about', 'spots'] : ['about', 'spots'], [isVisited]);
  const defaultTab: Tab = isVisited ? 'visit' : 'about';
  const startTab: Tab = (initialTab && TAB_ORDER.includes(initialTab)) ? initialTab : defaultTab;
  const [activeTab,     setActiveTab    ] = useState<Tab>(startTab);

  // Derive visits from store, carrying the old destination-level photos/notes/spots onto
  // the synthesized legacy entry so a pre-redesign visit still shows its content as its
  // own module — editing it migrates those fields onto a real Visit the first time it's saved.
  const localVisits: Visit[] = saved?.visits
    ?? (saved?.visitDate
      ? [{
          id: 'legacy', startDate: saved.visitDate, photos: saved.photos, notes: saved.notes,
          spotIds: Object.values(savedSpots)
            .filter(ss => ss.destinationId === destination.id)
            .map(ss => ss.spotId),
        }]
      : []);

  // Saves one visit module — appends a brand new one ('new') or replaces just the matching
  // id in place. Every other entry in the array is copied through untouched either way, so
  // sibling modules never re-render with different content as a side effect of this.
  // Does NOT close the editor itself — VisitModuleSheet auto-commits on every field change,
  // so this fires many times per editing session; only its own Save/X button calls onClose.
  const handleSaveVisitModule = (v: Visit) => {
    // The destination only actually becomes "visited" here, on a genuine save — not the moment
    // "Add Visit" was tapped (see handleMarkVisited). updateSaved below patches fields onto an
    // EXISTING record, so one has to exist first when this is the very first visit.
    if (!isVisited) saveDestination(destination.id, 'visited', {});
    const base = localVisits.filter(x => x.id !== 'legacy');
    const idx  = base.findIndex(x => x.id === v.id);
    const updated = idx >= 0 ? base.map(x => x.id === v.id ? v : x) : [...base, v];
    updated.sort((a, b) => b.startDate.localeCompare(a.startDate));
    updateSaved(destination.id, { visits: updated, visitDate: updated[0]?.startDate });
  };
  const handleDeleteVisitModule = (id: string) => {
    // Nothing to remove (and nothing to touch in the store) if this destination was never
    // actually saved as visited in the first place — e.g. Remove Trip on a brand-new visit
    // that was never saved. Proceeding here would otherwise write a malformed record missing
    // destinationId/type.
    if (!isVisited) return;
    const updated = localVisits.filter(v => v.id !== id);
    // That was the only trip logged for this destination — it's not "visited" anymore, not
    // just visited-with-zero-trips. Unsaves the destination entirely (also drops the legacy
    // visitDate/notes/photos fields, if this was that synthesized single-visit entry) rather
    // than leaving a type:'visited' record with an empty visits array — which would keep the
    // green "Visited" state and the My Visit tab showing despite nothing actually being logged.
    if (updated.length === 0) { unsaveDestination(destination.id); return; }
    updateSaved(destination.id, { visits: updated, visitDate: updated[0]?.startDate });
  };

  // Ref to the sheet's main content ScrollView — declared early since both the tab-swipe
  // gesture below and the main vertical drag gesture (further down) need it.
  const scrollRef       = useRef<ScrollView>(null);
  // Refs to the horizontal ScrollViews nested *inside* each tab panel (About's "popular spots"
  // row, Visit's spots-visited carousel). The top-spots row BLOCKS tab swiping. Without
  // registering
  // these as simultaneous with tabSwipeGesture below, a horizontal drag that starts on top
  // of one of them is claimed by that inner ScrollView first, and only a much larger/more
  // forceful swipe manages to also activate the tab-swipe gesture. Registering them all
  // lets both recognize together regardless of where on the panel the swipe starts.
  const aboutHlScrollRef     = useRef<ScrollView>(null);
  // The About tab's "Why visit" photo carousel — same treatment as the top-spots row (see
  // tabSwipeGesture's requireExternalGestureToFail).
  const whyScrollRef         = useRef<ScrollView>(null);
  // Tab slide position: 0 = first tab, -W = second, -2W = third (if present). A Reanimated
  // shared value (not core Animated) — the gesture below writes to it directly from the UI
  // thread with zero JS-thread hop per frame, which is what makes the tab swipe track the
  // finger smoothly instead of lagging behind it.
  const tabSlideAnim    = useSharedValue(-TAB_ORDER.indexOf(startTab) * W);
  const activeTabRef    = useRef<Tab>(startTab);
  const tabSwipeBaseRef = useSharedValue(0);
  const tabSlideFor = (tab: Tab) => -TAB_ORDER.indexOf(tab) * W;
  // No overshoot at all — a plain duration+curve tween rather than a spring, so switching or
  // settling a tab never has even a slight bounce.
  const TAB_SLIDE_CONFIG = { duration: 220, easing: Easing.out(Easing.cubic) };

  // Derived indicator position for the tab bar underline — evenly spaced by tab count
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
  // actually on screen, letting a short tab scroll down into blank space left over from a
  // taller sibling. Driving the track's height off the same shared value as the horizontal
  // slide keeps the two in lockstep, so it eases across during a tab swipe rather than
  // jumping when the swipe settles. Mirrors CountrySheet's own fix.
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

  // If visited-state flips while the sheet is open (e.g. marking a visit adds the "My
  // Visit" tab), snap the slide position back in sync instead of leaving it misaligned.
  useEffect(() => {
    // Panel indices are positional within TAB_ORDER, so adding/removing "My Visit" shifts
    // every measurement by one — drop them and let the panels re-report on the next layout.
    panelHeightsRef.current = [];
    panelHeightsSV.value = [];
    const idx = TAB_ORDER.indexOf(activeTabRef.current);
    if (idx === -1) {
      activeTabRef.current = TAB_ORDER[0];
      setActiveTab(TAB_ORDER[0]);
      tabSlideAnim.value = 0;
    } else {
      tabSlideAnim.value = -idx * W;
    }
  }, [isVisited]);

  const switchTabRef = useRef<(tab: Tab) => void>(() => {});
  switchTabRef.current = (newTab: Tab) => {
    if (activeTabRef.current === newTab) return;
    activeTabRef.current = newTab;
    setActiveTab(newTab);
    tabSlideAnim.value = withTiming(tabSlideFor(newTab), TAB_SLIDE_CONFIG);
  };

  const snapTabToNearest = () => {
    tabSlideAnim.value = withTiming(tabSlideFor(activeTabRef.current), TAB_SLIDE_CONFIG);
  };

  const setActiveTabJS = useCallback((tab: Tab) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  }, []);

  // A Reanimated/Gesture-Handler gesture (like the vertical `pan` above), not core
  // PanResponder — a plain PanResponder wrapping a gesture-handler ScrollView (which is what
  // the main content ScrollView now is, needed for the vertical drag's own ScrollView
  // cooperation) doesn't reliably win touches from it, which silently broke tab swiping.
  // activeOffsetX/failOffsetY give this gesture priority for horizontal drags while ceding
  // vertical ones to the ScrollView (or the outer vertical sheet-drag gesture) instead.
  const tabSwipeGesture = Gesture.Pan()
    .enabled(TAB_ORDER.length > 1)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onStart(() => {
      tabSwipeBaseRef.value = tabSlideAnim.value;
    })
    .onUpdate(e => {
      const maxOffset = -(TAB_ORDER.length - 1) * W;
      tabSlideAnim.value = Math.max(maxOffset, Math.min(0, tabSwipeBaseRef.value + e.translationX));
    })
    .onEnd(e => {
      const projected = tabSwipeBaseRef.value + e.translationX;
      // Nearest tab by raw dragged position, unless a decisive fling overrides it
      // to step exactly one tab further in the fling direction.
      let targetIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < TAB_ORDER.length; i++) {
        const d = Math.abs(-i * W - projected);
        if (d < nearestDist) { nearestDist = d; targetIdx = i; }
      }
      if (Math.abs(e.velocityX) > 400) {
        // Derived from the UI-thread-only tabSwipeBaseRef (this gesture's own recorded start
        // position) rather than activeTabRef.current — that ref is only updated later, via
        // runOnJS, so on a quick second swipe fired before the previous swipe's JS-thread
        // update had actually landed, it could still read the OLD tab and jump two steps
        // instead of one.
        const curIdx = Math.round(-tabSwipeBaseRef.value / W);
        const dir = e.velocityX < 0 ? 1 : -1;
        targetIdx = Math.max(0, Math.min(TAB_ORDER.length - 1, curIdx + dir));
      }
      tabSlideAnim.value = withTiming(-targetIdx * W, TAB_SLIDE_CONFIG);
      // Always sync JS state, rather than trying to skip a no-op update by comparing
      // against activeTabRef.current here — a plain JS ref read from inside a UI-thread
      // worklet can hold a stale snapshot (refs aren't live-synced across the JS/UI thread
      // boundary the way a shared value is), which was silently skipping this call and
      // leaving the previous tab's highlight in place even though the content had already
      // slid to the new one. setActiveTabJS is a harmless no-op on the JS thread if the tab
      // hasn't actually changed.
      runOnJS(setActiveTabJS)(TAB_ORDER[targetIdx]);
    })
    .simultaneousWithExternalGesture(scrollRef)
    // The About tab's "Popular Spots" and "Why visit" carousels are the exception to the simultaneous
    // registration above: a horizontal drag that starts on one should ONLY scroll that carousel,
    // not also slide the sheet to another tab. Requiring their native scroll gestures to fail
    // first means this pan never activates for touches that begin on a carousel (the scroll wins
    // the moment it starts moving), while touches anywhere else on the panel are unaffected —
    // a handler that isn't tracking the touch isn't waited on.
    .requireExternalGestureToFail(aboutHlScrollRef, whyScrollRef);

  // NOTE: this sheet deliberately has NO lateral destination-swiping (neither on the hero
  // nor at collapsed height, which is now just a shorter crop of the same hero — see
  // heroAnimStyle). Sheets only page laterally when the siblings they'd page through are
  // the pins currently visible on the map (SpotSheet's carousel passes that test — its
  // sibling spots are all on screen at spot zoom; a destination's siblings are other
  // cities, off-screen). Moving between destinations happens on the map (tapping sibling
  // pins) — there's deliberately no in-sheet destination list either.

  // Shared tab-bar content (buttons + sliding indicator) — rendered both inline (scrolls
  // normally with the hero) and in the fixed overlay copy that takes over once scrolled
  // past it, so the two never drift out of sync.
  const isTabSelected = (tab: Tab) => activeTab === tab;
  const renderTabBarRow = () => (
    <>
      {TAB_ORDER.map((tab, i) => (
        <React.Fragment key={tab}>
        {i > 0 && <View style={st.tabDivider} />}
        <Pressable
          style={st.tabBtn}
          onPress={() => {
            // Tapping a subtab (from any snap state, even the already-active tab — the
            // tab bar is only ever fully reachable/readable at half-screen, so the tap
            // itself signals "show me this content") always expands to full-screen.
            if (snapStateRef.current !== 'full') snapToFullRef.current();
            switchTabRef.current(tab);
          }}
        >
          {tab === 'visit' ? (
            <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
              <Text style={[st.tabBtnTxt, isTabSelected('visit') && st.tabBtnTxtActive]}>
                {localVisits.length > 1 ? 'My Visits' : 'My Visit'}
              </Text>
              {localVisits.length > 1 && (
                <View style={st.tabVisitBadge}>
                  <Text style={st.tabVisitBadgeTxt}>{localVisits.length}</Text>
                </View>
              )}
            </View>
          ) : tab === 'spots' ? (
            <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
              <Text style={[st.tabBtnTxt, isTabSelected('spots') && st.tabBtnTxtActive]}>Spots</Text>
              {spots.length > 0 && (
                <View style={st.tabSpotsBadge}>
                  <Text style={st.tabSpotsBadgeTxt}>{spots.length}</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={[st.tabBtnTxt, isTabSelected(tab) && st.tabBtnTxtActive]}>About</Text>
          )}
        </Pressable>
        </React.Fragment>
      ))}
      {/* Sliding underline — outer element keeps the existing per-tab left/width
          positioning; the visible bar itself is a narrower, centered child so it doesn't
          span the full tab width. */}
      <Reanimated.View
        style={[
          st.tabIndicatorTrack,
          { width: `${100 / TAB_ORDER.length}%` },
          tabIndicatorStyle,
        ]}
      >
        <View style={st.tabIndicator} />
      </Reanimated.View>
    </>
  );

  // The hero and peek photos are <EntityPhoto> elements (see EntityPhoto.tsx): they derive their URL from this
  // destination's own cache key, so it can't be another destination's, and their loading state never re-renders
  // this sheet.

  // ── Unified sheet: two snap points ───────────────────────────────────────────
  // COLLAPSED_Y = compact card visible at bottom; FULL_POS = full screen
  const snapStateRef = useRef<SnapState>(resolvedInitialSnap);
  // Mirrors snapStateRef but readable from the UI-thread gesture worklets below.
  const snapStateSV  = useSharedValue<SnapState>(resolvedInitialSnap);
  // Real React state mirror (unlike the ref above, mutating it DOES trigger a re-render) —
  // needed for scrollEnabled below, which must flip the instant the sheet reaches
  // full-screen. Set via reportSnapState alongside every onSnapStateChange call.
  const [snapStateReact, setSnapStateReact] = useState<SnapState>(resolvedInitialSnap);
  const reportSnapState = useCallback((state: SnapState) => {
    setSnapStateReact(state);
    onSnapStateChange?.(state);
  }, [onSnapStateChange]);
  const slideAnim    = useSharedValue(enterFromPrevious ? (sheetPose.get() ?? CLOSE_POS) : CLOSE_POS);
  const lastPos      = useSharedValue(resolvedInitialSnap === 'full' ? FULL_POS : COLLAPSED_Y);
  // Worklet-readable scroll offset, for the drag gesture's full-screen capture gate (only
  // let a downward drag pull the sheet once its inner ScrollView is already at top).
  const scrollYSV    = useSharedValue(0);
  // Drives the overlay tab bar below.
  const scrollYAnim  = useRef(new Animated.Value(0)).current;
  // The vertical scroll offset at which the inline tab bar's top edge reaches the very top
  // of the sheet — i.e. exactly where it should hand off to the pinned overlay copy. Measured
  // via onLayout (below) rather than computed from HERO_H/insets, since the tab bar's own
  // -24 marginTop (it overlaps the hero's bottom edge) would otherwise throw the threshold
  // off by that amount, causing a visible gap where neither copy is correctly positioned.
  const [tabBarAppearY, setTabBarAppearY] = useState(HERO_H - insets.bottom - 24);
  const tabBarOverlayY = useMemo(() => scrollYAnim.interpolate({
    inputRange: [tabBarAppearY - 1, tabBarAppearY],
    outputRange: [-120, 0],
    extrapolate: 'clamp',
  }), [tabBarAppearY]);

  // Fixed collapsed Y (COLLAPSED_Y is itself a constant — see its own comment). A shared
  // value (not just a ref) so the worklets below (drag gesture, heroAnimStyle) can read it
  // directly on the UI thread.
  const collapsedYRef  = useRef(COLLAPSED_Y);
  const collapsedYAnim = useSharedValue(COLLAPSED_Y);
  // Peek strip: a thin sliver of the hero image + name, fixed at PEEK_Y — invisible until the
  // sheet actually drops down that far (fading in over the same range the hero itself holds
  // steady at its collapsed height — see heroAnimStyle's CLAMP), so the two never
  // double-render mid-transition.
  const peekAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [collapsedYAnim.value, PEEK_Y], [0, 1], Extrapolation.CLAMP),
  }));
  // Continuously writes the back-to-country pill's target "bottom" offset as slideAnim (or
  // scroll position — see below) moves, so the parent's pill mirrors the sheet's own top edge
  // frame-for-frame instead of only re-targeting an animation after a drag settles at a new
  // snap point. Written directly to the shared value passed in via pillOffsetSV — no
  // runOnJS/JS-thread hop at all, since both this sheet and the pill are UI-thread Reanimated
  // values, which is what keeps the pill's glide exactly as smooth as the sheet's own.
  //
  // Now that the hero's own close button is gone, the pill takes over that exact spot for
  // as long as the sheet is full screen — the FULL_POS leg here is the same top-position
  // formula heroTopRowStyle uses, just expressed in "bottom" terms (bottom = H - top - pill's
  // own height) since that's what the pill wrapper's style actually animates. The collapsed
  // leg is untouched — same tuned resting target as before, so the bottom-screen view keeps
  // its existing look — with a single 2-point interpolation giving one smooth, continuous
  // glide between the two states.
  useAnimatedReaction(
    () => [slideAnim.value, scrollYSV.value] as const,
    ([value, scrollY]) => {
      if (!pillOffsetSV || pillOffsetLockedSV?.value) return;
      // Approximate rendered height of the back pill itself (MapScreen's st.upPill) — used
      // to convert its target *top* position (matching where the hero's close button used
      // to sit) into the *bottom* offset the pill wrapper actually animates.
      const PILL_H = 36;
      // The pill lives in MapScreen's own root View, not nested inside this sheet — and
      // that root does NOT span the full device height: App.tsx's bottom Tab.Navigator
      // reserves BOTTOM_TAB_H of layout space for itself (no `position: absolute` on the
      // tab bar), so `bottom: 0` there is BOTTOM_TAB_H above the physical screen edge, not
      // at it. Using raw H here previously overstated the container height, and — more
      // importantly — omitted slideAnim's own contribution: heroTopRowStyle's `top` is
      // relative to the *hero's* origin, which itself sits at slideAnim.value within
      // MapScreen's frame, not at 0.
      const SCREEN_H = H - BOTTOM_TAB_H;
      // While full-screen, the pill is meant to sit exactly where a real in-flow button at
      // the top of the hero would — so it tracks scroll 1:1, sliding up and off the top edge
      // as the user scrolls down, same as any other piece of header content would, instead
      // of staying pinned at a fixed screen position while the hero (and everything else)
      // scrolls underneath it. That fixed-position version was what let it end up floating
      // over the sticky tab-bar overlay / scrolled body text — impossible once it genuinely
      // leaves the screen with the rest of the header. `scrollY` is already clamped to >= 0
      // by bounces={false} on this ScrollView, so no extra clamping is needed here.
      const FULL_TOP_ABS = FULL_POS + (insets.top + 20) - scrollY;
      const FULL_TARGET = SCREEN_H - FULL_TOP_ABS - PILL_H;
      // Collapsed: float a fixed gap above the compact card's own *measured* top
      // (collapsedYAnim.value, kept live by the card's onLayout) rather than a constant
      // distance from the screen's bottom. A constant broke once the collapsed card grew a
      // "Destinations in {Country}" header row above its carousel — the card's top moved up
      // by that header's height, but the fixed-from-bottom pill target didn't follow, so the
      // pill ended up overlapping the header instead of resting above the card.
      const COLLAPSED_PILL_GAP = 16;
      const COLLAPSED_TOP_ABS = collapsedYAnim.value - COLLAPSED_PILL_GAP - PILL_H;
      const COLLAPSED_TARGET = SCREEN_H - COLLAPSED_TOP_ABS - PILL_H;
      // Peek: same fixed-gap-above-the-visible-top idea, now against the peek strip's own
      // (fixed) top instead of the collapsed card's measured one.
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

  // Backdrop: dark when full-screen, fading out to clear as the sheet approaches collapsed.
  // The sheet's drop-shadow (sheetShadow below) is the same view/style at every snap point,
  // but shadows read poorly against a still-dim backdrop.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [1, 0], Extrapolation.CLAMP),
  }));

  // Measured live (tab bar height varies slightly by tab count/font rendering) rather than
  // assumed, so the reserved gap below is always exactly right. Default is a reasonable
  // pre-layout guess so the very first collapsed frame isn't off before onLayout fires.
  const tabBarHAnim = useSharedValue(54);

  // Hero height animates CONTINUOUSLY with the drag — one single element that grows from
  // its collapsed-height crop up to its full height (fullHeroH), rather than a separate
  // duplicate card sliding away to reveal a different full-size hero underneath. This is
  // what makes collapsed→full read as one continuous sheet: same photo, same gradient,
  // same buttons, same text — only the crop changes. Clamped past COLLAPSED_Y so it holds
  // steady at its collapsed height while peeking (the peek strip overlay takes over there).
  //
  // Collapsed crop = COMPACT_H (the fixed, full collapsed visible-window height) MINUS the
  // tab bar's own net footprint (its measured height beyond the TAB_BAR_TUCK overlap) — so
  // the tab bar, INCLUDING its bottom underline, lands fully inside the visible window
  // instead of being clipped at its edge. Without this the tab bar rendered flush against
  // the window boundary with the last few px (its underline) pushed just past it.
  const fullHeroH = HERO_H - insets.bottom;
  const heroAnimStyle = useAnimatedStyle(() => {
    const collapsedHeroH = COMPACT_H - Math.max(0, tabBarHAnim.value - TAB_BAR_TUCK);
    return {
      height: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [fullHeroH, collapsedHeroH], Extrapolation.CLAMP),
    };
  });

  // ── Sheet position: one authority ─────────────────────────────────────────────────────────────────────
  // snapStateRef / snapStateSV hold which snap this sheet is MEANT to be in and slideAnim is animated toward it.
  // Every change of position except the user's own finger drag goes through transitionTo, so there is no second,
  // contradictory writer: a map gesture, a selection change, the back pill and a swipe each just name a target
  // snap, and this function alone turns that into an animation (assigning a new withTiming replaces whatever was
  // running). Nothing routes through the off-screen position except closing. That is what the selection-change
  // effect used to do — it snapped the sheet to CLOSE_POS and slid it back up to half-screen on every switch,
  // which fought the map gesture's peek and showed up as the sheet jumping to half-screen or vanishing.
  const didMountRef = useRef(false);
  const closingRef = useRef(false);
  const transitionToRef = useRef<(next: SnapState, reason: string) => void>(() => {});
  transitionToRef.current = (next, reason) => {
    // Once the parent has told this sheet to leave, only a NEW selection may bring it back — otherwise a late
    // peek/collapse would cancel the slide-out and leave a sheet that's about to unmount hanging on screen.
    if (closingRef.current && reason !== 'selectionChange') return;
    closingRef.current = false;
    const prev = snapStateRef.current;
    const target = next === 'full' ? FULL_POS : next === 'peek' ? PEEK_Y : collapsedYRef.current;
    if (__DEV__) console.log('[sheet] Destination', destination.id, prev, '->', next, `reason=${reason}`, 'mapInteracting=', isMapInteracting?.() ?? false);
    snapStateRef.current = next;
    snapStateSV.value = next;
    lastPos.value = target;
    if (next === 'full') onExpand?.(); else if (reason !== 'mount') onCollapse?.();
    reportSnapState(next);
    if (next !== 'full') onCollapsedTopChange?.(H - target);
    sheetPose.set(next === 'full' ? null : target);
    slideAnim.value = withTiming(target, SNAP_CONFIG);
  };

  // Slide in on mount — collapsed (bottom-screen carousel) by default whenever a destination is selected, unless
  // initialSnap requests otherwise (e.g. the spot carousel's "list view" button wants 'full'), or the map is being
  // interacted with, in which case it comes in already out of the way.
  useEffect(() => {
    if (leaving) {
      closingRef.current = true;
      slideAnim.value = withTiming(CLOSE_POS, { duration: 180, easing: Easing.in(Easing.cubic) }, finished => {
        if (finished && onExited) runOnJS(onExited)();
      });
      return;
    }
    transitionToRef.current(resolvedInitialSnap === 'full' ? 'full' : isMapInteracting?.() ? 'peek' : 'collapsed', 'mount');
  }, []);

  // A different destination was selected while this sheet is up (it isn't remounted). Go straight to the snap it
  // should be in now — half-screen for an ordinary tap, but peeked if the user is mid map gesture, so the
  // selection change can't fight the gesture that's already holding the sheet out of the way. Not the first mount
  // (handled above, which also applies initialSnap/initialTab).
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    transitionToRef.current(isMapInteracting?.() ? 'peek' : 'collapsed', 'selectionChange');
    activeTabRef.current = defaultTab;
    setActiveTab(defaultTab);
    tabSlideAnim.value = 0;
  }, [destination.id]);

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
    if (__DEV__) console.log('[sheet] Destination', destination.id, snapStateRef.current, '-> closed', 'reason=exit');
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

  // TEMPORARY diagnostic (see MapScreen's [sheet-trace]): log when this sheet unmounts/dismisses.
  useEffect(() => {
    if (__DEV__) console.log('[sheet-trace] DestinationSheet mounted', destination.id);
    return () => { if (__DEV__) console.log('[sheet-trace] DestinationSheet unmounted', destination.id); };
  }, []);

  const dismissSheetRef = useRef(() => {});
  dismissSheetRef.current = () => {
    sheetPose.set(null);
    slideAnim.value = withTiming(CLOSE_POS, { duration: 280 }, finished => {
      if (finished) {
        runOnJS(logDismiss)();
        runOnJS(onClose)(true);
      }
    });
  };


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
  const logDismiss = useCallback(() => { if (__DEV__) console.log('[sheet-trace] DestinationSheet dismiss-by-swipe completed'); }, []);

  // True only once onUpdate has actually moved the sheet at least one frame during the
  // current gesture — while full-screen, onUpdate legitimately no-ops for most vertical
  // touches (anything that isn't "already scrolled to top and dragging down"), e.g. an
  // ordinary upward scroll. Without this flag, onEnd would still run its snap-decision logic
  // for that scroll gesture purely off its raw translation/velocity, which is what caused an
  // upward content scroll to incorrectly snap the sheet down to half once released.
  const dragEngagedSV = useSharedValue(false);

  // Runs entirely on the UI thread — onUpdate fires every touch-move frame with zero
  // JS-thread/bridge round trip, which is what actually eliminates the drag jank (switching
  // the sheet's own positioning from `top` to `transform` wasn't enough on its own, since the
  // old PanResponder computed every frame's position on the JS thread regardless of which
  // style property consumed it).
  let pan = Gesture.Pan()
    .maxPointers(1)   // a two-finger map pinch that lands on the sheet is never a drag of it
    // Only activates once the drag is decisively vertical, and fails outright (ceding the
    // touch) once it's decisively horizontal instead — without this, this gesture (with no
    // direction restriction) could win the race against the horizontal tab-swipe gesture
    // below for ANY touch, since both wrap the same content and RNGH activates a Pan on
    // small movement in any direction by default.
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
      // Threshold raised from 6 to 24 — see SpotSheet's own identical gate for why: a few
      // stray pixels of touch movement while scrolling content that's already at the top
      // shouldn't be read as "start collapsing the sheet," since that also drags the
      // back-navigation pill (the down arrow) along with it, making it look like it moves
      // during ordinary scrolling.
      if (snapStateSV.value === 'full' && !(scrollYSV.value <= 1 && e.translationY > 24)) return;
      dragEngagedSV.value = true;
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
        slideAnim.value = Math.max(FULL_POS, Math.min(collapsedYAnim.value, raw));
      }
    })
    .onEnd(e => {
      if (mapGestureAtSV && Date.now() - mapGestureAtSV.value < 400) { runOnJS(callSnapBack)(); return; }
      const pos = lastPos.value + e.translationY;
      const cy  = collapsedYAnim.value;

      if (snapStateSV.value === 'peek') {
        // Same as the Explore sheet: a drag carried past the half-screen position commits straight to full-screen
        // (a direct bottom -> top connection); a smaller swipe up stops at half-screen; anything less settles back.
        if (pos <= cy) { runOnJS(callSnapToFull)(); return; }
        if (e.velocityY < -500 || pos < PEEK_Y - 60) runOnJS(callSnapToCollapsed)();
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

      // Full-screen: a gesture that never actually engaged (e.g. an upward scroll, or a
      // downward one that never got past the "scrolled to top" gate) shouldn't change the
      // sheet's snap state at all — leave it exactly at full.
      if (!dragEngagedSV.value) return;
      // Carried past the half-screen position: straight down to the bottom view, like the Explore sheet.
      if (pos >= cy) runOnJS(callSnapToPeek)();
      else if (e.velocityY > 500 || pos > H * 0.25) runOnJS(callSnapToCollapsed)();
      else runOnJS(callSnapToFull)();
    });
  // Needed for the full-screen case (scrolled to top, then drag down) — without this, the
  // inner ScrollView's own native pan (iOS UIScrollView / Android NestedScrollView) claims
  // the touch outright while full-screen, so our gesture never even starts recognizing.
  // Letting both recognize simultaneously there means the ScrollView keeps scrolling
  // normally, while our onUpdate's own `scrollYSV.value <= 1` check (above) decides whether
  // a given downward drag should also start moving the sheet.
  pan = pan.simultaneousWithExternalGesture(scrollRef);

  // Actions
  const handleMarkVisited = () => {
    if (isVisited) {
      Alert.alert(
        'Remove visit?',
        'This will permanently delete your log and notes for this destination.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove', style: 'destructive',
            onPress: () => unsaveDestination(destination.id),
          },
        ]
      );
      return;
    }
    // Opens the trip editor WITHOUT marking the destination visited yet — that only happens
    // once the user actually saves a trip inside it (see handleSaveVisitModule). Tapping "Add
    // Visit" and then closing with X or Remove Trip before ever saving should leave the
    // destination exactly as it was.
    setEditingVisitModule('new');
  };
  // Top offset animates continuously with the drag, same reasoning as heroAnimStyle's own
  // height: at full-screen the row needs to clear the status bar (insets.top + 20), but at
  // collapsed the sheet's own top edge already sits well below the status bar — reusing the
  // full-screen offset there pushed the button far down into the shorter collapsed crop
  // instead of sitting near ITS top edge. A small fixed 14 is enough clearance once the
  // sheet itself provides that gap.
  const heroTopRowStyle = useAnimatedStyle(() => ({
    top: interpolate(slideAnim.value, [FULL_POS, COLLAPSED_Y], [insets.top + 20, 20], Extrapolation.CLAMP),
  }));
  // Invisible right at full-screen, fading in over the first 40pt of dragging away from it —
  // gone well before the top action row would otherwise sit near it.
  const dragPillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, FULL_POS + 40], [0, 1], Extrapolation.CLAMP),
  }));
  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }],
  }));

  return (
    <View style={st.backdrop} pointerEvents="box-none">
      {/* Dark overlay — fades in as sheet expands, never affects sheet visibility */}
      <Reanimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }, backdropStyle]}
      />
      {/* Tap overlay to collapse (only active when fully expanded) */}
      <Animated.View
        pointerEvents={snapStateReact === 'full' ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToCollapsedRef.current()} />
      </Animated.View>

      {/* Shadow-only backdrop — sibling behind sheet so overflow:hidden doesn't clip the shadow.
          Positioned via transform (not top) so dragging only recomposites instead of forcing a
          native layout pass on every touch-move frame — top is a layout property and was part
          of the drag jank. The gesture itself (`pan` above) is the bigger fix: a Reanimated /
          Gesture-Handler worklet running on the UI thread with no per-frame JS-thread hop. */}
      <Reanimated.View pointerEvents="none" style={[st.sheetShadow, sheetAnimStyle]} />

      <GestureDetector gesture={pan}>
      <Reanimated.View style={[st.sheet, sheetAnimStyle]}>

        {/* ── FULL CONTENT — fills entire sheet, hero starts at y=0 ──────── */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
        <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          // Only scrollable at full-screen — while collapsed/peeking there's nothing to
          // scroll TO (the hero itself is cropped shorter, not scrolled), and leaving this
          // always-true let the ScrollView's own native pan recognize simultaneously with
          // the sheet's drag gesture at every snap state, not just full. A fast half→full
          // swipe would then have its OWN residual motion already captured mid-flight as a
          // scroll, so the instant the sheet visually landed at full it immediately kept
          // moving as a content scroll instead of settling — "doesn't lock, transitions
          // into scrolling". Gating this to snapStateReact (real React state, unlike the
          // snapStateRef used elsewhere in this file for cheaper reads) means the very
          // first frame at full-screen is the first frame scrolling can even engage.
          scrollEnabled={snapStateReact === 'full'}
          bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const y = e.nativeEvent.contentOffset.y;
            scrollYSV.value = y;
            scrollYAnim.setValue(y);
          }}
          scrollEventThrottle={16}
          // White (not the sheet's own light-gray #F9FAFB) — this bottom padding is the
          // scroll content's own trailing space, past the white "content" card, and shows
          // through whenever a tab's content is short enough not to need scrolling past it
          // (most visibly the Spots tab with few spots), where it read as a stray gray strip.
          contentContainerStyle={{ paddingBottom: insets.bottom + 55, backgroundColor: 'white' }}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── HERO ─────────────────────────────────────────────────────
              Shared, single element for every snap state — see heroAnimStyle's own
              comment. Tapping the background (not the buttons, which claim the touch
              first) expands to full-screen while collapsed; a no-op once already full. */}
          <Pressable onPress={() => { if (snapStateRef.current !== 'full') snapToFullRef.current(); }}>
          <Reanimated.View style={[st.hero, { backgroundColor: '#111827' }, heroAnimStyle]}>
            <EntityPhoto
              cacheKey={destination.id}
              cache={photoCache}
              load={() => getOrFetchWikiThumbnail(destination.id, photoCache, destination.name, 900)}
            />

            {/* Ambient scrim so text is always legible */}
            <View pointerEvents="none" style={st.heroScrim} />

            {/* Gradient: darkens toward the bottom */}
            <View pointerEvents="none" style={st.gradWrap}>
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgLinearGradient id="heroScrimGrad" x1="0" y1="0" x2="0" y2="1">
                    {GRADIENT_STOPS.map(({ offset, opacity }) => (
                      <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                    ))}
                  </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroScrimGrad)" />
              </Svg>
            </View>

            {/* Drag-handle pill — visible while collapsed/peeking, fades out approaching
                full-screen (where a handle would just clutter the header buttons).
                Explicitly absolute (NOT st.peekPillRow's normal-flow layout, which is fine
                for the separate, short peek-strip container it was designed for) — as a
                normal-flow child here it would get swept down by the hero's own
                justifyContent:'flex-end' to sit right above heroBottomStack instead of at
                the top. */}
            <Reanimated.View pointerEvents="none" style={[st.heroDragPillRow, dragPillStyle]}>
              <View style={st.peekPill} />
            </Reanimated.View>

            {/* Top row — the close/collapse button that used to live here is gone; the
                back-navigation pill (rendered by the map screen, not this sheet) now glides
                to sit in that same spot instead — see the pillOffsetSV reaction below, which
                targets the same top-left position this row's own left edge used to occupy.
                Save actions stay on the right. */}
            <Reanimated.View style={[st.heroTopRow, heroTopRowStyle, { justifyContent: 'flex-end' }]}>
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
            </Reanimated.View>

            {/* Bottom stack: pushed to hero bottom via justifyContent on parent — tracks the
                hero's own animated height, so it sits flush above the tab bar when
                collapsed and lower down once expanded, same as it always has. */}
            <View style={[st.heroBottomStack, st.heroBottomStackPad]}>
              <View style={st.heroContent}>
                <Text style={st.heroName} numberOfLines={1}>{destination.name}</Text>

                <View style={st.heroMeta}>
                  <View style={st.heroFlagCircle}>
                    <View style={st.heroFlagClip}>
                      <Image
                        source={{ uri: `https://flagcdn.com/w160/${destination.countryCode.toLowerCase()}.png` }}
                        style={st.heroFlagImg}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                  <Text style={st.heroMetaTxt}>{destination.country}</Text>
                  <View style={st.heroMetaDivider} />
                  <Text style={st.heroMetaTxt}>{destination.continent}</Text>
                </View>

                {!!destination.tagline && (
                  <Text style={st.heroTagline} numberOfLines={2}>{destination.tagline}</Text>
                )}

                {/* Spots row */}
                {spots.length > 0 && (
                  <View style={st.commRatingRow}>
                    <MapPin size={12} color="rgba(255,255,255,0.80)" />
                    <Text style={st.commRatingCount}>{spots.length} spots</Text>
                  </View>
                )}
              </View>

            </View>
          </Reanimated.View>
          </Pressable>

        {/* Tab swipe handler wraps only the tab bar row + content below it — NOT the hero
            above — so a horizontal swipe on the header never risks being read as a tab
            switch. */}
        <GestureDetector gesture={tabSwipeGesture}>
        <View
          onLayout={e => {
            // Measured here (on this wrapper) rather than on the tab bar View directly — this
            // wrapper is now the tab bar's immediate parent (needed so a single GestureDetector
            // can cover both the tab bar and the content below it), and onLayout's y is always
            // relative to the immediate parent. Measuring on the tab bar itself here would
            // report ~0 (its own offset within this wrapper, which is always 0), not the real
            // position within the scroll content that tabBarOverlayY's scroll-position
            // comparison needs — this wrapper's own y is exactly that value instead, since it
            // sits with zero offset where the tab bar used to sit directly.
            //
            // Ignore measurements taken while collapsed/half — the hero (and therefore this
            // tab bar's position) is intentionally a different height there, and would
            // otherwise corrupt the threshold the full-screen sticky overlay uses.
            if (snapStateRef.current === 'full') setTabBarAppearY(e.nativeEvent.layout.y);
          }}
        >

          {/* ── TAB BAR — every destination gets About + Spots; visited also gets My Visit.
              Scrolls normally here; a second copy (tabBarOverlay below, outside the
              ScrollView) fades/slides in to pin it in place once this one reaches the top. */}
          <View
            style={st.tabBar}
            onLayout={e => { tabBarHAnim.value = e.nativeEvent.layout.height; }}
          >
            {renderTabBarRow()}
          </View>

          {/* ── CONTENT ────────────────────────────────────────────────── */}
          <View style={st.content}>

            {/* ── SLIDE TRACK for tabs ─────────────────────────────────── */}
            <Reanimated.View style={[st.slideTrack, slideTrackStyle]}>
              <Reanimated.View
                style={[st.slideRow, { width: W * TAB_ORDER.length }, slideRowStyle]}
              >

                  {/* ── MY VISIT PANEL — visited destinations only ──────── */}
                  {isVisited && (
                  <View
                    style={st.slidePanel}
                    onLayout={e => measurePanel(TAB_ORDER.indexOf('visit'), e.nativeEvent.layout.height)}
                  >

                    {/* Each logged visit is its own standalone module — its own title,
                        dates, photos, and notes — like a separate journal entry. Adding a
                        new one (or editing/deleting a specific one) only ever touches that
                        single module's own card; every sibling module is copied through
                        untouched. Shared with CountrySheet/SpotSheet — see VisitCardList. */}
                    <VisitCardList
                      visits={localVisits}
                      onEditVisit={setEditingVisitModule}
                      onNewVisit={() => setEditingVisitModule('new')}
                      onOpenGallery={setGalleryVisit}
                      onSelectItem={item => {
                        const spot = spots.find(sp => sp.id === item.id);
                        if (spot) onSelectSpot?.(spot);
                      }}
                      selectorLabel={spots.length > 0 ? 'Spots Visited' : undefined}
                      selectorItems={spots.length > 0 ? spotSelectorItems : undefined}
                    />

                  </View>
                  )}

                  {/* ── ABOUT PANEL ────────────────────────────────────── */}
                  <View
                    style={st.slidePanel}
                    onLayout={e => measurePanel(TAB_ORDER.indexOf('about'), e.nativeEvent.layout.height)}
                  >
                    <AboutPanel
                      destination={destination} spots={spots}
                      onSelectSpot={onSelectSpot}
                      onOpenClimateDetail={() => setShowClimateDetail(true)}
                      onSeeAllSpots={() => switchTabRef.current('spots')}
                      hlScrollRef={aboutHlScrollRef}
                      whyScrollRef={whyScrollRef}
                    />
                  </View>

                  {/* ── SPOTS PANEL — full grid, map-view button ── */}
                  <View
                    style={st.slidePanel}
                    onLayout={e => measurePanel(TAB_ORDER.indexOf('spots'), e.nativeEvent.layout.height)}
                  >
                    <SpotsPanel spots={spots} onSelectSpot={onSelectSpot} />
                  </View>
                </Reanimated.View>
              </Reanimated.View>

          </View>
        </View>
        </GestureDetector>{/* end tab-swipe gesture wrapper */}
        </ScrollView>
        </View>
        </KeyboardAvoidingView>

        {/* ── TAB BAR OVERLAY — fixed copy that slides in once the inline one (above,
            inside the ScrollView) scrolls up to this point, and slides back out as soon as
            scrolling back up reveals the hero again underneath it. */}
        <Animated.View
          pointerEvents="box-none"
          style={[st.tabBar, st.tabBarOverlay, { top: 0, paddingTop: insets.top, transform: [{ translateY: tabBarOverlayY }] }]}
        >
          {renderTabBarRow()}
        </Animated.View>
        </View>{/* end full-content wrapper */}


        {/* ── PEEK STRIP — a thin sliver of the hero image with the destination's name,
            shown only once the sheet has been dropped down past collapsed (via peekSignal,
            fired when the user pans/zooms the map). Tapping it returns to collapsed. ── */}
        <Reanimated.View
          pointerEvents="box-none"
          style={[{
            position: 'absolute', left: 0, right: 0, top: 0, height: PEEK_STRIP_H, overflow: 'hidden',
            backgroundColor: '#111827',
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
          }, peekAnimStyle]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (isPressBlocked?.()) return; snapToCollapsedRef.current(); }}>
            <EntityPhoto
              instant
              cacheKey={destination.id}
              cache={photoCache}
              load={() => getOrFetchWikiThumbnail(destination.id, photoCache, destination.name, 900)}
            />
            <View pointerEvents="none" style={st.peekScrim} />
            <View pointerEvents="none" style={st.peekPillRow}>
              <View style={st.peekPill} />
            </View>
            <View pointerEvents="none" style={st.peekNameRow}>
              <Text style={st.peekNameTxt} numberOfLines={1}>{destination.name}</Text>
              {spots.length > 0 && (
                // marginTop:0 override — commRatingRow's own marginTop:6 is meant for the
                // hero (no other spacing mechanism there); here peekNameRow's own gap:2
                // already spaces this from the name above it, so the two shouldn't stack.
                <View style={[st.commRatingRow, { marginTop: 0 }]}>
                  <MapPin size={12} color="rgba(255,255,255,0.80)" />
                  <Text style={st.commRatingCount} numberOfLines={1}>{spots.length} spots</Text>
                </View>
              )}
            </View>
          </Pressable>
        </Reanimated.View>

      </Reanimated.View>
      </GestureDetector>



      {editingVisitModule !== null && (
        <VisitModuleSheet
          entityName={destination.name}
          visit={editingVisitModule === 'new' ? null : editingVisitModule}
          onSave={handleSaveVisitModule}
          onDelete={handleDeleteVisitModule}
          onClose={() => setEditingVisitModule(null)}
          selectorLabel={spots.length > 0 ? 'Spots Visited' : undefined}
          selectorItems={spots.length > 0 ? spotSelectorItems : undefined}
          // Checking a spot off marks it visited destination-wide too (consistent with how
          // "visited" works everywhere else in the app) — unchecking is handled entirely
          // inside the shared editor itself (removes it from just this visit).
          onCheckItem={spotId => saveSpotVisited(spotId, destination.id)}
          onRemoveLegacy={() => unsaveDestination(destination.id)}
        />
      )}
      {showClimateDetail && (
        <ClimateDetailModal destination={destination} onClose={() => setShowClimateDetail(false)} />
      )}
      {galleryVisit && (
        <PhotoGalleryModal
          photos={galleryVisit.photos ?? []}
          title={galleryVisit.title || `${destination.name} Trip`}
          onClose={() => setGalleryVisit(null)}
        />
      )}
    </View>
  );
}

const CROWD_CHART_H = 64;
// Spots grid: 2 columns filling the content area (W minus its 16px side padding) with a
// 14px gap between — computed in px rather than a '%' width, since RN's flex `gap` adds
// extra space between percentage-sized items rather than subtracting from them.
const GRID_GAP = 14;
const GRID_CARD_W = (W - 32 - GRID_GAP) / 2;

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex:200, elevation:200 },
  sheet: {
    position:'absolute', left:0, right:0, top:0, height:H, overflow:'hidden',
    borderTopLeftRadius:28, borderTopRightRadius:28, backgroundColor:'#F9FAFB',
  },
  sheetShadow: {
    position:'absolute', left:0, right:0, top:0, height:H,
    borderTopLeftRadius:28, borderTopRightRadius:28,
    backgroundColor:'#F9FAFB',
    // Boosted a bit from the original 0.22/20/16 — half-screen shows this shadow along its
    // full top edge (not just around a small compact card), where the original weaker
    // values read as barely-there.
    shadowColor:'#000', shadowOpacity:0.3, shadowRadius:24,
    shadowOffset:{ width:0, height:-8 }, elevation:20,
  },

  // Hero's own drag-handle pill row — absolute so it stays pinned to the very top of the
  // hero regardless of the hero's flex layout (see its JSX comment).
  heroDragPillRow: { position:'absolute', top:8, left:0, right:0, alignItems:'center' },

  // Peek strip — thin hero-image sliver with the destination's name, shown while peeking.
  peekScrim: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.35)' },
  peekPillRow: { alignItems:'center', paddingTop:8 },
  peekPill: { width:36, height:4, borderRadius:2, backgroundColor:'rgba(229,231,235,0.85)' },
  peekNameRow: { position:'absolute', left:16, right:16, bottom:8, gap:2 },
  // Same serif face as the full/half-screen hero's own heroName (just smaller, to fit the
  // much shorter peek strip) — matches its letterSpacing too so it reads as the same
  // typographic treatment, not a different font at a bigger size.
  peekNameTxt: { fontSize:30, fontFamily:'PlayfairDisplay_700Bold', color:'white', letterSpacing:-0.4 },

  // Pill
  pillRow: { position:'absolute', top:10, left:0, right:0, alignItems:'center', zIndex:10 },
  pill:    { width:36, height:4, borderRadius:2 },

  // Hero — flex-end pushes heroBottomStack to the bottom; photo/gradient/topRow are absolute
  hero:    { width:'100%', height: HERO_H, overflow:'hidden', justifyContent:'flex-end' },
  heroScrim: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.18)' },
  gradWrap:{ position:'absolute', left:0, right:0, bottom:0, height: GRAD_H_TOTAL },

  // Top row — uses Animated.View so it can share the same style pipeline as the rest
  heroTopRow: {
    position:'absolute', left:14, right:14,
    flexDirection:'row', justifyContent:'space-between', alignItems:'center', zIndex:10,
  },
  heroActionsRight:     { flexDirection:'row', gap:10, alignItems:'center' },
  heroIconBtnVisited:   { backgroundColor:'#059669', borderColor:'rgba(16,185,129,0.5)' },
  heroVisitPill: {
    flexDirection:'row', alignItems:'center', gap:6,
    height:36, borderRadius:18, paddingHorizontal:14,
    backgroundColor:'rgba(0,0,0,0.35)',
    borderWidth:1.5, borderColor:'rgba(255,255,255,0.25)',
  },
  heroVisitPillTxt: { fontSize:13, fontWeight:'700', color:'white' },


  // Hero bottom stack — normal flow child, pushed to bottom by parent justifyContent
  heroBottomStack: {},
  heroBottomStackPad: { paddingBottom: 10 },

  // Hero text content
  heroContent: { paddingHorizontal:20, paddingBottom:34, paddingTop:8, gap:10 },
  heroName:    { fontSize:42, fontFamily:'PlayfairDisplay_700Bold', color:'white', letterSpacing:-0.5 },
  heroMeta:      { flexDirection:'row', alignItems:'center' },
  heroMetaTxt:   { fontSize:14, color:'rgba(255,255,255,0.90)', fontWeight:'500' },
  heroMetaDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.40)', marginHorizontal: 8 },
  heroFlagCircle: { width:20, height:20, borderRadius:10, backgroundColor:'#fff', alignItems:'center', justifyContent:'center', marginRight:6 },
  heroFlagClip:   { width:17, height:17, borderRadius:8.5, overflow:'hidden' },
  heroFlagImg:    { width:17, height:17 },
  heroTagline: { fontSize:14, color:'rgba(255,255,255,0.78)', lineHeight:20, fontWeight:'400', letterSpacing:0.1 },

  // Spots row
  commRatingRow:  { flexDirection:'row', alignItems:'center', gap:5, marginTop:6 },
  commRatingCount:{ fontSize:13, color:'rgba(255,255,255,0.92)', fontWeight:'800' },


  // Tab bar — sits between hero and content for visited destinations
  tabBar: {
    flexDirection:'row',
    backgroundColor:'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -TAB_BAR_TUCK,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor:'#E5E7EB',
    zIndex: 1,
    overflow: 'hidden',
  },
  // Fixed copy of tabBar shown once scrolling passes the inline one — flat top (no
  // marginTop/radius carried over, since it's not tucked under the hero here) and a touch
  // of shadow so it visually separates from the content sliding underneath it.
  tabBarOverlay: {
    position: 'absolute', left: 0, right: 0,
    marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0,
    shadowColor:'#000', shadowOpacity:0.08, shadowRadius:6, shadowOffset:{ width:0, height:2 }, elevation: 4,
  },
  tabBtn:              { flex:1, paddingVertical:15, alignItems:'center' },
  tabDivider:          { width: StyleSheet.hairlineWidth, marginVertical:14, backgroundColor:'#E5E7EB' },
  tabBtnTxt:           { fontSize:15, fontWeight:'600', color:'#9CA3AF' },
  tabBtnTxtActive:     { color:'#111827' },
  // Visit and Spots counts share the same plain gray scheme — neither switches color when
  // its tab is selected.
  tabVisitBadge:       { minWidth:20, height:20, borderRadius:6, backgroundColor:'#E5E7EB',
                         paddingHorizontal:5, alignItems:'center', justifyContent:'center' },
  tabVisitBadgeTxt:    { fontSize:11, fontWeight:'800', color:'#6B7280', lineHeight:14 },
  tabSpotsBadge:    { minWidth:20, height:20, borderRadius:6, backgroundColor:'#E5E7EB',
                      paddingHorizontal:5, alignItems:'center', justifyContent:'center' },
  tabSpotsBadgeTxt: { fontSize:11, fontWeight:'800', color:'#6B7280', lineHeight:14 },
  // Animated sliding underline — outer track keeps the full per-tab width (for left/width
  // positioning math elsewhere), the visible bar inside it is narrower and centered.
  tabIndicatorTrack: {
    position:'absolute', bottom:0, alignItems:'center',
  },
  tabIndicator: {
    width:28, height:2.5, backgroundColor:'#111827', borderRadius:2,
  },

  // Content area
  content:        { backgroundColor:'white', padding:16, gap:16 },

  // Tab slide track
  slideTrack: { overflow:'hidden', marginHorizontal:-16, width:W },
  slideRow:   { flexDirection:'row', alignItems:'flex-start', width: W * 2 },
  slidePanel: { width:W, paddingHorizontal:16, gap:16 },


  // Section
  section:         { gap:14 },
  aboutFirstSection: { marginTop:8 },
  aboutLastSection:  { marginBottom:24 },
  // About tab: a bit more breathing room between sections than the other tabs.
  aboutStack:      { gap:30 },
  sectionLabel:    { fontSize:10, fontWeight:'800', color:'#16A34A', letterSpacing:1.0, textTransform:'uppercase' },
  sectionHeaderRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  sectionCountBadge:{ backgroundColor:'#111827', borderRadius:10, paddingHorizontal:8, paddingVertical:2 },
  sectionCountTxt:  { fontSize:11, fontWeight:'700', color:'white' },

  // Personal card
  personalCard: { backgroundColor:'white', borderRadius:16, overflow:'hidden', borderWidth:1, borderColor:'#F3F4F6' },
  tripRow:      { flexDirection:'row', alignItems:'center', gap:12, padding:16 },
  tripIcon:     { width:42, height:42, borderRadius:12, alignItems:'center', justifyContent:'center' },
  tripRowLbl:   { fontSize:11, color:'#9CA3AF', marginBottom:3 },
  tripRowVal:   { fontSize:15, fontWeight:'600', color:'#111827' },
  tripRowPh:    { color:'#D1D5DB' },

  // Review
  reviewHeaderRow: { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', padding:16 },
  reviewTapEdit:   { fontSize:12, color:'#16A34A', fontWeight:'500', marginTop:3 },
  reviewDivider:   { height:StyleSheet.hairlineWidth, backgroundColor:'#F3F4F6' },
  reviewBodyRow:   { flexDirection:'row', gap:12, padding:16, paddingTop:14 },
  reviewNotesInput:{ fontSize:14, color:'#111827', lineHeight:22, minHeight:48 },
  reviewReadMore:  { fontSize:13, color:'#16A34A', fontWeight:'600', marginTop:6 },
  reviewThumb:     { width:82, height:82, borderRadius:12, flexShrink:0 },

  // Section title (bold dark, replaces small-caps sectionLabel in new sections)
  sectionTitle:    { fontSize:17, fontWeight:'800', color:'#111827', letterSpacing:-0.3 },
  sectionTitleRow: { flexDirection:'row', alignItems:'center', gap:10 },
  sectionBadge:    { backgroundColor:'#111827', borderRadius:10, paddingHorizontal:8, paddingVertical:2 },
  sectionBadgeTxt: { fontSize:11, fontWeight:'700', color:'white' },

  // Plain (non-colored) section header + "See all" link — used for the At a Glance /
  // Highlights pair, which read as light-gray caps rather than the colored-eyebrow style
  // previously used by the rest of the About page.
  plainSectionHeader: { fontSize:13, fontWeight:'800', color:'#9CA3AF', letterSpacing:0.4 },
  seeAllRow:          { flexDirection:'row', alignItems:'center', gap:1 },
  seeAllTxt:          { fontSize:13, fontWeight:'600', color:'#16A34A' },

  // At a glance — one connected card containing the reason rows AND the description below
  // (see AboutTab's own comment), no hairlines between the rows themselves, just the one
  // outer border/shadow wrapping the whole card.
  glanceStack:     { backgroundColor:'white', borderRadius:16, overflow:'hidden',
                     borderWidth:1, borderColor:ABOUT_BORDER,
                     shadowColor:'#000', shadowOpacity:0.04, shadowRadius:6, shadowOffset:{ width:0, height:2 }, elevation:1 },

  // "Why visit" photo carousel — unbounded, bleeds to the panel's own edges (slidePanel has
  // 16px side padding) rather than sitting inside a box, so cards scroll in from the screen
  // edge, with the same 16px inset at rest.
  whyScroll:     { marginHorizontal:-16 },
  whyRow:        { gap:WHY_GAP, paddingHorizontal:WHY_INSET },
  whyCard:       { width:WHY_CARD_W, height:WHY_CARD_H, borderRadius:12, overflow:'hidden', backgroundColor:'#E5E7EB',
                   borderWidth:1, borderColor:'#D1D5DB' },
  whyCaptionStrip: { position:'absolute', left:0, right:0, bottom:0,
                     paddingHorizontal:12, paddingTop:8, paddingBottom:14, backgroundColor:`rgba(0,0,0,${WHY_STRIP_OPACITY})` },
  whyStripFade:  { position:'absolute', left:0, right:0, top:-WHY_STRIP_FADE_H, height:WHY_STRIP_FADE_H },
  // Same size/line height as the description below (aboutTxt), just bold and white.
  whyCaption:    { fontSize:15.5, fontWeight:'700', color:'white', lineHeight:25 },

  // Highlight cards (bigger than the old spot preview cards — photo, badge, name, bio)
  // The cards have an outer shadow, which a horizontal ScrollView clips at its edges — so the row gets
  // padding to hold it, and the scroll view matching negative margins so the layout doesn't shift.
  // 12px each way: the shadow (radius 8, 2px down) reaches ~10px out, and anything less clipped it in a
  // straight line that showed as a faint band above the cards.
  hlScroll:     { marginHorizontal:-12, marginTop:-12, marginBottom:-8 },
  hlRow:        { gap:14, paddingHorizontal:12, paddingTop:12, paddingBottom:12 },

  // Spots tab — 2-column wrapping grid of SpotCards,
  // and a discrete link into the sliding spot carousel (kept
  // low-key since the grid itself, not the carousel, is the primary way to browse here).
  // Bordered pill, same shape/sizing as the spot carousel's own List button (SpotSheet's
  // carListBtn/carListBtnTxt) — mirrored so the two "jump to the other view" controls read
  // as the same affordance wherever they show up.
  mapViewBtn:      { flexDirection:'row', alignItems:'center', gap:4,
                     alignSelf:'flex-end', paddingHorizontal:8, paddingVertical:5,
                     borderRadius:8, borderWidth:1, borderColor:'#E5E7EB' },
  mapViewBtnTxt:   { fontSize:12.5, fontWeight:'600', color:'#6B7280' },
  // Same padding the country sheet's destination grid has: room above and below for the cards' shadows.
  spotsGrid:       { flexDirection:'row', flexWrap:'wrap', gap:GRID_GAP, paddingTop:4, paddingBottom:16 },
  gridEmptyTxt:    { fontSize:14, color:'#9CA3AF', textAlign:'center', paddingVertical:24 },

  // About
  aboutTxt: { fontSize:15.5, color:'#374151', lineHeight:25 },
  // Description text's own padding when it sits inside glanceStack (below the reason rows,
  // which already carry their own padding via glanceRow).
  glanceDescription: { padding:14 },

  // Section header row (label + optional icon/link on the right)
  secHeadRow:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },

  // When to visit — best-time-to-go card, month-by-month crowd/rain/temp grid, legend,
  // and a link into the full ClimateDetailModal breakdown.
  wtvCard:        { backgroundColor:'white', borderRadius:16, padding:14, gap:14,
                    borderWidth:1, borderColor:ABOUT_BORDER },
  wtvHeadRow:     { flexDirection:'row', alignItems:'center', gap:12 },
  // The recommendation is the card's headline now, so it carries primary-text weight rather
  // than the muted grey it had as a subtitle under a redundant title.
  // Same color as glanceRowTitle ("Why Visit" reasons text) — the green month range (wtvLedeMonths)
  // overrides this per-segment.
  wtvLede:        { flex:1, fontSize:16, fontWeight:'600', color:'#111827', lineHeight:22 },
  // Same green used everywhere else (buttons, tags, the grid's own "best month" highlight) so
  // the month range reads as the one thing to notice in the sentence.
  wtvLedeMonths:  { color:'#16A34A' },
  wtvGuideBtn:    { flexDirection:'row', alignItems:'center', gap:8,
                    backgroundColor:'#F9FAFB', borderRadius:12, padding:11 },
  wtvGuideBtnTxt: { flex:1, fontSize:13, fontWeight:'600', color:'#374151' },

  // Good to know — one connected card, each row its own custom icon (single consistent
  // badge color, no per-tip tagging), bold title, and a detail line underneath.
  goodToKnowHeadRow: { flexDirection:'row', alignItems:'center', gap:6 },
  tipStack:     { backgroundColor:'white', borderRadius:16, overflow:'hidden',
                  borderWidth:1, borderColor:ABOUT_BORDER },
  tipRow:       { flexDirection:'row', gap:12, padding:14 },
  tipRowDivider:{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor:'#F0F1F3' },
  tipIconBadge: { width:40, height:40, borderRadius:20, backgroundColor:'#FEF3C7',
                  alignItems:'center', justifyContent:'center' },
  tipIconTxt:   { fontSize:18 },
  // Same size/weight/color as wtvLede (the "When to Visit" card's headline).
  tipTitleTxt:  { fontSize:16, fontWeight:'600', color:'#111827', lineHeight:22, marginBottom:2 },
  // Same size/color as wtvGuideBtnTxt ("View climate and visitor data"), but unbolded.
  tipDetailTxt: { fontSize:13, fontWeight:'400', color:'#374151', lineHeight:18 },
});

// Memoized: the map screen re-renders continuously while the camera moves, and a re-render of the sheet is a React
// commit on its animated views for no reason. With stable props it now renders only when its own inputs change.
export default React.memo(DestinationSheet);
