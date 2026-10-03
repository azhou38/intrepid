// Shared sliding-sheet primitives used by DestinationSheet, CountrySheet, and SpotSheet.
// Extracted so the three sheets stay visually and behaviourally in sync.
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image,
  Dimensions, Modal, TextInput, Platform, KeyboardAvoidingView, Alert, Animated,
  type StyleProp, type TextStyle,
} from 'react-native';
import { ScrollView as GHScrollView, Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Camera, Calendar, Pencil, ChevronDown, ChevronRight, Trash2, Star, NotebookPen, Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import type { PhotoEntry, Visit } from '../../types';

const { width: W, height: H } = Dimensions.get('window');

// ── Photo picking ────────────────────────────────────────────────────────────
// Filters a freshly-picked batch down to photos not already in the collage, so re-picking the
// same photo (the OS picker has no memory of a previous session's selection, and doesn't let
// us pre-tick anything in its own UI) doesn't add it twice. Matched by assetId when both sides
// have one (the reliable media-library identity — `uri` alone can differ between two picks of
// the very same photo), falling back to `uri` only when assetId is unavailable on either side.
// Mount-time deferral for a sheet's heavy, off-screen content (its full-screen tab panels). A sheet
// opens at half-screen or peek, where that content sits below the visible part of the sheet, and it
// mounts in the busiest commit there is — the one that swaps sheets while the map re-plans its pins
// and the camera moves. Mounting it a moment later, once the slide-in has finished, keeps that
// commit (and the slide itself) light. `reveal` mounts it right away instead — call it the moment
// the sheet heads to full-screen, where the content is visible.
export const SHEET_PANEL_MOUNT_DELAY_MS = 300;
export function useDeferredMount(delayMs = SHEET_PANEL_MOUNT_DELAY_MS): [boolean, () => void] {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const reveal = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    setReady(true);
  }, []);
  useEffect(() => {
    const t = setTimeout(reveal, delayMs);
    return () => clearTimeout(t);
  }, [reveal, delayMs]);
  return [ready, reveal];
}

// Small light-gray note at the bottom of every About tab (country, destination, spot), flagging that
// its descriptive content is AI-generated.
export function AIContentNote({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[aiNoteStyle, style]}>
      AI-generated content. Verify important information.
    </Text>
  );
}
const aiNoteStyle = { fontSize: 12, color: '#D1D5DB', textAlign: 'center' as const, marginTop: 0, marginBottom: 10, lineHeight: 16 };

