import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image, Alert,
  Animated, PanResponder, Dimensions, Modal, TextInput, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Heart, Calendar, Star, MapPin, Camera, Pencil, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store';
import { CONTINENT_COLORS } from '../../types';
import type { Destination, PhotoEntry, Visit } from '../../types';
import { SPOTS } from '../../data/spots';
import { flag } from '../../utils/stats';
import { photoCache } from '../../utils/photoCache';
import {
  getCommunityRating, getWeatherData, getCrowdData,
  crowdColor, crowdLabel,
} from '../../utils/travelData';

const { height: H, width: W } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;  // fully off-screen
const HERO_H      = Math.round(H * 0.52);
const COMPACT_H   = 164;     // handle (28) + card row height
const COLLAPSED_Y = Math.max(0, H - (Platform.OS === 'ios' ? 88 : 64) - COMPACT_H);

// Gradient: 200 strips × 2px, t^1.8 curve — deeper scrim for text legibility
const GRAD_N = 200, GRAD_H = 2;
const GRADIENT_STRIPS = Array.from({ length: GRAD_N }, (_, i) => {
  const t = i / (GRAD_N - 1);
  return +(t ** 1.8 * 0.94).toFixed(4);
});


function CompactStarRow({ value, color }: { value: number; color: string }) {
  const whole = Math.round(value);
  return (
    <View style={{ flexDirection: 'row', gap: 1.5 }}>
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={11} color={color} fill={n <= whole ? color : 'none'} strokeWidth={1.5} />
      ))}
    </View>
  );
}

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

// ── Date helpers ──────────────────────────────────────────────────────────────
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const THIS_YEAR = new Date().getFullYear();
const ITEM_H = 48;
const P_MONTHS   = MO;
const P_DAYS     = Array.from({ length: 31 }, (_, i) => String(i+1).padStart(2,'0'));
const P_DAYS_OPT = ['–', ...P_DAYS]; // '–' = no specific day (stored as '00')
const P_YEARS    = Array.from({ length: 50 }, (_, i) => String(THIS_YEAR - i));

