import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions, Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useStats, useVisitIndex } from '../store';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS, spotCountry, spotCountryCode } from '../data/spots';
// Country outlines for My World: Natural Earth 1:50m admin-0 (public domain), simplified, in the Miller projection as SVG
// paths (x = longitude + 180, y = MILLER_TOP − miller(latitude), in degrees, 84° N to 58° S), one entry per ISO 3166-1 code.
import WORLD_COUNTRIES from '../data/worldCountries.json';
import CircleFlag from '../components/CircleFlag';
import { ALL_COUNTRIES } from '../data/countries';

const COUNTRY_NAME = new Map(ALL_COUNTRIES.map(c => [c.code, c.name]));

// My World's map: the whole world drawn as SVG (a Mapbox view cannot zoom out far enough to fit it in the card), in the
// Miller projection (a 2:1 wall-map shape: a flat latitude scale squashed it into a thin strip), 84° N to 58° S, at the
// card's width.
const miller = (lat: number) => {
  const phi = (Math.max(-89.9, Math.min(89.9, lat)) * Math.PI) / 180;
  return (1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi)) * 180) / Math.PI;
};
const MILLER_TOP = miller(84);
const WORLD_VH = MILLER_TOP - miller(-58);
const WORLD_Y0 = 0, WORLD_Y1 = WORLD_VH;
const WORLD_W = Dimensions.get('window').width - 32;
const WORLD_H = Math.round((WORLD_W * WORLD_VH) / 360);
const worldPoint = (lon: number, lat: number) => ({ x: lon + 180, y: MILLER_TOP - miller(lat) });