export function dedupeNewPhotos(existing: PhotoEntry[], picked: PhotoEntry[]): PhotoEntry[] {
  const existingAssetIds = new Set(existing.map(p => p.assetId).filter((id): id is string => !!id));
  const existingUris     = new Set(existing.map(p => p.uri));
  return picked.filter(p =>
    p.assetId ? !existingAssetIds.has(p.assetId) : !existingUris.has(p.uri)
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────
export const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const THIS_YEAR = new Date().getFullYear();
const ITEM_H = 48;
const P_MONTHS   = MO;
const P_DAYS     = Array.from({ length: 31 }, (_, i) => String(i+1).padStart(2,'0'));
const P_DAYS_OPT = ['–', ...P_DAYS]; // '–' = no specific day (stored as '00')
const P_YEARS    = Array.from({ length: 50 }, (_, i) => String(THIS_YEAR - i));

export function parseDateStr(s: string) {
  if (!s) return null;
  const p = s.split('-');
  if (p.length !== 3) return null;
  const mi = parseInt(p[1], 10) - 1;
  if (mi < 0 || mi > 11) return null;
  return { year: p[0], monthLabel: MO[mi], day: p[2].padStart(2, '0') };
}
export function fmtDatePart(dateStr: string): string {
  const p = parseDateStr(dateStr);
  if (!p) return '';
  if (p.day === '00') return `${p.monthLabel} ${p.year}`;
  return `${p.monthLabel} ${parseInt(p.day, 10)}, ${p.year}`;
}
export function fmtVisitRange(visit: Visit): string {
  const start = fmtDatePart(visit.startDate);
  if (!visit.endDate) return start;
  return `${start} – ${fmtDatePart(visit.endDate)}`;
}
// Trip length in whole days, INCLUDING both the start and end date (a same-day trip is 1, not
// 0). Returns null when it can't be computed precisely — no end date is fine (defaults to a
// single day), but a month/year-only date (day === '00') has no specific day to count from.
export function visitDayCount(visit: Visit): number | null {
  const s = parseDateStr(visit.startDate);
  if (!s || s.day === '00') return null;
  const startMs = Date.parse(visit.startDate);
  if (Number.isNaN(startMs)) return null;
  if (!visit.endDate) return 1;
  const e = parseDateStr(visit.endDate);
  if (!e || e.day === '00') return null;
  const endMs = Date.parse(visit.endDate);
  if (Number.isNaN(endMs)) return null;
  return Math.round((endMs - startMs) / 86400000) + 1;
}
// Compact range used in the read-only My Visit card only
export function fmtVisitRangeShort(visit: Visit): string {
  const s = parseDateStr(visit.startDate);
  if (!s) return '';
  if (!visit.endDate) return fmtDatePart(visit.startDate);
  const e = parseDateStr(visit.endDate);
  if (!e) return fmtDatePart(visit.startDate);
  const sd = s.day !== '00' ? parseInt(s.day, 10) : 0;
  const ed = e.day !== '00' ? parseInt(e.day, 10) : 0;
  if (s.year === e.year) {
    if (s.monthLabel === e.monthLabel) {
      return sd > 0 && ed > 0 ? `${s.monthLabel} ${sd}–${ed}, ${s.year}` : `${s.monthLabel} ${s.year}`;
    }
    return sd > 0 && ed > 0
      ? `${s.monthLabel} ${sd} – ${e.monthLabel} ${ed}, ${s.year}`
      : `${s.monthLabel}–${e.monthLabel} ${s.year}`;
  }
  return `${fmtDatePart(visit.startDate)} – ${fmtDatePart(visit.endDate)}`;
}

// ── Date picker wheel ─────────────────────────────────────────────────────────
export function WheelCol({ data, value, onChange, width }: {
  data: string[]; value: string; onChange: (v: string) => void; width: number;
}) {
  const ref = useRef<ScrollView>(null);
  const initIdx = Math.max(0, data.indexOf(value));
  const [idx, setIdx] = useState(initIdx);
  useEffect(() => {
    requestAnimationFrame(() => ref.current?.scrollTo({ y: initIdx * ITEM_H, animated: false }));
  }, []);
  return (
    <View style={{ width, overflow: 'hidden' }}>
      <ScrollView ref={ref} style={{ height: ITEM_H * 5 }} showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H} decelerationRate="fast" scrollEventThrottle={32}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        onScroll={e => setIdx(Math.max(0, Math.min(data.length-1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H))))}
        onMomentumScrollEnd={e => {
          const i = Math.max(0, Math.min(data.length-1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
          setIdx(i); onChange(data[i]);
        }}>
        {data.map((item, i) => (
          <Pressable key={item}
            style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}
            onPress={() => { ref.current?.scrollTo({ y: i * ITEM_H, animated: true }); setIdx(i); onChange(item); }}>
            <Text style={i === idx ? pS.active : pS.item}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={{ position:'absolute', top: ITEM_H*2, left:0, right:0, height: ITEM_H,
        borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor:'#D1D5DB' }} />
    </View>
  );
}

export function DatePickerModal({ value, onDone, onCancel }: { value:string; onDone:(v:string)=>void; onCancel:()=>void }) {
  const parsed = parseDateStr(value), now = new Date();
  const [mo, setMo] = useState(parsed?.monthLabel ?? MO[now.getMonth()]);
  const [dy, setDy] = useState(parsed?.day         ?? String(now.getDate()).padStart(2,'0'));
  const [yr, setYr] = useState(parsed?.year        ?? String(now.getFullYear()));
  const done = () => {
    const m = String(MO.indexOf(mo)+1).padStart(2,'0');
    const max = new Date(parseInt(yr,10), MO.indexOf(mo)+1, 0).getDate();
    onDone(`${yr}-${m}-${String(Math.min(parseInt(dy,10), max)).padStart(2,'0')}`);
  };
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={pS.overlay}>
        <View style={pS.card}>
          <View style={pS.header}>
            <Pressable onPress={onCancel} hitSlop={12}><Text style={pS.cancel}>Cancel</Text></Pressable>
            <Text style={pS.title}>Date Visited</Text>
            <Pressable onPress={done} hitSlop={12}><Text style={pS.done}>Done</Text></Pressable>
          </View>
          <View style={pS.wheels}>
            <WheelCol data={P_MONTHS} value={mo} onChange={setMo} width={80} />
            <WheelCol data={P_DAYS}   value={dy} onChange={setDy} width={60} />
            <WheelCol data={P_YEARS}  value={yr} onChange={setYr} width={80} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
const pS = StyleSheet.create({
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center', padding:24 },
  card:    { backgroundColor:'white', borderRadius:20, overflow:'hidden', width:'100%' },
  header:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingVertical:16, borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'#E5E7EB' },
  title:   { fontSize:15, fontWeight:'700', color:'#111827' },
  cancel:  { fontSize:15, color:'#6B7280' },
  done:    { fontSize:15, fontWeight:'700', color:'#6366F1' },
  wheels:  { flexDirection:'row', justifyContent:'center', gap:8, paddingHorizontal:16, paddingVertical:8 },
  item:    { fontSize:18, color:'#9CA3AF' },
  active:  { fontSize:20, fontWeight:'700', color:'#111827' },
});

// ── Visit date-range picker ───────────────────────────────────────────────────
export function VisitDateRangeModal({ visit, withTitle, noun = 'Trip', onDone, onCancel }: {
  visit: Visit | null;
  // Only used by the standalone "Add Visit" flow — creating a brand new visit that's kept
  // separate from the shared destination edit page, so its title has to be captured here
  // instead. Editing an existing visit's dates (from within that shared page) never sets
  // this, since that page's own header already owns title editing.
  withTitle?: boolean;
  // "Trip" (default) or "Visit" — spots call these visits, not trips (see VisitModuleSheet's
  // own `noun`, which this mirrors when opened from inside it).
  noun?: string;
  onDone: (v: Visit) => void;
  onCancel: () => void;
}) {
  const now = new Date();
  const s = visit?.startDate ? parseDateStr(visit.startDate) : null;
  const e = visit?.endDate   ? parseDateStr(visit.endDate)   : null;
  const startDayInit = s ? (s.day === '00' ? '–' : s.day) : '–';
  const endDayInit   = e ? (e.day === '00' ? '–' : e.day) : '–';
  const [title,   setTitle  ] = useState(visit?.title ?? '');
  const [startMo, setStartMo] = useState(s?.monthLabel ?? MO[now.getMonth()]);
  const [startDy, setStartDy] = useState(startDayInit);
  const [startYr, setStartYr] = useState(s?.year        ?? String(now.getFullYear()));
  const [hasEnd,  setHasEnd ] = useState(!!visit?.endDate);
  const [endMo,   setEndMo  ] = useState(e?.monthLabel  ?? MO[now.getMonth()]);
  const [endDy,   setEndDy  ] = useState(endDayInit);
  const [endYr,   setEndYr  ] = useState(e?.year        ?? String(now.getFullYear()));
  const done = () => {
    const sm = String(MO.indexOf(startMo) + 1).padStart(2, '0');
    const sd = startDy === '–' ? '00' : startDy;
    const startDate = `${startYr}-${sm}-${sd}`;
    let endDate: string | undefined;
    if (hasEnd) {
      const em = String(MO.indexOf(endMo) + 1).padStart(2, '0');
      const ed = endDy === '–' ? '00' : endDy;
      endDate = `${endYr}-${em}-${ed}`;
      // A "YYYY-MM-DD" pair compares correctly with plain string comparison (zero-padded,
      // most-significant field first) — including an unknown day ('00'), which sorts as the
      // earliest possible day of its month, the only sensible reading when we don't know
      // which day it actually was. Blocks the save rather than silently clamping/swapping,
      // so the user notices and fixes the field they actually meant to change.
      if (endDate <= startDate) {
        Alert.alert('Invalid dates', 'The end date must be after the start date.');
        return;
      }
    }
    // When editing an existing visit's dates (withTitle unset), title is preserved by the
    // caller instead — that flow's title lives on the shared edit page's own header.
    onDone({
      id: visit?.id ?? Date.now().toString(),
      title: withTitle ? (title.trim() || undefined) : visit?.title,
      startDate, endDate,
    });
  };
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={pS.overlay}>
        <View style={pS.card}>
          <View style={pS.header}>
            <Pressable onPress={onCancel} hitSlop={12}><Text style={pS.cancel}>Cancel</Text></Pressable>
            <Text style={pS.title}>{hasEnd ? `${noun} Dates` : `${noun} Date`}</Text>
            <Pressable onPress={done} hitSlop={12}><Text style={pS.done}>Done</Text></Pressable>
          </View>
          {withTitle && (
            <View style={vdS.titleSection}>
              <Text style={vdS.label}>TRIP NAME (OPTIONAL)</Text>
              <TextInput
                style={vdS.titleInput}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Anniversary trip"
                placeholderTextColor="#C4C9D4"
                maxLength={60}
              />
            </View>
          )}
          <View style={vdS.section}>
            {/* "FROM" only means something once there's also a "TO" to distinguish it from —
                a single date doesn't need a label. */}
            {hasEnd && <Text style={vdS.label}>FROM</Text>}
            <View style={pS.wheels}>
              <WheelCol data={P_MONTHS}   value={startMo} onChange={setStartMo} width={72} />
              <WheelCol data={P_DAYS_OPT} value={startDy} onChange={setStartDy} width={52} />
              <WheelCol data={P_YEARS}    value={startYr} onChange={setStartYr} width={72} />
            </View>
          </View>
          <Pressable style={vdS.toggleRow} onPress={() => setHasEnd(!hasEnd)}>
            <View style={[vdS.toggle, hasEnd && vdS.toggleOn]}>
              {hasEnd && <Check size={11} color="white" strokeWidth={2.5} />}
            </View>
            <Text style={vdS.toggleTxt}>Add date range</Text>
          </Pressable>
          {hasEnd && (
            <View style={vdS.section}>
              <Text style={vdS.label}>TO</Text>
              <View style={pS.wheels}>
                <WheelCol data={P_MONTHS}   value={endMo} onChange={setEndMo} width={72} />
                <WheelCol data={P_DAYS_OPT} value={endDy} onChange={setEndDy} width={52} />
                <WheelCol data={P_YEARS}    value={endYr} onChange={setEndYr} width={72} />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
const vdS = StyleSheet.create({
  section:   { paddingTop: 4, paddingBottom: 4 },
  label:     { fontSize:10, fontWeight:'800', color:'#9CA3AF', letterSpacing:1.2, textAlign:'center', marginBottom:2 },
  toggleRow: { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:20, paddingVertical:14,
               borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:'#F3F4F6' },
  toggle:    { width:22, height:22, borderRadius:11, borderWidth:2, borderColor:'#D1D5DB',
               alignItems:'center', justifyContent:'center' },
  toggleOn:  { backgroundColor:'#16A34A', borderColor:'#16A34A' },
  toggleTxt: { fontSize:14, color:'#6B7280' },
  titleSection: { paddingHorizontal:20, paddingTop:16, paddingBottom:8 },
  titleInput:   { fontSize:15, color:'#111827', paddingVertical:8, textAlign:'center' },
});

// ── Photo collage ─────────────────────────────────────────────────────────────
// inner width = screen - 32 (content padding) - 24 (wrap padding)
const COLLAGE_INNER_W = W - 32 - 24;
const COLLAGE_H = 196;
const COLLAGE_H_TALL = 320; // exactly 4 photos (2x2 grid) — see collageH's own comment
// 5+ photos' own layout: repeats the count===3 big-tile-plus-stacked-pair block as its own
// row, adding a whole new block as photos grow (capped at BLOCK_MAX — see renderTiles).
const BLOCK_SIZE = 3;
const BLOCK_H = 130;
const BLOCK_MAX = 4;
// Fixed height of the editor's own scroll box once expandAll drops the BLOCK_MAX cap — sized so
// a partial next block peeking off the bottom edge reads as a scroll cue rather than looking
// like the last photo got clipped.
const PHOTO_BOX_MAX_H = 510;
// ── Editable photo grid ─────────────────────────────────────────────────────
// A plain uniform 3-column grid of square tiles — used by both the editor and the read-only My
// Visit display (see PhotoCollage's expandAll), in place of the magazine collage below. Uniform
// slots are what make dragging tractable: a raw x/y can be turned into a target slot analytically,
// and every OTHER tile can reflow live as you drag instead of only reordering on drop.
const EDIT_COLS = 3;
const EDIT_GAP = 6;
type SV = ReturnType<typeof useSharedValue<number>>;

// Last time any scroll view hosting the editor's photo grid actually scrolled (the grid's own box,
// or the editor page around it — see notePhotoGridScroll's callers). A tap is ignored if anything
// scrolled after its finger went down: when a swipe is claimed by a scroll view straight away,
// the tile's own gesture never sees ANY movement and it looks exactly like a still tap, so
// movement alone can't rule it out.
let lastPhotoGridScrollAt = 0;
export function notePhotoGridScroll() {
  lastPhotoGridScrollAt = Date.now();
}

// One square tile. Long-press-then-drag (not a plain pan) so a quick tap still reaches the delete
// button and a quick vertical swipe still reaches the surrounding scroll box — the pan gesture
// simply doesn't activate until held. translateX/Y are OWNED by the parent grid (passed in) since
// the parent's floating drag overlay reads the same shared values to follow the finger — see
// EditablePhotoGrid. This tile itself goes invisible (but keeps its slot, via `hidden`) once it's
// the one being dragged, so the overlay reads as the "real" tile floating above the grid.
function EditableGridTile({ photo, index, hidden, draggable, tileSize, offsetX, offsetY, animateOffset, overlayCount, onDelete, onTapView, translateX, translateY, onDragStart, onDragUpdate, onDragEnd }: {
  photo: PhotoEntry;
  index: number;
  hidden: boolean;
  offsetX: number;
  offsetY: number;
  animateOffset: boolean;
  // False for the read-only My Visit display — same 3-column grid, but with no drag gesture and
  // no delete button, since nothing there can actually persist a reorder or a deletion.
  draggable: boolean;
  tileSize: number;
  // Set only on the last visible tile when maxRows hides some photos — darkens this tile and
  // shows "+N" over it, same as the magazine collage's own overflow tile.
  overlayCount?: number;
  onDelete?: (index: number) => void;
  // Opens the full-screen PhotoViewerModal on this photo — fired from the SAME pan gesture below
  // (see activatedSV) rather than a second, competing gesture recognizer. Two independent
  // recognizers tracking the same touch turned out to fight over the drag's own coordinate
  // state mid-gesture, which looked exactly like the photo "dropping" itself without a release.
  // Second arg: when the finger went down (ms since epoch), so the grid can discard the tap if
  // anything scrolled since then (see lastPhotoGridScrollAt).
  onTapView: (index: number, touchDownAt: number) => void;
  translateX: SV;
  translateY: SV;
  onDragStart: (index: number, absY: number) => void;
  onDragUpdate: (tx: number, ty: number, absY: number) => void;
  // `success` is false when the gesture was CANCELLED or FAILED rather than genuinely released
  // (e.g. a competing scroll gesture stealing the touch mid-drag) — the parent uses this to
  // revert instead of commit, so a stolen touch can't look like the photo silently "dropped"
  // itself into place without the user releasing.
  onDragEnd: (success: boolean) => void;
}) {
  // Tracks whether THIS touch ever made it into an active drag (onStart only fires once
  // activateAfterLongPress's 260ms has actually elapsed) — onFinalize reads it to tell a genuine
  // drag-that-got-released-or-cancelled apart from a quick tap that never became a drag at all,
  // without a second gesture recognizer competing for the same touch (see onTapView's own note).
  const activatedSV = useSharedValue(false);
  // Max distance the finger moved from where it first touched down. Measured from the raw touch
  // stream (onTouchesDown/onTouchesMove), NOT onUpdate: onUpdate only starts firing once the
  // 260ms long-press has activated the pan, so for a swipe (which never activates) it never ran
  // and this always read 0 — every swipe looked like a zero-movement tap and opened the viewer.
  // The touch callbacks fire from the first touch onward, activated or not.
  const maxMoveSV = useSharedValue(0);
  const touchStartXSV = useSharedValue(0);
  const touchStartYSV = useSharedValue(0);
  const touchDownAtSV = useSharedValue(0);
  // Effectively "any movement is a swipe" — 1pt rather than 0 only because the touch stream
  // reports sub-point jitter (~0.3pt) even for a finger held perfectly still.
  const TAP_MAX_MOVE = 1;
  const TAP_MAX_VELOCITY = 300; // px/s — secondary guard for a flick released almost instantly

  const pan = Gesture.Pan()
    .activateAfterLongPress(260)
    .onTouchesDown(e => {
      const t = e.allTouches[0];
      if (!t) return;
      touchStartXSV.value = t.absoluteX;
      touchStartYSV.value = t.absoluteY;
      touchDownAtSV.value = Date.now();
      maxMoveSV.value = 0;
    })
    .onTouchesMove(e => {
      const t = e.allTouches[0];
      if (!t) return;
      maxMoveSV.value = Math.max(
        maxMoveSV.value,
        Math.abs(t.absoluteX - touchStartXSV.value),
        Math.abs(t.absoluteY - touchStartYSV.value),
      );
    })
    .onStart(e => {
      activatedSV.value = true;
      translateX.value = 0;
      translateY.value = 0;
      runOnJS(onDragStart)(index, e.absoluteY);
    })
    .onUpdate(e => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      runOnJS(onDragUpdate)(e.translationX, e.translationY, e.absoluteY);
    })
    // onFinalize (not onEnd) — it fires exactly once regardless of whether the gesture ended,
    // failed, or got cancelled (e.g. the ScrollView stealing it), so cleanup can't be skipped.
    // The `success` param it's given IS the state check — true only for a genuine release.
    .onFinalize((e, success) => {
      const fastFlick = Math.abs(e.velocityX) > TAP_MAX_VELOCITY || Math.abs(e.velocityY) > TAP_MAX_VELOCITY;
      if (activatedSV.value) {
        runOnJS(onDragEnd)(success);
      } else if (e.state !== State.CANCELLED && maxMoveSV.value <= TAP_MAX_MOVE && !fastFlick) {
        // A tap = released before the long-press threshold with the finger essentially still.
        // Anything that moved more than TAP_MAX_MOVE is a swipe (which the scroll box handles),
        // so it never opens the viewer. Note swipes end in FAILED here, same as taps — the state
        // alone can't tell them apart, only the measured movement can.
        runOnJS(onTapView)(index, touchDownAtSV.value);
      }
      activatedSV.value = false;
      maxMoveSV.value = 0;
    })
    .enabled(draggable);

  // The delete button (and spot tag) are deliberately SIBLINGS of the GestureDetector below, not
  // descendants of it — a plain RN Pressable nested inside a GestureDetector can have its onPress
  // swallowed, since gesture-handler's recognizer claims the touch responder chain ahead of RN's
  // own touchable system, even when the pan itself never activates (activateAfterLongPress or
  // not). Only the image itself needs to be draggable, so only it goes inside the detector.
  const image = <Image source={{ uri: photo.uri }} style={pcS.imgFill} resizeMode="cover" />;

  // This tile's slot position in the grid (tiles are absolutely positioned, never reordered as
  // views — see EditablePhotoGrid's renderList). Animates to its live preview slot during a drag;
  // snaps otherwise, so the frame where a drag settles doesn't animate away from where it landed.
  const posStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: animateOffset ? withTiming(offsetX, { duration: 180 }) : offsetX },
      { translateY: animateOffset ? withTiming(offsetY, { duration: 180 }) : offsetY },
    ],
  }), [offsetX, offsetY, animateOffset]);

  return (
    <Reanimated.View
      style={[{ position: 'absolute', left: 0, top: 0, width: tileSize, height: tileSize, borderRadius: 10, overflow: 'hidden', opacity: hidden ? 0 : 1 }, posStyle]}
    >
      {draggable ? <GestureDetector gesture={pan}><View style={pcS.imgFill}>{image}</View></GestureDetector> : image}
      {photo.spotName ? (
        <View pointerEvents="none" style={pcS.spotTag}>
          <Text style={pcS.spotTagTxt} numberOfLines={1}>📍 {photo.spotName}</Text>
        </View>
      ) : null}
      {onDelete && !hidden ? (
        <Pressable style={pcS.delBtn} onPress={() => onDelete(index)} hitSlop={6}>
          <View style={pcS.delBtnInner}><X size={9} color="white" strokeWidth={3} /></View>
        </Pressable>
      ) : null}
      {overlayCount ? (
        <View pointerEvents="none" style={pcS.moreOverlay}>
          <Text style={pcS.moreTxt}>+{overlayCount}</Text>
        </View>
      ) : null}
    </Reanimated.View>
  );
}

function EditablePhotoGrid({ photos, onDelete, onReorder, maxRows, onDragActiveChange }: {
  photos: PhotoEntry[];
  onDelete?: (index: number) => void;
  onReorder?: (reordered: PhotoEntry[]) => void;
  // Caps the grid at this many rows (read-only My Visit display passes 3, for a 3x3 preview) and
  // drops the scroll box entirely — the rest is reachable through the "View all" gallery already
  // sitting right above this grid, so there's nothing here worth scrolling to.
  maxRows?: number;
  // Told true/false as a drag starts/ends — this grid's own box already disables ITS scroll while
  // dragging (see scrollEnabled below), but it has no way to reach the surrounding editor PAGE's
  // own ScrollView, which is a separate gesture-handler recognizer with nothing telling it to
  // defer. A large vertical drag was ending up recognized as a page scroll and cancelling the
  // tile's pan gesture mid-drag — looking exactly like the photo silently dropping without a
  // release. The caller uses this to disable that outer ScrollView for the same window.
  onDragActiveChange?: (active: boolean) => void;
}) {
  const draggable = !!onReorder;
  // Identity (not index) of the photo being dragged — its index changes every time the live
  // preview reorders, but which photo it is doesn't.
  const [dragKey, setDragKey] = useState<string | null>(null);
  // True only while the finger is actually down on an active drag — the dragged tile must stay
  // pinned to its start slot for exactly that window (it's the gesture's host view). It's
  // released at finger-up, not at settle, so the hidden tile is already sitting in its final
  // slot by the time it's revealed: its position is applied through the animated style one frame
  // after React props, so moving and revealing it in the same render flashed its old and new
  // slots for a frame.
  const [gestureLive, setGestureLive] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Measured at runtime (onLayout) rather than computed from the surrounding padding/border
  // constants — this grid gets nested under slightly different containers depending on the
  // caller (the editor's form vs. the read-only My Visit card), and hard-coding their combined
  // padding here was fragile enough to silently end up one column short in both places. Measuring
  // the actual rendered width is correct regardless of what wraps this component.
  const [gridW, setGridW] = useState(0);
  const tileSize = gridW > 0 ? (gridW - EDIT_GAP * (EDIT_COLS - 1)) / EDIT_COLS : 0;
  const step = tileSize + EDIT_GAP;
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // How far the box has auto-scrolled during this drag. The floating photo lives INSIDE the
  // scrolled content, so every pixel of auto-scroll carried it away from a finger held still at
  // the edge (it came untethered from the touch point). Adding this back keeps it under the finger.
  const scrollDeltaSV = useSharedValue(0);
  // Plain refs, not state — the drag-start slot only needs to feed the overlay's initial
  // position (read at render time, right after the setDragIndex that started it), and the
  // "from" index needs to survive across the many onUpdate calls within one gesture without
  // itself triggering a render on every frame.
  const startSlotRef = useRef({ x: 0, y: 0 });
  const currentIndexRef = useRef<number | null>(null);
  // Local working order, used for rendering while a drag is in progress — every slot crossing
  // reorders THIS, not the parent's photos, so the grid still visibly reflows live but nothing
  // is actually "placed" (committed via onReorder, which the editor persists) until release.
  // Kept in sync with the parent's photos whenever a drag isn't in progress, so an add/delete
  // that happens between drags is picked up normally.
  const [order, setOrder] = useState(photos);
  const draggingRef = useRef(false);
  useEffect(() => {
    if (!draggingRef.current) setOrder(photos);
  }, [photos]);
  const orderRef = useRef(order);
  orderRef.current = order;
  const dragStartOrderRef = useRef(order);

  // Auto-scroll while dragging past the scroll box's own top/bottom edge. lastTx/lastTy/lastAbsY
  // track the most recent gesture frame; scrollDeltaRef accumulates how far the box has scrolled
  // since THIS drag started, since a stationary finger held at the edge keeps scrolling content
  // out from under it — evaluateTarget below needs that delta added on top of the raw translation
  // to still land on the right slot, not just whatever slot was under the finger at drag start.
  // Typed `any` — gesture-handler's ScrollView type doesn't expose measureInWindow/scrollTo even
  // though the underlying native view supports both (it wraps RN's own ScrollView).
  const scrollRef = useRef<any>(null);
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const viewportRef = useRef({ top: 0, height: 0 });
  const scrollDeltaRef = useRef(0);
  const lastTxRef = useRef(0);
  const lastTyRef = useRef(0);
  const lastAbsYRef = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SETTLE_MS = 180;
  useEffect(() => () => {
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);
  const keyOf = (p: PhotoEntry) => p.assetId ?? p.uri;

  const slotXY = (idx: number) => ({
    x: (idx % EDIT_COLS) * step,
    y: Math.floor(idx / EDIT_COLS) * step,
  });

  // Re-run whenever the finger moves OR the box auto-scrolls under a stationary finger — see the
  // scrollDeltaRef comment above for why scroll alone (no finger movement) still has to re-evaluate.
  const evaluateTarget = () => {
    const from = currentIndexRef.current;
    if (from == null) return;
    const total = orderRef.current.length;
    const cx = startSlotRef.current.x + lastTxRef.current + tileSize / 2;
    const cy = startSlotRef.current.y + lastTyRef.current + scrollDeltaRef.current + tileSize / 2;
    const col = Math.min(EDIT_COLS - 1, Math.max(0, Math.floor(cx / step)));
    const row = Math.max(0, Math.floor(cy / step));
    const target = Math.min(total - 1, Math.max(0, row * EDIT_COLS + col));
    if (target === from) return;
    const next = orderRef.current.slice();
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    currentIndexRef.current = target;
    setOrder(next);
  };

  const SCROLL_EDGE = 50;      // px of viewport near an edge that triggers auto-scroll
  const SCROLL_MAX_SPEED = 12; // px per tick (ticks run every 16ms) right at the very edge

  const autoScrollTick = () => {
    const { top, height } = viewportRef.current;
    if (height <= 0) return;
    const y = lastAbsYRef.current;
    let dy = 0;
    if (y < top + SCROLL_EDGE) {
      dy = -Math.min(SCROLL_MAX_SPEED, ((top + SCROLL_EDGE - y) / SCROLL_EDGE) * SCROLL_MAX_SPEED);
    } else if (y > top + height - SCROLL_EDGE) {
      dy = Math.min(SCROLL_MAX_SPEED, ((y - (top + height - SCROLL_EDGE)) / SCROLL_EDGE) * SCROLL_MAX_SPEED);
    }
    if (dy === 0) return;
    const maxOffset = Math.max(0, contentHeightRef.current - height);
    const next = Math.max(0, Math.min(maxOffset, scrollOffsetRef.current + dy));
    if (next === scrollOffsetRef.current) return;
    scrollDeltaRef.current += next - scrollOffsetRef.current;
    scrollDeltaSV.value = scrollDeltaRef.current;
    scrollOffsetRef.current = next;
    scrollRef.current?.scrollTo({ y: next, animated: false });
    evaluateTarget();
  };

  const handleDragStart = (idx: number, absY: number) => {
    draggingRef.current = true;
    startSlotRef.current = slotXY(idx);
    currentIndexRef.current = idx;
    scrollDeltaRef.current = 0;
    scrollDeltaSV.value = 0;
    // Snapshot so a CANCELLED gesture (below, in handleDragEnd) can revert cleanly instead of
    // keeping whatever partial reorder happened before the touch got stolen.
    dragStartOrderRef.current = orderRef.current;
    // These refs survive across drags (they're only otherwise written from onUpdate/autoScrollTick,
    // never reset on release) — without resetting them here, a NEW drag's very first evaluateTarget
    // call (which can fire from the auto-scroll timer before any real onUpdate arrives) reused the
    // PREVIOUS drag's leftover tx/ty, immediately reordering onto a stale, unrelated slot right as
    // the new drag began — looking exactly like the photo "auto-dropping" before the user moved it.
    lastTxRef.current = 0;
    lastTyRef.current = 0;
    lastAbsYRef.current = absY;
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    const p = orderRef.current[idx];
    setDragKey(p ? keyOf(p) : null);
    setGestureLive(true);
    onDragActiveChange?.(true);
    scrollRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => { viewportRef.current = { top: y, height: h }; });
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    autoScrollTimer.current = setInterval(autoScrollTick, 16);
  };

  // Called on every gesture frame (via runOnJS) — cheap arithmetic, and only actually reorders
  // the LOCAL working order when the finger has crossed into a different slot, which is what
  // makes the other tiles visibly reflow live without touching the parent's committed order.
  const handleDragUpdate = (tx: number, ty: number, absY: number) => {
    lastTxRef.current = tx;
    lastTyRef.current = ty;
    lastAbsYRef.current = absY;
    evaluateTarget();
  };

  // Only a genuine release commits — hands the parent the final local order once, instead of on
  // every slot crossed while still dragging. A CANCELLED/FAILED gesture (success=false — e.g. a
  // competing scroll gesture stealing the touch mid-drag) reverts to the pre-drag snapshot
  // instead, so a stolen touch can't look like the photo silently placed itself without the
  // user releasing.
  const handleDragEnd = (success: boolean) => {
    if (autoScrollTimer.current) { clearInterval(autoScrollTimer.current); autoScrollTimer.current = null; }
    setGestureLive(false);
    onDragActiveChange?.(false);
    // Fly the floating photo INTO its final slot (or back to its start, if cancelled) rather than
    // springing its offset back to 0 — 0 means "the slot it was picked up from", which is why it
    // used to visibly flash back to its original position before the real tile appeared in the
    // new one. The real tile is only revealed (settle, below) once the photo has landed there.
    const endIdx = success && currentIndexRef.current != null ? currentIndexRef.current : null;
    const land = endIdx != null ? slotXY(endIdx) : startSlotRef.current;
    translateX.value = withTiming(land.x - startSlotRef.current.x, { duration: SETTLE_MS });
    // Minus the auto-scroll delta, since overlayStyle adds it back on top.
    translateY.value = withTiming(land.y - startSlotRef.current.y - scrollDeltaRef.current, { duration: SETTLE_MS });
    currentIndexRef.current = null;
    if (success) {
      onReorder?.(orderRef.current);
    } else {
      setOrder(dragStartOrderRef.current);
    }
    settleTimer.current = setTimeout(settle, SETTLE_MS);
  };
  // Swap the floating photo for the real tile once it's landed: the real tile snaps from its
  // pinned drag-start slot to its final slot and becomes visible in the same render. Every other
  // tile is already sitting in its final slot, so nothing else moves.
  const settle = () => {
    settleTimer.current = null;
    draggingRef.current = false;
    setDragKey(null);
  };

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value + scrollDeltaSV.value }],
  }));

  const dragPhoto = dragKey != null ? order.find(p => keyOf(p) === dragKey) ?? null : null;
  // The read-only display passes maxRows (3, for a 3x3 preview) — everything beyond that many
  // rows is simply not rendered here at all, since "View all" already opens the full set.
  const displayed = maxRows ? order.slice(0, maxRows * EDIT_COLS) : order;
  const hiddenCount = order.length - displayed.length;
  const orderIdx = new Map(displayed.map((p, i) => [keyOf(p), i]));
  // Tiles are RENDERED in a fixed order (by key) that never changes when photos are reordered,
  // and placed purely by position (see EditableGridTile's posStyle). Reordering the actual tile
  // views — which happened the moment a drag committed — makes the new renderer tear down and
  // rebuild them, so every image briefly reloaded and the grid flashed white.
  const renderList = [...displayed].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  const rows = Math.ceil(displayed.length / EDIT_COLS);
  const gridH = rows > 0 ? rows * step - EDIT_GAP : 0;

  const grid = (
    <View style={{ position: 'relative' }} onLayout={e => setGridW(e.nativeEvent.layout.width)}>
      {tileSize > 0 && (
        <>
          <View style={{ height: gridH }}>
            {renderList.map(p => {
              const k = keyOf(p);
              const i = orderIdx.get(k) ?? 0;
              const isDragged = k === dragKey;
              // The dragged tile stays pinned to the slot it was picked up from for the whole drag:
              // it's hidden anyway, and it's the view hosting the active gesture, so moving it
              // while the finger is on it cancels the gesture (the old "drops without releasing").
              const pos = isDragged && gestureLive ? startSlotRef.current : slotXY(i);
              return (
              <EditableGridTile
                key={k}
                photo={p}
                index={i}
                hidden={isDragged}
                draggable={draggable}
                tileSize={tileSize}
                offsetX={pos.x}
                offsetY={pos.y}
                // The hidden dragged tile snaps (no animation) to its final slot at finger-up, so
                // it's already there, well before settle reveals it.
                animateOffset={dragKey != null && !isDragged}
                overlayCount={hiddenCount > 0 && i === displayed.length - 1 ? hiddenCount : undefined}
                // Maps back to the PARENT's photos array by identity, not by this local index
                // directly — order and photos can transiently disagree on position mid-drag
                // (order isn't committed to the parent until release), so a delete tap on some
                // OTHER tile while a drag is in progress must still remove the right photo.
                onDelete={onDelete ? (i: number) => {
                  const target = order[i];
                  const realIdx = photos.findIndex(x => (x.assetId ?? x.uri) === (target.assetId ?? target.uri));
                  onDelete(realIdx === -1 ? i : realIdx);
                } : undefined}
                onTapView={(i: number, touchDownAt: number) => {
                  if (lastPhotoGridScrollAt >= touchDownAt) return; // it was a swipe, not a tap
                  setViewerIndex(i);
                }}
                translateX={translateX}
                translateY={translateY}
                onDragStart={handleDragStart}
                onDragUpdate={handleDragUpdate}
                onDragEnd={handleDragEnd}
              />
              );
            })}
          </View>
          {dragPhoto && (
            // Shadow and clipping are split across two nested views, not combined on one — a
            // single view with BOTH overflow:'hidden' AND a shadow is a known iOS rendering
            // pitfall: the shadow forces an unclipped compositing layer, and a resizeMode="cover"
            // image can then render at its full cover-scaled size instead of being cropped to the
            // tile, which is exactly why the floating photo looked oversized (worse the more its
            // own aspect ratio differed from square) instead of just mispositioned.
            <Reanimated.View
              pointerEvents="none"
              style={[{
                position: 'absolute', width: tileSize, height: tileSize,
                left: startSlotRef.current.x, top: startSlotRef.current.y, zIndex: 20,
                shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
              }, overlayStyle]}
            >
              <View style={{ flex: 1, borderRadius: 10, overflow: 'hidden' }}>
                <Image source={{ uri: dragPhoto.uri }} style={pcS.imgFill} resizeMode="cover" />
              </View>
            </Reanimated.View>
          )}
        </>
      )}
    </View>
  );

  const viewer = viewerIndex != null && (
    <PhotoViewerModal photos={displayed} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
  );

  if (maxRows) return <>{grid}{viewer}</>;

  return (
    <>
      <GHScrollView
        ref={scrollRef}
        style={{ maxHeight: PHOTO_BOX_MAX_H }}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        // Off while a tile is actively being dragged — otherwise this box's own touch-scroll pan can
        // still compete for the same touch as an in-progress tile drag and cancel it. Auto-scroll
        // itself is unaffected: it drives scrollTo() imperatively, which works regardless of this.
        scrollEnabled={dragKey == null}
        onScroll={e => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          notePhotoGridScroll();
        }}
        onContentSizeChange={(w, h) => { contentHeightRef.current = h; }}
      >
        {grid}
      </GHScrollView>
      {viewer}
    </>
  );
}

