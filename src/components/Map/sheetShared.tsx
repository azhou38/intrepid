// Shared sliding-sheet primitives used by both DestinationSheet and SpotSheet.
// Extracted so the two sheets stay visually and behaviourally in sync.
import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image,
  Dimensions, Modal, TextInput, Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Camera } from 'lucide-react-native';
import type { PhotoEntry, Visit } from '../../types';

const { width: W } = Dimensions.get('window');

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

export function PhotoCollage({ photos, onAdd, onDelete, hideAddMore }: {
  photos: PhotoEntry[];
  onAdd: () => void;
  onDelete?: (index: number) => void;
  hideAddMore?: boolean;
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

  const tile = (uri: string, idx: number, style?: object) => (
    <View style={[{ overflow: 'hidden' }, style]}>
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
    const visibleBlocks = Math.min(totalBlocks, BLOCK_MAX);
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
      {renderTiles()}
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