function parseDateStr(s: string) {
  if (!s) return null;
  const p = s.split('-');
  if (p.length !== 3) return null;
  const mi = parseInt(p[1], 10) - 1;
  if (mi < 0 || mi > 11) return null;
  return { year: p[0], monthLabel: MO[mi], day: p[2].padStart(2, '0') };
}
function fmtDatePart(dateStr: string): string {
  const p = parseDateStr(dateStr);
  if (!p) return 'Unknown';
  if (p.day === '00') return `${p.monthLabel} ${p.year}`;
  return `${p.monthLabel} ${parseInt(p.day, 10)}, ${p.year}`;
}
function fmtVisitRange(visit: Visit): string {
  const start = fmtDatePart(visit.startDate);
  if (!visit.endDate) return start;
  return `${start} – ${fmtDatePart(visit.endDate)}`;
}
// Compact range used in the read-only My Visit card only
function fmtVisitRangeShort(visit: Visit): string {
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
function WheelCol({ data, value, onChange, width }: {
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
function DatePickerModal({ value, onDone, onCancel }: { value:string; onDone:(v:string)=>void; onCancel:()=>void }) {
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
function VisitDateRangeModal({ visit, onDone, onCancel }: {
  visit: Visit | null;
  onDone: (v: Visit) => void;
  onCancel: () => void;
}) {
  const now = new Date();
  const s = visit?.startDate ? parseDateStr(visit.startDate) : null;
  const e = visit?.endDate   ? parseDateStr(visit.endDate)   : null;
  const startDayInit = s ? (s.day === '00' ? '–' : s.day) : '–';
  const endDayInit   = e ? (e.day === '00' ? '–' : e.day) : '–';
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
    }
    onDone({ id: visit?.id ?? Date.now().toString(), startDate, endDate });
  };
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={pS.overlay}>
        <View style={pS.card}>
          <View style={pS.header}>
            <Pressable onPress={onCancel} hitSlop={12}><Text style={pS.cancel}>Cancel</Text></Pressable>
            <Text style={pS.title}>Trip Dates</Text>
            <Pressable onPress={done} hitSlop={12}><Text style={pS.done}>Done</Text></Pressable>
          </View>
          <View style={vdS.section}>
            <Text style={vdS.label}>FROM</Text>
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
});

// ── Full-screen visit edit sheet ──────────────────────────────────────────────
function VisitEditSheet({ destination, onClose }: { destination: Destination; onClose: () => void }) {
  const insets       = useSafeAreaInsets();
  const saved        = useStore(s => s.savedDestinations[destination.id]);
  const updateSaved  = useStore(s => s.updateSaved);

  const localVisits: Visit[] = saved?.visits
    ?? (saved?.visitDate ? [{ id: 'legacy', startDate: saved.visitDate }] : []);
  const localPhotos: PhotoEntry[] = saved?.photos ?? [];

  const [localNotes,       setLocalNotes      ] = useState(saved?.notes  ?? '');
  const [localRating,      setLocalRating     ] = useState(saved?.rating ?? 0);
  const [editingVisit,     setEditingVisit    ] = useState<Visit | null | 'new'>(null);
  const [showReviewEditor, setShowReviewEditor] = useState(false);

  const slide = useRef(new Animated.Value(H)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 0, damping: 24, stiffness: 260, useNativeDriver: true }).start();
  }, []);
  const dismiss = () => {
    Animated.timing(slide, { toValue: H, duration: 280, useNativeDriver: true }).start(onClose);
  };

  const handleSaveVisit = (v: Visit) => {
    const base = localVisits.filter(x => x.id !== 'legacy');
    const idx  = base.findIndex(x => x.id === v.id);
    const updated = idx >= 0 ? base.map(x => x.id === v.id ? v : x) : [...base, v];
    updated.sort((a, b) => b.startDate.localeCompare(a.startDate));
    updateSaved(destination.id, { visits: updated, visitDate: updated[0]?.startDate });
    setEditingVisit(null);
  };
  const handleDeleteVisit = (id: string) => {
    const updated = localVisits.filter(v => v.id !== id);
    updateSaved(destination.id, { visits: updated, visitDate: updated[0]?.startDate });
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
      const newEntries: PhotoEntry[] = result.assets.map(a => ({ uri: a.uri, width: a.width, height: a.height }));
      updateSaved(destination.id, { photos: [...localPhotos, ...newEntries] });
    }
  };
  const handleDeletePhoto = (index: number) => {
    const updated = localPhotos.filter((_, i) => i !== index);
    updateSaved(destination.id, { photos: updated });
  };

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[esS.sheet, { transform: [{ translateY: slide }] }]}>

        {/* Header */}
        <View style={[esS.header, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={dismiss} style={esS.closeBtn} hitSlop={12}>
            <X size={18} color="#111827" />
          </Pressable>
          <Text style={esS.headerTitle}>{destination.name}</Text>
          <View style={{ width: 36 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={esS.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── VISIT DATES ─────────────────────────────────────── */}
            <View style={esS.section}>
              <View style={esS.sectionHead}>
                <Text style={esS.sectionTitle}>Visit Dates</Text>
                <Pressable style={esS.addBtn} onPress={() => setEditingVisit('new')}>
                  <Plus size={13} color="#6366F1" />
                  <Text style={esS.addBtnTxt}>Add visit</Text>
                </Pressable>
              </View>
              {localVisits.length === 0 ? (
                <Pressable style={esS.emptyBanner} onPress={() => setEditingVisit('new')}>
                  <Calendar size={15} color="#9CA3AF" />
                  <Text style={esS.emptyBannerTxt}>Tap to add visit dates</Text>
                </Pressable>
              ) : (
                localVisits.map((v, i) => (
                  <View key={v.id} style={[esS.visitRow, i > 0 && esS.visitRowBorder]}>
                    <View style={esS.visitDateBadge}>
                      <Calendar size={13} color="#6366F1" />
                      <Text style={esS.visitDateTxt}>{fmtVisitRange(v)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Pressable onPress={() => setEditingVisit(v)} hitSlop={8}>
                        <Text style={esS.editTxt}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteVisit(v.id)} hitSlop={8}>
                        <Text style={esS.deleteTxt}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* ── RATING ──────────────────────────────────────────── */}
            <View style={esS.section}>
              <View style={esS.sectionHead}>
                <Text style={esS.sectionTitle}>My Rating</Text>
              </View>
              <View style={esS.ratingWrap}>
                <HalfStarRow value={localRating} onChange={n => {
                  setLocalRating(n);
                  updateSaved(destination.id, { rating: n });
                }} size={34} />
              </View>
              {localRating > 0 && (
                <Text style={esS.ratingLabel}>
                  {Math.round(localRating)} – {STAR_LABELS[Math.round(localRating)] ?? ''}
                </Text>
              )}
            </View>

            {/* ── PHOTOS ──────────────────────────────────────────── */}
            <View style={esS.section}>
              <View style={esS.sectionHead}>
                <Text style={esS.sectionTitle}>Photos</Text>
              </View>
              <PhotoCollage photos={localPhotos} onAdd={handleAddPhoto} onDelete={handleDeletePhoto} />
            </View>

            {/* ── REVIEW ──────────────────────────────────────────── */}
            <View style={esS.section}>
              <View style={esS.sectionHead}>
                <Text style={esS.sectionTitle}>My Review</Text>
              </View>
              <Pressable style={esS.reviewPreview} onPress={() => setShowReviewEditor(true)}>
                {localNotes
                  ? <Text style={esS.reviewPreviewTxt}>{localNotes}</Text>
                  : <Text style={esS.reviewPreviewPh}>Write about your trip…</Text>}
                <View style={esS.reviewEditHint}>
                  <Pencil size={11} color="#9CA3AF" />
                  <Text style={esS.reviewEditHintTxt}>Tap to edit</Text>
                </View>
              </Pressable>
            </View>

            {/* ── SAVE BUTTON ─────────────────────────────────────── */}
            <Pressable style={esS.saveBtn} onPress={dismiss}>
              <Text style={esS.saveBtnTxt}>Save Changes</Text>
            </Pressable>

          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      {editingVisit !== null && (
        <VisitDateRangeModal
          visit={editingVisit === 'new' ? null : editingVisit}
          onDone={handleSaveVisit}
          onCancel={() => setEditingVisit(null)}
        />
      )}
      {showReviewEditor && (
        <ReviewEditModal
          value={localNotes}
          onSave={text => {
            setLocalNotes(text);
            updateSaved(destination.id, { notes: text || undefined });
            setShowReviewEditor(false);
          }}
          onCancel={() => setShowReviewEditor(false)}
        />
      )}
    </Modal>
  );
}
const esS = StyleSheet.create({
  sheet:         { ...StyleSheet.absoluteFillObject, backgroundColor: '#F3F4F6' } as any,
  header:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                   paddingHorizontal:16, paddingBottom:12,
                   borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'#E5E7EB',
                   backgroundColor:'white' },
  closeBtn:      { width:36, height:36, borderRadius:18, backgroundColor:'#F3F4F6',
                   alignItems:'center', justifyContent:'center' },
  headerTitle:   { fontSize:17, fontWeight:'700', color:'#111827', flex:1, textAlign:'center' },
  scrollContent: { padding:16, gap:16, paddingBottom:60 },
  section:       { backgroundColor:'white', borderRadius:18, overflow:'hidden',
                   borderWidth:1, borderColor:'#F0F1F3' },
  sectionHead:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                   paddingHorizontal:16, paddingTop:16, paddingBottom:12,
                   borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'#F0F1F3' },
  sectionTitle:  { fontSize:15, fontWeight:'700', color:'#111827' },
  addBtn:        { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:5,
                   borderRadius:10, backgroundColor:'#EEF2FF' },
  addBtnTxt:     { fontSize:12, fontWeight:'600', color:'#6366F1' },
  emptyBanner:   { flexDirection:'row', alignItems:'center', gap:10,
                   paddingHorizontal:16, paddingVertical:14 },
  emptyBannerTxt:{ fontSize:14, color:'#9CA3AF' },
  visitRow:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                   paddingHorizontal:16, paddingVertical:14 },
  visitRowBorder:{ borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:'#F0F1F3' },
  visitDateBadge:{ flexDirection:'row', alignItems:'center', gap:8 },
  visitDateTxt:  { fontSize:14, fontWeight:'600', color:'#374151' },
  editTxt:       { fontSize:13, fontWeight:'600', color:'#6366F1' },
  deleteTxt:     { fontSize:13, fontWeight:'600', color:'#EF4444' },
  ratingWrap:    { flexDirection:'row', alignItems:'center', gap:14,
                   paddingHorizontal:16, paddingTop:18, paddingBottom:8 },
  ratingLabel:      { fontSize:14, fontWeight:'500', color:'#6B7280',
                      paddingHorizontal:16, paddingBottom:18 },
  ratingNum:        { fontSize:17, fontWeight:'700', color:'#111827' },
  reviewPreview:    { paddingHorizontal:16, paddingTop:12, paddingBottom:16, minHeight:80 },
  reviewPreviewTxt: { fontSize:15, color:'#374151', lineHeight:24 },
  reviewPreviewPh:  { fontSize:15, color:'#C4C9D4', lineHeight:24 },
  reviewEditHint:   { flexDirection:'row', alignItems:'center', gap:4, marginTop:10 },
  reviewEditHintTxt:{ fontSize:12, color:'#9CA3AF' },
  saveBtn:          { backgroundColor:'#059669', borderRadius:16, paddingVertical:15,
                      alignItems:'center', marginTop:4 },
  saveBtnTxt:       { fontSize:16, fontWeight:'700', color:'white' },
});

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

// ── Star rating labels ────────────────────────────────────────────────────────
const STAR_LABELS: Record<number, string> = {
  1: 'Not for me',
  2: 'Some highlights',
  3: 'Glad I went',
  4: 'Highly recommend',
  5: 'Truly unforgettable',
};

// ── Star rating row (whole stars only; half-star display preserved for legacy) ─
function HalfStarRow({ value, onChange, size = 22 }: { value:number; onChange:(n:number)=>void; size?: number }) {
  const GAP = 4;
  return (
    <View style={{ flexDirection:'row', gap:GAP }}>
      {[1,2,3,4,5].map(n => {
        const filled     = value >= n;
        const halfFilled = !filled && value >= n - 0.5;
        return (
          <View key={n} style={{ width:size, height:size }}>
            <Star size={size} color="#FBBF24" fill="none" strokeWidth={1.5} />
            {(filled || halfFilled) && (
              <View style={{
                position:'absolute', left:0, top:0,
                width: filled ? size : size / 2, height:size, overflow:'hidden',
              }} pointerEvents="none">
                <Star size={size} color="#FBBF24" fill="#FBBF24" strokeWidth={1.5} />
              </View>
            )}
            <Pressable
              style={{ position:'absolute', left:0, top:0, width:size, height:size }}
              onPress={() => onChange(n)}
            />
          </View>
        );
      })}
    </View>
  );
}

function filledStars(r: number) {
  const full  = Math.floor(r);
  const half  = r - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ── Spot photo card (shared: Spots Visited + Highlights) ─────────────────────
function SpotPhotoCard({ spot, color }: {
  spot: { id: string; name: string; icon: string };
  color: string;
}) {
  const cacheKey = `spot_${spot.id}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(photoCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (photoCache.has(cacheKey)) return;
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(spot.name)}`)
      .then(r => r.json())
      .then(d => {
        const url = d?.thumbnail?.source ?? d?.originalimage?.source ?? null;
        if (url) { photoCache.set(cacheKey, url); setPhotoUrl(url); }
      })
      .catch(() => {});
  }, [spot.id]);

  return (
    <View style={st.spcCard}>
      {photoUrl
        ? <Image source={{ uri: photoUrl }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} resizeMode="cover" />
        : <View style={[st.spcPlaceholder, { backgroundColor: color + '22' }]}>
            <Text style={st.spcPlaceholderIcon}>{spot.icon}</Text>
          </View>
      }
      <View style={st.spcOverlay} />
      <Text style={st.spcName} numberOfLines={2}>{spot.name}</Text>
    </View>
  );
}

