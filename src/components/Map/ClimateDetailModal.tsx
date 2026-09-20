import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, Dimensions, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { X, Users, Thermometer, CloudRain } from 'lucide-react-native';
import { MONTHS_SHORT, crowdColor } from '../../utils/travelData';
import type { MonthCrowd, MonthWeather, MonthRain } from '../../utils/travelData';
import { useDestinationClimate } from '../../utils/climateApi';
import type { Destination } from '../../types';

const { height: H, width: W } = Dimensions.get('window');
const CHART_W = W - 32 - 32; // screen minus outer padding minus card padding
// None of the three charts has a y-axis anymore — all three now lay out their 12 months as
// equal-width flex columns spanning the same full CHART_W, so the month positions are
// pixel-identical across all three cards.

interface Props {
  // Widened from a structural subset to the real Destination: the climate lookup needs
  // longitude, which that subset omitted. The only caller already passes a full Destination.
  destination: Destination;
  onClose: () => void;
}

// ── Crowds by Month — vertical bar chart ──────────────────────────────────────
function CrowdChart({ data }: { data: MonthCrowd[] }) {
  const BAR_MAX = 90;
  return (
    <View>
      <View style={st.barsArea}>
        {data.map((c, i) => (
          <View key={i} style={st.barCol}>
            <View style={[st.bar, { height: Math.max(6, (c.level / 5) * BAR_MAX), backgroundColor: crowdColor(c.level) }]} />
            <Text style={st.monthLbl}>{c.month[0]}</Text>
          </View>
        ))}
      </View>
      <View style={st.legendRow}>
        {[
          { label: 'Low',       color: crowdColor(1) },
          { label: 'Moderate',  color: crowdColor(3) },
          { label: 'High',      color: crowdColor(4) },
          { label: 'Very High', color: crowdColor(5) },
        ].map(l => (
          <View key={l.label} style={st.legendItem}>
            <View style={[st.legendDot, { backgroundColor: l.color }]} />
            <Text style={st.legendTxt}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Average Temperatures — dual-line SVG chart ────────────────────────────────
function TempChart({ data }: { data: MonthWeather[] }) {
  const highs = data.map(d => d.tempC);
  const lows  = data.map(d => d.tempLowC);
  const dataMin = Math.min(...lows);
  const dataMax = Math.max(...highs);
  // "Nice" rounded axis bounds (nearest 10) with a little breathing room.
  const axisMin = Math.floor((dataMin - 3) / 10) * 10;
  const axisMax = Math.ceil((dataMax + 3) / 10) * 10;
  const span = Math.max(1, axisMax - axisMin);

  const CHART_H = 150;
  // Each month gets an equal-width column (CHART_W / 12), point plotted at its column's
  // center — the same scheme the two bar charts use via flex — so all three charts' months
  // land at identical x positions. Centering (rather than spacing points edge-to-edge)
  // also keeps the first/last value labels clear of the SVG's bounds on their own.
  const colW = CHART_W / data.length;
  const xFor = (i: number) => colW * (i + 0.5);
  const yFor = (t: number) => CHART_H - ((t - axisMin) / span) * CHART_H;

  const highPts = highs.map((t, i) => `${xFor(i)},${yFor(t)}`).join(' ');
  const lowPts  = lows.map((t, i) => `${xFor(i)},${yFor(t)}`).join(' ');

  return (
    <View>
      <View style={st.legendRowTop}>
        <View style={st.legendItem}>
          <View style={[st.legendDot, { backgroundColor: '#F97316' }]} />
          <Text style={st.legendTxt}>High</Text>
        </View>
        <View style={st.legendItem}>
          <View style={[st.legendDot, { backgroundColor: '#3B82F6' }]} />
          <Text style={st.legendTxt}>Low</Text>
        </View>
      </View>
      <Svg width={CHART_W} height={CHART_H + 24}>
        <Polyline points={highPts} fill="none" stroke="#F97316" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={lowPts}  fill="none" stroke="#3B82F6" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {highs.map((t, i) => (
          <React.Fragment key={`h${i}`}>
            <Circle cx={xFor(i)} cy={yFor(t)} r={3} fill="#F97316" />
            <SvgText x={xFor(i)} y={yFor(t) - 8} fontSize={10} fontWeight="700" fill="#374151" textAnchor="middle">
              {t}°
            </SvgText>
          </React.Fragment>
        ))}
        {lows.map((t, i) => (
          <React.Fragment key={`l${i}`}>
            <Circle cx={xFor(i)} cy={yFor(t)} r={3} fill="#3B82F6" />
            <SvgText x={xFor(i)} y={yFor(t) + 16} fontSize={10} fontWeight="700" fill="#374151" textAnchor="middle">
              {t}°
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
      <View style={st.monthRowFlex}>
        {data.map((d, i) => (
          <Text key={i} style={[st.monthLbl, st.monthLblFlex]}>{d.month[0]}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Rainy Days — vertical bar chart ───────────────────────────────────────────
// Fixed axis (0–30) rather than one scaled to the data, so the scale reads consistently
// across destinations — bar height still scales against 31 as headroom, so a month with
// more rainy days than the top label can still grow slightly past it instead of clipping.
// Rainfall bars are scaled per destination rather than against a fixed ceiling: monthly totals
// span roughly 0mm in Dubai to 380mm in Bali, so any single maximum would either flatten dry
// climates to nothing or clip wet ones. Floored so a near-dry destination doesn't amplify a
// 3mm month into a full-height bar.
const RAIN_SCALE_MIN = 60;

function RainChart({ data }: { data: MonthRain[] }) {
  const BAR_MAX = 90;
  const scaleMax = Math.max(RAIN_SCALE_MIN, ...data.map(d => d.mm));
  return (
    <View style={st.barsArea}>
      {data.map((d, i) => (
        <View key={i} style={st.barCol}>
          <View style={st.barTrack}>
            <Text style={st.barValueLbl}>{d.mm}</Text>
            <View style={[st.bar, { height: Math.max(4, (d.mm / scaleMax) * BAR_MAX), backgroundColor: '#60A5FA' }]} />
          </View>
          <Text style={st.monthLbl}>{d.month[0]}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ClimateDetailModal({ destination, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(H)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 0, damping: 24, stiffness: 260, useNativeDriver: true }).start();
  }, []);
  const dismiss = () => {
    Animated.timing(slide, { toValue: H, duration: 280, useNativeDriver: true }).start(onClose);
  };

  // Same hook the destination sheet uses, so this detail view and the summary card can never
  // show different numbers for the same destination.
  const { weather: weatherData, rain: rainData, crowds: crowdData } =
    useDestinationClimate(destination);

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[st.sheet, { transform: [{ translateY: slide }] }]}>
      <View style={[st.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={dismiss} style={st.closeBtn} hitSlop={12}>
          <X size={18} color="#111827" />
        </Pressable>
        <Text style={st.headerTitle} numberOfLines={1}>{destination.name}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={st.card}>
          <View style={st.cardHeadRow}>
            <Users size={16} color="#111827" />
            <View style={{ marginLeft: 8 }}>
              <Text style={st.cardTitle}>CROWDS BY MONTH</Text>
              <Text style={st.cardSub}>Based on visitor data</Text>
            </View>
          </View>
          <CrowdChart data={crowdData} />
        </View>

        <View style={st.card}>
          <View style={st.cardHeadRow}>
            <Thermometer size={16} color="#111827" />
            <Text style={[st.cardTitle, { marginLeft: 8 }]}>AVERAGE TEMPERATURES (°C)</Text>
          </View>
          <TempChart data={weatherData} />
        </View>

        <View style={st.card}>
          <View style={st.cardHeadRow}>
            <CloudRain size={16} color="#111827" />
            <View style={{ marginLeft: 8 }}>
              <Text style={st.cardTitle}>RAINFALL (MM)</Text>
              <Text style={st.cardSub}>Average monthly total precipitation</Text>
            </View>
          </View>
          <RainChart data={rainData} />
        </View>
      </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 48 },

  card: { backgroundColor: 'white', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F0F1F3', gap: 14 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#111827', letterSpacing: 0.3 },
  cardSub: { fontSize: 11.5, color: '#9CA3AF', marginTop: 1 },

  barsArea: { flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  barTrack: { height: 90, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 14, borderRadius: 4 },
  barValueLbl: { fontSize: 10, fontWeight: '700', color: '#374151' },
  monthLbl: { fontSize: 10, color: '#9CA3AF', fontWeight: '500', marginTop: 2 },
  // Temp chart's month row (no barCol wrapper to center it for us) — same equal-flex-column
  // scheme as the bar charts' barsArea/barCol, so all three align to identical positions.
  monthRowFlex: { flexDirection: 'row', marginTop: 4 },
  monthLblFlex: { flex: 1, textAlign: 'center' },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  legendRowTop: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
});
