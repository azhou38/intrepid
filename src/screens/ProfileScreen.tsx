import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions, Pressable, LayoutAnimation, TextInput,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
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
import WorldMapModal from '../components/WorldMapModal';
import EntityPhoto from '../components/Map/EntityPhoto';
import { thumbCache, getOrFetchWikiThumbnail } from '../utils/photoCache';
import { photoSubject } from '../utils/subjectCrop';
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
// A spot pin on the card's map, in its map units: the app's teardrop (a round head, the tail's edges tangent to it) with
// its tip on the place. PIN_TIP is the tip's distance below the head's centre.
const PIN_R = 1.5, PIN_TIP = 3.4;
const PIN_TY = (PIN_R * PIN_R) / PIN_TIP, PIN_TX = PIN_R * Math.sqrt(1 - (PIN_R * PIN_R) / (PIN_TIP * PIN_TIP));
const pinPath = (x: number, y: number) => {
  const cy = y - PIN_TIP;
  return `M ${x - PIN_TX} ${cy + PIN_TY} L ${x} ${y} L ${x + PIN_TX} ${cy + PIN_TY} A ${PIN_R} ${PIN_R} 0 1 0 ${x - PIN_TX} ${cy + PIN_TY} Z`;
};

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
  // Top Countries (on Countries): ranked by visited destinations or visited spots, its own small toggle.
  const [topRank, setTopRank] = useState<'destinations' | 'spots'>('destinations');
  const topCountries = useMemo(() => {
    const by = new Map<string, { country: string; code: string; count: number }>();
    const add = (code: string | undefined, country: string | undefined) => {
      if (!code || !country) return;
      const row = by.get(code) ?? { country, code, count: 0 };
      row.count += 1; by.set(code, row);
    };
    if (topRank === 'destinations') for (const d of visitedDests) add(d.countryCode, d.country);
    else for (const sp of visitedSpots) add(spotCountryCode(sp), spotCountry(sp));
    return [...by.values()].sort((x, y) => y.count - x.count || x.country.localeCompare(y.country)).slice(0, 8);
  }, [topRank, visitedDests, visitedSpots]);
  // Top Destinations (on Destinations): every destination with a visited spot, ranked by how many of its spots are visited.
  const topDestinations = useMemo(() => {
    const n = new Map<string, number>();
    for (const sp of visitedSpots) if (sp.destinationId) n.set(sp.destinationId, (n.get(sp.destinationId) ?? 0) + 1);
    return DESTINATIONS.filter(d => n.has(d.id)).map(d => ({ dest: d, count: n.get(d.id)! }))
      .sort((x, y) => y.count - x.count || x.dest.name.localeCompare(y.dest.name));
  }, [visitedSpots]);
  const maxDestCount = topDestinations[0]?.count ?? 1;
  // The Explored lists for destinations and spots, alphabetical.
  const exploredDests = useMemo(() => [...visitedDests].sort((x, y) => x.name.localeCompare(y.name)), [visitedDests]);
  // Destinations Explored can be filtered to one country: the countries with visited destinations, most first.
  const [destCountry, setDestCountry] = useState<string | null>(null);
  const destCountries = useMemo(() => {
    const m = new Map<string, { code: string; name: string; count: number }>();
    for (const d of visitedDests) {
      const r = m.get(d.countryCode) ?? { code: d.countryCode, name: d.country, count: 0 };
      r.count += 1; m.set(d.countryCode, r);
    }
    return [...m.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  }, [visitedDests]);
  // A search over them: it matches a destination's name or its country, and narrows the country filters too.
  const [destQuery, setDestQuery] = useState('');
  const q = destQuery.trim().toLowerCase();
  const matchesQuery = (name: string, country: string) => !q || name.toLowerCase().includes(q) || country.toLowerCase().includes(q);
  const shownDests = useMemo(
    () => exploredDests.filter(d => (!destCountry || d.countryCode === destCountry) && matchesQuery(d.name, d.country)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exploredDests, destCountry, q]);
  const shownDestCountries = useMemo(
    () => (q ? destCountries.filter(c => c.name.toLowerCase().includes(q) || exploredDests.some(d => d.countryCode === c.code && d.name.toLowerCase().includes(q))) : destCountries),
    [destCountries, exploredDests, q]);
  const exploredSpots = useMemo(() => [...visitedSpots].sort((x, y) => x.name.localeCompare(y.name)), [visitedSpots]);
  const maxCountryCount = topCountries[0]?.count ?? 1;

  // The map opens full screen to explore (WorldMapModal), on the same level; its tap card counts per country.
  const [mapOpen, setMapOpen] = useState(false);
  const countsByCountry = useMemo(() => {
    const m = new Map<string, { dests: number; spots: number }>();
    const row = (c: string) => { const r = m.get(c) ?? { dests: 0, spots: 0 }; m.set(c, r); return r; };
    for (const d of visitedDests) row(d.countryCode).dests++;
    for (const sp of visitedSpots) { const c = spotCountryCode(sp); if (c) row(c).spots++; }
    return m;
  }, [visitedDests, visitedSpots]);
  const spotsByDest = useMemo(() => {
    const m = new Map<string, number>();
    for (const sp of visitedSpots) if (sp.destinationId) m.set(sp.destinationId, (m.get(sp.destinationId) ?? 0) + 1);
    return m;
  }, [visitedSpots]);
  const modalSpots = useMemo(
    () => visitedSpots.map(sp => ({ spot: sp, country: spotCountry(sp) ?? '', countryCode: spotCountryCode(sp) })),
    [visitedSpots]);

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
    {/* The level selector (child 1) pins to the top while the sections it controls scroll beneath it. */}
    <ScrollView
      style={styles.container}
      onTouchEnd={onScreenTouchEnd}
      onScrollBeginDrag={() => setFlagTip(null)}
      stickyHeaderIndices={[1]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 100 }}
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

      {/* ── The level selector: Countries / Destinations / Spots. It heads the My World card and chooses what the map and
          every section below show; it stays pinned at the top as they scroll. ── */}
      <View style={styles.selectorSticky}>
        <View style={styles.statsHeader}>
          {WORLD_MODES.map(({ mode, label }, i) => {
            const on = worldMode === mode;
            const value = mode === 'countries' ? stats.totalCountries : mode === 'destinations' ? stats.totalDestinations : stats.totalSpots;
            return (
              <React.Fragment key={mode}>
                {i > 0 && <View style={styles.statDivider} />}
                <Pressable
                  style={[styles.statItem, on && styles.statItemOn]}
                  onPress={() => {
                    if (on) return;
                    Haptics.selectionAsync();
                    // The sections below swap with an animation, so the change is seen to follow the selection.
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setWorldMode(mode);
                  }}
                  hitSlop={4}
                >
                  <Text style={[styles.statValue, on ? styles.statValueOn : styles.statValueOff]}>{value}</Text>
                  <Text style={[styles.statLabel, on && styles.statLabelOn]}>{label}</Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* ── The panel under the selector: the map, then the sections for the chosen level ── */}
      <View style={styles.mapCard}>

        <Pressable onPress={() => { Haptics.selectionAsync(); setMapOpen(true); }} accessibilityLabel="Open the map">
        <View pointerEvents="none" style={styles.mapWrap}>
          <Svg width={WORLD_W} height={WORLD_H} viewBox={`0 ${WORLD_Y0} 360 ${WORLD_Y1 - WORLD_Y0}`}>
            <Rect x={0} y={WORLD_Y0} width={360} height={WORLD_Y1 - WORLD_Y0} fill="#EEF2F6" />
            {(WORLD_COUNTRIES as { c: string; d: string }[]).map(({ c, d }, k) => (
              <Path key={k} d={d}
                fill={worldMode === 'countries' && visitedCountrySet.has(c) ? '#10B981' : '#D9DEE5'}
                stroke="white" strokeWidth={0.15} />
            ))}
            {/* Destinations: a dot at each one visited. Spots: a small pin (the app's spot pin, its tip on the place), so they
                read differently from destinations, as on the full-screen map. */}
            {worldMode === 'destinations' && worldDots.map((p, k) => (
              <Circle key={k} cx={p.x} cy={p.y} r={2} fill="#10B981" stroke="white" strokeWidth={0.5} />
            ))}
            {worldMode === 'spots' && worldDots.map((p, k) => (
              <React.Fragment key={k}>
                <Path d={pinPath(p.x, p.y)} fill="#10B981" stroke="white" strokeWidth={0.3} strokeLinejoin="round" />
                <Circle cx={p.x} cy={p.y - PIN_TIP} r={0.55} fill="#111111" />
              </React.Fragment>
            ))}
          </Svg>
          {/* A hint that the map opens. */}
          <View style={styles.mapHint}><Text style={styles.mapHintTxt}>Tap to explore</Text></View>
        </View>
        </Pressable>

      {/* The sections below follow the level chosen in the selector: they sit inside the same panel as the map, under it,
          so everything the selector controls is visibly part of it. */}
      {worldMode === 'countries' && (<>
      {/* ── Countries explored ──────────────────────────────────────── */}
      <View style={styles.panelSection}>
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
                <CircleFlag countryCode={code} size={24} ring ringWidth={1.5} style={styles.flagRing} />
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
        <View style={styles.panelSection}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Top Countries</Text>
            {/* Rank by visited destinations or by visited spots. */}
            <View style={styles.topToggle}>
              {(['destinations', 'spots'] as const).map(m => {
                const on = topRank === m;
                return (
                  <Pressable key={m} style={[styles.topToggleBtn, on && styles.topToggleBtnOn]} hitSlop={4}
                    onPress={() => { if (!on) { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTopRank(m); } }}>
                    <Text style={[styles.topToggleTxt, on && styles.topToggleTxtOn]}>{m === 'destinations' ? 'Destinations' : 'Spots'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {topCountries.length === 0 && <Text style={styles.topEmpty}>No {topRank} visited yet.</Text>}
          {topCountries.map(({ country, count, code }) => (
            <View key={code} style={styles.countryRow}>
              <CircleFlag countryCode={code} size={22} ring ringWidth={1.5} style={styles.flagRing} />
              <Text style={styles.countryName} numberOfLines={1}>{country}</Text>
              <View style={styles.countryBarTrack}>
                <View style={[styles.countryBarFill, { width: `${(count / maxCountryCount) * 100}%` }]} />
              </View>
              <Text style={styles.countryCount}>
                {count} {topRank === 'destinations' ? (count === 1 ? 'dest' : 'dests') : (count === 1 ? 'spot' : 'spots')}
              </Text>
            </View>
          ))}
        </View>
      )}
      </>)}

      {/* ── Destinations: Destinations Explored, Top Destinations (by visited spots) ── */}
      {worldMode === 'destinations' && (<>
        <View style={styles.panelSection}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Destinations Explored</Text>
            <Text style={styles.cardBadge}>{exploredDests.length}</Text>
          </View>
          {exploredDests.length === 0 ? (
            <Text style={styles.topEmpty}>No destinations visited yet.</Text>
          ) : (
            <>
            {/* Search: a destination or a country. Shown once there are enough to need it. */}
            {(exploredDests.length > 8 || destCountries.length > 3) && (
              <View style={styles.searchBox}>
                <Search size={15} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  value={destQuery}
                  onChangeText={setDestQuery}
                  placeholder="Search destinations or countries"
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  clearButtonMode="never"
                />
                {!!destQuery && (
                  <Pressable onPress={() => setDestQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                    <X size={15} color="#9CA3AF" strokeWidth={2.5} />
                  </Pressable>
                )}
              </View>
            )}
            {/* Filter by country: All, then each country with visited destinations (flag, name, count). */}
            {destCountries.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
                {[{ code: null as string | null, name: 'All', count: exploredDests.length }, ...shownDestCountries].map(c => {
                  const on = destCountry === c.code;
                  return (
                    <Pressable key={c.code ?? 'all'} style={[styles.filterChip, on && styles.filterChipOn]} hitSlop={4}
                      onPress={() => {
                        Haptics.selectionAsync();
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setDestCountry(on && c.code ? null : c.code);
                      }}>
                      {!!c.code && <CircleFlag countryCode={c.code} size={14} />}
                      <Text style={[styles.filterTxt, on && styles.filterTxtOn]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[styles.filterCount, on && styles.filterTxtOn]}>{c.count}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {shownDests.length === 0 && <Text style={styles.topEmpty}>No destinations match.</Text>}
            {/* One row per destination: its photo, its name, and its country with how many of its spots are visited. */}
            <ScrollView style={styles.destRowsScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={shownDests.length > 5}>
              {shownDests.map((d, k) => {
                const n = spotsByDest.get(d.id) ?? 0;
                return (
                  <View key={d.id} style={[styles.destRow, k > 0 && styles.destRowBorder]}>
                    <View style={styles.destThumb}>
                      {/* The same small-photo key as the country sheet's destination pickers, so either can reuse it. */}
                      <EntityPhoto
                        cacheKey={`pick_${d.id}`}
                        cache={thumbCache}
                        load={() => getOrFetchWikiThumbnail(`pick_${d.id}`, thumbCache, d.name, 300)}
                        subject={photoSubject(d.name)}
                        placeholderColor="#E5E7EB"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.destRowName} numberOfLines={1}>{d.name}</Text>
                      <Text style={styles.destRowSub} numberOfLines={1}>
                        {d.country}{n > 0 ? ` · ${n} spot${n === 1 ? '' : 's'} visited` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            </>
          )}
        </View>
        {topDestinations.length > 0 && (
          <View style={styles.panelSection}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Top Destinations</Text>
              <Text style={styles.topBy}>by spots</Text>
            </View>
            <ScrollView style={styles.topScroll} nestedScrollEnabled showsVerticalScrollIndicator={topDestinations.length > 8}>
              {topDestinations.map(({ dest, count }) => (
                <View key={dest.id} style={styles.countryRow}>
                  <CircleFlag countryCode={dest.countryCode} size={22} ring ringWidth={1.5} style={styles.flagRing} />
                  <Text style={[styles.countryName, styles.destName]} numberOfLines={1}>{dest.name}</Text>
                  <View style={styles.countryBarTrack}>
                    <View style={[styles.countryBarFill, { width: `${(count / maxDestCount) * 100}%` }]} />
                  </View>
                  <Text style={styles.countryCount}>{count} {count === 1 ? 'spot' : 'spots'}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </>)}

      {/* ── Spots: Spots Explored ── */}
      {worldMode === 'spots' && (
        <View style={styles.panelSection}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Spots Explored</Text>
            <Text style={styles.cardBadge}>{exploredSpots.length}</Text>
          </View>
          {exploredSpots.length === 0 ? (
            <Text style={styles.topEmpty}>No spots visited yet.</Text>
          ) : (
            <ScrollView style={styles.exploredScroll} nestedScrollEnabled showsVerticalScrollIndicator={exploredSpots.length > 24}>
              <View style={styles.chipWrap}>
                {exploredSpots.map(sp => (
                  <View key={sp.id} style={styles.chip}>
                    <Text style={styles.chipIcon}>{sp.icon}</Text>
                    <Text style={styles.chipTxt} numberOfLines={1}>{sp.name}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      </View>
    </ScrollView>
    <WorldMapModal
      visible={mapOpen}
      onClose={() => setMapOpen(false)}
      level={worldMode}
      onLevelChange={setWorldMode}
      visitedCountryCodes={[...visitedCountrySet]}
      countryName={code => COUNTRY_NAME.get(code) ?? code}
      dests={visitedDests}
      spots={modalSpots}
      countsByCountry={countsByCountry}
      spotsByDest={spotsByDest}
    />
    </View>
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
  // The level selector: the top of the My World card, pinned while scrolling (on the page colour, so nothing shows round
  // its corners). The selected count sits on a soft green pill.
  selectorSticky: { backgroundColor: '#F9FAFB', paddingHorizontal: 16 },
  statsHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 6,
    backgroundColor: 'white', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#F3F4F6',
  },
  statItemOn:  { backgroundColor: '#ECFDF5' },
  statValueOn: { color: '#059669' },
  // A section inside the panel (Explored, Top …): separated from the map or the section above by a hairline.
  panelSection: { padding: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  // The panel: the map and the level's sections, joined to the selector above it.
  mapCard: {
    marginHorizontal: 16, marginBottom: 14, overflow: 'hidden', backgroundColor: 'white',
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
    borderWidth: 1, borderTopWidth: 0, borderColor: '#F3F4F6',
  },
  statItem:    { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12 },
  statValueOff:    { color: '#9CA3AF' },
  statLabelOn:     { color: '#047857', fontWeight: '600' },
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
  mapHint:       { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(17,24,39,0.65)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  mapHintTxt:    { fontSize: 11, fontWeight: '600', color: 'white' },
  topEmpty:      { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  topBy:         { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  // Top Countries' Destinations · Spots toggle: a small segmented control beside its title.
  topToggle:       { flexDirection: 'row', padding: 2, backgroundColor: '#F3F4F6', borderRadius: 9 },
  topToggleBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  topToggleBtnOn:  { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  topToggleTxt:    { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  topToggleTxtOn:  { color: '#111827' },
  // Destinations and Spots Explored: name chips that wrap, in a box that scrolls once it is full.
  exploredScroll: { maxHeight: 232 },
  chipWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
                paddingLeft: 6, paddingRight: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F3F4F6' },
  chipTxt:    { fontSize: 13, fontWeight: '600', color: '#374151', flexShrink: 1 },
  chipIcon:   { fontSize: 13 },
  // Destinations Explored's search box.
  searchBox:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 12, height: 38,
                  borderRadius: 12, backgroundColor: '#F3F4F6' },
  searchInput:  { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 0 },
  // Destinations Explored's country filter: a sideways row of chips; the chosen one is green.
  filterScroll: { marginHorizontal: -16, marginBottom: 10, flexGrow: 0 },
  filterRow:    { paddingHorizontal: 16, gap: 6 },
  filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: 'white' },
  filterChipOn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  filterTxt:    { fontSize: 12, fontWeight: '600', color: '#374151' },
  filterTxtOn:  { color: '#047857' },
  filterCount:  { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  // Destinations Explored's rows: photo, name, country and spots visited; about five rows, then the list scrolls.
  destRowsScroll: { maxHeight: 300 },
  destRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  destRowBorder:  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  destThumb:      { width: 46, height: 46, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  destRowName:    { fontSize: 15, fontWeight: '700', color: '#111827' },
  destRowSub:     { fontSize: 12, color: '#6B7280', marginTop: 2 },
  // Top Destinations: up to about eight rows, then it scrolls.
  topScroll:  { maxHeight: 300 },
  destName:   { width: 110 },

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
  // Every flag here in the map's frame: a thin white ring with a soft shadow (the country pills and breadcrumb flags).
  flagRing:  { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  // The name bubble over a tapped flag: centred above it, with a small pointer underneath.
  flagTipWrap:  { position: 'absolute', bottom: 30, left: -80, right: -80, alignItems: 'center' },
  flagTip:      { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 184 },
  flagTipTxt:   { fontSize: 12, fontWeight: '600', color: 'white' },
  flagTipArrow: {
    width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 5,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#111827',
  },
});