// ── Photo collage ─────────────────────────────────────────────────────────────
// inner width = screen - 32 (content padding) - 24 (wrap padding)
const COLLAGE_INNER_W = W - 32 - 24;
const COLLAGE_H = 196;

function PhotoCollage({ photos, onAdd, onDelete, hideAddMore }: {
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

  const delBtn = (idx: number) => onDelete ? (
    <Pressable style={pcS.delBtn} onPress={() => onDelete(idx)} hitSlop={6}>
      <View style={pcS.delBtnInner}><X size={9} color="white" strokeWidth={3} /></View>
    </Pressable>
  ) : null;

  const tile = (uri: string, idx: number, style?: object) => (
    <View style={[{ overflow: 'hidden' }, style]}>
      <Image source={{ uri }} style={pcS.imgFill} resizeMode="cover" />
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
        <View style={{ height: COLLAGE_H, gap:3 }}>
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
    // 5+ photos
    const extra = count - 3;
    return (
      <View style={{ height: COLLAGE_H, flexDirection:'row', gap:3 }}>
        {tile(photos[0].uri, 0, { flex: 3, borderRadius: 10 })}
        <View style={{ flex:2, gap:3 }}>
          {tile(photos[1].uri, 1, { flex: 1, borderRadius: 8 })}
          <View style={{ flex:1, borderRadius:8, overflow:'hidden' }}>
            {tile(photos[2].uri, 2)}
            {extra > 0 && (
              <View pointerEvents="none" style={pcS.moreOverlay}>
                <Text style={pcS.moreTxt}>+{extra}</Text>
              </View>
            )}
          </View>
        </View>
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
  imgFill:    { ...StyleSheet.absoluteFillObject } as any,
  wrap:       { paddingHorizontal:12, paddingTop:12 },
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
  moreOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.5)',
                alignItems:'center', justifyContent:'center' } as any,
  moreTxt:    { fontSize:18, fontWeight:'800', color:'white' },
  delBtn:     { position:'absolute', top:5, right:5, zIndex:10 },
  delBtnInner:{ width:20, height:20, borderRadius:10, backgroundColor:'rgba(0,0,0,0.55)',
                alignItems:'center', justifyContent:'center' },
});

// ── Review edit popup (floats above keyboard) ─────────────────────────────────
const REVIEW_MAX = 500;

