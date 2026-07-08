import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Alert,
  Animated, Dimensions, Modal, TextInput, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
// The main vertical drag (collapsed/half/full) is driven by Reanimated + Gesture Handler
// (UI thread) instead of core Animated/PanResponder — PanResponder's move events are
// computed on the JS thread, round-tripping through the bridge every touch-move frame, which
// was the actual cause of drag jank. Aliased to `Reanimated` (rather than replacing the core
// `Animated` import) since the rest of this file — the tab swipe, small modals below, the
// scroll-driven tab bar overlay — still use core Animated and aren't part of this fix.
import Reanimated, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, runOnJS,
  interpolate, interpolateColor, Extrapolation, Easing,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
// ScrollView specifically comes from gesture-handler (not core RN) — only a gesture-handler-
// aware component can actually participate in `simultaneousWithExternalGesture` below; a
// plain core ScrollView's native pan silently claims every touch first regardless of that
// call, which is what was still blocking the full-screen swipe-down.
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Heart, Calendar, MapPin, Camera, Pencil, Plus, ChevronRight, ChevronUp, Lightbulb, Map, Sun, LayoutGrid } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useStore, useDestinationPhotos } from '../../store';
import { CONTINENT_COLORS, SPOT_CATEGORY_META, CATEGORY_ICONS } from '../../types';
import type { Destination, PhotoEntry, Visit, SpotCategory, GoodToKnowTip, SavedDestination } from '../../types';
import { SPOTS, type Spot } from '../../data/spots';
import { DESTINATIONS } from '../../data/destinations';
import { photoCache, thumbCache, fetchWikiThumbnail } from '../../utils/photoCache';
import CircleFlag from '../CircleFlag';
import ClimateDetailModal from './ClimateDetailModal';
import { MONTHS_SHORT, getCrowdData, getWeatherData, getRainyDaysData, crowdColor } from '../../utils/travelData';
import {
  parseDateStr, fmtVisitRange, fmtVisitRangeShort,
  WheelCol, DatePickerModal, VisitDateRangeModal, PhotoCollage, ReviewEditModal,
} from './sheetShared';

const { height: H, width: W } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;  // fully off-screen
const HERO_H      = Math.round(H * 0.52);
const COMPACT_H   = 164;     // handle (28) + card row height
// Same bottom-tab-bar reservation App.tsx's Tab.Navigator uses for its own tabBarStyle
// height — the destination sheet lives inside that "Map" tab's screen, so anything it
// shows must end above this, not at the raw device bottom edge, or the app's own
// Map/Explore/Profile bar covers it.
const BOTTOM_TAB_H = Platform.OS === 'ios' ? 88 : 64;
const COLLAPSED_Y = Math.max(0, H - BOTTOM_TAB_H - COMPACT_H);
// Snap transitions ease to their target with no overshoot at all — a plain duration+curve
// tween instead of a physical spring, since any spring (even lightly underdamped) reads as
// "bouncy" here given how large a distance these snaps travel.
const SNAP_CONFIG  = { duration: 280, easing: Easing.out(Easing.cubic) };
const QUICK_CONFIG = { duration: 150, easing: Easing.out(Easing.cubic) };
// Half-screen snap: sheet top sits exactly at the vertical midpoint of the screen, showing
// only the hero (cropped shorter than usual — see HALF_HERO_H) and the tab bar, with
// everything below the tab bar naturally falling past the bottom edge of the screen — but
// "the bottom edge" here means just above the app's own bottom tab bar, not the device edge.
// Small nudge down from the exact midpoint so the tab row's bottom edge (About/My Visit/
// Spots) lines up exactly with the top of the app's own bottom Map/Explore/Profile bar —
// the plain H/2 math landed a few pixels short of that line on device.
const HALF_SHIFT  = 1;
const HALF_POS    = H / 2 + HALF_SHIFT;
const TAB_BAR_H   = 50; // approx rendered height of st.tabBar (paddingVertical 15 × 2 + text)
// A tiny bit of extra clearance above the bottom tab bar — landing the tab row's bottom
// edge exactly flush with it left the sliding underline's bottom sliver covered by the
// bottom bar itself, since TAB_BAR_H is only an approximation of the real rendered height.
const HALF_BOTTOM_GAP = 2;
// tabBar overlaps the hero's bottom edge by 24 (its own -24 marginTop), so the hero only
// needs to shrink enough that hero-bottom + tabBar-height - 24 lands just above
// BOTTOM_TAB_H (plus the small gap above).
const HALF_HERO_H = HALF_POS - TAB_BAR_H + 24 - BOTTOM_TAB_H - HALF_BOTTOM_GAP;

// Collapsed/bottom-screen carousel card metrics — one card centered, neighbors peeking on
// both sides, identical scheme to SpotSheet's own collapsed carousel (CARD_W/CARD_GAP/
// CARD_SNAP/SIDE_PAD there).
const COMPACT_CARD_W    = W - 64;
const COMPACT_CARD_GAP  = 12;
const COMPACT_CARD_SNAP = COMPACT_CARD_W + COMPACT_CARD_GAP;
const COMPACT_SIDE_PAD  = (W - COMPACT_CARD_W) / 2;

