import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions, Pressable, LayoutAnimation, TextInput,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, useAnimatedReaction, runOnJS, withTiming, Easing, interpolateColor, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useStats, useVisitIndex } from '../store';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS, spotCountry, spotCountryCode, spotDestination, spotPhotoTitle } from '../data/spots';
import { NO_PHOTO } from '../data/imageOverrides';
import PhotoPlaceholder from '../components/Map/PhotoPlaceholder';
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
  // The selector's sliding pill: levelSV is the selected item's index (animated between them), selectorWSV the row's inner
  // width (three equal items and two 1 pt dividers).
  const levelSV = useSharedValue(WORLD_MODES.findIndex(m => m.mode === 'countries'));
  // Once the selector is pinned (the page has scrolled past where it sits), the bar fills in: its background, a small
  // centred avatar and name, and a hairline and soft shadow under it, so it reads as a bar that stays while the sections
  // slide beneath. Before that its top strip is see-through, over the bottom of the full profile header.
  const scrollSV = useSharedValue(0);
  const stickyYSV = useSharedValue(1e6);
  // Each style reads both values itself: a style re-runs only for the shared values it reads directly, not ones read
  // inside a helper it calls (with a shared stuckT() helper the bar never filled in).
  // Read on the UI thread, so everything driven by the scroll keeps step with the page.
  const onPageScroll = useAnimatedScrollHandler(e => { scrollSV.value = e.contentOffset.y; });
  // As it pins, the selector card gives way to a row of plain tab headings (the number and name, a sliding underline
  // under the selected one): the card fades and settles back while the tabs fade in, and the bar's background, drawn as
  // its own layer, shortens to the tabs. cardHSV is the card's height. t is eased (smoothstep) so the change starts and
  // ends gently. `pinned` (from the halfway point) decides which of the two takes taps.
  const cardHSV = useSharedValue(70);
  const stuckStyle = useAnimatedStyle(() => {
    const r = Math.min(1, Math.max(0, (scrollSV.value - stickyYSV.value + FADE) / FADE));
    const t = r * r * (3 - 2 * r), h = cardHSV.value;
    const full = COMPACT_H + h + 12, small = COMPACT_H + TABS_H;
    return {
      height: full + (small - full) * t, opacity: t,
      borderBottomColor: `rgba(229,231,235,${t})`, shadowOpacity: 0.08 * t,
    };
  });
  const cardStyle = useAnimatedStyle(() => {
    const r = Math.min(1, Math.max(0, (scrollSV.value - stickyYSV.value + FADE) / FADE));
    const t = r * r * (3 - 2 * r), h = cardHSV.value;
    return { opacity: 1 - t, transform: [{ translateY: -6 * t }, { scale: 1 - 0.06 * t }] };
  });
  const tabsStyle = useAnimatedStyle(() => {
    const r = Math.min(1, Math.max(0, (scrollSV.value - stickyYSV.value + FADE) / FADE));
    const t = r * r * (3 - 2 * r);
    return { opacity: t, transform: [{ translateY: (1 - t) * 8 }] };
  });
  const [pinned, setPinned] = useState(false);
  useAnimatedReaction(
    () => scrollSV.value - stickyYSV.value + FADE / 2 > 0,
    (v, prev) => { if (v !== prev) runOnJS(setPinned)(v); },
  );
  // The tabs' underline slides with the selection, like the pill; tabsWSV is the tab row's measured width (three equal
  // tabs, so the middle one is centred on the screen).
  const tabsWSV = useSharedValue(0);
  const underlineStyle = useAnimatedStyle(() => {
    const w = tabsWSV.value / 3;
    return { width: w * 0.6, opacity: w > 0 ? 1 : 0, transform: [{ translateX: levelSV.value * w + w * 0.2 }] };
  });
  // The full header (fixed behind the page) fades as the selector slides up over it, gone before the bar fills in.
  const [headerH, setHeaderH] = useState(150);
  const headerFade = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.max(0, scrollSV.value / Math.max(1, stickyYSV.value - FADE))),
  }));
  const compactStyle = useAnimatedStyle(() => {
    const r = Math.min(1, Math.max(0, (scrollSV.value - stickyYSV.value + FADE) / FADE));
    const t = r * r * (3 - 2 * r);
    return { opacity: t, transform: [{ translateY: (1 - t) * 6 }] };
  });
  const selectorWSV = useSharedValue(0);
  const pillStyle = useAnimatedStyle(() => {
    const itemW = Math.max(0, (selectorWSV.value - 2) / 3);
    return { width: itemW, transform: [{ translateX: levelSV.value * (itemW + 1) }], opacity: selectorWSV.value > 0 ? 1 : 0 };
  });
  // The pill follows the level wherever it is chosen (here, or on the full-screen map).
  useEffect(() => {
    levelSV.value = withTiming(WORLD_MODES.findIndex(m => m.mode === worldMode), { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [worldMode]);
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
  // Spots Explored's search: a spot's name, its destination or its country.
  const [spotQuery, setSpotQuery] = useState('');
  const sq = spotQuery.trim().toLowerCase();
  const shownSpots = useMemo(() => !sq ? exploredSpots : exploredSpots.filter(sp => {
    const hay = [sp.name, spotDestination(sp)?.name, spotCountry(sp)].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(sq);
  }), [exploredSpots, sq]);
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



  const selectMode = (mode: WorldMode) => {
    if (mode === worldMode) return;
    Haptics.selectionAsync();
    // The sections below swap with an animation, so the change is seen to follow the selection.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setWorldMode(mode);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
    {/* ── Profile header ──────────────────────────────────────────── */}
    {/* Fixed behind the page: it holds still and fades while the selector slides up over it, gone by the time the pinned
        bar's small avatar and name fade in. Scrolling with the page, it was sliced by the top edge before it had faded.
        Its height sizes the room left for it at the top of the page and where the pinned bar starts (16 below it, less
        the bar's overlapping top strip; the bar's own onLayout reads 0 inside the ScrollView's sticky wrapper). */}
    <Animated.View
      pointerEvents="none"
      style={[styles.profileHeader, { position: 'absolute', top: insets.top + 16, left: 0, right: 0 }, headerFade]}
      onLayout={e => { const h = e.nativeEvent.layout.height; setHeaderH(h); stickyYSV.value = 16 + h + 16 - COMPACT_H; }}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.profileName} numberOfLines={1}>{userName}</Text>
      <Text style={styles.profileSub}>
        {stats.firstVisitDate
          ? `Exploring since ${new Date(stats.firstVisitDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
          : 'World Traveler'}
      </Text>
    </Animated.View>
    {/* The level selector (child 1) pins to the top while the sections it controls scroll beneath. */}
    <Animated.ScrollView
      style={{ flex: 1 }}
      onTouchEnd={onScreenTouchEnd}
      onScrollBeginDrag={() => setFlagTip(null)}
      onScroll={onPageScroll}
      scrollEventThrottle={16}
      stickyHeaderIndices={[1]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Room for the profile header, which sits fixed behind the page (above the ScrollView). */}
      <View style={{ height: headerH + 16 }} />

      {/* ── The level selector: Countries / Destinations / Spots. It heads the My World card and chooses what the map and
          every section below show; it stays pinned at the top as they scroll. ── */}
      {/* The sticky child stays a plain View: the ScrollView's sticky wrapper attaches its own ref to it, which an animated
          component would freeze ("set the key `current` … frozen"). The fading line and shadow are on the view inside. */}
      <View style={{ marginTop: -COMPACT_H }} pointerEvents="box-none">
      <View style={styles.selectorSticky} pointerEvents="box-none">
        {/* The pinned bar's background, hairline and shadow, behind the strip and the card. */}
        <Animated.View pointerEvents="none" style={[styles.stuckBg, stuckStyle]} />
        {/* The small centred avatar and name, shown only while the bar is pinned. */}
        <Animated.View pointerEvents="none" style={[styles.compactHeader, compactStyle]}>
          <View style={styles.compactAvatar}>
            <Text style={styles.compactAvatarText}>{userName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.compactName} numberOfLines={1}>{userName}</Text>
        </Animated.View>

        <Animated.View
          pointerEvents={pinned ? 'none' : 'auto'}
          style={[styles.statsHeader, cardStyle]}
          onLayout={e => { selectorWSV.value = e.nativeEvent.layout.width - 12; cardHSV.value = e.nativeEvent.layout.height; }}
        >
          {/* The dark pill slides to the selected level; the numbers and dividers fade with it. */}
          <Animated.View pointerEvents="none" style={[styles.selectorPill, pillStyle]} />
          {WORLD_MODES.map(({ mode, label }, i) => {
            const value = mode === 'countries' ? stats.totalCountries : mode === 'destinations' ? stats.totalDestinations : stats.totalSpots;
            return (
              <React.Fragment key={mode}>
                {i > 0 && <StatDivider index={i} level={levelSV} />}
                <Pressable style={styles.statItem} onPress={() => selectMode(mode)} hitSlop={4}>
                  <StatText index={i} level={levelSV} style={styles.statValue} on="#FFFFFF" off="#9CA3AF">{value}</StatText>
                  <StatText index={i} level={levelSV} style={styles.statLabel} on="#D1D5DB" off="#6B7280">{label}</StatText>
                </Pressable>
              </React.Fragment>
            );
          })}
        </Animated.View>
        {/* The pinned bar's tab headings, in place of the card. */}
        <Animated.View
          pointerEvents={pinned ? 'auto' : 'none'}
          style={[styles.tabs, tabsStyle]}
          onLayout={e => { tabsWSV.value = e.nativeEvent.layout.width; }}
        >
          {WORLD_MODES.map(({ mode, label }, i) => {
            const value = mode === 'countries' ? stats.totalCountries : mode === 'destinations' ? stats.totalDestinations : stats.totalSpots;
            return (
              <Pressable key={mode} style={styles.tab} onPress={() => selectMode(mode)} hitSlop={{ top: 6, bottom: 6 }}>
                <StatText index={i} level={levelSV} style={styles.tabValue} on="#111827" off="#9CA3AF">{value}</StatText>
                <StatText index={i} level={levelSV} style={styles.tabLabel} on="#111827" off="#9CA3AF">{label}</StatText>
              </Pressable>
            );
          })}
          <Animated.View style={[styles.tabUnderline, underlineStyle]} />
        </Animated.View>
      </View>
      </View>

      {/* ── The map, its own card under the selector ── */}
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
      </View>

      {/* The sections below follow the level chosen in the selector, each a card of its own. */}
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
                      <View style={styles.destRowSubRow}>
                        <CircleFlag countryCode={d.countryCode} size={12} />
                        <Text style={[styles.destRowSub, { marginTop: 0, flexShrink: 1 }]} numberOfLines={1}>
                          {d.country}{n > 0 ? ` · ${n} spot${n === 1 ? '' : 's'} visited` : ''}
                        </Text>
                      </View>
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
            <ScrollView style={styles.topScroll} contentContainerStyle={styles.topScrollContent} nestedScrollEnabled showsVerticalScrollIndicator={topDestinations.length > 8}>
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
            <>
            {/* Search: a spot, a destination or a country. Shown once there are enough to need it. */}
            {exploredSpots.length > 8 && (
              <View style={styles.searchBox}>
                <Search size={15} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  value={spotQuery}
                  onChangeText={setSpotQuery}
                  placeholder="Search spots, destinations or countries"
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {!!spotQuery && (
                  <Pressable onPress={() => setSpotQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                    <X size={15} color="#9CA3AF" strokeWidth={2.5} />
                  </Pressable>
                )}
              </View>
            )}
            {shownSpots.length === 0 && <Text style={styles.topEmpty}>No spots match.</Text>}
            {/* One row per spot, as for destinations: its photo, its name, and where it is (its destination and country). */}
            <ScrollView style={styles.destRowsScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={shownSpots.length > 5}>
              {shownSpots.map((sp, k) => {
                const dest = spotDestination(sp);
                const where = [dest?.name, spotCountry(sp)].filter(Boolean).join(' · ');
                return (
                  <View key={sp.id} style={[styles.destRow, k > 0 && styles.destRowBorder]}>
                    <View style={styles.destThumb}>
                      {/* The same small-photo key as the destination sheet's spot pickers, so either can reuse it. */}
                      {NO_PHOTO.has(spotPhotoTitle(sp))
                        ? <PhotoPlaceholder icon={sp.icon} category={sp.category} size={46} />
                        : <EntityPhoto
                            cacheKey={`pick_spot_${sp.id}`}
                            cache={thumbCache}
                            load={() => getOrFetchWikiThumbnail(`pick_spot_${sp.id}`, thumbCache, spotPhotoTitle(sp), 300)}
                            subject={photoSubject(spotPhotoTitle(sp))}
                            placeholderColor="#E5E7EB"
                            fallback={<PhotoPlaceholder icon={sp.icon} category={sp.category} size={46} />}
                          />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.destRowName} numberOfLines={1}>{sp.name}</Text>
                      <Text style={styles.destRowSub} numberOfLines={1}>{where}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            </>
          )}
        </View>
      )}
    </Animated.ScrollView>
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

// A selector item's text, fading between its selected and unselected colours as the pill slides to or from it.
function StatText({ index, level, style, on, off, children }: { index: number; level: SharedValue<number>; style: any; on: string; off: string; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => ({
    color: interpolateColor(Math.min(1, Math.abs(level.value - index)), [0, 1], [on, off]),
  }));
  return <Animated.Text style={[style, a]}>{children}</Animated.Text>;
}
// The divider before item `index`: shown only between two unselected items, fading out as the pill nears either side.
function StatDivider({ index, level }: { index: number; level: SharedValue<number> }) {
  const a = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(level.value - (index - 1)), Math.abs(level.value - index)),
  }));
  return <Animated.View style={[styles.statDivider, a]} />;
}

// The pinned bar's top strip, holding its small avatar and name.
const COMPACT_H = 40;
// How many points of scroll, ending where the bar pins, the bar fills in over and the full header fades out over.
const FADE = 36;
// The pinned bar's tab row height.
const TABS_H = 36;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  // Profile header
  // The avatar centred, the name and the line under it centred below.
  profileHeader: { alignItems: 'center', paddingHorizontal: 16 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 36, fontWeight: '800', color: 'white' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 12 },
  profileSub:  { fontSize: 13, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  // The pinned bar's own small avatar and name, in its top strip (COMPACT_H tall).
  compactHeader: {
    position: 'absolute', top: 0, left: 16, right: 16, height: COMPACT_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  compactAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },
  compactAvatarText: { fontSize: 12, fontWeight: '800', color: 'white' },
  compactName: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1 },

  // Stats row
  // The level selector: pinned while scrolling (on the page colour, so nothing shows round its corners). The selected
  // count sits on a dark pill.
  // Its top strip (room for the small avatar and name; the sticky View's negative margin) overlaps the bottom of the
  // full header until it pins, so the page keeps its old spacing; the background fills in only once pinned (stuckStyle).
  selectorSticky: { paddingTop: COMPACT_H, paddingHorizontal: 16 },
  // The pinned bar's tab headings: plain text on the bar, the number and the level's name, with an underline.
  // Spans the bar edge to edge less the page margins, whichever box absolute offsets count from: left and right are equal.
  tabs: { position: 'absolute', top: COMPACT_H, left: 16, right: 16, height: TABS_H, flexDirection: 'row' },
  // Equal thirds; the text centred in each (it may run past a third's edges rather than wrap, staying centred).
  tab: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4, paddingTop: 8, overflow: 'visible' },
  tabValue: { fontSize: 15, fontWeight: '800' },
  tabLabel: { fontSize: 13, fontWeight: '600' },
  tabUnderline: { position: 'absolute', left: 0, bottom: 0, height: 2, borderRadius: 1, backgroundColor: '#111827' },
  stuckBg: {
    position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#F9FAFB',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, shadowOpacity: 0,
  },
  statsHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 6, marginBottom: 12,
    backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: '#F3F4F6',
  },
  // The selected level in the app's own dark selection style (the breadcrumb's active segment, the dark buttons): a pill
  // that slides behind the items.
  selectorPill: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: 12, backgroundColor: '#111827' },
  // A section inside the panel (Explored, Top …): separated from the map or the section above by a hairline.
  // Each section below the selector is a card of its own (the map, Explored, Top …).
  panelSection: {
    marginHorizontal: 16, marginBottom: 12, padding: 16, backgroundColor: 'white',
    borderRadius: 18, borderWidth: 1, borderColor: '#F3F4F6',
  },
  mapCard: {
    marginHorizontal: 16, marginBottom: 12, overflow: 'hidden', backgroundColor: 'white',
    borderRadius: 18, borderWidth: 1, borderColor: '#F3F4F6',
  },
  statItem:    { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12 },
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
  // A quiet hint that the map opens: a translucent white pill with grey text, not a dark badge.
  mapHint:       { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  mapHintTxt:    { fontSize: 11, fontWeight: '500', color: '#6B7280' },
  topEmpty:      { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  topBy:         { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  // Top Countries' Destinations · Spots toggle: a small segmented control beside its title.
  topToggle:       { flexDirection: 'row', padding: 2, backgroundColor: '#F3F4F6', borderRadius: 9 },
  topToggleBtn:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  topToggleBtnOn:  { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  topToggleTxt:    { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  topToggleTxtOn:  { color: '#111827' },
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
  // The line under a destination's name: a tiny flag, then its country (and spots visited).
  destRowSubRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  // Top Destinations: up to about eight rows, then it scrolls.
  // The scroll box clips at its edges, which cut off the flags' shadows: its content gets a few points of room inside, and
  // the box is pulled out by the same amount so the rows stay where they were.
  topScroll:  { maxHeight: 300, marginHorizontal: -6, marginTop: -4 },
  topScrollContent: { paddingHorizontal: 6, paddingTop: 4, paddingBottom: 2 },
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