type WorldMode = 'countries' | 'destinations' | 'spots';
const WORLD_MODES: { mode: WorldMode; label: string }[] = [
  { mode: 'countries', label: 'Countries' },
  { mode: 'destinations', label: 'Destinations' },
  { mode: 'spots', label: 'Spots' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const stats  = useStats();
  const visitIndex        = useVisitIndex();
  const userName          = useStore(s => s.userName);

  const visitedDests = useMemo(() =>
    DESTINATIONS.filter(d => visitIndex.isDestVisited(d.id)),
  [visitIndex]);

  const visitedSpots = useMemo(() => SPOTS.filter(sp => visitIndex.isSpotVisited(sp.id)), [visitIndex]);

  // My World shows one level at a time (the counts at its top choose it): the visited countries filled in, or a dot per
  // visited destination or spot. Top Countries follows it: ranked by visited spots on Spots, by destinations otherwise.
  const [worldMode, setWorldMode] = useState<WorldMode>('countries');
  const topMode: 'destinations' | 'spots' = worldMode === 'spots' ? 'spots' : 'destinations';
  const topCountries = useMemo(() => {
    const by = new Map<string, { country: string; code: string; count: number }>();
    const add = (code: string | undefined, country: string | undefined) => {
      if (!code || !country) return;
      const row = by.get(code) ?? { country, code, count: 0 };
      row.count += 1; by.set(code, row);
    };
    if (topMode === 'destinations') for (const d of visitedDests) add(d.countryCode, d.country);
    else for (const sp of visitedSpots) add(spotCountryCode(sp), spotCountry(sp));
    return [...by.values()].sort((x, y) => y.count - x.count || x.country.localeCompare(y.country)).slice(0, 8);
  }, [topMode, visitedDests, visitedSpots]);
  const maxCountryCount = topCountries[0]?.count ?? 1;

  // Countries Explored: tapping a flag shows its country's name in a small bubble above it for a moment.
  const [flagTip, setFlagTip] = useState<string | null>(null);
  // A tap anywhere else on the screen (or a scroll) closes the bubble; a tap on a flag is that flag's own (see onPress).
  const flagTapRef = useRef(false);
  const onScreenTouchEnd = () => setTimeout(() => {
    if (!flagTapRef.current) setFlagTip(null);
    flagTapRef.current = false;
  }, 0);
  useEffect(() => {
    if (!flagTip) return;
    const t = setTimeout(() => setFlagTip(null), 2500);
    return () => clearTimeout(t);
  }, [flagTip]);

  const visitedCountrySet = visitIndex.visitedCountryCodes;
  const worldDots = useMemo(
    () => (worldMode === 'spots' ? visitedSpots : worldMode === 'destinations' ? visitedDests : [])
      .map(p => worldPoint(p.coordinates.longitude, p.coordinates.latitude)),
    [worldMode, visitedSpots, visitedDests]);



  return (
    <ScrollView
      style={styles.container}
      onTouchEnd={onScreenTouchEnd}
      onScrollBeginDrag={() => setFlagTip(null)}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile header ──────────────────────────────────────────── */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{userName}</Text>
          <Text style={styles.profileSub}>
            {stats.firstVisitDate
              ? `Exploring since ${new Date(stats.firstVisitDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
              : 'World Traveler'}
          </Text>
        </View>
      </View>

      {/* ── My World: the three counts head the map and choose what it (and Top Countries) shows ── */}
      <View style={[styles.card, { marginHorizontal: 16, marginBottom: 14, padding: 0, overflow: 'hidden' }]}>
        <View style={styles.statsHeader}>
          {WORLD_MODES.map(({ mode, label }, i) => {
            const on = worldMode === mode;
            const value = mode === 'countries' ? stats.totalCountries : mode === 'destinations' ? stats.totalDestinations : stats.totalSpots;
            return (
              <React.Fragment key={mode}>
                {i > 0 && <View style={styles.statDivider} />}
                <Pressable
                  style={styles.statItem}
                  onPress={() => { if (!on) { Haptics.selectionAsync(); setWorldMode(mode); } }}
                  hitSlop={4}
                >
                  <Text style={[styles.statValue, !on && styles.statValueOff]}>{value}</Text>
                  <Text style={[styles.statLabel, on && styles.statLabelOn]}>{label}</Text>
                  <View style={[styles.statUnderline, on && styles.statUnderlineOn]} />
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>

        <View pointerEvents="none" style={styles.mapWrap}>
          <Svg width={WORLD_W} height={WORLD_H} viewBox={`0 ${WORLD_Y0} 360 ${WORLD_Y1 - WORLD_Y0}`}>
            <Rect x={0} y={WORLD_Y0} width={360} height={WORLD_Y1 - WORLD_Y0} fill="#EEF2F6" />
            {(WORLD_COUNTRIES as { c: string; d: string }[]).map(({ c, d }, k) => (
              <Path key={k} d={d}
                fill={worldMode === 'countries' && visitedCountrySet.has(c) ? '#10B981' : '#D9DEE5'}
                stroke="white" strokeWidth={0.15} />
            ))}
            {/* Destinations or spots: a dot at each one visited (spots smaller, as there are more of them). */}
            {worldMode !== 'countries' && worldDots.map((p, k) => (
              <Circle key={k} cx={p.x} cy={p.y} r={worldMode === 'spots' ? 1.4 : 2}
                fill="#10B981" stroke="white" strokeWidth={worldMode === 'spots' ? 0.35 : 0.5} />
            ))}
          </Svg>
        </View>
      </View>

      {/* ── Countries explored ──────────────────────────────────────── */}
      <View style={[styles.card, { marginHorizontal: 16, marginBottom: 14 }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Countries Explored</Text>
          <Text style={styles.cardBadge}>{stats.totalCountries}</Text>
        </View>
        {stats.visitedCountryCodes.length > 0 && (
          <View style={styles.flagGrid}>
            {stats.visitedCountryCodes.map(code => (
              <Pressable
                key={code}
                style={[styles.flagItem, flagTip === code && { zIndex: 10 }]}
                onPress={() => { flagTapRef.current = true; Haptics.selectionAsync(); setFlagTip(t => (t === code ? null : code)); }}
                hitSlop={3}
              >
                <CircleFlag countryCode={code} size={24} />
                {flagTip === code && (
                  <View pointerEvents="none" style={styles.flagTipWrap}>
                    <View style={styles.flagTip}>
                      <Text style={styles.flagTipTxt} numberOfLines={1}>{COUNTRY_NAME.get(code) ?? code}</Text>
                    </View>
                    <View style={styles.flagTipArrow} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {/* ── Top Countries ───────────────────────────────────────────── */}
      {(visitedDests.length > 0 || visitedSpots.length > 0) && (
        <View style={[styles.card, { marginHorizontal: 16, marginBottom: 14 }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Top Countries</Text>
            <Text style={styles.topBy}>{topMode === 'spots' ? 'by spots' : 'by destinations'}</Text>
          </View>
          {topCountries.length === 0 && (
            <Text style={styles.topEmpty}>No {topMode} visited yet.</Text>
          )}
          {topCountries.map(({ country, count, code }) => (
            <View key={code} style={styles.countryRow}>
              <CircleFlag countryCode={code} size={22} />
              <Text style={styles.countryName} numberOfLines={1}>{country}</Text>
              <View style={styles.countryBarTrack}>
                <View style={[styles.countryBarFill, { width: `${(count / maxCountryCount) * 100}%` }]} />
              </View>
              <Text style={styles.countryCount}>
                {count} {topMode === 'destinations' ? (count === 1 ? 'dest' : 'dests') : (count === 1 ? 'spot' : 'spots')}
              </Text>
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  // Profile header
  profileHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginBottom: 16,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 22, fontWeight: '800', color: 'white' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#111827' },
  profileSub:  { fontSize: 13, color: '#9CA3AF', marginTop: 2 },

  // Stats row
  // My World's header: the three counts, each a button; the selected one is dark with a green underline.
  statsHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statValueOff:    { color: '#9CA3AF' },
  statLabelOn:     { color: '#111827', fontWeight: '600' },
  statUnderline:   { marginTop: 10, width: 28, height: 2.5, borderRadius: 2, backgroundColor: 'transparent' },
  statUnderlineOn: { backgroundColor: '#10B981' },
  statValue:   { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel:   { fontSize: 10, color: '#6B7280', marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: '#E5E7EB' },

  // Generic card
  card: {
    backgroundColor: 'white', borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: '#F3F4F6',
  },
  cardHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  cardBadge:  { fontSize: 12, fontWeight: '700', color: '#6366F1' },

  // My World
  mapWrap:       { height: WORLD_H, backgroundColor: '#EEF2F6' },
  topEmpty:      { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  topBy:         { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  // Top Countries
  countryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 10,
  },
  countryName:     { fontSize: 13, fontWeight: '600', color: '#374151', width: 90 },
  countryBarTrack: { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  countryBarFill:  { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },
  countryCount:    { fontSize: 11, color: '#9CA3AF', width: 44, textAlign: 'right' },

  // Progress bar

  // Flag grid
  flagGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flagItem:  { alignItems: 'center' },
  // The name bubble over a tapped flag: centred above it, with a small pointer underneath.
  flagTipWrap:  { position: 'absolute', bottom: 30, left: -80, right: -80, alignItems: 'center' },
  flagTip:      { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 184 },
  flagTipTxt:   { fontSize: 12, fontWeight: '600', color: 'white' },
  flagTipArrow: {
    width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 5,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#111827',
  },
});