function ReviewEditModal({ value, onSave, onCancel }: {
  value: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const insets = useSafeAreaInsets();
  const atLimit = text.length >= REVIEW_MAX;
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      {/* Outer container fills the modal — backdrop absolutely covers everything including card corners */}
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
              placeholder="Write about your trip…"
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

// ── Main ─────────────────────────────────────────────────────────────────────
interface Props {
  destination: Destination;
  onClose: () => void;
  onExpand?: () => void;
  onCollapse?: () => void;

}

export default function DestinationSheet({ destination, onClose, onExpand, onCollapse }: Props) {
  const insets            = useSafeAreaInsets();
  const savedDestinations = useStore(s => s.savedDestinations);
  const saveDestination   = useStore(s => s.saveDestination);
  const unsaveDestination = useStore(s => s.unsaveDestination);
  const updateSaved       = useStore(s => s.updateSaved);

  const saved      = savedDestinations[destination.id];
  const color      = CONTINENT_COLORS[destination.continent];
  const spots      = SPOTS.filter(s => s.destinationId === destination.id);
  const isVisited  = saved?.type === 'visited';
  const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');

  const communityRating = useMemo(() => getCommunityRating(destination.id), [destination.id]);
  const weatherData     = useMemo(() =>
    getWeatherData(destination.coordinates.latitude, destination.category),
  [destination.id]);
  const crowdData       = useMemo(() =>
    getCrowdData(destination.continent, destination.category, destination.coordinates.latitude),
  [destination.id]);
  const currentMonthIdx = new Date().getMonth();
  const bestMonths      = crowdData.filter(c => c.isBest).map(c => c.month).join(', ');

  const [photoUrl,      setPhotoUrl    ] = useState<string | null>(photoCache.get(destination.id) ?? null);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [activeTab,     setActiveTab    ] = useState<'visit' | 'about'>('visit');

  // Derive visits from store (with legacy visitDate fallback)
  const localVisits: Visit[] = saved?.visits
    ?? (saved?.visitDate ? [{ id: 'legacy', startDate: saved.visitDate }] : []);
  const localPhotos: PhotoEntry[] = saved?.photos ?? [];

  // Tab slide animation: 0 = visit tab, -W = about tab
  // useNativeDriver: false required so stopAnimation gives accurate JS value during drag
  const tabSlideAnim    = useRef(new Animated.Value(0)).current;
  const activeTabRef    = useRef<'visit' | 'about'>('visit');
  const tabSwipeBaseRef = useRef(0);

  // Derived indicator position for the tab bar underline (0% = visit, 50% = about)
  const tabIndicatorLeft = useMemo(() => tabSlideAnim.interpolate({
    inputRange: [-W, 0],
    outputRange: ['50%', '0%'],
    extrapolate: 'clamp',
  }), []);

  const switchTabRef = useRef<(tab: 'visit' | 'about') => void>(() => {});
  switchTabRef.current = (newTab: 'visit' | 'about') => {
    if (activeTabRef.current === newTab) return;
    activeTabRef.current = newTab;
    setActiveTab(newTab);
    Animated.spring(tabSlideAnim, {
      toValue: newTab === 'visit' ? 0 : -W,
      useNativeDriver: false,
      damping: 26,
      stiffness: 230,
    }).start();
  };

  const snapTabToNearest = () => {
    Animated.spring(tabSlideAnim, {
      toValue: activeTabRef.current === 'visit' ? 0 : -W,
      useNativeDriver: false, damping: 26, stiffness: 230,
    }).start();
  };

  const tabSwipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 2.5,
      onPanResponderGrant: () => {
        tabSlideAnim.stopAnimation(v => { tabSwipeBaseRef.current = v; });
      },
      onPanResponderMove: (_, { dx }) => {
        const next = Math.max(-W, Math.min(0, tabSwipeBaseRef.current + dx));
        tabSlideAnim.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const projected = tabSwipeBaseRef.current + dx;
        const goTo: 'visit' | 'about' = (vx < -0.4 || projected < -W / 2) ? 'about' : 'visit';
        if (goTo !== activeTabRef.current) {
          switchTabRef.current(goTo);
        } else {
          // Already on this tab — just snap content back (switchTabRef would early-return)
          snapTabToNearest();
        }
      },
      onPanResponderTerminate: () => {
        // Gesture stolen (e.g. by ScrollView) — snap back to current tab
        snapTabToNearest();
      },
    })
  ).current;

  // Wikipedia photo
  useEffect(() => {
    if (photoCache.has(destination.id)) return;
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(destination.name)}`)
      .then(r => r.json())
      .then(d => {
        const url = d?.originalimage?.source ?? d?.thumbnail?.source ?? null;
        if (url) { photoCache.set(destination.id, url); setPhotoUrl(url); }
      })
      .catch(() => {});
  }, [destination.id]);

  // ── Unified sheet: two snap points ──────────────────────────────────────────
  // COLLAPSED_Y = compact card visible at bottom; FULL_POS = full-screen
  const snapStateRef = useRef<'collapsed' | 'full'>('collapsed');
  const slideAnim    = useRef(new Animated.Value(CLOSE_POS)).current;
  const lastPos      = useRef(COLLAPSED_Y);
  const scrollRef    = useRef<ScrollView>(null);
  const scrollY      = useRef(0);

  // Dynamic collapsed Y — updated when compact card is measured via onLayout
  const collapsedYRef   = useRef(COLLAPSED_Y);
  const collapsedYAnimV = useRef(new Animated.Value(COLLAPSED_Y)).current;
  // Compact card translates: 0 when collapsed, slides off top as sheet expands.
  // Clamped at 0 so spring overshoot / downward drag never shifts the card below y=0,
  // which would expose the dark hero behind it.
  const compactRaw = useMemo(() => Animated.subtract(slideAnim, collapsedYAnimV), []);
  const compactTranslateY = useMemo(() => compactRaw.interpolate({
    inputRange: [-H, 0],
    outputRange: [-H, 0],
    extrapolate: 'clamp',
  }), []);
  // Pill color: dark on white card (collapsed), white on dark hero (full)
  const pillBg = useMemo(() => slideAnim.interpolate({
    inputRange:  [FULL_POS, COLLAPSED_Y],
    outputRange: ['rgba(255,255,255,0.65)', 'rgba(0,0,0,0.18)'],
    extrapolate: 'clamp',
  }), []);

  // Backdrop: transparent when collapsed, dark when full-screen
  const backdropOpacity = useMemo(() => slideAnim.interpolate({
    inputRange: [FULL_POS, COLLAPSED_Y],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  }), []);

  // Slide in from off-screen to collapsed on mount
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(slideAnim, {
      toValue: collapsedYRef.current, useNativeDriver: false, damping: 28, stiffness: 260,
    }).start();
  }, []);

  // Reset to collapsed when destination changes
  useEffect(() => {
    snapStateRef.current = 'collapsed';
    slideAnim.stopAnimation();
    slideAnim.setValue(CLOSE_POS);
    const cy = collapsedYRef.current;
    lastPos.current = cy;
    Animated.spring(slideAnim, {
      toValue: cy, useNativeDriver: false, damping: 28, stiffness: 260,
    }).start();
    activeTabRef.current = 'visit';
    setActiveTab('visit');
    tabSlideAnim.setValue(0);
  }, [destination.id]);

  // Use refs so panResponder (created once) always calls the latest version
  const snapToFullRef = useRef(() => {});
  snapToFullRef.current = () => {
    snapStateRef.current = 'full';
    lastPos.current = FULL_POS;
    onExpand?.();
    Animated.spring(slideAnim, { toValue: FULL_POS, useNativeDriver: false, damping: 30, stiffness: 280 }).start();
  };

  const snapToCollapsedRef = useRef(() => {});
  snapToCollapsedRef.current = () => {
    const cy = collapsedYRef.current;
    snapStateRef.current = 'collapsed';
    lastPos.current = cy;
    onCollapse?.();
    Animated.spring(slideAnim, { toValue: cy, useNativeDriver: false, damping: 28, stiffness: 260 }).start();
  };

  const dismissSheetRef = useRef(() => {});
  dismissSheetRef.current = () => {
    Animated.timing(slideAnim, { toValue: CLOSE_POS, duration: 280, useNativeDriver: false })
      .start(() => onClose());
  };

  const hapticFiredRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) => {
        if (Math.abs(dx) >= Math.abs(dy)) return false;
        // Collapsed: capture any vertical drag on the card
        if (snapStateRef.current === 'collapsed') return true;
        // Full: only capture downward drag when scroll is at top
        return scrollY.current <= 1 && dy > 6;
      },
      onMoveShouldSetPanResponder: () => false,
      onPanResponderGrant: () => {
        hapticFiredRef.current = false;
        slideAnim.stopAnimation(v => { lastPos.current = v; });
      },
      onPanResponderMove: (_, { dy }) => {
        if (Math.abs(dy) > 8 && !hapticFiredRef.current) {
          hapticFiredRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const clampMax = snapStateRef.current === 'collapsed' ? CLOSE_POS : collapsedYRef.current;
        slideAnim.setValue(Math.max(FULL_POS, Math.min(clampMax, lastPos.current + dy)));
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        const pos = lastPos.current + dy;
        const cy  = collapsedYRef.current;
        if (snapStateRef.current === 'collapsed') {
          if (vy < -0.5 || pos < cy - 60) snapToFullRef.current();
          else if (vy > 0.5 || pos > cy + 40) dismissSheetRef.current();
          else snapToCollapsedRef.current();
        } else {
          if (vy > 0.8 || pos > H * 0.25) snapToCollapsedRef.current();
          else snapToFullRef.current();
        }
      },
    })
  ).current;

  // Actions
  const handleMarkVisited = () => {
    if (isVisited) {
      Alert.alert(
        'Remove visit?',
        'This will permanently delete your log, notes, and rating for this destination.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove', style: 'destructive',
            onPress: () => {
              if (isWishlist) {
                // Keep wishlist entry, just strip visited data
                saveDestination(destination.id, 'wishlist', { isWishlisted: true });
              } else {
                unsaveDestination(destination.id);
              }
            },
          },
        ]
      );
      return;
    }
    saveDestination(destination.id, 'visited', {});
    setShowEditSheet(true);
  };
  const handleWishlist = () => {
    if (isWishlist) {
      if (isVisited) {
        updateSaved(destination.id, { isWishlisted: false });
      } else {
        unsaveDestination(destination.id);
      }
    } else {
      if (saved) {
        updateSaved(destination.id, { isWishlisted: true });
      } else {
        saveDestination(destination.id, 'wishlist', { isWishlisted: true });
      }
    }
  };
  const heroTopRowTop = insets.top + 14;

  const userRating      = saved?.rating ?? 0;
  const userRatingWhole = Math.round(userRating);

  // Bookmark tabs positioned just above the sheet's top edge
  const bookmarkTop = useMemo(() => Animated.subtract(slideAnim, 22), []);
  // Country back button: 68px above card top (above bookmark tab area + gap)

  return (
    <View style={st.backdrop} pointerEvents="box-none">
      {/* Dark overlay — fades in as sheet expands, never affects sheet visibility */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropOpacity }]}
      />
      {/* Tap overlay to collapse (only active when fully expanded) */}
      <Animated.View
        pointerEvents={snapStateRef.current === 'full' ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToCollapsedRef.current()} />
      </Animated.View>

      <Animated.View {...panResponder.panHandlers} style={[st.sheet, { top: slideAnim }]}>

        {/* ── FULL CONTENT — fills entire sheet, hero starts at y=0 ──────── */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
        {/* Tab swipe handler wraps ScrollView so it intercepts horizontal gestures first */}
        <View style={{ flex: 1 }} {...(isVisited ? tabSwipePan.panHandlers : {})}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          scrollEnabled
          bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── HERO ───────────────────────────────────────────────────── */}
          <View style={[st.hero, { backgroundColor: color, height: HERO_H - insets.bottom }]}>
            {photoUrl && <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}

            {/* Ambient scrim so text is always legible */}
            <View pointerEvents="none" style={st.heroScrim} />

            {/* Gradient: darkens toward the bottom */}
            <View pointerEvents="none" style={st.gradWrap}>
              {GRADIENT_STRIPS.map((opacity, i) => (
                <View key={i} style={{
                  position:'absolute', left:0, right:0,
                  bottom: (GRAD_N - 1 - i) * GRAD_H, height: GRAD_H + 0.5,
                  backgroundColor: `rgba(0,0,0,${opacity})`,
                }} />
              ))}
            </View>

            {/* Top row — close button only */}
            <Animated.View style={[st.heroTopRow, { top: heroTopRowTop }]}>
              <Pressable style={st.heroIconBtn} onPress={() => snapToCollapsedRef.current()} hitSlop={12}>
                <X size={16} color="rgba(255,255,255,0.92)" />
              </Pressable>
            </Animated.View>

            {/* Bottom stack: pushed to hero bottom via justifyContent on parent */}
            <View style={st.heroBottomStack}>
              <View style={st.heroContent}>
                <Text style={st.heroName} numberOfLines={1}>{destination.name}</Text>

                <View style={st.heroMeta}>
                  <Text style={st.heroMetaTxt}>{flag(destination.countryCode)}  {destination.country}</Text>
                  <Text style={st.heroMetaDot}> · </Text>
                  <Text style={st.heroMetaTxt}>{destination.continent}</Text>
                </View>

                {!!destination.tagline && (
                  <Text style={st.heroTagline} numberOfLines={2}>{destination.tagline}</Text>
                )}

                {/* Rating + spots row */}
                <View style={st.commRatingRow}>
                  <Text style={st.commRatingStar}>★</Text>
                  <Text style={st.commRatingNum}>{communityRating.rating}</Text>
                  <Text style={st.commRatingSep}>  |</Text>
                  <Text style={st.commRatingCount}>{communityRating.count} ratings</Text>
                  <Text style={st.commRatingSep}>  |</Text>
                  <MapPin size={12} color="rgba(255,255,255,0.80)" />
                  <Text style={st.commRatingCount}>{spots.length} spots</Text>
                </View>
              </View>

              {/* ── ACTION PILLS — overlaid on hero photo ──────────────── */}
              <View style={st.heroPillsRow}>
                <Pressable
                  style={[st.heroPill, isVisited ? st.heroPillVisitedOn : st.heroPillVisitedOff]}
                  onPress={handleMarkVisited}>
                  <Check size={14} color="white" strokeWidth={2.5} />
                  <Text style={[st.heroPillTxt, { color: 'white' }]}>
                    {isVisited ? 'Visited' : 'Mark Visited'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[st.heroPill, isWishlist ? st.heroPillWishlistOn : st.heroPillWishlistOff]}
                  onPress={handleWishlist}>
                  <Heart size={14} color="white" fill={isWishlist ? 'white' : 'none'} strokeWidth={isWishlist ? 0 : 2} />
                  <Text style={[st.heroPillTxt, { color: 'white' }]}>
                    {isWishlist ? 'Wishlisted' : 'Add to Wishlist'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── TAB BAR — visited destinations only ──────────────────── */}
          {isVisited && (
            <View style={st.tabBar}>
              <Pressable style={st.tabBtn} onPress={() => switchTabRef.current('visit')}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                  <Text style={[st.tabBtnTxt, activeTab === 'visit' && st.tabBtnTxtActive]}>
                    {localVisits.length > 1 ? 'My Visits' : 'My Visit'}
                  </Text>
                  {localVisits.length > 1 && (
                    <View style={[st.tabVisitBadge, activeTab === 'visit' && st.tabVisitBadgeActive]}>
                      <Text style={[st.tabVisitBadgeTxt, activeTab === 'visit' && st.tabVisitBadgeTxtActive]}>
                        {localVisits.length}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
              <Pressable style={st.tabBtn} onPress={() => switchTabRef.current('about')}>
                <Text style={[st.tabBtnTxt, activeTab === 'about' && st.tabBtnTxtActive]}>About</Text>
              </Pressable>
              {/* Sliding green indicator */}
              <Animated.View style={[st.tabIndicator, { left: tabIndicatorLeft }]} />
            </View>
          )}

          {/* ── CONTENT ────────────────────────────────────────────────── */}
          <View style={[st.content, !isVisited && st.contentRounded]}>

            {isVisited ? (
              /* ── SLIDE TRACK for tabs ─────────────────────────────────── */
              <View style={st.slideTrack}>
                <Animated.View
                  style={[st.slideRow, { transform: [{ translateX: tabSlideAnim }] }]}
                >

                  {/* ── MY VISIT PANEL ─────────────────────────────────── */}
                  <View style={st.slidePanel}>

                    {/* MEMORY CARD — read-only display */}
                    <View style={st.memCard}>

                      {/* Row 1: Visit date(s) + Edit button */}
                      <View style={st.memTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={st.memDateCaption}>
                            {localVisits.length > 1 ? 'LAST VISITED' : 'VISITED'}
                          </Text>
                          {localVisits.length > 0 ? (
                            <View style={{ flexDirection:'row', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <Text style={st.memDateVal}>{fmtVisitRangeShort(localVisits[0])}</Text>
                              {localVisits.length > 1 && (
                                <View style={st.memVisitBadge}>
                                  <Text style={st.memVisitBadgeTxt}>{localVisits.length} visits</Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <Text style={st.memDateEmpty}>No dates logged</Text>
                          )}
                        </View>
                        <Pressable style={st.memEditBtn} onPress={() => setShowEditSheet(true)}>
                          <Pencil size={12} color="#6366F1" />
                          <Text style={st.memEditBtnTxt}>Edit</Text>
                        </Pressable>
                      </View>

                      {/* Row 2: Rating */}
                      {(saved?.rating ?? 0) > 0 && (
                        <>
                          <View style={st.memDivider} />
                          <View style={st.memSectionRow}>
                            <Text style={st.memSectionLabel}>YOUR RATING</Text>
                            <View style={st.memRatingRow}>
                              <HalfStarRow value={saved?.rating ?? 0} onChange={() => {}} size={18} />
                              {(saved?.rating ?? 0) > 0 && (
                                <Text style={st.memRatingLabel}>
                                  {Math.round(saved?.rating ?? 0)} – {STAR_LABELS[Math.round(saved?.rating ?? 0)] ?? ''}
                                </Text>
                              )}
                            </View>
                          </View>
                        </>
                      )}

                      {/* Row 3: Photos collage */}
                      <>
                        <View style={st.memDivider} />
                        <Text style={st.memSectionLabelPad}>YOUR PHOTOS</Text>
                        <PhotoCollage
                          photos={localPhotos}
                          onAdd={() => setShowEditSheet(true)}
                        />
                      </>

                      {/* Row 4: Review snippet */}
                      <>
                        <View style={st.memDivider} />
                        <Pressable style={st.memNotesDisplay} onPress={() => setShowEditSheet(true)}>
                          <Text style={st.memSectionLabel}>YOUR REVIEW</Text>
                          {saved?.notes
                            ? <Text style={[st.memNotesTxt, { marginTop: 4 }]} numberOfLines={3}>{saved.notes}</Text>
                            : <Text style={[st.memNotesPh, { marginTop: 4 }]}>Tap to write about your trip…</Text>}
                        </Pressable>
                      </>

                    </View>

                    {/* SPOTS VISITED */}
                    {spots.length > 0 && (
                      <View style={st.section}>
                        <View style={st.spotsHeaderRow}>
                          <View style={st.spotsLabel}>
                            <MapPin size={13} color="#16A34A" />
                            <Text style={st.spotsLabelTxt}>{spots.length} spots visited</Text>
                          </View>
                          <Pressable hitSlop={8}>
                            <Text style={st.spotsAddMore}>+ add more</Text>
                          </Pressable>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                          contentContainerStyle={st.spcRow}>
                          {spots.map(spot => (
                            <SpotPhotoCard key={spot.id} spot={spot} color={color} />
                          ))}
                        </ScrollView>
                      </View>
                    )}

                  </View>

                  {/* ── ABOUT PANEL ────────────────────────────────────── */}
                  <View style={st.slidePanel}>

                    {!!destination.description && (
                      <View style={st.section}>
                        <Text style={st.sectionTitle}>Why Visit {destination.name}?</Text>
                        <Text style={st.aboutTxt}>{destination.description}</Text>
                      </View>
                    )}

                    {!!destination.whyVisit && (
                      <View style={st.section}>
                        <Text style={st.sectionTitle}>Why People Love It</Text>
                        <View style={st.whyCard}>
                          {destination.whyVisit.map((reason, i) => (
                            <View key={i} style={[st.whyRow, i < destination.whyVisit!.length-1 && st.whyRowBorder]}>
                              <View style={[st.whyBadge, { backgroundColor: color + '18' }]}>
                                <Text style={[st.whyBadgeNum, { color }]}>{i+1}</Text>
                              </View>
                              <Text style={st.whyTxt}>{reason}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {spots.length > 0 && (
                      <View style={st.section}>
                        <Text style={st.sectionTitle}>Highlights</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                          contentContainerStyle={st.spcRow}>
                          {spots.map(spot => (
                            <SpotPhotoCard key={spot.id} spot={spot} color={color} />
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    <View style={st.section}>
                      <Text style={st.sectionTitle}>Best Time to Visit</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        contentContainerStyle={st.bestTimeRow}>
                        {weatherData.map((w, i) => {
                          const crowd = crowdData[i];
                          return (
                            <View key={i} style={[
                              st.bestTimeCard,
                              i === currentMonthIdx && st.bestTimeCardNow,
                              crowd?.isBest && st.bestTimeCardBest,
                            ]}>
                              <Text style={[st.bestTimeMonth, i === currentMonthIdx && st.bestTimeMonthNow]}>{w.month}</Text>
                              <Text style={st.bestTimeIcon}>{w.icon}</Text>
                              <Text style={[st.bestTimeTemp, i === currentMonthIdx && st.bestTimeTempNow]}>{w.tempC}°</Text>
                              {crowd && <View style={[st.bestTimeCrowdDot, { backgroundColor: crowdColor(crowd.level) }]} />}
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>

                    <View style={st.section}>
                      <Text style={st.sectionTitle}>Crowd Calendar</Text>
                      <View style={st.heatmapRow}>
                        {crowdData.map((c, i) => (
                          <View key={i} style={st.heatmapCol}>
                            <View style={[st.heatmapSquare, { backgroundColor: crowdColor(c.level) }]} />
                            <Text style={[st.heatmapLbl, i === currentMonthIdx && st.heatmapLblNow]}>{c.month}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={st.crowdLegend}>
                        {[1,3,5].map(l => (
                          <View key={l} style={st.crowdLegendItem}>
                            <View style={[st.crowdLegendDot, { backgroundColor: crowdColor(l) }]} />
                            <Text style={st.crowdLegendTxt}>{crowdLabel(l)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                  </View>
                </Animated.View>
              </View>
            ) : (
              /* ── NON-VISITED: About content only ─────────────────────── */
              <>
                {!!destination.description && (
                  <View style={st.section}>
                    <Text style={st.sectionTitle}>Why Visit {destination.name}?</Text>
                    <Text style={st.aboutTxt}>{destination.description}</Text>
                  </View>
                )}

                {!!destination.whyVisit && (
                  <View style={st.section}>
                    <Text style={st.sectionTitle}>Why People Love It</Text>
                    <View style={st.whyCard}>
                      {destination.whyVisit.map((reason, i) => (
                        <View key={i} style={[st.whyRow, i < destination.whyVisit!.length-1 && st.whyRowBorder]}>
                          <View style={[st.whyBadge, { backgroundColor: color + '18' }]}>
                            <Text style={[st.whyBadgeNum, { color }]}>{i+1}</Text>
                          </View>
                          <Text style={st.whyTxt}>{reason}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {spots.length > 0 && (
                  <View style={st.section}>
                    <Text style={st.sectionTitle}>Highlights</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={st.spcRow}>
                      {spots.map(spot => (
                        <SpotPhotoCard key={spot.id} spot={spot} color={color} />
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={st.section}>
                  <Text style={st.sectionTitle}>Best Time to Visit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={st.bestTimeRow}>
                    {weatherData.map((w, i) => {
                      const crowd = crowdData[i];
                      return (
                        <View key={i} style={[
                          st.bestTimeCard,
                          i === currentMonthIdx && st.bestTimeCardNow,
                          crowd?.isBest && st.bestTimeCardBest,
                        ]}>
                          <Text style={[st.bestTimeMonth, i === currentMonthIdx && st.bestTimeMonthNow]}>{w.month}</Text>
                          <Text style={st.bestTimeIcon}>{w.icon}</Text>
                          <Text style={[st.bestTimeTemp, i === currentMonthIdx && st.bestTimeTempNow]}>{w.tempC}°</Text>
                          {crowd && <View style={[st.bestTimeCrowdDot, { backgroundColor: crowdColor(crowd.level) }]} />}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={st.section}>
                  <Text style={st.sectionTitle}>Crowd Calendar</Text>
                  <View style={st.heatmapRow}>
                    {crowdData.map((c, i) => (
                      <View key={i} style={st.heatmapCol}>
                        <View style={[st.heatmapSquare, { backgroundColor: crowdColor(c.level) }]} />
                        <Text style={[st.heatmapLbl, i === currentMonthIdx && st.heatmapLblNow]}>{c.month}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={st.crowdLegend}>
                    {[1,3,5].map(l => (
                      <View key={l} style={st.crowdLegendItem}>
                        <View style={[st.crowdLegendDot, { backgroundColor: crowdColor(l) }]} />
                        <Text style={st.crowdLegendTxt}>{crowdLabel(l)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

          </View>
        </ScrollView>
        </View>{/* end tabSwipePan wrapper */}
        </KeyboardAvoidingView>
        </View>{/* end full-content wrapper */}

        {/* ── COMPACT CARD — absolute overlay, slides off top as sheet expands ── */}
        <Animated.View
          style={{
            position: 'absolute', left: 0, right: 0, top: 0,
            backgroundColor: 'white',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            ...(isVisited ? { borderTopWidth: 3, borderTopColor: '#059669' } : isWishlist ? { borderTopWidth: 3, borderTopColor: '#DB2777' } : {}),
            transform: [{ translateY: compactTranslateY }],
          }}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h < 20) return;
            const newCY = Math.max(0, H - (Platform.OS === 'ios' ? 88 : 64) - h);
            if (Math.abs(newCY - collapsedYRef.current) < 2) return;
            collapsedYRef.current = newCY;
            collapsedYAnimV.setValue(newCY);
            if (snapStateRef.current === 'collapsed') {
              lastPos.current = newCY;
              Animated.spring(slideAnim, { toValue: newCY, useNativeDriver: false, damping: 40, stiffness: 400 }).start();
            }
          }}
        >
          {/* Pill */}
          <View pointerEvents="none" style={st.pillRow}>
            <Animated.View style={[st.pill, { backgroundColor: pillBg }]} />
          </View>



          {/* Compact row */}
          <Pressable style={st.compactRow} onPress={() => snapToFullRef.current()}>
            {/* Thumbnail */}
            <View style={[st.compactThumb, { backgroundColor: color + '22' }]}>
              {photoUrl
                ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                : <Text style={st.compactThumbIcon}>{destination.icon ?? '📍'}</Text>}
            </View>

            {/* Info */}
            <View style={st.compactInfo}>
              <Text style={st.compactName} numberOfLines={1}>{destination.name}</Text>
              <Text style={st.compactMeta} numberOfLines={1}>
                {flag(destination.countryCode)}{'  '}{destination.country} · {destination.continent}
              </Text>
              <View style={st.compactStatsRow}>
                {isVisited ? (
                  <>
                    <Text style={st.compactRatingNum}>{userRatingWhole} </Text>
                    <CompactStarRow value={userRating} color="#059669" />
                    {spots.length > 0 && <Text style={st.compactRatingTxt}> · {spots.length} spots visited</Text>}
                  </>
                ) : (
                  <>
                    <Text style={st.compactRatingNum}>{communityRating.rating.toFixed(1)} </Text>
                    <CompactStarRow value={communityRating.rating} color="#FBBF24" />
                    <Text style={st.compactRatingTxt}> ({communityRating.count})</Text>
                    {spots.length > 0 && <Text style={st.compactRatingTxt}> · {spots.length} spots</Text>}
                  </>
                )}
              </View>
            </View>

            {/* Open button */}
            <View style={[st.compactOpenBtn, isVisited && st.compactOpenBtnVisited]}>
              <Text style={st.compactOpenBtnTxt}>Open</Text>
            </View>
          </Pressable>
        </Animated.View>

      </Animated.View>

      {/* Bookmark tabs — backdrop sibling, synced via direct slideAnim */}
      {(isVisited || isWishlist) && (
        <Animated.View
          pointerEvents="none"
          style={[st.bookmarkTabsRow, { top: bookmarkTop }]}
        >
          {isVisited && (
            <View style={[st.bookmarkTab, st.bookmarkTabVisited]}>
              <Text style={st.bookmarkTabTxt}>Visited</Text>
            </View>
          )}
          {isWishlist && (
            <View style={[st.bookmarkTab, st.bookmarkTabWishlist]}>
              <Text style={st.bookmarkTabTxt}>Wishlist</Text>
            </View>
          )}
        </Animated.View>
      )}


      {showEditSheet && (
        <VisitEditSheet destination={destination} onClose={() => setShowEditSheet(false)} />
      )}
    </View>
  );
}

const CROWD_CHART_H = 64;

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex:200, elevation:200 },
  sheet: {
    position:'absolute', left:0, right:0, bottom:0, overflow:'hidden',
    borderTopLeftRadius:24, borderTopRightRadius:24, backgroundColor:'#F9FAFB',
  },

  // ── Compact card header ─────────────────────────────────────────────────────
  compactRow: {
    flexDirection:'row', alignItems:'flex-start',
    paddingTop:28, paddingBottom:16, paddingHorizontal:16,
    backgroundColor:'white',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor:'#F0F1F3',
  },
  compactThumb: {
    width:66, height:66, borderRadius:14,
    overflow:'hidden', alignItems:'center', justifyContent:'center', flexShrink:0,
  },
  compactThumbIcon: { fontSize:24 },
  compactInfo: { flex:1, paddingHorizontal:12, paddingTop:2 },
  compactName:      { fontSize:18, fontWeight:'800', color:'#111827', marginBottom:2 },
  compactMeta:      { fontSize:12, color:'#6B7280', marginBottom:5 },
  compactStatsRow:  { flexDirection:'row', alignItems:'center', marginBottom:6, flexWrap:'wrap' },
  compactRatingNum: { fontSize:12, fontWeight:'700', color:'#111827' },
  compactRatingTxt: { fontSize:11, color:'#9CA3AF' },
  // Filing-cabinet bookmark tabs (protrude above top-left edge of compact card)

  bookmarkTabsRow:     { position:'absolute', top:0, left:28, flexDirection:'row', gap:6, zIndex:201 },
  bookmarkTab:         { paddingHorizontal:11, paddingTop:5, paddingBottom:5,
                         borderTopLeftRadius:9, borderTopRightRadius:9 },
  bookmarkTabVisited:  { backgroundColor:'#059669' },
  bookmarkTabWishlist: { backgroundColor:'#DB2777' },
  bookmarkTabTxt:      { fontSize:11, fontWeight:'700', color:'white' },
  compactOpenBtn: {
    backgroundColor:'#111827', borderRadius:12,
    paddingHorizontal:14, paddingVertical:9, flexShrink:0, marginTop:2, alignSelf:'flex-start',
  },
  compactOpenBtnVisited: { backgroundColor:'#059669' },
  compactOpenBtnTxt: { fontSize:13, fontWeight:'700', color:'white' },

  // Pill
  pillRow: { position:'absolute', top:10, left:0, right:0, alignItems:'center', zIndex:10 },
  pill:    { width:36, height:4, borderRadius:2 },

  // Hero — flex-end pushes heroBottomStack to the bottom; photo/gradient/topRow are absolute
  hero:    { width:'100%', height: HERO_H, overflow:'hidden', justifyContent:'flex-end' },
  heroScrim: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.18)' },
  gradWrap:{ position:'absolute', left:0, right:0, bottom:0, height: GRAD_N * GRAD_H },

  // Top row — uses Animated.View so top interpolates between half/full positions
  heroTopRow: {
    position:'absolute', left:14, right:14,
    flexDirection:'row', justifyContent:'space-between', alignItems:'center', zIndex:10,
  },
  heroIconBtn: {
    width:34, height:34, borderRadius:17,
    backgroundColor:'rgba(0,0,0,0.35)', alignItems:'center', justifyContent:'center',
  },


  // Hero bottom stack — normal flow child, pushed to bottom by parent justifyContent
  heroBottomStack: {},

  // Hero text content
  heroContent: { paddingHorizontal:20, paddingBottom:14, paddingTop:8, gap:10 },
  heroName:    { fontSize:42, fontFamily:'PlayfairDisplay_700Bold', color:'white', letterSpacing:-0.5 },
  heroMeta:    { flexDirection:'row', alignItems:'center' },
  heroMetaTxt: { fontSize:14, color:'rgba(255,255,255,0.90)', fontWeight:'500' },
  heroMetaDot: { fontSize:14, color:'rgba(255,255,255,0.40)' },
  heroTagline: { fontSize:14, color:'rgba(255,255,255,0.78)', lineHeight:20, fontWeight:'400', letterSpacing:0.1 },

  // Community rating + spots row
  commRatingRow:  { flexDirection:'row', alignItems:'center', gap:5 },
  commRatingStar: { fontSize:15, color:'#FBBF24' },
  commRatingNum:  { fontSize:15, fontWeight:'700', color:'white' },
  commRatingSep:  { fontSize:13, color:'rgba(255,255,255,0.40)' },
  commRatingCount:{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:'500' },

  // Action pills (inside hero, overlaid on photo)
  heroPillsRow:        { flexDirection:'row', gap:10, paddingHorizontal:20, paddingBottom:38, paddingTop:10 },
  heroPill:            { flexDirection:'row', alignItems:'center', gap:7, paddingVertical:10, paddingHorizontal:20, borderRadius:28, borderWidth:1.5 },
  heroPillVisitedOn:   { backgroundColor:'#16A34A', borderColor:'transparent' },
  heroPillVisitedOff:  { backgroundColor:'rgba(0,0,0,0.38)', borderColor:'rgba(255,255,255,0.35)' },
  heroPillWishlistOn:  { backgroundColor:'#DB2777', borderColor:'transparent' },
  heroPillWishlistOff: { backgroundColor:'rgba(0,0,0,0.38)', borderColor:'rgba(255,255,255,0.35)' },
  heroPillTxt:         { fontSize:14, fontWeight:'700' },

  // Tab bar — sits between hero and content for visited destinations
  tabBar: {
    flexDirection:'row',
    backgroundColor:'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor:'#E5E7EB',
    zIndex: 1,
    overflow: 'hidden',
  },
  tabBtn:              { flex:1, paddingVertical:15, alignItems:'center' },
  tabBtnTxt:           { fontSize:15, fontWeight:'600', color:'#9CA3AF' },
  tabBtnTxtActive:     { color:'#111827' },
  tabVisitBadge:       { minWidth:20, height:20, borderRadius:6, backgroundColor:'#E5E7EB',
                         paddingHorizontal:5, alignItems:'center', justifyContent:'center' },
  tabVisitBadgeActive: { backgroundColor:'#16A34A' },
  tabVisitBadgeTxt:    { fontSize:11, fontWeight:'800', color:'#6B7280', lineHeight:14 },
  tabVisitBadgeTxtActive:{ color:'white' },
  // Animated sliding underline
  tabIndicator: {
    position:'absolute', bottom:0, width:'50%', height:2.5,
    backgroundColor:'#16A34A', borderRadius:2,
  },

  // Content area
  content:        { backgroundColor:'#F3F4F6', padding:16, gap:16 },
  contentRounded: { borderTopLeftRadius:24, borderTopRightRadius:24, marginTop:-24 },

  // Tab slide track
  slideTrack: { overflow:'hidden', marginHorizontal:-16, width:W },
  slideRow:   { flexDirection:'row', alignItems:'flex-start', width: W * 2 },
  slidePanel: { width:W, paddingHorizontal:16, gap:16 },

  // AT A GLANCE card
  glanceCard:    { backgroundColor:'white', borderRadius:16, flexDirection:'row', borderWidth:1, borderColor:'#F3F4F6' },
  glanceItem:    { flex:1, alignItems:'center', paddingVertical:20, gap:5 },
  glanceDivider: { width:StyleSheet.hairlineWidth, backgroundColor:'#E5E7EB', marginVertical:14 },
  glanceValRow:  { flexDirection:'row', alignItems:'center', gap:6 },
  glanceVal:     { fontSize:20, fontWeight:'800', color:'#111827' },
  glanceLbl:     { fontSize:11, color:'#9CA3AF', fontWeight:'500' },

  // Section
  section:         { gap:10 },
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
  reviewRatingLbl: { fontSize:15, fontWeight:'700', color:'#111827' },
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

  // Memory card (unified journal entry — read-only display)
  memCard:             { backgroundColor:'white', borderRadius:20, overflow:'hidden', borderWidth:1, borderColor:'#F0F1F3' },
  memTopRow:           { flexDirection:'row', alignItems:'center', paddingHorizontal:18, paddingTop:18, paddingBottom:16 },
  memDateCaption:      { fontSize:9, fontWeight:'800', color:'#9CA3AF', letterSpacing:1.3, marginBottom:4 },
  memDateVal:          { fontSize:17, fontWeight:'800', color:'#111827' },
  memDateEmpty:        { fontSize:14, fontWeight:'600', color:'#9CA3AF' },
  memVisitBadge:       { backgroundColor:'#EEF2FF', borderRadius:8, paddingHorizontal:7, paddingVertical:3 },
  memVisitBadgeTxt:    { fontSize:11, fontWeight:'700', color:'#6366F1' },
  memEditBtn:          { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:10, paddingVertical:6,
                         borderRadius:10, backgroundColor:'#EEF2FF' },
  memEditBtnTxt:       { fontSize:12, fontWeight:'600', color:'#6366F1' },
  memDivider:          { height:StyleSheet.hairlineWidth, backgroundColor:'#F0F1F3' },
  memSectionRow:       { paddingHorizontal:18, paddingTop:12, paddingBottom:14 },
  memSectionLabel:     { fontSize:9, fontWeight:'800', color:'#9CA3AF', letterSpacing:1.3, marginBottom:4 },
  memSectionLabelPad:  { fontSize:9, fontWeight:'800', color:'#9CA3AF', letterSpacing:1.3,
                         paddingHorizontal:18, paddingTop:12, marginBottom:0 },
  memRatingRow:        { flexDirection:'row', alignItems:'center', gap:8, marginTop:4, flexWrap:'wrap' },
  memRatingNum:        { fontSize:14, fontWeight:'700', color:'#111827' },
  memRatingLabel:      { fontSize:12, fontWeight:'500', color:'#6B7280' },
  // Review display
  memNotesDisplay:     { paddingHorizontal:18, paddingTop:12, paddingBottom:16 },
  memNotesTxt:         { fontSize:15, color:'#374151', lineHeight:24 },
  memNotesPh:          { fontSize:15, color:'#C4C9D4', lineHeight:24 },

  // Spots visited section header
  spotsHeaderRow:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  spotsLabel:        { flexDirection:'row', alignItems:'center', gap:5 },
  spotsLabelTxt:     { fontSize:13, fontWeight:'600', color:'#6B7280' },
  spotsAddMore:      { fontSize:13, fontWeight:'600', color:'#16A34A' },

  // Spot photo card (shared)
  spcRow:             { gap:12, paddingBottom:4, paddingRight:4 },
  spcCard:            { width:130, height:130, borderRadius:16, overflow:'hidden', backgroundColor:'#F3F4F6' },
  spcPlaceholder:     { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center' },
  spcPlaceholderIcon: { fontSize:36 },
  spcOverlay:         { position:'absolute', left:0, right:0, bottom:0, height:56, backgroundColor:'rgba(0,0,0,0.42)' },
  spcName:            { position:'absolute', bottom:8, left:8, right:8, fontSize:12, fontWeight:'700', color:'white', lineHeight:16 },


  // Why People Love It
  whyCard:    { backgroundColor:'#F3F4F6', borderRadius:16, overflow:'hidden' },
  whyRow:     { flexDirection:'row', alignItems:'center', gap:14, paddingHorizontal:16, paddingVertical:14 },
  whyRowBorder:{ borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'#E5E7EB' },
  whyBadge:   { width:30, height:30, borderRadius:15, alignItems:'center', justifyContent:'center', flexShrink: 0 as const },
  whyBadgeNum:{ fontSize:13, fontWeight:'800' as const },
  whyTxt:     { fontSize:14, color:'#374151', flex:1, lineHeight:20 },

  // About
  aboutTxt: { fontSize:15, color:'#374151', lineHeight:24 },

  // Best Time to Visit — monthly cards
  bestTimeRow:        { gap:8, paddingBottom:4, paddingRight:4 },
  bestTimeCard:       { width:62, alignItems:'center', paddingVertical:12, borderRadius:14, backgroundColor:'white', borderWidth:1, borderColor:'#F3F4F6', gap:4 },
  bestTimeCardNow:    { borderColor:'#6366F1', backgroundColor:'#EEF2FF' },
  bestTimeCardBest:   { borderColor:'#10B981', backgroundColor:'#ECFDF5' },
  bestTimeMonth:      { fontSize:11, fontWeight:'600', color:'#9CA3AF' },
  bestTimeMonthNow:   { color:'#6366F1' },
  bestTimeIcon:       { fontSize:18 },
  bestTimeTemp:       { fontSize:12, fontWeight:'700', color:'#374151' },
  bestTimeTempNow:    { color:'#6366F1' },
  bestTimeCrowdDot:   { width:6, height:6, borderRadius:3 },

  // Crowd Calendar — heatmap squares
  heatmapRow:    { flexDirection:'row', marginBottom:6 },
  heatmapCol:    { flex:1, alignItems:'center', gap:3 },
  heatmapSquare: { width:'85%' as any, aspectRatio:1, borderRadius:3 },
  heatmapLbl:    { fontSize:8, color:'#9CA3AF', fontWeight:'500' },
  heatmapLblNow: { color:'#6366F1', fontWeight:'700' },
  crowdLegend:   { flexDirection:'row', gap:14 },
  crowdLegendItem:{ flexDirection:'row', alignItems:'center', gap:5 },
  crowdLegendDot: { width:8, height:8, borderRadius:4 },
  crowdLegendTxt: { fontSize:11, color:'#6B7280' },
});