// Gradient: 200 strips × 2px, t^1.8 curve — deeper scrim for text legibility
const GRAD_N = 200, GRAD_H = 2;
const GRADIENT_STRIPS = Array.from({ length: GRAD_N }, (_, i) => {
  const t = i / (GRAD_N - 1);
  return +(t ** 1.8 * 0.94).toFixed(4);
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

// ── Full-screen visit edit sheet ──────────────────────────────────────────────
function VisitEditSheet({ destination, onClose }: { destination: Destination; onClose: () => void }) {
  const insets       = useSafeAreaInsets();
  const saved        = useStore(s => s.savedDestinations[destination.id]);
  const updateSaved  = useStore(s => s.updateSaved);

  const localVisits: Visit[] = saved?.visits
    ?? (saved?.visitDate ? [{ id: 'legacy', startDate: saved.visitDate }] : []);
  const localPhotos: PhotoEntry[] = saved?.photos ?? [];

  const [localNotes,       setLocalNotes      ] = useState(saved?.notes  ?? '');
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



// ── Spot photo card (shared: Spots Visited + Highlights) ─────────────────────
function SpotPhotoCard({ spot, color, onPress }: {
  spot: Spot;
  color: string;
  onPress?: () => void;
}) {
  // Small preview card (130px) — small thumbnail keeps the horizontal spot rail snappy.
  const cacheKey = `spot_${spot.id}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(spot.name, 400).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [spot.id]);

  const cat = SPOT_CATEGORY_META[spot.category];

  return (
    <Pressable style={st.spcCard} onPress={onPress}>
      {photoUrl
        ? <Image source={{ uri: photoUrl }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} resizeMode="cover" />
        : <View style={[st.spcPlaceholder, { backgroundColor: color + '22' }]}>
            <Text style={st.spcPlaceholderIcon}>{spot.icon}</Text>
          </View>
      }
      <View style={st.spcOverlay} />
      {!!cat && (
        <View style={st.spcCatTag}>
          <Text style={st.spcCatTagTxt} numberOfLines={1}>{cat.icon} {cat.label}</Text>
        </View>
      )}
      <Text style={st.spcName} numberOfLines={2}>{spot.name}</Text>
    </Pressable>
  );
}

// ── "At a glance" — the destination's top 3 reasons to visit, as rows within a single
// connected group (not separate tappable cards): a light-green numbered badge on the left,
// the reason as the row's title, with hairline dividers between rows instead of individual
// chevrons — these are informational, not navigational.
function GlanceItem({ reason, index, isLast }: { reason: string; index: number; isLast: boolean }) {
  return (
    <View style={[st.glanceRow, !isLast && st.glanceRowDivider]}>
      <View style={st.glanceNumBadge}>
        <Text style={st.glanceNumTxt}>{String(index + 1).padStart(2, '0')}</Text>
      </View>
      <Text style={st.glanceRowTitle} numberOfLines={2}>{reason}</Text>
    </View>
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

// ── "When to visit" — a best-time-to-go card (icon, headline, subtitle, destination photo)
// followed by a 3×12 grid: crowd level, rainfall, and temperature, one colored dot per
// month, plus a link into the full ClimateDetailModal breakdown.
function rainDotColor(days: number): string {
  if (days <= 4) return '#BFDBFE';
  if (days <= 9) return '#60A5FA';
  if (days <= 14) return '#3B82F6';
  return '#1D4ED8';
}
function tempDotColor(tempC: number): string {
  if (tempC < 5) return '#60A5FA';
  if (tempC < 15) return '#34D399';
  if (tempC < 24) return '#FBBF24';
  if (tempC < 32) return '#F97316';
  return '#EF4444';
}

function WhenToVisitCard({ destination, bestMonths, photoUrl, onOpenClimateDetail }: {
  destination: Destination;
  bestMonths: string;
  photoUrl?: string | null;
  onOpenClimateDetail?: () => void;
}) {
  const crowdData = useMemo(() =>
    getCrowdData(destination.continent, destination.category, destination.coordinates.latitude, destination.rank),
  [destination.id]);
  const weatherData = useMemo(() =>
    getWeatherData(destination.coordinates.latitude, destination.category),
  [destination.id]);
  const rainData = useMemo(() =>
    getRainyDaysData(destination.coordinates.latitude, destination.category),
  [destination.id]);

  return (
    <View style={st.wtvCard}>
      <View style={st.wtvHeadRow}>
        <View style={st.wtvIconWrap}>
          <Sun size={18} color="#16A34A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.wtvTitle}>Best time to go</Text>
          <Text style={st.wtvSubtitle} numberOfLines={2}>
            {bestMonths ? `Pleasant weather and fewer crowds around ${bestMonths}.` : 'Pleasant weather, fewer crowds, and lots to explore.'}
          </Text>
        </View>
        {!!photoUrl && (
          <Image source={{ uri: photoUrl }} style={st.wtvPhoto} resizeMode="cover" />
        )}
      </View>

      <View style={st.wtvGrid}>
        <View style={st.wtvGridRow}>
          <View style={st.wtvRowLabel} />
          {MONTHS_SHORT.map((m, i) => (
            <Text key={i} style={[st.wtvMonthTxt, crowdData[i]?.isBest && st.wtvMonthTxtBest]}>{m[0]}</Text>
          ))}
        </View>
        <View style={st.wtvGridRow}>
          <Text style={st.wtvRowLabelTxt}>Crowds</Text>
          {crowdData.map((c, i) => (
            <View key={i} style={st.wtvDotCell}>
              <View style={[st.wtvDot, { backgroundColor: crowdColor(c.level) }]} />
            </View>
          ))}
        </View>
        <View style={st.wtvGridRow}>
          <Text style={st.wtvRowLabelTxt}>Rain</Text>
          {rainData.map((r, i) => (
            <View key={i} style={st.wtvDotCell}>
              <View style={[st.wtvDot, { backgroundColor: rainDotColor(r.days) }]} />
            </View>
          ))}
        </View>
        <View style={st.wtvGridRow}>
          <Text style={st.wtvRowLabelTxt}>Temp</Text>
          {weatherData.map((w, i) => (
            <View key={i} style={st.wtvDotCell}>
              <View style={[st.wtvDot, { backgroundColor: tempDotColor(w.tempC) }]} />
            </View>
          ))}
        </View>
      </View>

      <View style={st.wtvLegendRow}>
        {[
          { label: 'Low', color: crowdColor(1) },
          { label: 'Moderate', color: crowdColor(3) },
          { label: 'High', color: crowdColor(5) },
        ].map(l => (
          <View key={l.label} style={st.wtvLegendItem}>
            <View style={[st.wtvLegendDot, { backgroundColor: l.color }]} />
            <Text style={st.wtvLegendTxt}>{l.label}</Text>
          </View>
        ))}
      </View>

      <Pressable style={st.wtvGuideBtn} onPress={onOpenClimateDetail}>
        <Calendar size={16} color="#16A34A" />
        <Text style={st.wtvGuideBtnTxt} numberOfLines={1}>View all data</Text>
        <ChevronRight size={16} color="#D1D5DB" />
      </Pressable>
    </View>
  );
}

// ── Highlight card: photo + category badge + name + short bio ────────────────
// ── Compact-card carousel card — one per destination in the country, shown in the
// collapsed/bottom-screen view's horizontal peek-adjacent carousel (mirrors SpotSheet's own
// CarouselCard: a self-contained card that fetches its own thumbnail, active state
// highlighted with a colored border). Reuses the same visual pieces (thumb, name, status
// pill, meta row, spot count, Open button) the single static compact row used to have.
function CompactCarouselCard({ dest, isActive, savedDestinations, onPress }: {
  dest: Destination;
  isActive: boolean;
  savedDestinations: Record<string, SavedDestination>;
  onPress: () => void;
}) {
  const cacheKey = dest.id;
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setThumb(thumbCache.get(cacheKey)!); return; }
    setThumb(null);
    fetchWikiThumbnail(dest.name, 200).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setThumb(url); }
    });
  }, [dest.id]);

  const color = CONTINENT_COLORS[dest.continent];
  const saved      = savedDestinations[dest.id];
  const isVisited  = saved?.type === 'visited';
  const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');
  const spotCount  = SPOTS.filter(s => s.destinationId === dest.id).length;

  return (
    <Pressable
      style={[st.compactCarouselCard, isActive && st.compactCarouselCardActive, { width: COMPACT_CARD_W, marginRight: COMPACT_CARD_GAP }]}
      onPress={onPress}
    >
      <View style={[st.compactThumb, { backgroundColor: color + '22' }]}>
        {thumb
          ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Text style={st.compactThumbIcon}>{dest.icon ?? '📍'}</Text>}
        {/* Badge overlay mirrors SpotSheet's own carousel-card bookmark, but keeps both
            real states (visited/wishlist) as distinct icon+color rather than collapsing to
            a single generic bookmark — destinations actually have two states to show. */}
        {(isVisited || isWishlist) && (
          <View style={st.compactBadge}>
            {isVisited
              ? <Check size={12} color="#059669" strokeWidth={3} />
              : <Heart size={12} color="#DB2777" strokeWidth={2.5} fill="#DB2777" />}
          </View>
        )}
      </View>
      <View style={st.compactInfo}>
        {/* Country/continent dropped — every card in this carousel is already within the
            same country, so it was redundant. Category takes that row instead, matching
            SpotSheet's own small gray category line above the name. */}
        <Text style={st.compactCat} numberOfLines={1}>
          {CATEGORY_ICONS[dest.category]}  {dest.category}
        </Text>
        <Text style={st.compactName} numberOfLines={1}>{dest.name}</Text>
        {spotCount > 0 && (
          <View style={st.compactStatRow}>
            <MapPin size={12} color="#16A34A" strokeWidth={2.5} />
            <Text style={st.compactStatTxt}>{spotCount} spot{spotCount !== 1 ? 's' : ''}</Text>
          </View>
        )}
        {!!(dest.tagline ?? dest.description) && (
          <Text style={st.compactBio} numberOfLines={2}>{dest.tagline ?? dest.description}</Text>
        )}
        {isActive && (
          <View style={st.compactExpandRow}>
            <ChevronUp size={13} color="#16A34A" strokeWidth={2.5} />
            <Text style={st.compactExpandTxt}>Swipe up for details</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function HighlightCard({ spot, color, onPress }: { spot: Spot; color: string; onPress?: () => void }) {
  const cacheKey = `spot_${spot.id}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(spot.name, 400).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [spot.id]);

  const cat = SPOT_CATEGORY_META[spot.category];

  return (
    <Pressable style={st.hlCard} onPress={onPress}>
      <View style={st.hlImageWrap}>
        {photoUrl
          ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[st.spcPlaceholder, { backgroundColor: color + '22' }]}>
              <Text style={st.spcPlaceholderIcon}>{spot.icon}</Text>
            </View>
        }
        <View style={st.hlBadge}>
          <Text style={st.hlBadgeIcon}>{cat?.icon ?? spot.icon}</Text>
        </View>
      </View>
      <Text style={st.hlName} numberOfLines={2}>{spot.name}</Text>
      <Text style={st.hlBio} numberOfLines={2}>{spot.bio}</Text>
    </Pressable>
  );
}

// ── Spot grid card — same visual language as HighlightCard (photo, category badge,
// name, bio) but flex-basis'd for a 2-column wrapping grid instead of horizontal scroll.
function SpotGridCard({ spot, color, onPress }: { spot: Spot; color: string; onPress?: () => void }) {
  const cacheKey = `spot_${spot.id}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(spot.name, 400).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [spot.id]);

  const cat = SPOT_CATEGORY_META[spot.category];

  return (
    <Pressable style={st.gridCard} onPress={onPress}>
      <View style={st.gridImageWrap}>
        {photoUrl
          ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[st.spcPlaceholder, { backgroundColor: color + '22' }]}>
              <Text style={st.spcPlaceholderIcon}>{spot.icon}</Text>
            </View>
        }
        <View style={st.hlBadge}>
          <Text style={st.hlBadgeIcon}>{cat?.icon ?? spot.icon}</Text>
        </View>
      </View>
      <Text style={st.hlName} numberOfLines={2}>{spot.name}</Text>
      <Text style={st.hlBio} numberOfLines={2}>{spot.bio}</Text>
    </Pressable>
  );
}

// ── Spots panel — full grid of a destination's spots, with category filter tags and a
// button that jumps into the sliding spot carousel (SpotSheet, via onSelectSpot), which
// already receives the destination's full spot list regardless of which spot is passed.
function SpotsPanel({ spots, color, onSelectSpot, filterScrollRef }: {
  spots: typeof SPOTS;
  color: string;
  onSelectSpot?: (spot: Spot) => void;
  filterScrollRef?: React.RefObject<ScrollView | null>;
}) {
  const [filter, setFilter] = useState<SpotCategory | 'all'>('all');

  const categories = useMemo(() => {
    const seen = new Set<SpotCategory>();
    spots.forEach(s => seen.add(s.category));
    return Array.from(seen);
  }, [spots]);

  const filteredSpots = filter === 'all' ? spots : spots.filter(s => s.category === filter);

  return (
    <View style={{ gap: 16 }}>
      {spots.length > 0 && (
        <Pressable style={st.mapViewBtn} onPress={() => onSelectSpot?.(spots[0])} hitSlop={6}>
          <Map size={13} color="#6B7280" />
          <Text style={st.mapViewBtnTxt}>Map view</Text>
        </Pressable>
      )}

      {categories.length > 1 && (
        <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
          <Pressable
            style={[st.filterTag, filter === 'all' && st.filterTagActive]}
            onPress={() => setFilter('all')}>
            <Text style={[st.filterTagTxt, filter === 'all' && st.filterTagTxtActive]}>All</Text>
          </Pressable>
          {categories.map(cat => {
            const meta = SPOT_CATEGORY_META[cat];
            const active = filter === cat;
            return (
              <Pressable key={cat} style={[st.filterTag, active && st.filterTagActive]} onPress={() => setFilter(cat)}>
                <Text style={st.filterTagIcon}>{meta.icon}</Text>
                <Text style={[st.filterTagTxt, active && st.filterTagTxtActive]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {filteredSpots.length > 0 ? (
        <View style={st.spotsGrid}>
          {filteredSpots.map(spot => (
            <SpotGridCard key={spot.id} spot={spot} color={color} onPress={() => onSelectSpot?.(spot)} />
          ))}
        </View>
      ) : (
        <Text style={st.gridEmptyTxt}>No spots in this category yet.</Text>
      )}
    </View>
  );
}

// ── About panel (shared by visited "About" tab + non-visited view) ────────────
function AboutPanel({
  destination, spots, color, bestMonths, photoUrl, onSelectSpot, onOpenClimateDetail,
  onSeeAllSpots, hlScrollRef,
}: {
  destination: Destination;
  spots: typeof SPOTS;
  color: string;
  bestMonths: string;
  photoUrl?: string | null;
  onSelectSpot?: (spot: Spot) => void;
  onOpenClimateDetail?: () => void;
  onSeeAllSpots?: () => void;
  hlScrollRef?: React.RefObject<ScrollView | null>;
}) {
  return (
    <View style={st.aboutStack}>
      {!!destination.whyVisit && (
        <View style={[st.section, st.aboutFirstSection]}>
          <Text style={st.plainSectionHeader}>WHY VISIT {destination.name.toUpperCase()}?</Text>
          <View style={st.glanceStack}>
            {destination.whyVisit.map((reason, i) => (
              <GlanceItem key={i} reason={reason} index={i} isLast={i === destination.whyVisit!.length - 1} />
            ))}
          </View>
        </View>
      )}

      {!!destination.description && (
        <View style={st.section}>
          <Text style={st.aboutTxt}>{destination.description}</Text>
        </View>
      )}

      {spots.length > 0 && (
        <View style={st.section}>
          <View style={st.secHeadRow}>
            <Text style={st.plainSectionHeader}>TOP SPOTS</Text>
            <Pressable style={st.seeAllRow} onPress={onSeeAllSpots} hitSlop={8}>
              <Text style={st.seeAllTxt}>See all</Text>
              <ChevronRight size={15} color="#16A34A" />
            </Pressable>
          </View>
          <ScrollView ref={hlScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hlRow}>
            {spots.map(spot => (
              <HighlightCard key={spot.id} spot={spot} color={color} onPress={() => onSelectSpot?.(spot)} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Full crowd/temperature/rainfall breakdown lives on its own page
          (ClimateDetailModal), opened from here via the "view full guide" row. */}
      <View style={st.section}>
        <Text style={st.plainSectionHeader}>WHEN TO VISIT</Text>
        <WhenToVisitCard
          destination={destination} bestMonths={bestMonths} photoUrl={photoUrl}
          onOpenClimateDetail={onOpenClimateDetail}
        />
      </View>

      {!!destination.goodToKnow && (
        <View style={[st.section, st.aboutLastSection]}>
          <View style={st.secHeadRow}>
            <View style={st.goodToKnowHeadRow}>
              <Lightbulb size={14} color="#B45309" />
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
type SnapState = 'collapsed' | 'half' | 'full';

interface Props {
  destination: Destination;
  // Only ever fires from a swipe-down while collapsed (bottom-screen) — see dismissSheetRef
  // below — so `toCollapsed` is always true, letting the caller land the country sheet
  // underneath in its own collapsed view instead of the usual half-screen default.
  onClose: (toCollapsed?: boolean) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onSelectSpot?: (spot: Spot) => void;
  // Reports how far the collapsed compact card's top edge sits from the very bottom of the
  // screen, once measured — lets callers (e.g. the map's back-navigation pill) position
  // themselves an exact, matching distance above it instead of guessing a fixed height.
  onCollapsedTopChange?: (distanceFromBottom: number) => void;
  // Fires on every snap transition (tap or drag) — lets callers that care about the
  // half-screen state specifically (e.g. repositioning the back-to-country pill) react
  // without having to reverse-engineer it from onExpand/onCollapse alone.
  onSnapStateChange?: (state: SnapState) => void;
  // Written to continuously (every frame, not just at snap boundaries) with the exact
  // "bottom" offset the back-to-country pill should sit at *right now* — computed here (this
  // sheet owns slideAnim and its snap-point constants) by piecewise-interpolating between the
  // three already-tuned resting targets as slideAnim moves. A shared value (not a JS callback)
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
  // Fires after the user swipes the hero to a different destination in the same country —
  // lets the caller keep its own "selected destination" state (map pin highlighting, etc.)
  // in sync. Deliberately separate from onClose/onSelectSpot: this is a lightweight
  // notification, not a "user tapped a pin" event, so callers shouldn't attach camera
  // animations or haptics to it the way they might for an actual marker press.
  onSwipeToDestination?: (dest: Destination) => void;
  // Bump this (e.g. an incrementing counter) to imperatively collapse the sheet from the
  // parent — used when the user pans the map while this sheet is at half-screen. No-ops
  // unless the sheet is currently at half.
  collapseSignal?: number;
  // "Go to list view" — swaps this sheet's collapsed carousel for CountrySheet's own
  // Destinations tab, which is often easier to scan than swiping card-by-card. Mirrors
  // SpotSheet's identical onGoToList.
  onGoToCountryList?: () => void;
}

export default function DestinationSheet({
  destination: destinationProp, onClose, onExpand, onCollapse, onSelectSpot, onCollapsedTopChange,
  onSnapStateChange, pillOffsetSV, pillOffsetLockedSV, initialTab, initialSnap,
  onSwipeToDestination, collapseSignal, onGoToCountryList,
}: Props) {
  const insets            = useSafeAreaInsets();
  const savedDestinations = useStore(s => s.savedDestinations);
  const saveDestination   = useStore(s => s.saveDestination);
  const unsaveDestination = useStore(s => s.unsaveDestination);
  // Internal "currently displayed" destination — decoupled from the `destination` prop so a
  // hero swipe (below) can move between a country's destinations without waiting on a full
  // prop round-trip through the parent, which would otherwise force the "genuine destination
  // switch" reset effect further down to fire (resetting snap state/tabs), the opposite of
  // what a carousel swipe should do. `destination` (used everywhere else in this file below,
  // completely unchanged) now refers to this state instead of the raw prop.
  const [destination, setDestination] = useState<Destination>(destinationProp);
  const lastExternalDestIdRef = useRef(destinationProp.id);
  // True only for the duration of an internally-triggered (carousel swipe) destination
  // change — lets the reset effect further down tell a "swipe" apart from a genuine external
  // switch (a different pin tapped on the map) without needing its own separate effect.
  const carouselSwapRef = useRef(false);
  // Destinations already shown via a hero swipe in this session (seeded with whichever
  // destination is current) — lets "next closest" mean "closest not already seen" instead of
  // just always re-picking the same nearest neighbor back and forth.
  const swipedThroughIdsRef = useRef<Set<string>>(new Set([destinationProp.id]));
  // The destination the user originally opened this sheet on — once a hero swipe has cycled
  // through every other destination in the country, the carousel loops back to this one
  // specifically (a fixed, predictable "start of the loop"), rather than just resetting the
  // exclusion set and picking whatever's nearest to wherever the user currently is.
  const firstDestIdRef = useRef(destinationProp.id);
  useEffect(() => {
    if (destinationProp.id === lastExternalDestIdRef.current) return;
    lastExternalDestIdRef.current = destinationProp.id;
    swipedThroughIdsRef.current = new Set([destinationProp.id]);
    firstDestIdRef.current = destinationProp.id;
    setDestination(destinationProp);
  }, [destinationProp.id]);
  const updateSaved       = useStore(s => s.updateSaved);

  const saved      = savedDestinations[destination.id];
  const color      = CONTINENT_COLORS[destination.continent];
  const spots      = SPOTS.filter(s => s.destinationId === destination.id);
  const isVisited  = saved?.type === 'visited';
  const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');

  const crowdData       = useMemo(() =>
    getCrowdData(destination.continent, destination.category, destination.coordinates.latitude, destination.rank),
  [destination.id]);
  const bestMonths      = crowdData.filter(c => c.isBest).map(c => c.month).join(', ');

  const [photoUrl,      setPhotoUrl    ] = useState<string | null>(photoCache.get(destination.id) ?? null);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showClimateDetail, setShowClimateDetail] = useState(false);
  // Half-screen is the default view whenever a destination is selected — callers only pass
  // initialSnap explicitly for the other two cases (e.g. the spot carousel's "list view"
  // button wants 'full').
  const resolvedInitialSnap: SnapState = initialSnap ?? 'half';
  // Plain React state (unlike snapStateRef, which is a ref for the pan responder's benefit)
  // so the compact card overlay below can actually re-render and hide itself in half-screen
  // mode — its transform-based hiding alone doesn't fully clear the screen at HALF_POS.
  const [isHalfState, setIsHalfState] = useState(resolvedInitialSnap === 'half');
  // Half-screen shows no tab as "selected" by default (it's a preview, not a picked view) —
  // but once the user has actually tapped a tab (in full screen), that choice should stick
  // even after swiping back down to half, instead of always reverting to unselected.
  const [hasUserPickedTab, setHasUserPickedTab] = useState(false);
  // Non-visited destinations have no "My Visit" tab — About and Spots only.
  const TAB_ORDER: Tab[] = useMemo(() => isVisited ? ['visit', 'about', 'spots'] : ['about', 'spots'], [isVisited]);
  const defaultTab: Tab = isVisited ? 'visit' : 'about';
  const startTab: Tab = (initialTab && TAB_ORDER.includes(initialTab)) ? initialTab : defaultTab;
  const [activeTab,     setActiveTab    ] = useState<Tab>(startTab);

  // Derive visits from store (with legacy visitDate fallback)
  const localVisits: Visit[] = saved?.visits
    ?? (saved?.visitDate ? [{ id: 'legacy', startDate: saved.visitDate }] : []);
  // Read-only display merges the destination's own photos with all child-spot photos
  // (tagged so the collage shows which spot each came from).
  const localPhotos: PhotoEntry[] = useDestinationPhotos(destination.id);

  // Ref to the sheet's main content ScrollView — declared early since both the tab-swipe
  // gesture below and the main vertical drag gesture (further down) need it.
  const scrollRef       = useRef<ScrollView>(null);
  // Refs to the horizontal ScrollViews nested *inside* each tab panel (About's "top spots"
  // row, Spots' category filter row, Visit's spots-visited carousel) — without registering
  // these as simultaneous with tabSwipeGesture below, a horizontal drag that starts on top
  // of one of them is claimed by that inner ScrollView first, and only a much larger/more
  // forceful swipe manages to also activate the tab-swipe gesture. Registering them all
  // lets both recognize together regardless of where on the panel the swipe starts.
  const aboutHlScrollRef     = useRef<ScrollView>(null);
  const spotsFilterScrollRef = useRef<ScrollView>(null);
  const visitCarouselScrollRef = useRef<ScrollView>(null);
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

  // If visited-state flips while the sheet is open (e.g. marking a visit adds the "My
  // Visit" tab), snap the slide position back in sync instead of leaving it misaligned.
  useEffect(() => {
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
    // Matches the tab button's own onPress handler below — a deliberate swipe to a tab is
    // just as much a "pick" as tapping it. Without this, isTabSelected (which requires
    // hasUserPickedTab while in half-screen) never updates for the newly-swiped-to tab, so
    // whichever tab was highlighted before the swipe visually stays highlighted afterward.
    setHasUserPickedTab(true);
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
    .simultaneousWithExternalGesture(scrollRef, aboutHlScrollRef, spotsFilterScrollRef, visitCarouselScrollRef);

  // ── Hero swipe — carousel through this country's other destinations ──────────
  // A genuine two-sheet carousel: the incoming destination's whole sheet (see
  // previewSheetAnimStyle below, in the render section) is rendered adjoined to the
  // outgoing one and both move together off a single shared drag value, rather than the
  // outgoing content sliding fully away before the new one appears within a fixed frame.
  // `destination` (used throughout the rest of this component) is the internal state set up
  // above, so committing a swipe is all that's needed for every other data-driven bit
  // (photo, name, tagline, spots, saved status, etc.) to update with it.
  const heroTranslateX = useSharedValue(0);
  const HERO_SWIPE_CONFIG = { duration: 260, easing: Easing.out(Easing.cubic) };

  // Which candidate destination is adjoined for the current drag, and on which side — only
  // decided once the drag direction is unambiguous (a few pixels in), so a single shared
  // "closest not yet shown" pick isn't wasted on a gesture that turns out to be vertical.
  const previewActiveSV = useSharedValue(false);
  const previewSignSV   = useSharedValue<1 | -1>(1);
  const [previewDest, setPreviewDest] = useState<Destination | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  // JS-thread mirror of previewDest so commitHeroSwipe can read it synchronously the instant
  // the slide-out animation finishes, without waiting on a React state read.
  const previewDestRef = useRef<Destination | null>(null);
  const previewSpots = useMemo(
    () => previewDest ? SPOTS.filter(s => s.destinationId === previewDest.id) : [],
    [previewDest],
  );

  const getNextClosestDestination = useCallback((): Destination | null => {
    const pool = DESTINATIONS.filter(d => d.country === destination.country && d.id !== destination.id);
    if (pool.length === 0) return null;
    const candidates = pool.filter(d => !swipedThroughIdsRef.current.has(d.id));
    if (candidates.length === 0) {
      // Every other destination in the country has already been shown this session —
      // continuous carousel: loop back to the one the user originally opened, then start a
      // fresh lap from there (rather than resetting to "closest to wherever we currently
      // are", which wouldn't reliably land back on a fixed, predictable start-of-loop point).
      swipedThroughIdsRef.current = new Set([destination.id]);
      return pool.find(d => d.id === firstDestIdRef.current) ?? pool[0];
    }
    let best: Destination | null = null;
    let bestDist = Infinity;
    for (const d of candidates) {
      const dLat = d.coordinates.latitude  - destination.coordinates.latitude;
      const dLng = d.coordinates.longitude - destination.coordinates.longitude;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }, [destination]);

  // Runs on the JS thread (via runOnJS) the moment the drag's direction is first clear —
  // picks and preloads the adjoined card (including fetching its full-res photo straight
  // into photoCache) so it's already rendered and ready by the time the finger has moved it
  // into view — and, if the user commits the swipe, so commitHeroSwipe below can hand that
  // same cached photo straight to the real sheet with no re-fetch/flash.
  const preparePreview = useCallback(() => {
    const next = getNextClosestDestination();
    previewDestRef.current = next;
    setPreviewDest(next);
    if (!next) { setPreviewPhotoUrl(null); return; }
    const cached = photoCache.get(next.id) ?? thumbCache.get(next.id) ?? null;
    setPreviewPhotoUrl(cached);
    if (!photoCache.has(next.id)) {
      fetchWikiThumbnail(next.name, 900).then(url => {
        if (url) {
          photoCache.set(next.id, url);
          setPreviewPhotoUrl(url);
        }
      });
    }
  }, [getNextClosestDestination]);

  const clearPreview = useCallback(() => {
    previewDestRef.current = null;
    setPreviewDest(null);
    setPreviewPhotoUrl(null);
  }, []);

  // Runs on the JS thread once the commit animation lands the preview card exactly at 0 —
  // swaps the displayed destination to whatever was already adjoined and on-screen, then
  // resets the drag value to 0 with no animation (the new "current" card is already
  // visually sitting at 0, so there's nothing left to animate).
  // Shared by both the hero-swipe carousel above and the collapsed-card carousel below —
  // swaps the internal `destination` state to `next` and takes care of everything that
  // needs to move with it (swipedThroughIds bookkeeping, the preloaded-photo hand-off to
  // avoid a hero flash, and notifying the parent).
  const commitDestinationSwap = useCallback((next: Destination) => {
    carouselSwapRef.current = true;
    swipedThroughIdsRef.current.add(next.id);
    setDestination(next);
    // Hand off the preloaded full-res photo directly, in the same batched update as
    // setDestination above, rather than letting the photoUrl effect re-derive it — that
    // effect would still land on the same (already-cached) value, but only after an extra
    // render where photoUrl briefly reflected the outgoing destination's photo (or null),
    // which is exactly the hero "flash" this avoids. Read straight from photoCache (the
    // same cache the photoUrl effect itself checks) rather than previewPhotoUrl state,
    // which may hold a lower-res thumbCache fallback used only for the transient hero-swipe
    // ghost — handing that off here would just get immediately clobbered back to null once
    // the effect below finds it's not actually in photoCache and re-fetches. The collapsed
    // carousel's own thumbnails are separately cached in thumbCache, so this hand-off only
    // ever helps when a full-res photo happens to already be cached, never hurts otherwise.
    const preloadedPhoto = photoCache.get(next.id);
    if (preloadedPhoto) setPhotoUrl(preloadedPhoto);
    // Pre-mark this id as "already the external prop" too — otherwise, once the parent's
    // `destination` prop eventually round-trips back down (via onSwipeToDestination below
    // updating its own selectedDest state), the sync effect would see it as a genuine
    // external change and wipe swipedThroughIdsRef right after we just built it up.
    lastExternalDestIdRef.current = next.id;
    onSwipeToDestination?.(next);
  }, [onSwipeToDestination]);

  const commitHeroSwipe = useCallback(() => {
    const next = previewDestRef.current;
    clearPreview();
    if (!next) { heroTranslateX.value = 0; return; }
    commitDestinationSwap(next);
    heroTranslateX.value = 0;
  }, [clearPreview, commitDestinationSwap]);

  // ── Collapsed/bottom-screen carousel — same "swipe between this country's destinations"
  // idea as the hero-swipe above, but for the compact card: a real horizontal ScrollView
  // with peek-adjacent neighbors (identical mechanism to SpotSheet's own collapsed
  // carousel), rather than the two-sheet ghost/ghost-preview dance the hero-swipe uses. That
  // fits the compact card better — it's a small, purely-visual overlay, not a whole
  // interactive sheet that needs a matching adjoined "ghost" of its own.
  const compactCarouselRef = useRef<ScrollView>(null);
  const countryDests = useMemo(
    () => DESTINATIONS.filter(d => d.country === destination.country)
                      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    [destination.country],
  );
  // Keeps the carousel scrolled to whichever destination is current, however it got there
  // (a tap elsewhere, the hero-swipe carousel, or this carousel's own settle below) — a
  // non-animated jump, since the compact card isn't visible except while truly collapsed.
  useEffect(() => {
    const idx = countryDests.findIndex(d => d.id === destination.id);
    if (idx < 0) return;
    requestAnimationFrame(() => {
      compactCarouselRef.current?.scrollTo({ x: idx * COMPACT_CARD_SNAP, animated: false });
    });
  }, [destination.id, countryDests]);

  const handleCompactCarouselSettle = useCallback((offsetX: number) => {
    const idx = Math.max(0, Math.min(countryDests.length - 1, Math.round(offsetX / COMPACT_CARD_SNAP)));
    const next = countryDests[idx];
    if (!next || next.id === destination.id) return;
    Haptics.selectionAsync();
    commitDestinationSwap(next);
  }, [countryDests, destination.id, commitDestinationSwap]);

  const HERO_SWIPE_THRESHOLD = 60;
  const heroSwipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate(e => {
      heroTranslateX.value = e.translationX;
      if (!previewActiveSV.value && Math.abs(e.translationX) > 5) {
        previewActiveSV.value = true;
        previewSignSV.value = e.translationX < 0 ? -1 : 1;
        runOnJS(preparePreview)();
      }
    })
    .onEnd(e => {
      const committing = previewActiveSV.value &&
        (Math.abs(e.translationX) > HERO_SWIPE_THRESHOLD || Math.abs(e.velocityX) > 600);
      if (committing) {
        const sign = previewSignSV.value;
        heroTranslateX.value = withTiming(sign * W, HERO_SWIPE_CONFIG, finished => {
          previewActiveSV.value = false;
          if (finished) runOnJS(commitHeroSwipe)();
        });
      } else {
        heroTranslateX.value = withTiming(0, HERO_SWIPE_CONFIG, finished => {
          previewActiveSV.value = false;
          if (finished) runOnJS(clearPreview)();
        });
      }
    })
    // Same reasoning as tabSwipeGesture above — the hero sits inside the same
    // gesture-handler ScrollView, which otherwise claims horizontal touches on it first.
    .simultaneousWithExternalGesture(scrollRef);

  // Shared tab-bar content (buttons + sliding indicator) — rendered both inline (scrolls
  // normally with the hero) and in the fixed overlay copy that takes over once scrolled
  // past it, so the two never drift out of sync.
  // Half-screen shows a tab as "selected" only once the user has actually tapped one
  // (hasUserPickedTab) — otherwise it's an unselected preview. Tapping a tab there also
  // expands straight to full, since that's the only place its content is actually visible.
  const isTabSelected = (tab: Tab) => (hasUserPickedTab || !isHalfState) && activeTab === tab;
  const renderTabBarRow = () => (
    <>
      {TAB_ORDER.map((tab, i) => (
        <React.Fragment key={tab}>
        {i > 0 && <View style={st.tabDivider} />}
        <Pressable
          style={st.tabBtn}
          onPress={() => {
            switchTabRef.current(tab);
            setHasUserPickedTab(true);
            if (isHalfState) snapToFullRef.current();
          }}
        >
          {tab === 'visit' ? (
            <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
              <Text style={[st.tabBtnTxt, isTabSelected('visit') && st.tabBtnTxtActive]}>
                {localVisits.length > 1 ? 'My Visits' : 'My Visit'}
              </Text>
              {localVisits.length > 1 && (
                <View style={[st.tabVisitBadge, isTabSelected('visit') && st.tabVisitBadgeActive]}>
                  <Text style={[st.tabVisitBadgeTxt, isTabSelected('visit') && st.tabVisitBadgeTxtActive]}>
                    {localVisits.length}
                  </Text>
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
      {/* Sliding underline — hidden in half-screen unless the user has already picked
          a tab, matching isTabSelected's logic above. Outer element keeps the existing
          per-tab left/width positioning; the visible bar itself is a narrower, centered
          child so it doesn't span the full tab width. */}
      <Reanimated.View
        style={[
          st.tabIndicatorTrack,
          { width: `${100 / TAB_ORDER.length}%`, opacity: (hasUserPickedTab || !isHalfState) ? 1 : 0 },
          tabIndicatorStyle,
        ]}
      >
        <View style={st.tabIndicator} />
      </Reanimated.View>
    </>
  );

  // Wikipedia photo — bounded width instead of the (often huge) original, so the hero loads fast.
  useEffect(() => {
    if (photoCache.has(destination.id)) { setPhotoUrl(photoCache.get(destination.id)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(destination.name, 900).then(url => {
      if (url) { photoCache.set(destination.id, url); setPhotoUrl(url); }
    });
  }, [destination.id]);

  // ── Unified sheet: three snap points ─────────────────────────────────────────
  // COLLAPSED_Y = compact card visible at bottom; HALF_POS = half-screen; FULL_POS = full
  const snapStateRef = useRef<SnapState>(resolvedInitialSnap);
  // Mirrors snapStateRef but readable from the UI-thread gesture worklets below.
  const snapStateSV  = useSharedValue<SnapState>(resolvedInitialSnap);
  const slideAnim    = useSharedValue(CLOSE_POS);
  const lastPos      = useSharedValue(resolvedInitialSnap === 'full' ? FULL_POS : resolvedInitialSnap === 'half' ? HALF_POS : COLLAPSED_Y);
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

  // Dynamic collapsed Y — updated when compact card is measured via onLayout. A shared value
  // (not just a ref) so the worklets below (drag gesture, hero-height/compact-translate
  // styles) can read the live measurement directly on the UI thread.
  const collapsedYRef  = useRef(COLLAPSED_Y);
  const collapsedYAnim = useSharedValue(COLLAPSED_Y);
  // Compact card translates: 0 when collapsed, slides off top as sheet expands.
  // Clamped at 0 so spring overshoot / downward drag never shifts the card below y=0,
  // which would expose the dark hero behind it.
  const compactAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(-H, Math.min(0, slideAnim.value - collapsedYAnim.value)) }],
  }));
  // Continuously writes the back-to-country pill's target "bottom" offset as slideAnim
  // moves, so the parent's pill mirrors the sheet's own top edge frame-for-frame instead of
  // only re-targeting an animation after a drag settles at a new snap point. Written directly
  // to the shared value passed in via pillOffsetSV — no runOnJS/JS-thread hop at all, since
  // both this sheet and the pill are UI-thread Reanimated values, which is what keeps the
  // pill's glide exactly as smooth as the sheet's own.
  //
  // Now that the hero's own close button is gone, the pill takes over that exact spot for
  // as long as the sheet is at half or full screen — the [FULL_POS, HALF_POS] leg here is
  // the same top-position formula heroTopRowStyle uses, just expressed in "bottom" terms
  // (bottom = H - top - pill's own height) since that's what the pill wrapper's style
  // actually animates. The collapsed leg is untouched — same tuned resting target as before,
  // so the bottom-screen view keeps its existing look — with a single 3-point interpolation
  // giving one smooth, continuous glide across all three states instead of a jump when
  // crossing from half into collapsed (or back).
  useAnimatedReaction(
    () => slideAnim.value,
    (value) => {
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
      // MapScreen's frame, not at 0. Missing that offset put the target roughly HALF_POS
      // pixels too high (i.e. off the top of the screen) at half-screen.
      const SCREEN_H = H - BOTTOM_TAB_H;
      const FULL_TOP_ABS = FULL_POS + (insets.top + 20);
      // Half-screen is the one exception to "pill sits inside the header row": here it
      // instead floats a fixed gap above the sheet's own top edge (HALF_POS), like the
      // collapsed pill floats above its card, rather than overlapping the header.
      const HALF_PILL_GAP = 16;
      const HALF_TOP_ABS = HALF_POS - HALF_PILL_GAP - PILL_H;
      const FULL_TARGET = SCREEN_H - FULL_TOP_ABS - PILL_H;
      const HALF_TARGET = SCREEN_H - HALF_TOP_ABS - PILL_H;
      // Collapsed: float the same fixed gap above the compact card's own *measured* top
      // (collapsedYAnim.value, kept live by the card's onLayout) rather than a constant
      // distance from the screen's bottom. A constant broke once the collapsed card grew a
      // "Destinations in {Country}" header row above its carousel — the card's top moved up
      // by that header's height, but the fixed-from-bottom pill target didn't follow, so the
      // pill ended up overlapping the header instead of resting above the card.
      const COLLAPSED_TOP_ABS = collapsedYAnim.value - HALF_PILL_GAP - PILL_H;
      const COLLAPSED_TARGET = SCREEN_H - COLLAPSED_TOP_ABS - PILL_H;
      pillOffsetSV.value = interpolate(
        value,
        [FULL_POS, HALF_POS, collapsedYAnim.value],
        [FULL_TARGET, HALF_TARGET, COLLAPSED_TARGET],
        Extrapolation.CLAMP,
      );
    },
    [insets.bottom, insets.top],
  );

  // Pill color: dark on white card (collapsed), white on dark hero (full)
  const pillBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      slideAnim.value, [FULL_POS, COLLAPSED_Y], ['rgba(255,255,255,0.65)', 'rgba(0,0,0,0.18)'],
    ),
  }));

  // Backdrop: dark when full-screen, nearly clear by half-screen and staying that way
  // through collapsed. The sheet's drop-shadow (sheetShadow below) is the same view/style
  // at every snap point, but shadows read poorly against a still-dim backdrop — dropping
  // the dimming away by HALF_POS (instead of a smooth linear fade all the way to
  // COLLAPSED_Y) gives the half-screen sheet the same bright-map, high-contrast shadow the
  // bottom-screen (collapsed) card already has.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideAnim.value, [FULL_POS, HALF_POS, COLLAPSED_Y], [1, 0.05, 0], Extrapolation.CLAMP),
  }));

  // Hero shrinks as the sheet passes through half-screen, so hero + tab bar together still
  // fit within the half of the screen the sheet occupies there. Three points, not two: a
  // simple two-point [FULL_POS, HALF_POS] interpolation clamps to the *shrunk* height for
  // every value beyond HALF_POS too — including the collapsed position, which is well past
  // it — so the hero (and therefore anything measuring its layout, like the tab bar's
  // position) would be wrong any time the sheet is collapsed. Reverting back to full height
  // beyond HALF_POS keeps collapsed/half/full all correct regardless of it being hidden
  // behind the compact card while collapsed.
  const fullHeroH = HERO_H - insets.bottom;
  const heroAnimStyle = useAnimatedStyle(() => ({
    height: interpolate(
      slideAnim.value,
      [FULL_POS, HALF_POS, Math.max(HALF_POS + 1, collapsedYAnim.value)],
      [fullHeroH, HALF_HERO_H, fullHeroH],
      Extrapolation.CLAMP,
    ),
  }));

  // Slide in from off-screen on mount — half-screen by default whenever a destination is
  // selected, unless initialSnap requests otherwise (e.g. the spot carousel's "list view"
  // button wants 'full').
  const didMountRef = useRef(false);
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resolvedInitialSnap === 'full') {
      snapStateRef.current = 'full';
      snapStateSV.value = 'full';
      lastPos.value = FULL_POS;
      slideAnim.value = withTiming(FULL_POS, SNAP_CONFIG);
      onExpand?.();
      onSnapStateChange?.('full');
    } else if (resolvedInitialSnap === 'half') {
      snapStateRef.current = 'half';
      snapStateSV.value = 'half';
      lastPos.value = HALF_POS;
      slideAnim.value = withTiming(HALF_POS, SNAP_CONFIG);
      onSnapStateChange?.('half');
    } else {
      slideAnim.value = withTiming(collapsedYRef.current, SNAP_CONFIG);
      onSnapStateChange?.('collapsed');
    }
    onCollapsedTopChange?.(H - (resolvedInitialSnap === 'half' ? HALF_POS : collapsedYRef.current));
  }, []);

  // Reset to half-screen + default tab on genuine destination switches — but not on the
  // very first mount (already applied initialSnap/initialTab above), and not on a hero-swipe
  // carousel change, which should preserve exactly whatever snap state/tab the user was
  // already on — only the displayed destination's own data should change.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (carouselSwapRef.current) { carouselSwapRef.current = false; return; }
    snapStateRef.current = 'half';
    snapStateSV.value = 'half';
    slideAnim.value = CLOSE_POS;
    lastPos.value = HALF_POS;
    slideAnim.value = withTiming(HALF_POS, SNAP_CONFIG);
    // Same reasoning as snapToHalfRef below: if the PREVIOUS destination was being viewed
    // full-screen, mapState is still 'sheet' from that — revert it so the back-pill's
    // `mapState !== 'sheet'` visibility check passes for this new destination's half view.
    onCollapse?.();
    onSnapStateChange?.('half');
    onCollapsedTopChange?.(H - HALF_POS);
    setIsHalfState(true);
    setHasUserPickedTab(false);
    activeTabRef.current = defaultTab;
    setActiveTab(defaultTab);
    tabSlideAnim.value = 0;
  }, [destination.id]);

  // Use refs so panResponder (created once) always calls the latest version
  const snapToFullRef = useRef(() => {});
  snapToFullRef.current = () => {
    snapStateRef.current = 'full';
    snapStateSV.value = 'full';
    lastPos.value = FULL_POS;
    onExpand?.();
    onSnapStateChange?.('full');
    setIsHalfState(false);
    slideAnim.value = withTiming(FULL_POS, SNAP_CONFIG);
  };

  // Half-screen — deliberately does NOT call onExpand (that flips the map's mapState to
  // 'sheet', which hides the back-to-country pill; half-screen wants the pill to stay
  // visible, just repositioned above the sheet's new top edge via onSnapStateChange).
  // It DOES call onCollapse, though — not to actually collapse anything, just because
  // that's what reverts mapState back to 'context' (via handleCloseSheet in MapScreen).
  // Without this, swiping down from FULL (which did call onExpand, setting mapState to
  // 'sheet') left mapState stuck there, and the pill's `mapState !== 'sheet'` visibility
  // check kept failing the whole time the sheet sat at half — the pill only reappeared
  // once the user dragged all the way down to collapsed, which does call onCollapse.
  const snapToHalfRef = useRef(() => {});
  snapToHalfRef.current = () => {
    snapStateRef.current = 'half';
    snapStateSV.value = 'half';
    lastPos.value = HALF_POS;
    onCollapse?.();
    onSnapStateChange?.('half');
    onCollapsedTopChange?.(H - HALF_POS);
    setIsHalfState(true);
    slideAnim.value = withTiming(HALF_POS, SNAP_CONFIG);
  };

  const snapToCollapsedRef = useRef(() => {});
  snapToCollapsedRef.current = () => {
    const cy = collapsedYRef.current;
    snapStateRef.current = 'collapsed';
    snapStateSV.value = 'collapsed';
    lastPos.value = cy;
    onCollapse?.();
    onSnapStateChange?.('collapsed');
    onCollapsedTopChange?.(H - cy);
    setIsHalfState(false);
    slideAnim.value = withTiming(cy, SNAP_CONFIG);
  };

  // Imperatively collapse from the parent (e.g. the user started panning the map while this
  // sheet sat at half-screen) — no-ops unless actually at half, so it's safe to bump this
  // regardless of the sheet's current state.
  const lastCollapseSignalRef = useRef(collapseSignal);
  useEffect(() => {
    if (collapseSignal === undefined || collapseSignal === lastCollapseSignalRef.current) return;
    lastCollapseSignalRef.current = collapseSignal;
    if (snapStateRef.current === 'half') snapToCollapsedRef.current();
  }, [collapseSignal]);

  const dismissSheetRef = useRef(() => {});
  dismissSheetRef.current = () => {
    slideAnim.value = withTiming(CLOSE_POS, { duration: 280 }, finished => {
      if (finished) runOnJS(onClose)(true);
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
  // for that scroll gesture purely off its raw translation/velocity, which is what caused an
  // upward content scroll to incorrectly snap the sheet down to half once released.
  const dragEngagedSV = useSharedValue(false);

  // Runs entirely on the UI thread — onUpdate fires every touch-move frame with zero
  // JS-thread/bridge round trip, which is what actually eliminates the drag jank (switching
  // the sheet's own positioning from `top` to `transform` wasn't enough on its own, since the
  // old PanResponder computed every frame's position on the JS thread regardless of which
  // style property consumed it).
  let pan = Gesture.Pan()
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
      if (Math.abs(e.translationX) >= Math.abs(e.translationY)) return;
      // Mirrors the old onMoveShouldSetPanResponderCapture gate: while full-screen, only
      // let this gesture pull the sheet down once its inner ScrollView is already at top.
      if (snapStateSV.value === 'full' && !(scrollYSV.value <= 1 && e.translationY > 6)) return;
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
        // to full instead of locking at half first. A fast fling that never physically
        // crosses halfway still only reaches half (mirrors full → half → collapsed).
        if (pos <= HALF_POS) { runOnJS(callSnapToFull)(); return; }
        if (e.velocityY < -500 || pos < cy - 60) runOnJS(callSnapToHalf)();
        else if (e.velocityY > 500 || pos > cy + 40) runOnJS(callDismissSheet)();
        else runOnJS(callSnapToCollapsed)();
        return;
      }

      if (snapStateSV.value === 'full') {
        // A gesture that never actually engaged (e.g. an upward scroll, or a downward one
        // that never got past the "scrolled to top" gate) shouldn't change the sheet's snap
        // state at all — leave it exactly at full.
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
    });
  // Only needed for the full-screen case (scrolled to top, then drag down) — without this,
  // the inner ScrollView's own native pan (iOS UIScrollView / Android NestedScrollView)
  // claims the touch outright while full-screen, so our gesture never even starts
  // recognizing. Letting both recognize simultaneously there means the ScrollView keeps
  // scrolling normally, while our onUpdate's own `scrollYSV.value <= 1` check (above)
  // decides whether a given downward drag should also start moving the sheet.
  //
  // Deliberately NOT applied in half-screen: content is meant to be completely static there
  // (scrollEnabled is already false), and giving the ScrollView's recognizer a simultaneous
  // claim on the touch was letting it visibly "grab" the content for the first few pixels of
  // a swipe-up-to-full gesture before our own gesture took over. Exclusive recognition here
  // means our Pan claims the touch outright, with no residual scroll interaction at all.
  if (!isHalfState) {
    pan = pan.simultaneousWithExternalGesture(scrollRef);
  }

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
  // Full-screen keeps the top row (X/wishlist/visit) below the status bar, as before. In
  // half-screen the hero is already cropped short and doesn't overlap the status bar at
  // all, so that same offset just reads as awkward empty space above the buttons instead
  // of them sitting in the corner — nudge them up as the sheet passes through half-screen,
  // interpolated off slideAnim (like heroHeightAnim) so it glides rather than snapping.
  const heroTopRowStyle = useAnimatedStyle(() => ({
    top: interpolate(slideAnim.value, [FULL_POS, HALF_POS], [insets.top + 20, 28], Extrapolation.CLAMP),
  }));
  // Carries both the vertical snap-drag position AND the horizontal destination-carousel
  // offset — applied to the *whole* sheet shape (this style, not just its inner content) is
  // what makes the entire card (rounded corners, shadow, background) move together during a
  // hero swipe, instead of the content sliding within a fixed sheet-shaped window.
  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }, { translateX: heroTranslateX.value }],
  }));
  // The incoming destination's own whole sheet — locked to sit exactly one screen-width
  // adjoined to the current one (same formula as the old previewCardStyle), so the two
  // slide as a matched pair with no gap, but now as two independent sheet-shaped siblings
  // rather than content confined within the current sheet's own clipped bounds.
  const previewSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: slideAnim.value },
      { translateX: heroTranslateX.value - previewSignSV.value * W },
    ],
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
        pointerEvents={snapStateRef.current === 'full' ? 'box-none' : 'none'}
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

      {/* ── PREVIEW GHOST SHEET — the incoming destination's whole sheet (own rounded
          corners/shadow/background), locked to sit exactly one screen-width adjoined to the
          current sheet (see previewSheetAnimStyle) for as long as the hero-swipe gesture or
          its commit/cancel animation is running. A sibling of the real sheet — not nested
          inside its clipped content — so it can actually render alongside/beside it rather
          than being confined to the current sheet's own bounds. Non-interactive and limited
          to hero+tab bar (matching exactly what's visible in collapsed/half-screen anyway;
          in full-screen the content below simply appears once the swap completes), since
          duplicating this sheet's entire interactive scrollable content for a
          transient preview isn't worth the complexity. */}
      {previewDest && (
        <Reanimated.View pointerEvents="none" style={[st.sheet, previewSheetAnimStyle]}>
          <Reanimated.View style={[st.hero, { backgroundColor: CONTINENT_COLORS[previewDest.continent] }, heroAnimStyle]}>
            {previewPhotoUrl && <Image source={{ uri: previewPhotoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            <View pointerEvents="none" style={st.heroScrim} />
            <View style={[st.heroBottomStack, st.heroBottomStackPad]}>
              <View style={st.heroContent}>
                <Text style={st.heroName} numberOfLines={1}>{previewDest.name}</Text>
                <View style={st.heroMeta}>
                  <View style={st.heroFlagCircle}>
                    <View style={st.heroFlagClip}>
                      <Image
                        source={{ uri: `https://flagcdn.com/w160/${previewDest.countryCode.toLowerCase()}.png` }}
                        style={st.heroFlagImg}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                  <Text style={st.heroMetaTxt}>{previewDest.country}</Text>
                  <Text style={st.heroMetaDot}> · </Text>
                  <Text style={st.heroMetaTxt}>{previewDest.continent}</Text>
                </View>
                {!!previewDest.tagline && (
                  <Text style={st.heroTagline} numberOfLines={2}>{previewDest.tagline}</Text>
                )}
                {previewSpots.length > 0 && (
                  <View style={st.commRatingRow}>
                    <MapPin size={12} color="rgba(255,255,255,0.80)" />
                    <Text style={st.commRatingCount}>{previewSpots.length} spots</Text>
                  </View>
                )}
              </View>
            </View>
          </Reanimated.View>
          <View style={st.tabBar}>{renderTabBarRow()}</View>
        </Reanimated.View>
      )}

      <GestureDetector gesture={pan}>
      <Reanimated.View style={[st.sheet, sheetAnimStyle]}>

        {/* Drag handle — the compact card has its own (pillRow/pill below), but that
            card is hidden entirely in half-screen, so half needs its own visible handle
            at the sheet's own top-center to signal it's draggable. */}
        {isHalfState && (
          <View pointerEvents="none" style={st.halfHandleRow}>
            <View style={st.halfHandle} />
          </View>
        )}

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
          // Half-screen is a fixed crop (hero + tab bar, nothing else) — not a scrollable
          // preview — so the only way out of it is the drag gesture (swipe up to full,
          // down to collapsed), not an internal scroll.
          scrollEnabled={!isHalfState}
          bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const y = e.nativeEvent.contentOffset.y;
            scrollYSV.value = y;
            scrollYAnim.setValue(y);
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── HERO ───────────────────────────────────────────────────── */}
          <GestureDetector gesture={heroSwipeGesture}>
          <Reanimated.View style={[st.hero, { backgroundColor: color }, heroAnimStyle]}>
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
                {/* Wishlisting only makes sense before a visit is logged — once visited,
                    the destination has already been "gotten to", so the option disappears. */}
                {!isVisited && (
                  <Pressable
                    style={[st.heroIconBtn, isWishlist && st.heroIconBtnWishlist]}
                    onPress={handleWishlist} hitSlop={10}>
                    <Heart size={16} color="white" fill={isWishlist ? 'white' : 'none'} strokeWidth={isWishlist ? 0 : 2.25} />
                  </Pressable>
                )}
              </View>
            </Reanimated.View>

            {/* Bottom stack: pushed to hero bottom via justifyContent on parent. A touch of
                extra bottom padding (both half- and full-screen), nudging the content up
                slightly within the same fixed hero height — doesn't change how much room
                hero+tab bar take up overall, just the gap between "X spots" and the tab
                bar. Irrelevant while collapsed, since the compact card covers the hero. */}
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
                  <Text style={st.heroMetaDot}> · </Text>
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
          </GestureDetector>

        {/* Tab swipe handler wraps only the tab bar row + content below it — NOT the hero
            above — so a horizontal swipe on the header always drives the destination
            carousel (heroSwipeGesture) and never the tab switch, regardless of activation
            threshold races between the two gestures. */}
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
          <View style={st.tabBar}>
            {renderTabBarRow()}
          </View>

          {/* ── CONTENT ────────────────────────────────────────────────── */}
          <View style={st.content}>

            {/* ── SLIDE TRACK for tabs ─────────────────────────────────── */}
            <View style={st.slideTrack}>
              <Reanimated.View
                style={[st.slideRow, { width: W * TAB_ORDER.length }, slideRowStyle]}
              >

                  {/* ── MY VISIT PANEL — visited destinations only ──────── */}
                  {isVisited && (
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

                      {/* Row 2: Photos collage */}
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
                        <ScrollView ref={visitCarouselScrollRef} horizontal showsHorizontalScrollIndicator={false}
                          contentContainerStyle={st.spcRow}>
                          {spots.map(spot => (
                            <SpotPhotoCard key={spot.id} spot={spot} color={color} onPress={() => onSelectSpot?.(spot)} />
                          ))}
                        </ScrollView>
                      </View>
                    )}

                  </View>
                  )}

                  {/* ── ABOUT PANEL ────────────────────────────────────── */}
                  <View style={st.slidePanel}>
                    <AboutPanel
                      destination={destination} spots={spots} color={color}
                      bestMonths={bestMonths} photoUrl={photoUrl}
                      onSelectSpot={onSelectSpot}
                      onOpenClimateDetail={() => setShowClimateDetail(true)}
                      onSeeAllSpots={() => switchTabRef.current('spots')}
                      hlScrollRef={aboutHlScrollRef}
                    />
                  </View>

                  {/* ── SPOTS PANEL — full grid, category filters, map-view button ── */}
                  <View style={st.slidePanel}>
                    <SpotsPanel spots={spots} color={color} onSelectSpot={onSelectSpot} filterScrollRef={spotsFilterScrollRef} />
                  </View>
                </Reanimated.View>
              </View>

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

        {/* ── COMPACT CARD — absolute overlay, slides off top as sheet expands.
            Force-hidden in half-screen mode: compactTranslateY's clamp only fully clears it
            once the sheet has passed the collapsed card's own height above HALF_POS, which
            isn't reliably true at exactly the screen midpoint, so it'd otherwise still show
            through over the real hero/tab bar. */}
        <Reanimated.View
          pointerEvents={isHalfState ? 'none' : 'auto'}
          style={[{
            position: 'absolute', left: 0, right: 0, top: 0,
            backgroundColor: 'white',
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            opacity: isHalfState ? 0 : 1,
          }, compactAnimStyle]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h < 20) return;
            const newCY = Math.max(0, H - BOTTOM_TAB_H - h);
            if (Math.abs(newCY - collapsedYRef.current) < 2) return;
            collapsedYRef.current = newCY;
            collapsedYAnim.value = newCY;
            onCollapsedTopChange?.(H - newCY);
            if (snapStateRef.current === 'collapsed') {
              lastPos.value = newCY;
              slideAnim.value = withTiming(newCY, QUICK_CONFIG);
            }
          }}
        >
          {/* Pill */}
          <View pointerEvents="none" style={st.pillRow}>
            <Reanimated.View style={[st.pill, pillBgStyle]} />
          </View>

          {/* Heading — indicates you're browsing the destinations within this country,
              identical layout to SpotSheet's own carHeader. */}
          <View style={st.carHeader}>
            <View style={{ flex: 1 }}>
              <Text style={st.carEyebrow}>DESTINATIONS IN</Text>
              <View style={st.carDestRow}>
                <CircleFlag countryCode={destination.countryCode} size={16} />
                <Text style={st.carDest} numberOfLines={1}>{destination.country}</Text>
              </View>
            </View>
            <Text style={st.carCounter}>
              {countryDests.findIndex(d => d.id === destination.id) + 1} / {countryDests.length}
            </Text>
            {!!onGoToCountryList && (
              <Pressable style={st.carListBtn} onPress={onGoToCountryList} hitSlop={8}>
                <LayoutGrid size={14} color="#6B7280" />
                <Text style={st.carListBtnTxt}>List</Text>
              </Pressable>
            )}
          </View>

          {/* Collapsed carousel — swipe between this country's destinations, identical
              mechanism to SpotSheet's own collapsed carousel: a horizontal ScrollView with
              peek-adjacent neighbor cards. */}
          <ScrollView
            ref={compactCarouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={COMPACT_CARD_SNAP}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: COMPACT_SIDE_PAD }}
            onMomentumScrollEnd={e => handleCompactCarouselSettle(e.nativeEvent.contentOffset.x)}
          >
            {countryDests.map((dest, i) => (
              <CompactCarouselCard
                key={dest.id}
                dest={dest}
                isActive={dest.id === destination.id}
                savedDestinations={savedDestinations}
                onPress={() => {
                  if (dest.id !== destination.id) {
                    commitDestinationSwap(dest);
                    compactCarouselRef.current?.scrollTo({ x: i * COMPACT_CARD_SNAP, animated: true });
                  }
                  snapToFullRef.current();
                }}
              />
            ))}
          </ScrollView>
        </Reanimated.View>

      </Reanimated.View>
      </GestureDetector>



      {showEditSheet && (
        <VisitEditSheet destination={destination} onClose={() => setShowEditSheet(false)} />
      )}
      {showClimateDetail && (
        <ClimateDetailModal destination={destination} onClose={() => setShowClimateDetail(false)} />
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
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex:200, elevation:200 },
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

  // ── Compact card header ─────────────────────────────────────────────────────
  // Collapsed carousel cards — same visual language the old single static compact row had
  // (thumb/info/Open button), just narrower and boxed so neighbors can peek in on the
  // sides; active card gets a colored border, mirroring SpotSheet's own carousel cards.
  compactCarouselCard: {
    flexDirection:'row', alignItems:'flex-start', gap:16,
    paddingTop:16, paddingBottom:16, paddingHorizontal:16,
    marginTop:12,
    backgroundColor:'white', borderRadius:18,
    borderWidth:1, borderColor:'#F0F1F3',
    shadowColor:'#000', shadowOpacity:0.06, shadowRadius:8, shadowOffset:{ width:0, height:3 }, elevation:2,
  },
  compactCarouselCardActive: { borderColor:'#16A34A' },
  // Collapsed-carousel heading row. paddingTop is larger than SpotSheet's own carHeader
  // because this card's pillRow (the drag-handle pill above) is absolutely positioned and
  // so doesn't reserve any flow space of its own — this padding is the only thing keeping
  // the heading text clear of both the handle and the card's top edge.
  carHeader: { flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop:20, paddingBottom:4 },
  carEyebrow: { fontSize:10, fontWeight:'800', color:'#9CA3AF', letterSpacing:1.3, marginBottom:2 },
  carDestRow: { flexDirection:'row', alignItems:'center', gap:6 },
  carDest:    { fontSize:18, fontWeight:'800', color:'#111827' },
  carCounter: { fontSize:13, fontWeight:'700', color:'#9CA3AF' },
  carListBtn:    { flexDirection:'row', alignItems:'center', gap:4,
                   marginLeft:12, paddingHorizontal:4, paddingVertical:4 },
  carListBtnTxt: { fontSize:12.5, fontWeight:'600', color:'#6B7280' },
  // Compact carousel card — same compact horizontal treatment as SpotSheet's own carousel
  // card: fixed image on the left (status badge overlaid on it), category/name/stat-row/
  // description on the right, "Swipe up for details" only on the active card.
  compactThumb: {
    width:96, height:96, borderRadius:14,
    overflow:'hidden', alignItems:'center', justifyContent:'center', flexShrink:0,
  },
  compactThumbIcon: { fontSize:30 },
  compactBadge: {
    position:'absolute', top:6, right:6, width:22, height:22, borderRadius:11,
    backgroundColor:'white', alignItems:'center', justifyContent:'center',
    shadowColor:'#000', shadowOpacity:0.15, shadowRadius:4, elevation:3,
  },
  compactInfo:    { flex:1, gap:3 },
  compactCat:     { fontSize:11.5, fontWeight:'600', color:'#6B7280' },
  compactName:    { fontSize:15.5, fontWeight:'800', color:'#111827', lineHeight:19 },
  compactStatRow: { flexDirection:'row', alignItems:'center', gap:4 },
  compactStatTxt: { fontSize:12.5, fontWeight:'700', color:'#16A34A' },
  compactBio:     { fontSize:12, color:'#6B7280', lineHeight:16 },
  compactExpandRow: { flexDirection:'row', alignItems:'center', gap:4, marginTop:2 },
  compactExpandTxt: { fontSize:12, fontWeight:'600', color:'#16A34A' },

  // Pill
  pillRow: { position:'absolute', top:10, left:0, right:0, alignItems:'center', zIndex:10 },
  pill:    { width:36, height:4, borderRadius:2 },
  // Half-screen's own drag handle — compact card's pillRow/pill above is hidden then, so
  // this stands in, sitting directly over the (cropped) hero at the sheet's top edge.
  halfHandleRow: { position:'absolute', top:10, left:0, right:0, alignItems:'center', zIndex:10 },
  halfHandle:    { width:36, height:4, borderRadius:2, backgroundColor:'rgba(255,255,255,0.65)' },

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
    width:36, height:36, borderRadius:18,
    backgroundColor:'rgba(0,0,0,0.35)', alignItems:'center', justifyContent:'center',
    borderWidth:1.5, borderColor:'rgba(255,255,255,0.25)',
  },
  heroActionsRight:     { flexDirection:'row', gap:10, alignItems:'center' },
  heroIconBtnVisited:   { backgroundColor:'#059669', borderColor:'transparent' },
  heroIconBtnWishlist:  { backgroundColor:'#DB2777', borderColor:'transparent' },
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
  heroMetaDot:   { fontSize:14, color:'rgba(255,255,255,0.40)' },
  heroFlagCircle: { width:20, height:20, borderRadius:10, backgroundColor:'#fff', alignItems:'center', justifyContent:'center', marginRight:6 },
  heroFlagClip:   { width:17, height:17, borderRadius:8.5, overflow:'hidden' },
  heroFlagImg:    { width:17, height:17 },
  heroTagline: { fontSize:14, color:'rgba(255,255,255,0.78)', lineHeight:20, fontWeight:'400', letterSpacing:0.1 },

  // Spots row
  commRatingRow:  { flexDirection:'row', alignItems:'center', gap:5, marginTop:6 },
  commRatingCount:{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:'500' },


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
  tabVisitBadge:       { minWidth:20, height:20, borderRadius:6, backgroundColor:'#E5E7EB',
                         paddingHorizontal:5, alignItems:'center', justifyContent:'center' },
  tabVisitBadgeActive: { backgroundColor:'#16A34A' },
  tabVisitBadgeTxt:    { fontSize:11, fontWeight:'800', color:'#6B7280', lineHeight:14 },
  tabVisitBadgeTxtActive:{ color:'white' },
  // Spots count — a plain gray rounded-square icon, always (never switches color when the
  // tab is selected, unlike the visit badge above).
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
  spcOverlay:         { position:'absolute', left:0, right:0, bottom:0, height:68, backgroundColor:'rgba(0,0,0,0.45)' },
  spcCatTag:          { position:'absolute', bottom:32, left:8, right:8 },
  spcCatTagTxt:       { fontSize:10, fontWeight:'700', color:'rgba(255,255,255,0.85)' },
  spcName:            { position:'absolute', bottom:8, left:8, right:8, fontSize:12, fontWeight:'700', color:'white', lineHeight:16 },

  // Plain (non-colored) section header + "See all" link — used for the At a Glance /
  // Highlights pair, which read as light-gray caps rather than the colored-eyebrow style
  // previously used by the rest of the About page.
  plainSectionHeader: { fontSize:13, fontWeight:'800', color:'#9CA3AF', letterSpacing:0.4 },
  seeAllRow:          { flexDirection:'row', alignItems:'center', gap:1 },
  seeAllTxt:          { fontSize:14, fontWeight:'600', color:'#16A34A' },

  // At a glance — one connected card containing all three rows (hairline dividers between
  // them) rather than separate floating cards, since these are informational, not tappable.
  glanceStack:     { backgroundColor:'white', borderRadius:16, overflow:'hidden',
                     borderWidth:1, borderColor:'#F0F1F3',
                     shadowColor:'#000', shadowOpacity:0.04, shadowRadius:6, shadowOffset:{ width:0, height:2 }, elevation:1 },
  glanceRow:       { flexDirection:'row', alignItems:'center', gap:12, padding:14 },
  glanceRowDivider:{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor:'#F0F1F3' },
  glanceNumBadge:  { width:42, height:42, borderRadius:12, backgroundColor:'#ECFDF5',
                     alignItems:'center', justifyContent:'center' },
  glanceNumTxt:    { fontSize:16, fontWeight:'800', color:'#16A34A' },
  glanceRowTitle:  { flex:1, fontSize:15, fontWeight:'700', color:'#111827', lineHeight:20 },

  // Highlight cards (bigger than the old spot preview cards — photo, badge, name, bio)
  hlRow:        { gap:14, paddingBottom:4, paddingRight:4 },
  hlCard:       { width:160, gap:8 },
  hlImageWrap:  { width:160, height:140, borderRadius:16, overflow:'hidden', backgroundColor:'#F3F4F6' },
  hlBadge:      { position:'absolute', bottom:10, left:10, width:38, height:38, borderRadius:19,
                  backgroundColor:'white', alignItems:'center', justifyContent:'center',
                  shadowColor:'#000', shadowOpacity:0.18, shadowRadius:5, shadowOffset:{ width:0, height:2 }, elevation:4 },
  hlBadgeIcon:  { fontSize:17 },
  hlName:       { fontSize:15, fontWeight:'800', color:'#111827', lineHeight:19 },
  hlBio:        { fontSize:12.5, color:'#6B7280', lineHeight:17 },

  // Spots tab — 2-column wrapping grid (reuses HighlightCard's badge/name/bio look),
  // a category filter tag row, and a discrete link into the sliding spot carousel (kept
  // low-key since the grid itself, not the carousel, is the primary way to browse here).
  mapViewBtn:      { flexDirection:'row', alignItems:'center', gap:5,
                     alignSelf:'flex-end', paddingHorizontal:4, paddingVertical:4 },
  mapViewBtnTxt:   { fontSize:13, fontWeight:'600', color:'#6B7280' },
  filterRow:       { gap:8, paddingBottom:2, paddingRight:4 },
  filterTag:       { flexDirection:'row', alignItems:'center', gap:6,
                     backgroundColor:'#F3F4F6', borderRadius:20, paddingHorizontal:14, paddingVertical:9 },
  filterTagActive: { backgroundColor:'#059669' },
  filterTagIcon:   { fontSize:13 },
  filterTagTxt:    { fontSize:13.5, fontWeight:'600', color:'#4B5563' },
  filterTagTxtActive: { color:'white' },
  spotsGrid:       { flexDirection:'row', flexWrap:'wrap', gap:GRID_GAP },
  gridCard:        { width:GRID_CARD_W, gap:8 },
  gridImageWrap:   { width:GRID_CARD_W, height:GRID_CARD_W * 0.87, borderRadius:16, overflow:'hidden', backgroundColor:'#F3F4F6' },
  gridEmptyTxt:    { fontSize:14, color:'#9CA3AF', textAlign:'center', paddingVertical:24 },

  // About
  aboutTxt: { fontSize:15.5, color:'#374151', lineHeight:25 },

  // Section header row (label + optional icon/link on the right)
  secHeadRow:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },

  // When to visit — best-time-to-go card, month-by-month crowd/rain/temp grid, legend,
  // and a link into the full ClimateDetailModal breakdown.
  wtvCard:        { backgroundColor:'white', borderRadius:16, padding:14, gap:14,
                    borderWidth:1, borderColor:'#F0F1F3' },
  wtvHeadRow:     { flexDirection:'row', alignItems:'center', gap:12 },
  wtvIconWrap:    { width:38, height:38, borderRadius:12, backgroundColor:'#ECFDF5',
                    alignItems:'center', justifyContent:'center' },
  wtvTitle:       { fontSize:14.5, fontWeight:'700', color:'#111827' },
  wtvSubtitle:    { fontSize:12.5, color:'#9CA3AF', marginTop:2, lineHeight:17 },
  wtvPhoto:       { width:56, height:44, borderRadius:10, backgroundColor:'#F3F4F6' },
  wtvGrid:        { gap:7 },
  wtvGridRow:     { flexDirection:'row', alignItems:'center' },
  wtvRowLabel:    { width:46 },
  wtvRowLabelTxt: { width:46, fontSize:10, fontWeight:'700', color:'#9CA3AF' },
  wtvMonthTxt:    { flex:1, textAlign:'center', fontSize:9, fontWeight:'700', color:'#9CA3AF' },
  wtvMonthTxtBest:{ color:'#16A34A' },
  wtvDotCell:     { flex:1, alignItems:'center', justifyContent:'center' },
  wtvDot:         { width:9, height:9, borderRadius:4.5 },
  wtvLegendRow:   { flexDirection:'row', gap:14 },
  wtvLegendItem:  { flexDirection:'row', alignItems:'center', gap:5 },
  wtvLegendDot:   { width:8, height:8, borderRadius:4 },
  wtvLegendTxt:   { fontSize:11.5, color:'#6B7280', fontWeight:'500' },
  wtvGuideBtn:    { flexDirection:'row', alignItems:'center', gap:8,
                    backgroundColor:'#F9FAFB', borderRadius:12, padding:11 },
  wtvGuideBtnTxt: { flex:1, fontSize:13, fontWeight:'600', color:'#374151' },

  // Good to know — one connected card, each row its own custom icon (single consistent
  // badge color, no per-tip tagging), bold title, and a detail line underneath.
  goodToKnowHeadRow: { flexDirection:'row', alignItems:'center', gap:6 },
  tipStack:     { backgroundColor:'white', borderRadius:16, overflow:'hidden',
                  borderWidth:1, borderColor:'#F0F1F3' },
  tipRow:       { flexDirection:'row', gap:12, padding:14 },
  tipRowDivider:{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor:'#F0F1F3' },
  tipIconBadge: { width:40, height:40, borderRadius:20, backgroundColor:'#FEF3C7',
                  alignItems:'center', justifyContent:'center' },
  tipIconTxt:   { fontSize:18 },
  tipTitleTxt:  { fontSize:14.5, fontWeight:'700', color:'#111827', marginBottom:2 },
  tipDetailTxt: { fontSize:13, color:'#6B7280', lineHeight:18 },
});