export function PhotoCollage({ photos, onAdd, onDelete, onReorder, hideAddMore, expandAll, maxRows, onDragActiveChange }: {
  photos: PhotoEntry[];
  onAdd: () => void;
  onDelete?: (index: number) => void;
  // Drag-to-reorder callback, given the full photos array in its new order. Only used when
  // expandAll is set — see EditablePhotoGrid, which expandAll switches to entirely in place of
  // the magazine layout below.
  onReorder?: (reordered: PhotoEntry[]) => void;
  hideAddMore?: boolean;
  // When true, renders as EditablePhotoGrid (a uniform 3-column grid) instead of the magazine
  // layout below. Both the trip editor and the read-only My Visit display pass this now, so
  // they use the same grid; only the editor also passes onReorder/onDelete, which is what
  // actually makes EditablePhotoGrid's tiles draggable/deletable (see its own draggable flag).
  expandAll?: boolean;
  // Passed straight through to EditablePhotoGrid — caps it at this many rows with no scroll box.
  // The read-only My Visit display passes 3 (a 3x3 preview); the editor leaves it unset.
  maxRows?: number;
  // Passed straight through to EditablePhotoGrid — see its own prop doc for why the editor needs
  // this (disabling the surrounding page's own ScrollView while a photo drag is active).
  onDragActiveChange?: (active: boolean) => void;
}) {
  if (photos.length === 0) {
    return (
      <Pressable style={pcS.addOnly} onPress={onAdd}>
        <Camera size={22} color="#9CA3AF" />
        <Text style={pcS.addTxt}>Add your travel photos</Text>
      </Pressable>
    );
  }
  const count = photos.length;
  const avgAR = photos.reduce((s, p) => s + p.width / Math.max(p.height, 1), 0) / count;
  // Single-row layouts (1-3 photos) keep the base height; the 2x2 grid (exactly 4 photos)
  // gets real height of its own instead of squeezing two rows into the same total. 5+ photos
  // use their own dynamic grid below (see renderTiles), which grows a row at a time instead
  // of a fixed height.
  const collageH = count <= 3 ? COLLAGE_H : COLLAGE_H_TALL;

  const delBtn = (idx: number) => onDelete ? (
    <Pressable style={pcS.delBtn} onPress={() => onDelete(idx)} hitSlop={6}>
      <View style={pcS.delBtnInner}><X size={9} color="white" strokeWidth={3} /></View>
    </Pressable>
  ) : null;

  // Small tag pill shown on photos that came from a spot (only in the destination collage).
  const spotTag = (idx: number) => photos[idx].spotName ? (
    <View pointerEvents="none" style={pcS.spotTag}>
      <Text style={pcS.spotTagTxt} numberOfLines={1}>📍 {photos[idx].spotName}</Text>
    </View>
  ) : null;

  // flex: 1 is a DEFAULT here, not just for the callers that happen to pass it explicitly —
  // several call sites below nest a bare `tile(uri, idx)` (no style) as the sole child of an
  // already-sized wrapper View, relying on it to fill that wrapper. Without an explicit
  // flex/height of its own, a View whose only children are absolutely-positioned (imgFill,
  // spotTag, delBtn all are) collapses to 0 height regardless of its parent's real size, since
  // Yoga sizes a column's main axis from content, not from the parent's height — leaving the
  // photo invisible even though the layout around it looks correct. flex:1 (overridden by any
  // caller-supplied style, since it's merged first) makes the tile fill its parent by default.
  const tile = (uri: string, idx: number, style?: object) => (
    <View style={[{ overflow: 'hidden', flex: 1 }, style]}>
      <Image source={{ uri }} style={pcS.imgFill} resizeMode="cover" />
      {spotTag(idx)}
      {delBtn(idx)}
    </View>
  );

  const renderTiles = () => {
    if (count === 1) {
      const ar = photos[0].width / Math.max(photos[0].height, 1);
      const h  = Math.min(COLLAGE_H, Math.round(COLLAGE_INNER_W / ar));
      return tile(photos[0].uri, 0, { height: h });
    }
    if (count === 2) {
      if (avgAR > 1.3) {
        return (
          <View style={{ height: COLLAGE_H, gap: 3 }}>
            {tile(photos[0].uri, 0, { flex: 1, borderRadius: 10 })}
            {tile(photos[1].uri, 1, { flex: 1, borderRadius: 10 })}
          </View>
        );
      }
      return (
        <View style={{ height: COLLAGE_H, flexDirection:'row', gap:3 }}>
          {tile(photos[0].uri, 0, { flex: 1, borderRadius: 10 })}
          {tile(photos[1].uri, 1, { flex: 1, borderRadius: 10 })}
        </View>
      );
    }
    if (count === 3) {
      const mainAR = photos[0].width / Math.max(photos[0].height, 1);
      return (
        <View style={{ height: COLLAGE_H, flexDirection:'row', gap:3 }}>
          {tile(photos[0].uri, 0, { flex: mainAR > 1 ? 3 : 2, borderRadius: 10 })}
          <View style={{ flex: mainAR > 1 ? 2 : 3, gap:3 }}>
            {tile(photos[1].uri, 1, { flex: 1, borderRadius: 8 })}
            {tile(photos[2].uri, 2, { flex: 1, borderRadius: 8 })}
          </View>
        </View>
      );
    }
    if (count === 4) {
      return (
        <View style={{ height: collageH, gap:3 }}>
          <View style={{ flex:1, flexDirection:'row', gap:3 }}>
            {tile(photos[0].uri, 0, { flex: 1, borderRadius: 10 })}
            {tile(photos[1].uri, 1, { flex: 1, borderRadius: 10 })}
          </View>
          <View style={{ flex:1, flexDirection:'row', gap:3 }}>
            {tile(photos[2].uri, 2, { flex: 1, borderRadius: 10 })}
            {tile(photos[3].uri, 3, { flex: 1, borderRadius: 10 })}
          </View>
        </View>
      );
    }
    // 5+ photos — repeats the count===3 block (one big tile + two stacked small ones,
    // alternating which side the big tile is on) as its own row, adding a whole new block as
    // photos grow instead of either (a) one dominant tile that just gets taller (the old
    // design) or (b) a flat uniform grid with no visual variety (last iteration). Blocks are
    // capped (BLOCK_MAX) at a still-reasonable total height; only beyond that does a "+N"
    // overlay take over the last visible tile.
    const totalBlocks   = Math.ceil(count / BLOCK_SIZE);
    const visibleBlocks = expandAll ? totalBlocks : Math.min(totalBlocks, BLOCK_MAX);
    const visibleSlots  = visibleBlocks * BLOCK_SIZE;
    const overflowing   = count > visibleSlots;
    const shownCount    = overflowing ? visibleSlots : count;
    const extra         = count - shownCount;
    const blocks = Array.from({ length: visibleBlocks }, (_, b) => photos.slice(b * BLOCK_SIZE, b * BLOCK_SIZE + BLOCK_SIZE).map((_, j) => b * BLOCK_SIZE + j)).filter(idxs => idxs.length > 0 && idxs[0] < shownCount);
    return (
      <View style={{ gap: 3 }}>
        {blocks.map((idxs, b) => {
          const visibleIdxs = idxs.filter(i => i < shownCount);
          const bigOnRight = b % 2 === 1; // alternate sides block to block for variety
          const overlayIdx = overflowing && b === blocks.length - 1 ? visibleIdxs[visibleIdxs.length - 1] : -1;
          const overlay = (i: number) => i === overlayIdx ? (
            <View pointerEvents="none" style={pcS.moreOverlay}>
              <Text style={pcS.moreTxt}>+{extra}</Text>
            </View>
          ) : null;
          if (visibleIdxs.length === 1) {
            const i = visibleIdxs[0];
            return (
              <View key={b} style={{ height: BLOCK_H, borderRadius: 10, overflow: 'hidden' }}>
                {tile(photos[i].uri, i)}
                {overlay(i)}
              </View>
            );
          }
          if (visibleIdxs.length === 2) {
            const [i0, i1] = visibleIdxs;
            return (
              <View key={b} style={{ height: BLOCK_H, flexDirection: 'row', gap: 3 }}>
                {tile(photos[i0].uri, i0, { flex: 1, borderRadius: 10 })}
                <View style={{ flex: 1, borderRadius: 10, overflow: 'hidden' }}>
                  {tile(photos[i1].uri, i1)}
                  {overlay(i1)}
                </View>
              </View>
            );
          }
          const [big, s0, s1] = bigOnRight ? [visibleIdxs[2], visibleIdxs[0], visibleIdxs[1]] : visibleIdxs;
          const stack = (
            <View style={{ flex: 2, gap: 3 }}>
              {tile(photos[s0].uri, s0, { flex: 1, borderRadius: 8 })}
              <View style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}>
                {tile(photos[s1].uri, s1)}
                {overlay(s1)}
              </View>
            </View>
          );
          const bigTile = (
            <View style={{ flex: 3, borderRadius: 10, overflow: 'hidden' }}>
              {tile(photos[big].uri, big)}
              {overlay(big)}
            </View>
          );
          return (
            <View key={b} style={{ height: BLOCK_H, flexDirection: 'row', gap: 3 }}>
              {bigOnRight ? <>{stack}{bigTile}</> : <>{bigTile}{stack}</>}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={pcS.wrap}>
      {expandAll ? (
        <EditablePhotoGrid photos={photos} onDelete={onDelete} onReorder={onReorder} maxRows={maxRows} onDragActiveChange={onDragActiveChange} />
      ) : renderTiles()}
      {!hideAddMore && (
        <Pressable style={pcS.addMore} onPress={onAdd}>
          <Camera size={13} color="#16A34A" />
          <Text style={pcS.addMoreTxt}>Add more photos</Text>
        </Pressable>
      )}
    </View>
  );
}
const pcS = StyleSheet.create({
  imgFill:    { ...StyleSheet.absoluteFill } as any,
  wrap:       { paddingHorizontal:12, paddingTop:12, paddingBottom:12 },
  addOnly:    { flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10,
                marginHorizontal:12, marginVertical:12,
                paddingVertical:30, borderRadius:16,
                borderWidth:1.5, borderColor:'#D1D5DB', borderStyle:'dashed',
                backgroundColor:'#F9FAFB' },
  addTxt:     { fontSize:13, fontWeight:'600', color:'#9CA3AF' },
  addMore:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6,
                marginTop:8, paddingVertical:8, borderRadius:10,
                borderWidth:1, borderColor:'#D1FAE5', backgroundColor:'#F0FDF4' },
  addMoreTxt: { fontSize:12, fontWeight:'600', color:'#16A34A' },
  moreOverlay:{ ...StyleSheet.absoluteFill, backgroundColor:'rgba(0,0,0,0.5)',
                alignItems:'center', justifyContent:'center' } as any,
  moreTxt:    { fontSize:18, fontWeight:'800', color:'white' },
  delBtn:     { position:'absolute', top:5, right:5, zIndex:10 },
  delBtnInner:{ width:20, height:20, borderRadius:10, backgroundColor:'rgba(0,0,0,0.55)',
                alignItems:'center', justifyContent:'center' },
  spotTag:    { position:'absolute', bottom:5, left:5, maxWidth:'80%',
                backgroundColor:'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:7, paddingVertical:3 },
  spotTagTxt: { fontSize:10, fontWeight:'700', color:'white' },
});

// ── Full-screen photo gallery — "view all" for a visit's whole photo set ─────────────────────
// A plain 3-column grid rather than PhotoCollage's own varied-layout collage: the collage's
// whole point is a magazine-style teaser for a handful of photos, which stops making sense
// once you're deliberately looking at all of them — a uniform grid scans faster at any count.
const GALLERY_COLS = 3;
const GALLERY_GAP = 3;
const GALLERY_TILE = (W - 32 - GALLERY_GAP * (GALLERY_COLS - 1)) / GALLERY_COLS;

export function PhotoGalleryModal({ photos, title, onClose }: {
  photos: PhotoEntry[];
  // Header title (e.g. the trip's own name) — the modal itself is destination-agnostic, so the
  // caller supplies whatever names this specific photo set. The photo count sits under it.
  title: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(H)).current;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  useEffect(() => {
    Animated.spring(slide, { toValue: 0, damping: 24, stiffness: 260, useNativeDriver: true }).start();
  }, []);
  const dismiss = () => {
    Animated.timing(slide, { toValue: H, duration: 280, useNativeDriver: true }).start(onClose);
  };

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[pgS.sheet, { transform: [{ translateY: slide }] }]}>
        <View style={[pgS.header, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={dismiss} style={pgS.closeBtn} hitSlop={12}>
            <X size={18} color="#111827" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={pgS.headerTitle} numberOfLines={1}>{title}</Text>
            <Text style={pgS.headerSub} numberOfLines={1}>{photos.length} photo{photos.length === 1 ? '' : 's'}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={pgS.grid} showsVerticalScrollIndicator={false}>
          {photos.map((p, i) => (
            <Pressable key={p.assetId ?? p.uri ?? i} style={pgS.tile} onPress={() => setViewerIndex(i)}>
              <Image source={{ uri: p.uri }} style={pcS.imgFill} resizeMode="cover" />
              {!!p.spotName && (
                <View pointerEvents="none" style={pcS.spotTag}>
                  <Text style={pcS.spotTagTxt} numberOfLines={1}>📍 {p.spotName}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
      {viewerIndex != null && (
        <PhotoViewerModal photos={photos} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </Modal>
  );
}
const pgS = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0, height: H,
    backgroundColor: '#F9FAFB', zIndex: 300, elevation: 300,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
    backgroundColor: 'white',
  },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' },
  headerSub:   { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 1 },
  grid: {
    padding: 16, paddingBottom: 48,
    flexDirection: 'row', flexWrap: 'wrap', gap: GALLERY_GAP,
  },
  tile: { width: GALLERY_TILE, height: GALLERY_TILE, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F3F4F6' },
});

// ── Full-screen single-photo viewer — opened by tapping any photo tile in either the gallery
// grid above or the editor's own draggable grid below. Horizontal paging between every photo in
// the same set, starting on whichever one was tapped.
export function PhotoViewerModal({ photos, initialIndex, onClose }: {
  photos: PhotoEntry[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const N = photos.length;
  // Continuous carousel: pad the real photos with one duplicate of the last photo up front and
  // one duplicate of the first at the end, so swiping past either edge lands on a REAL-looking
  // neighbor instead of just bouncing. The moment that duplicate page settles, we silently jump
  // (no animation) to the matching real page on the other side — invisible to the user, since a
  // duplicate frame looks identical to the real one it stands in for.
  const loopPhotos = N > 1 ? [photos[N - 1], ...photos, photos[0]] : photos;
  const posToIndex = (p: number) => N > 1 ? (p === 0 ? N - 1 : p === N + 1 ? 0 : p - 1) : p;
  const initialPos = N > 1 ? initialIndex + 1 : initialIndex;
  const [index, setIndex] = useState(initialIndex);
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, []);
  const dismiss = () => {
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(onClose);
  };

  // Swipe-down-to-dismiss — a Reanimated pan on top of the ScrollView, not instead of it.
  // activeOffsetY restricts activation to a clear DOWNWARD drag (upward never activates it, so
  // it can't be triggered trying to scroll up past nothing); failOffsetX releases the gesture to
  // the ScrollView the moment the drag reads as mostly horizontal, so normal paging is untouched.
  const dragY = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetY([-100000, 24])
    .failOffsetX([-15, 15])
    .onUpdate(e => { dragY.value = Math.max(0, e.translationY); })
    .onEnd(e => {
      if (e.translationY > 120 || e.velocityY > 800) {
        // Keep sliding rather than snapping back — the fade-out below finishes the dismissal.
        dragY.value = withTiming(dragY.value + 200, { duration: 160 });
        runOnJS(dismiss)();
      } else {
        dragY.value = withTiming(0, { duration: 200 });
      }
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
    opacity: 1 - Math.min(dragY.value / 300, 0.6),
  }));

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[pvS.overlay, { opacity }]}>
        <GestureDetector gesture={pan}>
          <Reanimated.View style={[{ flex: 1 }, dragStyle]}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              // contentOffset (not scrollTo in an effect) — positions correctly on the very first
              // frame, before anything is painted, so there's no visible jump from photo 0 to the
              // tapped index.
              contentOffset={{ x: initialPos * W, y: 0 }}
              onMomentumScrollEnd={e => {
                const p = Math.round(e.nativeEvent.contentOffset.x / W);
                setIndex(posToIndex(p));
                if (N > 1 && (p === 0 || p === N + 1)) {
                  // Landed on a padding duplicate — snap to the real page it stands in for, with no
                  // animation, so the wrap-around is invisible.
                  scrollRef.current?.scrollTo({ x: (p === 0 ? N : 1) * W, animated: false });
                }
              }}
            >
              {loopPhotos.map((p, i) => (
                <View key={`${p.assetId ?? p.uri ?? i}-${i}`} style={pvS.page}>
                  <Image source={{ uri: p.uri }} style={pvS.image} resizeMode="contain" />
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={dismiss} style={[pvS.closeBtn, { top: insets.top + 10 }]} hitSlop={12}>
              <X size={20} color="white" />
            </Pressable>
            {photos.length > 1 && (
              <View style={[pvS.counterWrap, { bottom: insets.bottom + 20 }]} pointerEvents="none">
                <Text style={pvS.counterTxt}>{index + 1} / {photos.length}</Text>
              </View>
            )}
          </Reanimated.View>
        </GestureDetector>
      </Animated.View>
    </Modal>
  );
}
const pvS = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'black' },
  page:       { width: W, height: H, alignItems: 'center', justifyContent: 'center' },
  image:      { width: W, height: H },
  closeBtn:   { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  counterWrap:{ position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6,
                borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  counterTxt: { color: 'white', fontSize: 13, fontWeight: '600' },
});

// ── Review edit popup (floats above keyboard) ─────────────────────────────────
const REVIEW_MAX = 500;

export function ReviewEditModal({ value, onSave, onCancel, title = 'My Review', placeholder = 'Write about your visit…' }: {
  value: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  title?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const insets = useSafeAreaInsets();
  const atLimit = text.length >= REVIEW_MAX;
  // Cancel (or tapping the dimmed backdrop) discards silently when nothing changed; otherwise
  // confirms first, so an accidental tap can't lose typed text.
  const handleCancel = () => {
    if (text === value) { onCancel(); return; }
    Alert.alert('Discard changes?', 'Your edits to this note haven’t been saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onCancel },
    ]);
  };
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={handleCancel}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View>
            <View style={[rvS.card, { paddingBottom: insets.bottom + 12 }]}>
              <View style={rvS.headerRow}>
                <Pressable onPress={handleCancel} hitSlop={12}>
                  <Text style={rvS.cancel}>Cancel</Text>
                </Pressable>
                <Text style={rvS.title}>{title}</Text>
                <Pressable onPress={() => onSave(text)} hitSlop={12}>
                  <Text style={rvS.save}>Save</Text>
                </Pressable>
              </View>
              <TextInput
                style={rvS.input}
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor="#9CA3AF"
                multiline
                autoFocus
                scrollEnabled
                maxLength={REVIEW_MAX}
              />
              <Text style={[rvS.charCount, atLimit && rvS.charCountLimit]}>
                {text.length}/{REVIEW_MAX}
              </Text>
            </View>
            {/* White filler that rides up with the card (same KeyboardAvoidingView-shifted
                parent) and extends far past the screen bottom — so once the card is pushed up
                above the keyboard, this sits exactly where the keyboard renders. The system
                keyboard's own top corners are slightly rounded, exposing a sliver of whatever
                sits directly behind it; without this, that sliver showed the dim backdrop
                Pressable behind the whole modal as two odd blank corners. White here reads as
                the note card simply continuing on behind the keyboard instead. */}
            <View style={rvS.keyboardFiller} pointerEvents="none" />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const rvS = StyleSheet.create({
  card:          { backgroundColor:'white', borderTopLeftRadius:28, borderTopRightRadius:28,
                   paddingHorizontal:20, paddingTop:16 },
  keyboardFiller:{ position:'absolute', top:'100%', left:0, right:0, height:1000, backgroundColor:'white' },
  headerRow:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  title:         { fontSize:15, fontWeight:'700', color:'#111827' },
  cancel:        { fontSize:15, color:'#6B7280', minWidth:56 },
  save:          { fontSize:15, fontWeight:'700', color:'#059669', minWidth:56, textAlign:'right' },
  input:         { fontSize:15, color:'#111827', lineHeight:24, minHeight:120, maxHeight:260 },
  charCount:     { fontSize:12, color:'#9CA3AF', textAlign:'right', paddingTop:6, paddingBottom:4 },
  charCountLimit:{ color:'#EF4444' },
});

// ── Visit log system (read-only "My Visit" card list + full-screen editor) ───────────────────
// Shared by all three levels that can log a visit — destination, country, spot — so the journal-
// entry UX (one standalone module per trip: title, dates, notes, spots-visited-style selector,
// photos) is implemented exactly once instead of three times. Each caller supplies its own
// selector (or none at all, for the spot level, which has nothing beneath it to tag a visit
// with) and its own store wiring (save/delete/mark-visited), so this file never needs to know
// which level it's being used from.

// One selectable thing a visit can be tagged with — a spot (destination level) or a destination
// (country level). Kept generic on purpose: this file only ever reads id/name/renderThumb.
export interface VisitSelectorItem {
  id: string;
  name: string;
  // Renders this item's own thumbnail — typically an <EntityPhoto>, which fills whatever sized/
  // clipped wrapper the caller-agnostic layout below puts it in (EntityPhoto defaults to
  // absoluteFill). Kept as a render callback (not e.g. a cacheKey/load pair) so this file never
  // needs to import EntityPhoto or know how a given level fetches its thumbnails.
  renderThumb: () => React.ReactNode;
}

// Same gray used for the About tab's boxes elsewhere in the app (DestinationSheet's own
// ABOUT_BORDER) — duplicated here as a plain value rather than imported, since this file sits
// below DestinationSheet in the dependency graph.
const VISIT_CARD_BORDER = '#D8DBE0';
// Caption-strip treatment for a selector item's thumbnail card (name over a dark gradient that
// fades up into the photo) — same formula as DestinationSheet's own WHY_STRIP_OPACITY/
// STRIP_FADE_STOPS, just scoped to this file's own (smaller) card size. Kept short: the solid
// strip only hugs the name (see memSpotCardStrip's padding) and this fade above it is brief, so
// most of the small square card still shows the photo rather than a dark scrim.
// Gentler than DestinationSheet's WHY_STRIP_OPACITY (0.68): enough to carry white text on these small
// cards without reading as a heavy black band.
const VISIT_STRIP_OPACITY = 0.55;
const VISIT_STRIP_FADE_H = 26;
// Smootherstep (6t⁵−15t⁴+10t³) rather than smoothstep: it lifts off zero more gradually, so the fade's
// top edge melts into the photo instead of showing where it starts. 21 stops so it never bands.
const VISIT_STRIP_FADE_STOPS = Array.from({ length: 21 }, (_, i) => {
  const t = i / 20;
  return { offset: `${t}`, opacity: VISIT_STRIP_OPACITY * t * t * t * (t * (6 * t - 15) + 10) };
});

// ── Read-only "My Visit" card list ────────────────────────────────────────────────────────────
// Each logged visit is its own standalone module — its own title, dates, photos, and notes, like
// a separate journal entry. Renders one memCard per visit (each section — notes, selector,
// photos — completely omitted when empty, with the LAST populated section, or the header alone
// if all are empty, getting consistent bottom padding — see memTopRowOnly/memNotesLast/
// memSpotsCarouselLast below), plus a trailing "Add Visit +" button.
export function VisitCardList<T extends VisitSelectorItem>({
  visits, onEditVisit, onNewVisit, onOpenGallery, onSelectItem, selectorLabel, selectorItems,
  ratingValue, hideSingleDayCount, isReadOnly, defaultTitle, noun = 'Trip',
}: {
  visits: Visit[];
  onEditVisit: (v: Visit) => void;
  onNewVisit: () => void;
  onOpenGallery: (v: Visit) => void;
  // Pressing a selector item's own card within a visit (e.g. jumping to that spot's or
  // destination's own sheet).
  onSelectItem?: (item: T) => void;
  // Both omitted (or an empty item list) hides the selector section entirely — the spot level
  // passes neither, since there's nothing beneath a spot to tag a visit with.
  selectorLabel?: string;
  selectorItems?: T[];
  // Rating is a per-ENTITY attribute (e.g. a spot's own rating), not per-visit — same value
  // shown on every card's header here when provided. Omitted (or 0) hides the stars entirely;
  // only the spot level passes this.
  ratingValue?: number;
  // A single-day visit's "· 1 day" is noise for a spot (inherently a short, usually same-day
  // stop) — hidden when this is true, mirroring VisitModuleSheet's own prop of the same name.
  // A genuinely multi-day spot visit still shows its real day count.
  hideSingleDayCount?: boolean;
  // A visit this returns true for is shown read-only, with no Edit button — e.g. a destination
  // trip that ticked this spot, which is edited on the destination.
  isReadOnly?: (v: Visit) => boolean;
  // Shown for a trip saved without a title (e.g. a pre-redesign one) — "Paris Trip".
  defaultTitle?: string;
  // "Trip" (default) or "Visit" — the empty state's wording.
  noun?: string;
}) {
  // Sizes the selector carousel's square cards to match the photo grid's own tiles exactly —
  // measured (not hardcoded) off the carousel's own container width, using the identical
  // padding/gap math PhotoCollage's EditablePhotoGrid applies to ITS measured width, since both
  // sit in the same memCard at the same 3-column layout. One value for the whole list (not per
  // visit module), since every module's card is the same screen width.
  const [itemSquareSize, setItemSquareSize] = useState(92);
  const hasSelector = !!selectorLabel && !!selectorItems?.length;
  // "Spots Visited" → "spots"/"spot", "Destinations Visited" → "destinations"/"destination" —
  // derived from the caller's own label rather than a second prop, so the two can never drift.
  const pluralNoun   = selectorLabel ? selectorLabel.replace(/\s+Visited$/i, '').toLowerCase() : '';
  const singularNoun = pluralNoun.endsWith('s') ? pluralNoun.slice(0, -1) : pluralNoun;

  // Visited, nothing logged yet: an invitation to log it rather than an empty trip card.
  if (visits.length === 0) {
    const what = hasSelector ? `dates, the ${pluralNoun} you visited, notes and photos` : 'a date, notes and photos';
    return (
      <View style={vcS.listWrap}>
        <View style={vcS.memCardShadow}>
          <Pressable style={[vcS.memCard, vcS.emptyCard]} onPress={onNewVisit}>
            <View style={vcS.emptyIcon}>
              <NotebookPen size={22} color="#059669" />
            </View>
            <Text style={vcS.emptyTitle}>Log your {noun.toLowerCase()}</Text>
            <Text style={vcS.emptySub}>Add {what} to remember it by.</Text>
            <View style={vcS.emptyBtn}>
              <Plus size={15} color="white" strokeWidth={2.75} />
              <Text style={vcS.emptyBtnTxt}>Add {noun}</Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={vcS.listWrap}>
      {visits.map(v => {
        const days = visitDayCount(v);
        const itemsForVisit = hasSelector ? selectorItems!.filter(it => v.spotIds?.includes(it.id)) : [];
        // Nothing besides the title/dates header itself — no white sliver of empty card below
        // it in that case; the dark header just fills the whole box (all four corners rounded,
        // no trailing margin).
        const headerOnly = !v.notes && !itemsForVisit.length && !v.photos?.length;
        const readOnly = !!isReadOnly?.(v);
        return (
          <View key={v.id} style={vcS.memCardShadow}>
            <View style={vcS.memCard}>
              <View style={[vcS.memTopRow, headerOnly && vcS.memTopRowOnly]}>
                <View style={{ flex: 1 }}>
                  {!!(v.title || defaultTitle) && (
                    // No trailing gap when nothing follows it — an undated trip's header is just its title.
                    <Text style={[vcS.memTripNameHeading, !ratingValue && !v.startDate && { marginBottom: 0 }]} numberOfLines={2}>
                      {v.title || defaultTitle}
                    </Text>
                  )}
                  {!!ratingValue && (
                    <View style={[vcS.memRatingRow, !v.startDate && { marginBottom: 0 }]}>
                      <StarRating value={ratingValue} size={13} />
                    </View>
                  )}
                  {/* Nothing at all for an undated trip, rather than a "no dates" label. */}
                  {!!v.startDate && (
                    <Text style={vcS.memDateVal}>
                      {fmtVisitRangeShort(v)}
                      {days != null && !(days === 1 && hideSingleDayCount) && `  ·  ${days} day${days === 1 ? '' : 's'}`}
                    </Text>
                  )}
                </View>
                {!readOnly && (
                  <Pressable style={vcS.memEditBtn} onPress={() => onEditVisit(v)}>
                    <Pencil size={12} color="white" />
                    <Text style={vcS.memEditBtnTxt}>Edit</Text>
                  </Pressable>
                )}
              </View>
              {!!v.notes && (
                // When nothing follows (no selector items, no photos), match the same bottom
                // padding the card ends on when photos ARE the last section.
                <Pressable
                  style={[vcS.memNotesDisplay, !itemsForVisit.length && !v.photos?.length && vcS.memNotesLast]}
                  onPress={readOnly ? undefined : () => onEditVisit(v)}
                >
                  <Text style={vcS.memNotesTxt} numberOfLines={3}>{v.notes}</Text>
                </Pressable>
              )}
              {hasSelector && itemsForVisit.length > 0 && (
                <View
                  // No notes block above means nothing separates this from the dark heading
                  // section — give it a bit of its own top space in that case.
                  style={!v.notes && vcS.memSpotsWrapNoNotes}
                  onLayout={e => {
                    // Same 3-column, 6px-gap math EditablePhotoGrid applies to ITS own measured
                    // width — this container is the same full memCard width pcS.wrap also
                    // receives, so subtracting pcS.wrap's own 12px-each-side padding here
                    // reproduces the same tile size.
                    const w = e.nativeEvent.layout.width - 24;
                    const size = (w - 6 * 2) / 3;
                    if (Math.abs(size - itemSquareSize) > 0.5) setItemSquareSize(size);
                  }}
                >
                  <Text style={vcS.memSpotsCount}>
                    {itemsForVisit.length} {itemsForVisit.length === 1 ? singularNoun : pluralNoun} visited
                  </Text>
                  {/* When no photos follow, match the same bottom padding the card ends on
                      when photos ARE last. */}
                  <GHScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={[vcS.memSpotsCarousel, !v.photos?.length && vcS.memSpotsCarouselLast]}
                    contentContainerStyle={vcS.memSpotsCarouselContent}
                  >
                    {itemsForVisit.map(item => (
                      <Pressable
                        key={item.id}
                        style={[vcS.memSpotCard, { width: itemSquareSize, height: itemSquareSize }]}
                        onPress={() => onSelectItem?.(item)}
                      >
                        {item.renderThumb()}
                        {/* Name on a dark strip whose top fades up into the photo — same
                            treatment as the About tab's "Why visit" captions. */}
                        <View pointerEvents="none" style={vcS.memSpotCardStrip}>
                          <View style={vcS.memSpotCardStripFade}>
                            {/* Explicit NUMERIC width/height (not "100%") — percentage sizing
                                inside react-native-svg has fallen short of its container before. */}
                            <Svg width={itemSquareSize} height={VISIT_STRIP_FADE_H}>
                              <Defs>
                                <SvgLinearGradient id={`memItemGrad-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                                  {VISIT_STRIP_FADE_STOPS.map(({ offset, opacity }) => (
                                    <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                                  ))}
                                </SvgLinearGradient>
                              </Defs>
                              <Rect x="0" y="0" width={itemSquareSize} height={VISIT_STRIP_FADE_H} fill={`url(#memItemGrad-${item.id})`} />
                            </Svg>
                          </View>
                          {/* Arrow as a trailing text glyph (not a separate icon) so it flows
                              with the text and sits right after the last letter, even once the
                              name wraps to a second line. */}
                          <Text style={vcS.memSpotCardName} numberOfLines={2}>
                            {item.name}
                            <Text style={vcS.memSpotCardArrow}> ›</Text>
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </GHScrollView>
                </View>
              )}
              {!!v.photos?.length && (
                // Same edge case as the selector section above — nothing (no notes, no
                // selector items) separating this from the dark heading section — gets the
                // same bit of extra top space on top of its own baseline paddingTop.
                <View style={[vcS.memPhotosWrap, !v.notes && !itemsForVisit.length && vcS.memSpotsWrapNoNotes]}>
                  <View style={vcS.memPhotosHeadRow}>
                    <Text style={vcS.memPhotosCount}>{v.photos.length} photo{v.photos.length === 1 ? '' : 's'}</Text>
                    <Pressable style={vcS.seeAllRow} onPress={() => onOpenGallery(v)} hitSlop={8}>
                      <Text style={[vcS.seeAllTxt, vcS.memViewAllTxt]}>View all</Text>
                      <ChevronRight size={15} color="#9CA3AF" />
                    </Pressable>
                  </View>
                  {/* Negative margin pulls the grid up against PhotoCollage's own 12px top
                      padding (pcS.wrap, shared with other PhotoCollage callers so not safe to
                      trim there) — memPhotosHeadRow's marginBottom alone left too much space
                      above the photos. */}
                  <Pressable style={{ marginTop: -8 }} onPress={() => onOpenGallery(v)}>
                    <PhotoCollage photos={v.photos} onAdd={() => onOpenGallery(v)} hideAddMore expandAll maxRows={3} />
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        );
      })}
      <Pressable style={vcS.addVisitBtn} onPress={onNewVisit}>
        <Text style={vcS.addVisitBtnTxt}>Add Visit +</Text>
      </Pressable>
    </View>
  );
}
const vcS = StyleSheet.create({
  addVisitBtn:         { alignSelf:'center', paddingVertical:6 },
  addVisitBtnTxt:      { fontSize:14, fontWeight:'600', color:'#C1C6D0' },
  // gap:16 reproduces what each caller's own slidePanel gap used to provide directly between
  // these cards, back when this list's elements were the panel's own direct children (a bare
  // Fragment) instead of wrapped in this View. paddingTop gives the FIRST card's own shadow
  // room to render — the tab content sits inside a panel with overflow:'hidden' (for the tab
  // swipe animation), which otherwise clipped the shadow bleeding above that first card's top
  // edge (every card after it already had that same room, from the gap above it).
  // paddingTop comfortably clears the shadow's full reach above the card (shadowRadius:14 minus
  // the 5px downward offset still leaves a soft blur reaching further than that) — anything
  // short of the shadow's true falloff distance clips its faint outer edge abruptly instead of
  // letting it fade to nothing, which reads as a visible seam rather than no shadow at all.
  listWrap:            { gap:16, paddingTop:20 },
  // Shadow lives on this outer wrapper, not memCard itself — memCard needs overflow:'hidden' to
  // clip its dark header strip to the rounded corners, and iOS clips a shadow along with content
  // when both are on the same view.
  memCardShadow:       { borderRadius:20, backgroundColor:'white',
                          shadowColor:'#000', shadowOpacity:0.16, shadowRadius:14, shadowOffset:{ width:0, height:5 }, elevation:5 },
  memCard:             { backgroundColor:'white', borderRadius:20, overflow:'hidden', borderWidth:1, borderColor:VISIT_CARD_BORDER },
  memTopRow:           { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:18, paddingTop:18, paddingBottom:18,
                         backgroundColor:'#111827', marginBottom:8,
                         borderTopLeftRadius:19, borderTopRightRadius:19 },
  // When nothing follows the header (see headerOnly above) — rounds the bottom corners to match
  // and drops the trailing margin, so the dark header itself fills the entire card.
  memTopRowOnly:       { marginBottom:0, borderBottomLeftRadius:19, borderBottomRightRadius:19 },
  memTripNameHeading:  { fontSize:25, fontFamily:'PlayfairDisplay_700Bold', color:'white', marginBottom:4 },
  memRatingRow:        { marginBottom:8 },
  memDateVal:          { fontSize:14, fontWeight:'600', color:'#9CA3AF' },
  // Empty state (visited, nothing logged) — see VisitCardList.
  emptyCard:           { alignItems:'center', paddingHorizontal:24, paddingTop:28, paddingBottom:24 },
  emptyIcon:           { width:52, height:52, borderRadius:26, backgroundColor:'#ECFDF5',
                         alignItems:'center', justifyContent:'center', marginBottom:14 },
  emptyTitle:          { fontSize:22, fontFamily:'PlayfairDisplay_700Bold', color:'#111827', textAlign:'center' },
  emptySub:            { fontSize:14, color:'#6B7280', lineHeight:20, textAlign:'center', marginTop:6, marginBottom:18 },
  emptyBtn:            { flexDirection:'row', alignItems:'center', gap:6, height:40, paddingHorizontal:18,
                         borderRadius:20, backgroundColor:'#111827' },
  emptyBtnTxt:         { fontSize:14, fontWeight:'700', color:'white' },
  memEditBtn:          { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:10, paddingVertical:6,
                         borderRadius:10, backgroundColor:'rgba(255,255,255,0.14)' },
  memEditBtnTxt:       { fontSize:12, fontWeight:'600', color:'white' },
  memNotesDisplay:     { marginHorizontal:12, marginTop:10, marginBottom:16,
                         paddingHorizontal:14, paddingVertical:12,
                         borderRadius:14, backgroundColor:'#F9FAFB' },
  // Overrides memNotesDisplay's marginBottom when notes is the card's last section — 12, to
  // match the card's bottom space when photos are the last section (PhotoCollage's pcS.wrap).
  memNotesLast:        { marginBottom:12 },
  memNotesTxt:         { fontSize:15, color:'#374151', lineHeight:24 },
  memPhotosWrap:       { paddingTop:16 },
  memPhotosHeadRow:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                         paddingHorizontal:12, marginBottom:2 },
  memPhotosCount:      { fontSize:13, fontWeight:'600', color:'#9CA3AF', marginLeft:3 },
  // Selector-items-visited display (read-only) — a horizontal carousel of square photo cards,
  // the item's own name overlaid at the bottom over a gradient scrim, rather than a vertical
  // list of thumbnail rows.
  memSpotsCount:           { fontSize:13, fontWeight:'600', color:'#9CA3AF', paddingHorizontal:12, marginLeft:3, marginBottom:6 },
  memSpotsWrapNoNotes:     { marginTop:7 },
  memSpotsCarousel:        { paddingBottom:4 },
  // When the selector is the card's last section (no photos follow), match the same bottom
  // space the card ends on when photos ARE last (PhotoCollage's pcS.wrap paddingBottom:12).
  memSpotsCarouselLast:    { paddingBottom:12 },
  // paddingHorizontal:12 and gap:6 (not 18/10) to match pcS.wrap's own outer padding and
  // EDIT_GAP's own inter-tile gap on the photo grid below it — the outer padding is also the
  // same value the itemSquareSize onLayout calc already assumes, so the squares' outer edges
  // line up with the photo grid's edges, not just their sizes.
  memSpotsCarouselContent: { paddingHorizontal:12, gap:6 },
  // width/height come from itemSquareSize (measured to match the photo grid's own tile size),
  // not a fixed value here.
  // Same green as the visited tag elsewhere (cardVisitedTag's #059669), slightly thinner than
  // before (was #16A34A at 2px). A whole-pixel width (1, not 1.5) — a fractional borderWidth
  // here left thin slivers of the card's own background peeking through at the rounded
  // corners, where the border's curve and the overflow:'hidden' clip plane rounded slightly
  // differently from each other.
  memSpotCard:             { borderRadius:14, overflow:'hidden', backgroundColor:'#F3F4F6',
                              borderWidth:1, borderColor:'#059669' },
  memSpotCardStrip:        { position:'absolute', left:0, right:0, bottom:0,
                              paddingHorizontal:8, paddingTop:2, paddingBottom:7, backgroundColor:`rgba(0,0,0,${VISIT_STRIP_OPACITY})` },
  memSpotCardStripFade:    { position:'absolute', left:0, right:0, top:-VISIT_STRIP_FADE_H, height:VISIT_STRIP_FADE_H },
  memSpotCardName:         { fontSize:12, fontWeight:'700', color:'white' },
  memSpotCardArrow:        { fontSize:12, fontWeight:'700', color:'#D1D5DB' },
  seeAllRow:          { flexDirection:'row', alignItems:'center', gap:1 },
  seeAllTxt:          { fontSize:13, fontWeight:'600', color:'#16A34A' },
  // Override for the My Visit "View all" photos link — gray instead of the shared seeAllTxt green.
  memViewAllTxt:      { color:'#9CA3AF' },
});

// One color for the WHOLE rating, keyed off the value chosen (not one color per star index) —
// a 2-star rating shows both filled stars orange, a 5-star rating shows all five green, etc.,
// reading at a glance as "bad" → "great" rather than a flat single color regardless of rating.
const RATING_COLORS: Record<number, string> = {
  1: '#DC2626', // red
  2: '#F97316', // orange
  3: '#EAB308', // yellow
  4: '#16A34A', // green
  5: '#16A34A', // green
};

// ── Star rating (tappable) ────────────────────────────────────────────────────
// Used by VisitModuleSheet's optional rating row below (spot-level trips only, see
// ratingValue/onRatingChange) — moved here from SpotSheet.tsx alongside it.
export function StarRating({ value, onChange, size = 30 }: {
  value: number; onChange?: (v: number) => void; size?: number;
}) {
  const color = RATING_COLORS[value] ?? '#16A34A';
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={6}>
          <Star
            size={size}
            color={n <= value ? color : '#D1D5DB'}
            fill={n <= value ? color : 'none'}
            strokeWidth={2}
          />
        </Pressable>
      ))}
    </View>
  );
}

// A trip's default title: "Paris Trip" / "Louvre Visit", numbered from the second one on
// ("Paris Trip 2") — `existing` is how many trips the place already has logged.
export function defaultTripTitle(name: string, noun: string, existing = 0): string {
  return existing > 0 ? `${name} ${noun} ${existing + 1}` : `${name} ${noun}`;
}

// ── Full-screen visit MODULE edit sheet ───────────────────────────────────────────────────────
// Scoped to exactly ONE visit (a fresh one when `visit` is null) — like editing a single Strava
// activity or journal entry. Every field auto-commits to LOCAL state as it changes; nothing is
// persisted to the caller's store until Save (see handleSave/canSave), keyed on this module's
// own id, so sibling visits are never touched.
export function VisitModuleSheet<T extends VisitSelectorItem>({
  entityName, visit, onSave, onDelete, onClose,
  selectorLabel, selectorItems, onRemoveLegacy,
  ratingValue, onRatingChange, noun = 'Trip', hideSingleDayCount, existingCount = 0,
}: {
  // Used for the title placeholder/fallback (see defaultTripTitle) — the destination's, country's,
  // or spot's own name.
  entityName: string;
  // How many trips the place already has logged, which numbers a new trip's default title
  // ("Paris Trip 2"). Only counts for a new trip — an existing one keeps the plain default.
  existingCount?: number;
  // "Trip" (default) or "Visit" — spots call these visits, not trips, throughout this sheet's
  // own copy (title placeholder, "Remove Trip"/"Remove Visit", "Trip Notes"/"Visit Notes", the
  // "Add trip/visit dates" placeholders, the discard-changes prompt, etc.) and the date picker
  // it opens.
  noun?: string;
  // A single-day visit's "1 day" subtitle next to the date range is noise for a spot (which is
  // inherently a short, usually same-day stop) — hidden when this is true, but a genuinely
  // multi-day spot visit (e.g. camping) still shows its real day count. Destination/country
  // leave this unset and always show it.
  hideSingleDayCount?: boolean;
  visit: Visit | null;
  onSave: (v: Visit) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  // Both omitted (or an empty item list) hides the selector section entirely — the spot level
  // passes neither.
  selectorLabel?: string;
  selectorItems?: T[];
  // Fired instead of onDelete when removing the synthesized 'legacy' visit (migrated from this
  // entity's pre-visits-array fields, see each caller's own localVisits derivation) — the caller
  // unsaves the whole entity rather than trying to delete a visit id that was never actually
  // persisted as its own record.
  onRemoveLegacy?: () => void;
  // Rating lives outside the visits system (it's a per-ENTITY attribute — e.g. a spot's own
  // rating — not tied to any one trip's own fields), but is edited HERE, right under Dates, for
  // the levels that have one. Omitted entirely (both props) hides the row — only the spot level
  // passes these.
  ratingValue?: number;
  onRatingChange?: (v: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const isLegacy = visit?.id === 'legacy';
  const defaultTitle = defaultTripTitle(entityName, noun, visit ? 0 : existingCount);
  const idRef = useRef(visit?.id ?? Date.now().toString());
  const hasSelector = !!selectorLabel && !!selectorItems?.length;

  const [title,       setTitle      ] = useState(visit?.title ?? '');
  // Empty (not defaulted to today) for a brand-new trip — the Dates row shows its own blank
  // "Add trip dates" placeholder until the user actually picks something (see the JSX below),
  // rather than silently pre-filling today's date as if the user had chosen it.
  const [startDate,   setStartDate  ] = useState(visit?.startDate ?? '');
  const [endDate,     setEndDate    ] = useState<string | undefined>(visit?.endDate);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(visit?.spotIds ?? []));
  const [localPhotos, setLocalPhotos] = useState<PhotoEntry[]>(visit?.photos ?? []);
  // True while a photo drag is in progress in the grid below — disables this whole page's own
  // ScrollView for that window (see the ScrollView prop below), since it was otherwise free to
  // recognize a large drag movement as its own scroll and cancel the tile's drag gesture mid-way.
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const [localNotes,  setLocalNotes ] = useState(visit?.notes ?? '');
  const [editingDates,     setEditingDates    ] = useState(false);
  const [showReviewEditor, setShowReviewEditor] = useState(false);
  // Where the title's last line of text ends (from the hidden mirror's onTextLayout below) —
  // lets the pencil sit right after the actual title instead of a fixed "Tap to edit" row.
  const [titleLastLine, setTitleLastLine] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(true);
  // Multiline title input doesn't reliably auto-grow inside this flex-row header, so its
  // height is driven explicitly off the measured content — otherwise a wrapped second line
  // gets clipped/overlapped by the "Tap to edit" hint sitting right below it.
  const TITLE_LINE_H = 25, TITLE_MAX_LINES = 3;
  // Seeded to the full 3-line height whenever there's an existing title, not the 1-line
  // default — onContentSizeChange doesn't reliably fire (or fires too late) for a multiline
  // TextInput's OWN initial value on remount, so a saved multi-line title opened with its later
  // lines clipped until you typed a character. A shorter title just shrinks back down the
  // instant onContentSizeChange does fire, which happens virtually immediately.
  const [titleInputHeight, setTitleInputHeight] = useState(() => visit?.title ? TITLE_LINE_H * TITLE_MAX_LINES : 28);
  const titleInputRef = useRef<TextInput>(null);
  // Last title that measured within the 3-line cap — a typed character that would wrap to a
  // 4th line gets reverted back to this in onContentSizeChange below (there's no native
  // maxLines-style prop for a multiline TextInput, only a total-character maxLength, which is
  // no longer used here — the limit is lines, not characters).
  const lastFittingTitleRef = useRef(title);

  // Not persisted until Save (see handleSave) — every field setter below calls this right
  // alongside its own setState, so it doubles as "something changed" tracking for both the X
  // button's discard-changes prompt (handleClose) and graying out the Save button until there
  // IS something to save. State (not a ref) because the Save button needs to actually
  // re-render when this flips — every call site already triggers its own setState right next
  // to this one, so this adds no re-renders beyond what was already happening.
  const [dirty, setDirty] = useState(false);
  const commit = () => {
    setDirty(true);
  };
  // Builds the persisted Visit shape from current draft state — called only at actual Save
  // time now (see handleSave), not on every field edit.
  const buildVisit = (): Visit => ({
    id: idRef.current,
    // Saved as the real title when the user never typed one (not left blank for some other
    // component to guess a fallback later) — matches the placeholder text itself, so what
    // you see before typing is exactly what gets saved if you don't.
    title: title.trim() || defaultTitle,
    // Left '' when the user never picked dates — an undated trip, never a made-up date.
    startDate,
    endDate,
    spotIds: selectedIds.size ? Array.from(selectedIds) : undefined,
    photos: localPhotos.length ? localPhotos : undefined,
    notes: localNotes || undefined,
  });
  // At least one of these has to actually have something — a bare title (or nothing at all)
  // isn't a trip worth saving. Combined with `dirty` for the Save button below: `dirty` says
  // something CHANGED, this says there's something WORTH keeping. ratingValue only exists for
  // the levels that pass one (spots) — undefined/0 there just falls through like any other
  // level that never had it.
  const hasContent = !!localNotes || selectedIds.size > 0 || localPhotos.length > 0 || !!startDate || !!ratingValue;
  const canSave = dirty && hasContent;

  // Checking an item off counts it as visited (see utils/visitStatus.ts) — nothing else is written,
  // so it needs no log of its own.
  const toggleItem = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    commit();
  };

  const slide = useRef(new Animated.Value(H)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 0, damping: 24, stiffness: 260, useNativeDriver: true }).start();
  }, []);
  const dismiss = () => {
    Animated.timing(slide, { toValue: H, duration: 280, useNativeDriver: true }).start(onClose);
  };
  // The Save button — persists the draft for real, then closes. Grayed out (see headerSaveBtn
  // below) and a no-op until something's actually changed AND there's real content to save
  // (see canSave/hasContent above).
  const handleSave = () => {
    if (!canSave) return;
    onSave(buildVisit());
    setDirty(false);
    dismiss();
  };
  // The X button — closes WITHOUT persisting, so anything edited since opening (or since the
  // last Save) needs a confirmation first, since it would otherwise be silently lost.
  const handleClose = () => {
    if (!dirty) { dismiss(); return; }
    Alert.alert(
      'Discard changes?',
      `You have unsaved changes to this ${noun.toLowerCase()}.`,
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: dismiss },
      ]
    );
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
      const picked: PhotoEntry[] = result.assets.map(a => ({
        uri: a.uri, width: a.width, height: a.height, assetId: a.assetId ?? undefined,
      }));
      const newEntries = dedupeNewPhotos(localPhotos, picked);
      if (newEntries.length === 0) {
        Alert.alert('Already added', "You've already added every photo you picked.");
        return;
      }
      const updated = [...localPhotos, ...newEntries];
      setLocalPhotos(updated);
      commit();
    }
  };
  const handleDeletePhoto = (index: number) => {
    const updated = localPhotos.filter((_, i) => i !== index);
    setLocalPhotos(updated);
    commit();
  };
  const handleReorderPhotos = (reordered: PhotoEntry[]) => {
    setLocalPhotos(reordered);
    commit();
  };

  const handleDelete = () => {
    Alert.alert(
      `Remove ${noun.toLowerCase()}?`,
      isLegacy
        ? 'This will permanently delete your log and notes.'
        : `This will permanently delete this ${noun.toLowerCase()}’s dates, photos, and notes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => {
            if (isLegacy) onRemoveLegacy?.();
            else onDelete(idRef.current);
            dismiss();
          },
        },
      ]
    );
  };

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[esS.sheet, { transform: [{ translateY: slide }] }]}>

        {/* Header — title doubles as this module's own trip-name field. */}
        <View style={[esS.header, { paddingTop: insets.top + 10 }]}>
          {/* Creating a brand-new trip (visit === null) — "Cancel" reads as abandoning
              something not yet created, where the X (used once a trip already exists) reads
              more like closing/dismissing an existing one. */}
          {visit ? (
            <Pressable onPress={handleClose} style={esS.closeBtn} hitSlop={12}>
              <X size={18} color="#111827" />
            </Pressable>
          ) : (
            <Pressable onPress={handleClose} style={esS.cancelBtn} hitSlop={12}>
              <Text style={esS.cancelBtnTxt}>Cancel</Text>
            </Pressable>
          )}
          <View style={esS.headerTitleEditWrap}>
            {/* Hidden mirror of the title, same font/width, used only to MEASURE the height the
                real box below should be — TextInput's own onContentSizeChange is unreliable when
                content SHRINKS (fires fine on growth, often doesn't on deletion), which left the
                real box stuck at its tallest-ever height even after the title shrank back down.
                A plain Text's onLayout doesn't have that asymmetry — it fires on every change,
                growing or shrinking, so it's used as the source of truth instead. */}
            <Text
              style={esS.headerTitleMirror}
              pointerEvents="none"
              onLayout={e => {
                const h = e.nativeEvent.layout.height;
                // A 4th line's worth of height (with a little slack for rounding) means the
                // character just typed pushed it over the 3-line cap — revert to the last title
                // that still fit, rather than accept it and let the box clip it invisibly.
                if (h > TITLE_LINE_H * TITLE_MAX_LINES + 6) {
                  setTitle(lastFittingTitleRef.current);
                  setTitleInputHeight(TITLE_LINE_H * TITLE_MAX_LINES);
                } else {
                  lastFittingTitleRef.current = title;
                  setTitleInputHeight(h);
                }
              }}
              onTextLayout={e => {
                const lines = e.nativeEvent.lines;
                if (lines.length) setTitleLastLine(lines[lines.length - 1]);
              }}
            >
              {title || ' '}
            </Text>
            <TextInput
              ref={titleInputRef}
              style={[esS.headerTitleInput, {
                height: Math.min(TITLE_LINE_H * TITLE_MAX_LINES + 3, Math.max(28, titleInputHeight)),
              }]}
              value={title}
              onChangeText={text => {
                // Multiline TextInputs insert a literal "\n" for the return key instead of
                // firing a distinct submit event on iOS — stripping it here and blurring is
                // what makes Enter "complete" the field instead of adding a new line.
                const hadNewline = text.includes('\n');
                const clean = hadNewline ? text.replace(/\n/g, '') : text;
                setTitle(clean);
                commit();
                if (hadNewline) titleInputRef.current?.blur();
              }}
              placeholder={defaultTitle}
              placeholderTextColor="#9CA3AF"
              textAlign="center"
              multiline
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => titleInputRef.current?.blur()}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
            />
            {title ? (
              // Title has real text — just the pencil, positioned right after the actual last
              // letter (via titleLastLine, measured off the hidden mirror above), no "Tap to
              // edit" row taking up its own line underneath. Hidden entirely while actually
              // editing — there's no need to hint "you can edit this" while already doing so.
              !titleFocused && titleLastLine && (
                <Pencil
                  size={16}
                  color="#D1D5DB"
                  style={[esS.headerTitlePencil, {
                    left: titleLastLine.x + titleLastLine.width + 8,
                    top: titleLastLine.y + (titleLastLine.height - 16) / 2,
                  }]}
                />
              )
            ) : (
              // No title typed yet — keep the explicit "Tap to edit" hint, since there's no
              // actual title text for a lone pencil to sit "after".
              <View style={esS.headerTitleHintRow}>
                <Pencil size={10} color="#9CA3AF" />
                <Text style={esS.headerTitleHintTxt}>Tap to edit</Text>
              </View>
            )}
          </View>
          <Pressable
            style={[esS.headerSaveBtn, !canSave && esS.headerSaveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={8}
          >
            <Text style={[esS.headerSaveBtnTxt, !canSave && esS.headerSaveBtnTxtDisabled]}>Save</Text>
          </Pressable>
        </View>

        {/* No KeyboardAvoidingView here (deliberately) — this screen has no TextInput of its
            own; the only text entry ("Notes") opens ReviewEditModal, a SEPARATE stacked
            Modal with its own keyboard handling. A KeyboardAvoidingView protecting nothing
            was also the actual bug behind "the edit page doesn't appear": flex:1 on a
            KeyboardAvoidingView measures unreliably specifically when nested inside a
            statusBarTranslucent Modal (a known RN interaction) — it was collapsing to zero
            height, so everything below the header (a sibling, unaffected) silently vanished
            while the map showed through underneath. */}
        <View style={{ flex: 1 }}>
          <GHScrollView
            contentContainerStyle={esS.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!photoDragActive}
            scrollEventThrottle={16}
            // A swipe that starts on a photo and scrolls this page must not open the photo viewer.
            onScroll={notePhotoGridScroll}
          >

            {/* ── DATES ───────────────────────────────────────────── */}
            <View style={esS.section}>
              <View style={esS.sectionHead}>
                <Text style={esS.sectionTitle}>Dates</Text>
              </View>
              {/* The whole row opens the editor now, not just a small "Edit" link — bigger,
                  easier target, with a chevron (the same "tap to open" affordance used
                  elsewhere in this file) replacing the old text link. */}
              <Pressable style={esS.dateRow} onPress={() => setEditingDates(true)}>
                {startDate ? (
                  <>
                    <View style={esS.dateIconBadge}>
                      <Calendar size={19} color="#059669" />
                    </View>
                    <View style={esS.dateTextCol}>
                      {/* Same abbreviation rules as the read-only My Visit card
                          (fmtVisitRangeShort) — same-month/same-year ranges collapse instead of
                          spelling out both full dates. */}
                      <Text style={esS.dateRangeTxt} numberOfLines={1}>
                        {fmtVisitRangeShort({ id: idRef.current, startDate, endDate })}
                      </Text>
                      {(() => {
                        const days = visitDayCount({ id: idRef.current, startDate, endDate });
                        if (days == null || (days === 1 && hideSingleDayCount)) return null;
                        return <Text style={esS.dateSubTxt}>{days} day{days === 1 ? '' : 's'}</Text>;
                      })()}
                    </View>
                  </>
                ) : (
                  // Blank state, before any date has actually been picked for a new visit — a
                  // gray (not green) calendar badge, same shape/size as the filled-in state, and
                  // "Add trip/visit dates" instead of a real range.
                  <>
                    <View style={[esS.dateIconBadge, esS.dateIconBadgeEmpty]}>
                      <Calendar size={19} color="#9CA3AF" />
                    </View>
                    <View style={esS.dateTextCol}>
                      <Text style={esS.dateRangePh}>Add {noun.toLowerCase()} dates</Text>
                    </View>
                  </>
                )}
                <Pencil size={16} color="#D1D5DB" />
              </Pressable>
            </View>

            {onRatingChange && (
              <View style={esS.section}>
                <View style={esS.sectionHead}>
                  <Text style={esS.sectionTitle}>Your Rating</Text>
                </View>
                <View style={esS.ratingRow}>
                  {/* onRatingChange itself writes straight to the caller's store (rating lives
                      outside the local draft/Save system, unlike every other field here) — commit()
                      alongside it just marks the Save button's own dirty/hasContent state so it
                      reflects a rating that was just set, same as every other field's own setter does. */}
                  <StarRating value={ratingValue ?? 0} onChange={r => { onRatingChange(r); commit(); }} />
                </View>
              </View>
            )}

            {/* ── NOTES ───────────────────────────────────────────── */}
            <View style={esS.section}>
              <View style={esS.sectionHead}>
                <Text style={esS.sectionTitle}>Notes</Text>
              </View>
              {/* Same row layout as the Dates row — text/placeholder flex:1, pencil pinned to
                  the right edge and vertically centered by the row itself. */}
              <Pressable style={esS.reviewPreview} onPress={() => setShowReviewEditor(true)}>
                {localNotes
                  ? <Text style={esS.reviewPreviewTxt}>{localNotes}</Text>
                  : <Text style={esS.reviewPreviewPh}>Add {noun.toLowerCase()} notes</Text>}
                <Pencil size={16} color="#D1D5DB" />
              </Pressable>
            </View>

            {/* ── SELECTOR (e.g. "Spots Visited" / "Destinations Visited") ─── */}
            {hasSelector && (
              <View style={esS.section}>
                <Pressable style={esS.sectionHead} onPress={() => setSelectorOpen(o => !o)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={esS.sectionTitle}>{selectorLabel}</Text>
                    {selectedIds.size > 0 && (
                      <View style={esS.spotsCountBadge}>
                        <Text style={esS.spotsCountBadgeTxt}>{selectedIds.size}</Text>
                      </View>
                    )}
                  </View>
                  <ChevronDown
                    size={16} color="#9CA3AF"
                    style={{ transform: [{ rotate: selectorOpen ? '180deg' : '0deg' }] }}
                  />
                </Pressable>
                {selectorOpen && (
                  <GHScrollView style={esS.spotsList} bounces={false} showsVerticalScrollIndicator nestedScrollEnabled>
                    {selectorItems!.map(item => {
                      const checked = selectedIds.has(item.id);
                      return (
                        <Pressable key={item.id} style={esS.spotRow} onPress={() => toggleItem(item.id)}>
                          <View style={esS.spotRowThumb}>
                            {item.renderThumb()}
                          </View>
                          <Text style={esS.spotRowTxt} numberOfLines={1}>{item.name}</Text>
                          <View style={[esS.spotToggle, checked && esS.spotToggleOn]}>
                            {checked && <Check size={11} color="white" strokeWidth={2.5} />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </GHScrollView>
                )}
              </View>
            )}

            {/* ── PHOTOS ──────────────────────────────────────────── */}
            <View style={esS.section}>
              <View style={esS.sectionHead}>
                <Text style={esS.sectionTitle}>Photos</Text>
                {/* Redundant with PhotoCollage's own big "Add your travel photos" placeholder
                    while empty — only becomes the add-more affordance (in place of the
                    collage's own, suppressed via hideAddMore below) once there's at least
                    one photo. */}
                {localPhotos.length > 0 && (
                  <Pressable style={esS.photosAddBtn} onPress={handleAddPhoto} hitSlop={8}>
                    <Text style={esS.photosAddBtnTxt}>Add +</Text>
                  </Pressable>
                )}
              </View>
              <PhotoCollage photos={localPhotos} onAdd={handleAddPhoto} onDelete={handleDeletePhoto} onReorder={handleReorderPhotos} onDragActiveChange={setPhotoDragActive} hideAddMore expandAll />
            </View>

            {/* ── DELETE ──────────────────────────────────────────── */}
            <Pressable style={esS.deleteTripBtn} onPress={handleDelete}>
              <Trash2 size={15} color="#EF4444" />
              <Text style={esS.deleteTripBtnTxt}>Remove {noun}</Text>
            </Pressable>

          </GHScrollView>
        </View>
      </Animated.View>

      {editingDates && (
        <VisitDateRangeModal
          visit={{ id: idRef.current, title, startDate, endDate }}
          noun={noun}
          onDone={v => {
            setStartDate(v.startDate);
            setEndDate(v.endDate);
            commit();
            setEditingDates(false);
          }}
          onCancel={() => setEditingDates(false)}
        />
      )}
      {showReviewEditor && (
        <ReviewEditModal
          value={localNotes}
          title={`${noun} Notes`}
          placeholder={`Write about your ${noun.toLowerCase()}…`}
          onSave={text => {
            setLocalNotes(text);
            commit();
            setShowReviewEditor(false);
          }}
          onCancel={() => setShowReviewEditor(false)}
        />
      )}
    </Modal>
  );
}
const esS = StyleSheet.create({
  sheet:         { ...StyleSheet.absoluteFill, backgroundColor: '#F3F4F6' } as any,
  // No fixed height anywhere in this row or its children — it's sized by its tallest child
  // (the title column, which itself grows/shrinks with the title's own 1–3 line height), so the
  // whole header genuinely grows and shrinks with the title rather than clipping it.
  // alignItems:'flex-start' (not 'center') keeps the close/save buttons anchored near the
  // title's FIRST line as it grows, instead of drifting down to the vertical center of an
  // increasingly tall block.
  header:        { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between',
                   paddingHorizontal:16, paddingBottom:16,
                   borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'#E5E7EB',
                   backgroundColor:'white' },
  // marginTop nudges these down slightly to line up with the title's first line now that the
  // header row is flex-start (not vertically centering them against the whole, possibly
  // multi-line, title block anymore).
  closeBtn:      { width:36, height:36, borderRadius:18, backgroundColor:'#F3F4F6',
                   alignItems:'center', justifyContent:'center', marginTop:2 },
  // Text alternative to closeBtn for a brand-new trip (see JSX comment) — sized to content
  // rather than the X button's fixed circle, but kept the same marginTop so it lines up.
  cancelBtn:     { justifyContent:'center', marginTop:2, minHeight:36 },
  cancelBtnTxt:  { fontSize:15, color:'#6B7280', fontWeight:'600' },
  headerSaveBtn:   { paddingHorizontal:14, paddingVertical:8, borderRadius:14,
                     backgroundColor:'#059669', marginTop:2 },
  headerSaveBtnDisabled: { backgroundColor:'#E5E7EB' },
  headerSaveBtnTxt:{ fontSize:14, fontWeight:'700', color:'white' },
  headerSaveBtnTxtDisabled: { color:'#9CA3AF' },
  headerTitle:   { fontSize:21, fontWeight:'800', color:'#111827', flex:1, textAlign:'center',
                   marginHorizontal:12 },
  headerTitleEditWrap:{ flex:1, alignItems:'center', marginHorizontal:12 },
  headerTitleInput:{ fontSize:21, fontWeight:'800', color:'#111827', padding:0, maxWidth:'100%',
                     textAlignVertical:'center', lineHeight:25,
                     borderBottomWidth:1, borderBottomColor:'#D1D5DB', borderStyle:'dashed',
                     paddingBottom:3 },
  // Same font metrics/width as headerTitleInput (not its border/height/color, which don't
  // affect wrapping) — absolutely positioned and invisible so it never affects layout or shows
  // to the user; it exists purely so onLayout can measure it (see JSX comment above).
  headerTitleMirror:{ position:'absolute', top:0, left:0, right:0,
                      fontSize:21, fontWeight:'800', lineHeight:25, paddingBottom:3,
                      textAlign:'center', opacity:0 },
  headerTitleHintRow:{ flexDirection:'row', alignItems:'center', gap:3, marginTop:3 },
  headerTitleHintTxt:{ fontSize:10, color:'#9CA3AF' },
  headerTitlePencil:{ position:'absolute' },
  scrollContent: { padding:16, gap:16, paddingBottom:60 },
  section:       { backgroundColor:'white', borderRadius:18, overflow:'hidden',
                   borderWidth:1, borderColor:'#F0F1F3' },
  sectionHead:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                   paddingHorizontal:16, paddingTop:16, paddingBottom:12,
                   borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'#F0F1F3' },
  sectionTitle:  { fontSize:15, fontWeight:'700', color:'#111827' },
  photosAddBtn:  { paddingHorizontal:10, paddingVertical:5, borderRadius:12,
                   backgroundColor:'#ECFDF5', alignItems:'center', justifyContent:'center' },
  photosAddBtnTxt:{ fontSize:12, fontWeight:'700', color:'#16A34A' },
  dateRow:       { flexDirection:'row', alignItems:'center', gap:12,
                   paddingHorizontal:16, paddingVertical:14 },
  ratingRow:     { paddingHorizontal:16, paddingVertical:14 },
  // Same green as headerSaveBtn/spotToggleOn.
  dateIconBadge: { width:40, height:40, borderRadius:20, backgroundColor:'#ECFDF5',
                   alignItems:'center', justifyContent:'center' },
  // Blank state (no date picked yet) — gray instead of green.
  dateIconBadgeEmpty: { backgroundColor:'#F3F4F6' },
  dateTextCol:   { flex:1, gap:2 },
  dateRangeTxt:  { fontSize:16, fontWeight:'700', color:'#111827' },
  dateRangePh:   { fontSize:16, fontWeight:'700', color:'#C4C9D4' },
  dateSubTxt:    { fontSize:13, color:'#9CA3AF' },
  spotsCountBadge:   { minWidth:20, height:20, borderRadius:6, backgroundColor:'#E5E7EB',
                       paddingHorizontal:5, alignItems:'center', justifyContent:'center' },
  spotsCountBadgeTxt:{ fontSize:11, fontWeight:'800', color:'#6B7280', lineHeight:14 },
  // Caps the list at exactly 5 rows tall (spotRow's own height: 36px thumb + 24px vertical
  // padding + its hairline top border) — a 6th item then scrolls into view instead of the
  // section just growing forever.
  spotsList:         { maxHeight: 5 * (36 + 24 + StyleSheet.hairlineWidth) },
  spotRow:           { flexDirection:'row', alignItems:'center', gap:10,
                       paddingHorizontal:16, paddingVertical:12,
                       borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:'#F3F4F6' },
  spotRowThumb:      { width:36, height:36, borderRadius:9, overflow:'hidden', backgroundColor:'#F3F4F6' },
  spotRowTxt:        { flex:1, fontSize:14, fontWeight:'700', color:'#111827' },
  spotToggle:        { width:22, height:22, borderRadius:11, borderWidth:2, borderColor:'#D1D5DB',
                       alignItems:'center', justifyContent:'center' },
  // Same green as headerSaveBtn (the Save button up top).
  spotToggleOn:      { backgroundColor:'#059669', borderColor:'#059669' },
  // Same row shape as dateRow — content flex:1, pencil pinned to the right edge and vertically
  // centered by the row itself.
  reviewPreview:    { flexDirection:'row', alignItems:'center', gap:12,
                      paddingHorizontal:16, paddingVertical:14, minHeight:80 },
  reviewPreviewTxt: { flex:1, fontSize:15, color:'#374151', lineHeight:24 },
  reviewPreviewPh:  { flex:1, fontSize:15, color:'#C4C9D4', lineHeight:24 },
  deleteTripBtn:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6,
                      paddingVertical:14, marginTop:4 },
  deleteTripBtnTxt: { fontSize:14, fontWeight:'600', color:'#EF4444' },
});
