// Shared sliding-sheet primitives used by both DestinationSheet and SpotSheet.
// Extracted so the two sheets stay visually and behaviourally in sync.
import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image,
  Dimensions, Modal, TextInput, Platform, KeyboardAvoidingView, Alert, Animated,
} from 'react-native';
import { ScrollView as GHScrollView, Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Camera } from 'lucide-react-native';
import type { PhotoEntry, Visit } from '../../types';

const { width: W, height: H } = Dimensions.get('window');

// ── Photo picking ────────────────────────────────────────────────────────────
// Filters a freshly-picked batch down to photos not already in the collage, so re-picking the
// same photo (the OS picker has no memory of a previous session's selection, and doesn't let
// us pre-tick anything in its own UI) doesn't add it twice. Matched by assetId when both sides
// have one (the reliable media-library identity — `uri` alone can differ between two picks of
// the very same photo), falling back to `uri` only when assetId is unavailable on either side.
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
  if (!p) return 'Unknown';
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
  if (!s) return 'Unknown';
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
export function VisitDateRangeModal({ visit, withTitle, onDone, onCancel }: {
  visit: Visit | null;
  // Only used by the standalone "Add Visit" flow — creating a brand new visit that's kept
  // separate from the shared destination edit page, so its title has to be captured here
  // instead. Editing an existing visit's dates (from within that shared page) never sets
  // this, since that page's own header already owns title editing.
  withTitle?: boolean;
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
            <Text style={pS.title}>{hasEnd ? 'Trip Dates' : 'Trip Date'}</Text>
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
            <Text style={vdS.toggleTxt}>Add end date</Text>
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

export function PhotoGalleryModal({ photos, subtitle, onClose }: {
  photos: PhotoEntry[];
  // Optional context line under the title (e.g. the visit's own date range) — the modal itself
  // is destination-agnostic, so the caller supplies whatever names this specific photo set.
  subtitle?: string;
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
            <Text style={pgS.headerTitle} numberOfLines={1}>{photos.length} photo{photos.length === 1 ? '' : 's'}</Text>
            {!!subtitle && <Text style={pgS.headerSub} numberOfLines={1}>{subtitle}</Text>}
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
  const [index, setIndex] = useState(initialIndex);
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, []);
  const dismiss = () => {
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(onClose);
  };

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[pvS.overlay, { opacity }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // contentOffset (not scrollTo in an effect) — positions correctly on the very first
          // frame, before anything is painted, so there's no visible jump from photo 0 to the
          // tapped index.
          contentOffset={{ x: initialIndex * W, y: 0 }}
          onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
        >
          {photos.map((p, i) => (
            <View key={p.assetId ?? p.uri ?? i} style={pvS.page}>
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

export function ReviewEditModal({ value, onSave, onCancel }: {
  value: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const insets = useSafeAreaInsets();
  const atLimit = text.length >= REVIEW_MAX;
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={onCancel}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[rvS.card, { paddingBottom: insets.bottom + 12 }]}>
            <View style={rvS.headerRow}>
              <Pressable onPress={onCancel} hitSlop={12}>
                <Text style={rvS.cancel}>Cancel</Text>
              </Pressable>
              <Text style={rvS.title}>My Review</Text>
              <Pressable onPress={() => onSave(text)} hitSlop={12}>
                <Text style={rvS.save}>Save</Text>
              </Pressable>
            </View>
            <TextInput
              style={rvS.input}
              value={text}
              onChangeText={setText}
              placeholder="Write about your visit…"
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
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const rvS = StyleSheet.create({
  card:          { backgroundColor:'white', borderTopLeftRadius:28, borderTopRightRadius:28,
                   paddingHorizontal:20, paddingTop:16 },
  headerRow:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  title:         { fontSize:15, fontWeight:'700', color:'#111827' },
  cancel:        { fontSize:15, color:'#6B7280', minWidth:56 },
  save:          { fontSize:15, fontWeight:'700', color:'#059669', minWidth:56, textAlign:'right' },
  input:         { fontSize:15, color:'#111827', lineHeight:24, minHeight:120, maxHeight:260 },
  charCount:     { fontSize:12, color:'#9CA3AF', textAlign:'right', paddingTop:6, paddingBottom:4 },
  charCountLimit:{ color:'#EF4444' },
});
