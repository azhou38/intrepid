import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions, Pressable, LayoutAnimation, TextInput, Modal,
} from 'react-native';
import { Search, X, Pencil, ChevronDown, Check } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, useAnimatedReaction, runOnJS, useAnimatedRef, scrollTo, withTiming, Easing, interpolateColor, interpolate, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Top Countries' tab swipe, and the chips' sideways scroller (gesture-handler's, so the two cooperate).
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
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
import EditProfileSheet, { ProfileAvatar } from '../components/EditProfileSheet';
import EntityPhoto from '../components/Map/EntityPhoto';
import { thumbCache, getOrFetchWikiThumbnail } from '../utils/photoCache';
import { photoSubject } from '../utils/subjectCrop';
import { getCountryBounds } from '../utils/countryBounds';
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
const SCREEN_W = Dimensions.get('window').width;
// The side room the Explored sections keep from the screen edge.
const EXPLORED_PAD = 12;
// The highlight for a picked tile and its dot on the map.
const PICK_COLOR = '#F97316';
// Rank badges: gold, silver, bronze.
const RANK_COLORS = ['#F59E0B', '#9CA3AF', '#B45309'];
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
  const userHandle        = useStore(s => s.userHandle) ?? '';
  const userAvatarUri     = useStore(s => s.userAvatarUri) ?? null;
  const userAvatarCrop    = useStore(s => s.userAvatarCrop) ?? null;
  const joinedAt          = useStore(s => s.joinedAt);
  const [editOpen, setEditOpen] = useState(false);

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
  // Never left half-way between the full header and the pinned bar: a scroll that comes to rest inside the transition
  // (a drag let go without a fling, or a fling that runs out there) settles at the top or the pinned point, whichever is
  // nearer. A fling that passes through, either way, is left alone, so swiping back up the page flows to the top.
  const pageRef = useAnimatedRef<Animated.ScrollView>();
  const settle = (y: number) => {
    'worklet';
    const pin = stickyYSV.value;
    if (y > 1 && y < pin - 1) scrollTo(pageRef, 0, y < pin / 2 ? 0 : pin, true);
  };
  const onPageScroll = useAnimatedScrollHandler({
    onScroll: e => { scrollSV.value = e.contentOffset.y; },
    onEndDrag: e => { if (Math.abs(e.velocity?.y ?? 0) < 0.1) settle(e.contentOffset.y); },
    onMomentumEnd: e => { settle(e.contentOffset.y); },
  });
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
  // The divider under the card shows only while the card does: it fades out as the bar pins.
  const dividerStyle = useAnimatedStyle(() => {
    const r = Math.min(1, Math.max(0, (scrollSV.value - stickyYSV.value + FADE) / FADE));
    return { opacity: 1 - r * r * (3 - 2 * r) };
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
  // The tabs' underline slides with the selection, like the pill, under each tab's text: tabXSV/tabWSV are where each
  // tab's text sits in the row (measured).
  const tabXSV = useSharedValue([0, 0, 0]);
  const tabWSV = useSharedValue([0, 0, 0]);
  const tabRef = useRef([0, 0, 0]);
  const tabTextRef = useRef([{ x: 0, w: 0 }, { x: 0, w: 0 }, { x: 0, w: 0 }]);
  const placeUnderline = () => {
    tabXSV.value = tabRef.current.map((x, k) => x + tabTextRef.current[k].x);
    tabWSV.value = tabTextRef.current.map(t => t.w);
  };
  const underlineStyle = useAnimatedStyle(() => {
    const xs = tabXSV.value, ws = tabWSV.value, l = levelSV.value;
    return {
      width: interpolate(l, [0, 1, 2], ws), opacity: ws[1] > 0 ? 1 : 0,
      transform: [{ translateX: interpolate(l, [0, 1, 2], xs) }],
    };
  });
  // The full header (fixed behind the page) fades as the selector slides up over it, gone before the bar fills in.
  const [headerH, setHeaderH] = useState(150);
  // The Edit Profile button is drawn in the fixed header (it holds still and fades with it), which sits behind the page
  // and so takes no taps: a clear target over it, above the page, takes them while the page is at its top (editTap).
  // editFrame is where the button sits in the header.
  const [editFrame, setEditFrame] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [editTap, setEditTap] = useState(true);
  useAnimatedReaction(() => scrollSV.value < 8, (v, prev) => { if (v !== prev) runOnJS(setEditTap)(v); });
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
  // The Explored lists for destinations and spots, alphabetical.
  // How the Explored grids are ordered: A–Z, most recently visited first, or best rated first. A spot's rating is its own;
  // a destination has none of its own, so it takes the average of its visited spots' ratings. Places with no date or rating
  // come last.
  const [exploredSort, setExploredSort] = useState<ExploredSort>('name');
  const savedSpots = useStore(s => s.savedSpots);
  const savedDests = useStore(s => s.savedDestinations);
  const sortKeys = useMemo(() => {
    const spotDate = new Map<string, string>();
    const destDate = new Map<string, string>();
    const bump = (m: Map<string, string>, id: string, d?: string) => { if (d && d > (m.get(id) ?? '')) m.set(id, d); };
    for (const [id, dv] of Object.entries(savedDests)) {
      bump(destDate, id, dv.visitDate);
      for (const v of dv.visits ?? []) {
        const d = v.endDate && v.endDate > v.startDate ? v.endDate : v.startDate;
        bump(destDate, id, d);
        for (const sid of v.spotIds ?? []) bump(spotDate, sid, d);
      }
    }
    for (const [id, sv] of Object.entries(savedSpots)) {
      bump(spotDate, id, sv.visitDate);
      for (const v of sv.visits ?? []) bump(spotDate, id, v.endDate && v.endDate > v.startDate ? v.endDate : v.startDate);
    }
    // Per destination: its visited spots (c), and the sum and count of their ratings.
    const sum = new Map<string, { t: number; n: number; c: number }>();
    for (const sp of visitedSpots) {
      if (!sp.destinationId) continue;
      const a = sum.get(sp.destinationId) ?? { t: 0, n: 0, c: 0 };
      a.c += 1;
      const r = savedSpots[sp.id]?.rating;
      if (r) { a.t += r; a.n += 1; }
      sum.set(sp.destinationId, a);
    }
    const destRating = (id: string) => { const a = sum.get(id); return a && a.n ? a.t / a.n : 0; };
    const destSpots = (id: string) => sum.get(id)?.c ?? 0;
    return { spotDate, destDate, destRating, destSpots };
  }, [savedSpots, savedDests, visitedSpots]);
  const sortBy = <T extends { id: string; name: string }>(list: T[], date: (id: string) => string, rating: (id: string) => number, spots?: (id: string) => number) =>
    [...list].sort((x, y) => {
      if (exploredSort === 'date') { const c = date(y.id).localeCompare(date(x.id)); if (c) return c; }
      else if (exploredSort === 'spots' && spots) { const c = spots(y.id) - spots(x.id); if (c) return c; }
      else if (exploredSort === 'rating') { const c = rating(y.id) - rating(x.id); if (c) return c; }
      return x.name.localeCompare(y.name);
    });
  const exploredDests = useMemo(
    () => sortBy(visitedDests, id => sortKeys.destDate.get(id) ?? '', sortKeys.destRating, sortKeys.destSpots),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visitedDests, sortKeys, exploredSort]);
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
  // A search over them, by destination name only. A country is a filter, not text: typing narrows the country chips to
  // the countries it could be (suggestions to tap), and typing a whole country name applies it (searchOrCountry).
  const [destQuery, setDestQuery] = useState('');
  const q = destQuery.trim().toLowerCase();
  const shownDests = useMemo(
    () => exploredDests.filter(d => (!destCountry || d.countryCode === destCountry) && wordMatch(d.name, q)),
    [exploredDests, destCountry, q]);
  const exploredSpots = useMemo(
    () => sortBy(visitedSpots, id => sortKeys.spotDate.get(id) ?? '', id => savedSpots[id]?.rating ?? 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visitedSpots, sortKeys, savedSpots, exploredSort]);
  // Spots Explored works the same way: search by a spot's name or its destination's, filter by country with chips.
  const [spotCountryF, setSpotCountryF] = useState<string | null>(null);
  const spotCountries = useMemo(() => {
    const m = new Map<string, { code: string; name: string; count: number }>();
    for (const sp of visitedSpots) {
      const code = spotCountryCode(sp);
      if (!code) continue;
      const r = m.get(code) ?? { code, name: spotCountry(sp) ?? code, count: 0 };
      r.count += 1; m.set(code, r);
    }
    return [...m.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  }, [visitedSpots]);
  const [spotQuery, setSpotQuery] = useState('');
  const sq = spotQuery.trim().toLowerCase();
  const shownSpots = useMemo(() => exploredSpots.filter(sp =>
    (!spotCountryF || spotCountryCode(sp) === spotCountryF) &&
    (wordMatch(sp.name, sq) || wordMatch(spotDestination(sp)?.name ?? '', sq))),
  [exploredSpots, spotCountryF, sq]);
  // Each Explored search is folded behind a magnifier in its header until wanted (FoldingSearch).
  const destSearchable = exploredDests.length > 8 || destCountries.length > 3;
  const spotSearchable = exploredSpots.length > 8;
  const [destSearchOpen, setDestSearchOpen] = useState(false);
  const [spotSearchOpen, setSpotSearchOpen] = useState(false);
  const toggleSearch = (open: boolean, setOpen: (v: boolean) => void, setQuery: (t: string) => void) => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (open) setQuery('');
    setOpen(!open);
  };
  // Typing a whole country name (one of the chips) applies it as the filter and clears the text.
  const searchOrCountry = (text: string, countries: { code: string; name: string }[], setText: (t: string) => void, setCountry: (c: string | null) => void) => {
    const hit = countries.find(c => c.name.toLowerCase() === text.trim().toLowerCase());
    if (hit) {
      Haptics.selectionAsync();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCountry(hit.code); setText('');
    } else setText(text);
  };
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

  // Countries Explored: tapping a flag shows its country's name in a small bubble above it for a moment, and fills that country
  // orange on the world map for as long.
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
  const worldDots = useMemo(() => {
    const dot = (id: string, code: string, c: { longitude: number; latitude: number }) => ({ id, code, ...worldPoint(c.longitude, c.latitude) });
    if (worldMode === 'spots') return visitedSpots.map(sp => dot(sp.id, spotCountryCode(sp) ?? '', sp.coordinates));
    if (worldMode === 'destinations') return visitedDests.map(d => dot(d.id, d.countryCode, d.coordinates));
    return [];
  }, [worldMode, visitedSpots, visitedDests]);



  // The Explored tile tapped: its dot on the world map is highlighted. Tapping it again clears it.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickTile = (id: string) => { Haptics.selectionAsync(); setPickedId(cur => (cur === id ? null : id)); };

  const selectMode = (mode: WorldMode) => {
    if (mode === worldMode) return;
    setPickedId(null);
    if (mode === 'spots' && exploredSort === 'spots') setExploredSort('name');
    Haptics.selectionAsync();
    // The sections below swap with an animation, so the change is seen to follow the selection.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setWorldMode(mode);
  };
  // Top Countries' own tabs (ranked by destinations or by spots) can be swiped inside its box: left to Spots, right to
  // Destinations. It only starts once the finger has gone 25 pt sideways, and fails on a vertical move first, so
  // scrolling the page is unaffected. Swiping elsewhere on the page does nothing.
  const pickTopRank = (m: 'destinations' | 'spots') => {
    if (m === topRank) return;
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTopRank(m);
  };
  const topRankRef = useRef(pickTopRank);
  topRankRef.current = pickTopRank;
  const callTopRank = useRef((left: boolean) => topRankRef.current(left ? 'spots' : 'destinations')).current;
  const topSwipeXSV = useSharedValue(0);
  const topSwipe = useMemo(() => Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-12, 12])
    .onUpdate(e => { topSwipeXSV.value = e.translationX * 0.2; })
    .onEnd(e => {
      if (Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 600) runOnJS(callTopRank)(e.translationX < 0);
    })
    .onFinalize(() => { topSwipeXSV.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }); }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);
  const topSwipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: topSwipeXSV.value }] }));

  // The world map: its own card under the Countries selector; under Destinations and Spots it sits inside the Explored card.
  // With a country picked in the Explored dropdown, the map frames that country: the country's box (and the places visited
  // there), padded, kept in the map's own shape and never tighter than about 25 degrees across (so one place is not a pixel of land).
  const mapView = useMemo(() => {
    const full = { x: 0, y: WORLD_Y0, w: 360, h: WORLD_Y1 - WORLD_Y0 };
    const code = worldMode === 'destinations' ? destCountry : worldMode === 'spots' ? spotCountryF : null;
    const pts = code ? worldDots.filter(d => d.code === code) : [];
    if (!pts.length) return full;
    // The whole country, not only the places visited in it (Japan is more than Kyoto and Tokyo): its box, where we have one.
    const cb = getCountryBounds(code!);
    if (cb) pts.push(
      { id: '', code: code!, ...worldPoint(cb.sw.longitude, cb.ne.latitude) },
      { id: '', code: code!, ...worldPoint(cb.ne.longitude, cb.sw.latitude) });
    const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
    const y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
    const shape = WORLD_VH / 360;
    const w = Math.min(360, Math.max(25, (x1 - x0) * 1.2, ((y1 - y0) * 1.2) / shape));
    const h = w * shape;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x: Math.max(0, Math.min(360 - w, cx - w / 2)), y: Math.max(0, Math.min(WORLD_VH - h, cy - h / 2)), w, h };
  }, [worldMode, destCountry, spotCountryF, worldDots]);
  // Dots and pins keep a readable size on screen as the map zooms in (they are drawn in map units).
  const dotScale = Math.min(1, (mapView.w / 360) * 2.5);
  // The world outlines are coarse (one decimal of a degree), which shows once a country fills the map: when zoomed in, draw the
  // finer set instead (scripts/build-world-detail.py), loaded on first use because it is large.
  const zoomed = mapView.w < 200;
  const detailInView = useMemo(() => {
    if (!zoomed) return [];
    const all = require('../data/worldCountriesDetail.json') as { c: string; b: number[]; d: string }[];
    const pad = mapView.w * 0.05;
    return all.filter(e => e.b[2] >= mapView.x - pad && e.b[0] <= mapView.x + mapView.w + pad && e.b[3] >= mapView.y - pad && e.b[1] <= mapView.y + mapView.h + pad);
  }, [zoomed, mapView]);
  const worldMapAt = (w: number) => (
    <Pressable onPress={() => { Haptics.selectionAsync(); setMapOpen(true); }} accessibilityLabel="Open the map">
    <View pointerEvents="none" style={[styles.mapWrap, { height: Math.round((w * WORLD_VH) / 360) }]}>
      <Svg width={w} height={Math.round((w * WORLD_VH) / 360)} viewBox={`${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`}>
        <Rect x={0} y={WORLD_Y0} width={360} height={WORLD_Y1 - WORLD_Y0} fill="#EEF2F6" />
        {zoomed ? detailInView.map(({ c, d }) => (
          // Zoomed in: the 1:10m outlines, only those in view, with a border about a point wide however far in it is.
          <Path key={c} d={d} fill="#D9DEE5" stroke="white" strokeWidth={(0.9 * mapView.w) / w} strokeLinejoin="round" />
        )) : (WORLD_COUNTRIES as { c: string; d: string }[]).map(({ c, d }, k) => (
          <Path key={k} d={d}
            fill={worldMode === 'countries' && c === flagTip ? PICK_COLOR : worldMode === 'countries' && visitedCountrySet.has(c) ? '#10B981' : '#D9DEE5'}
            stroke="white" strokeWidth={0.15} />
        ))}
        {/* Destinations: a dot at each one visited. Spots: a small pin (the app's spot pin, its tip on the place), so they
            read differently from destinations, as on the full-screen map. */}
        {/* The picked tile's place is drawn last (on top), in orange and a little larger. */}
        {worldMode === 'destinations' && [...worldDots].sort((x, y) => +(x.id === pickedId) - +(y.id === pickedId)).map(p => (
          <Circle key={p.id} cx={p.x} cy={p.y} r={(p.id === pickedId ? 3.2 : 2) * dotScale} fill={p.id === pickedId ? PICK_COLOR : '#10B981'} stroke="white" strokeWidth={0.5 * dotScale} />
        ))}
        {worldMode === 'spots' && [...worldDots].sort((x, y) => +(x.id === pickedId) - +(y.id === pickedId)).map(p => {
          const on = p.id === pickedId;
          return (
            <G key={p.id} transform={`translate(${p.x} ${p.y}) scale(${dotScale * (on ? 1.6 : 1)}) translate(${-p.x} ${-p.y})`}>
              <Path d={pinPath(p.x, p.y)} fill={on ? PICK_COLOR : '#10B981'} stroke="white" strokeWidth={0.3} strokeLinejoin="round" />
              <Circle cx={p.x} cy={p.y - PIN_TIP} r={0.55} fill="#111111" />
            </G>
          );
        })}
      </Svg>
      {w !== WORLD_W && <View style={styles.mapBorder} pointerEvents="none" />}
      {/* A hint that the map opens. */}
      <View style={styles.mapHint}><Text style={styles.mapHintTxt}>Tap to explore</Text></View>
    </View>
    </Pressable>
  );
  const worldMap = worldMapAt(worldMode === 'countries' ? WORLD_W : SCREEN_W);
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
      <ProfileAvatar uri={userAvatarUri} name={userName} size={88} crop={userAvatarCrop} />
      <Text style={styles.profileName} numberOfLines={1}>{userName}</Text>
      {!!userHandle && <Text style={styles.profileHandle} numberOfLines={1}>@{userHandle}</Text>}
      <Text style={styles.profileSub}>
        {joinedAt ? `Joined ${new Date(joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}
      </Text>
      {/* Room for the Edit Profile button, which is drawn in the page (see below) so it can be tapped. */}
      <View style={styles.editBtn} onLayout={e => setEditFrame(e.nativeEvent.layout)}>
        <Pencil size={12} color="#6B7280" strokeWidth={2.2} />
        <Text style={styles.editTxt}>Edit Profile</Text>
      </View>
    </Animated.View>
    {/* The level selector (child 1) pins to the top while the sections it controls scroll beneath. */}
    <Animated.ScrollView
      ref={pageRef}
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
      {/* Tapping the avatar here opens Edit Profile too (the header itself sits behind the page and takes no taps). */}
      <View style={{ height: headerH + 16 }}>
        <Pressable style={styles.avatarHit} onPress={() => setEditOpen(true)} accessibilityLabel="Edit profile" />
      </View>

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
          <ProfileAvatar uri={userAvatarUri} name={userName} size={26} crop={userAvatarCrop} />
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
        <Animated.View pointerEvents="none" style={[styles.selectorDivider, dividerStyle]} />
        {/* The pinned bar's tab headings, in place of the card. */}
        <Animated.View
          pointerEvents={pinned ? 'auto' : 'none'}
          style={[styles.tabs, tabsStyle]}
        >
          {WORLD_MODES.map(({ mode, label }, i) => {
            const value = mode === 'countries' ? stats.totalCountries : mode === 'destinations' ? stats.totalDestinations : stats.totalSpots;
            return (
              // The middle tab takes its text's own width and the outer two share the rest equally, so the middle tab is
              // centred on the screen whatever the counts' widths.
              <Pressable
                key={mode}
                style={[styles.tab, i !== 1 && { flex: 1 }]}
                onPress={() => selectMode(mode)}
                hitSlop={{ top: 6, bottom: 6 }}
                onLayout={e => { tabRef.current[i] = e.nativeEvent.layout.x; placeUnderline(); }}
              >
                <View style={styles.tabText} onLayout={e => {
                  // The underline spans the text, not the whole tab: offset by where the text sits in it.
                  tabTextRef.current[i] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
                  placeUnderline();
                }}>
                  <StatText index={i} level={levelSV} style={styles.tabValue} on="#111827" off="#9CA3AF">{value}</StatText>
                  <StatText index={i} level={levelSV} style={styles.tabLabel} on="#111827" off="#9CA3AF">{label}</StatText>
                </View>
              </Pressable>
            );
          })}
          <Animated.View style={[styles.tabUnderline, underlineStyle]} />
        </Animated.View>
      </View>
      </View>

      {/* ── The map, its own card under the selector ── */}
      {worldMode === 'countries' && <View style={styles.mapCard}>{worldMap}</View>}

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
        <GestureDetector gesture={topSwipe}>
        <Animated.View style={[styles.panelSection, topSwipeStyle]} collapsable={false}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Top Countries</Text>
            {/* Rank by visited destinations or by visited spots. */}
            <View style={styles.topToggle}>
              {(['destinations', 'spots'] as const).map(m => {
                const on = topRank === m;
                return (
                  <Pressable key={m} style={[styles.topToggleBtn, on && styles.topToggleBtnOn]} hitSlop={4}
                    onPress={() => pickTopRank(m)}>
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
                {count}
              </Text>
            </View>
          ))}
        </Animated.View>
        </GestureDetector>
      )}
      </>)}

      {/* ── Destinations: Destinations Explored, Top Destinations (by visited spots) ── */}
      {worldMode === 'destinations' && (<>
        <View style={styles.exploredSection}>
          {destSearchOpen && (
            <View style={[styles.cardHeaderRow, styles.exploredPad]}>
              <FoldingSearch value={destQuery} placeholder="Search destinations or countries"
                onChangeText={t => searchOrCountry(t, destCountries, setDestQuery, setDestCountry)}
                onClose={() => { setDestQuery(''); setDestSearchOpen(false); }} onBlurEmpty={() => setDestSearchOpen(false)} />
            </View>
          )}
          {exploredDests.length > 0 && <SortRow sort={exploredSort} onSort={setExploredSort} withSpots countries={destCountries} total={exploredDests.length} country={destCountry} onCountry={setDestCountry} />}
          <View>
            {worldMap}
            {destSearchable && !destSearchOpen && (
              <View style={styles.exploredSearchBtn}>
                <SearchToggle onPress={() => toggleSearch(false, setDestSearchOpen, setDestQuery)} />
              </View>
            )}
          </View>
          {exploredDests.length === 0 ? (
            <Text style={[styles.topEmpty, styles.exploredPad, { marginTop: 12 }]}>No destinations visited yet.</Text>
          ) : (
            <>
            {shownDests.length === 0 && (
              <Text style={[styles.topEmpty, styles.exploredPad]}>
                {q && destCountries.some(c => wordMatch(c.name, q)) ? 'No destination names match. Pick the country from the Country dropdown to filter by it.' : 'No destinations match.'}
              </Text>
            )}
            {/* A photo grid: one tile per destination, its name and its visited spots over its photo. */}
            <PhotoGrid pickedId={pickedId} onPick={pickTile} tiles={shownDests.map((d, k) => {
              const n = spotsByDest.get(d.id) ?? 0;
              return {
                key: d.id, name: d.name, countryCode: d.countryCode, sub: n > 0 ? `${n} spot${n === 1 ? '' : 's'}` : '',
                // Sorted by most spots, the top three (with any spots) wear a rank badge.
                rank: exploredSort === 'spots' && n > 0 && k < 3 ? k + 1 : undefined,
                photo: (
                  // The same small-photo key as the country sheet's destination pickers, so either can reuse it.
                  <EntityPhoto
                    cacheKey={`pick_${d.id}`}
                    cache={thumbCache}
                    load={() => getOrFetchWikiThumbnail(`pick_${d.id}`, thumbCache, d.name, 300)}
                    subject={photoSubject(d.name)}
                    placeholderColor="#E5E7EB"
                  />
                ),
              };
            })} />
            </>
          )}
        </View>
      </>)}

      {/* ── Spots: Spots Explored ── */}
      {worldMode === 'spots' && (
        <View style={styles.exploredSection}>
          {spotSearchOpen && (
            <View style={[styles.cardHeaderRow, styles.exploredPad]}>
              <FoldingSearch value={spotQuery} placeholder="Search spots, destinations or countries"
                onChangeText={t => searchOrCountry(t, spotCountries, setSpotQuery, setSpotCountryF)}
                onClose={() => { setSpotQuery(''); setSpotSearchOpen(false); }} onBlurEmpty={() => setSpotSearchOpen(false)} />
            </View>
          )}
          {exploredSpots.length > 0 && <SortRow sort={exploredSort} onSort={setExploredSort} withSpots={false} countries={spotCountries} total={exploredSpots.length} country={spotCountryF} onCountry={setSpotCountryF} />}
          <View>
            {worldMap}
            {spotSearchable && !spotSearchOpen && (
              <View style={styles.exploredSearchBtn}>
                <SearchToggle onPress={() => toggleSearch(false, setSpotSearchOpen, setSpotQuery)} />
              </View>
            )}
          </View>
          {exploredSpots.length === 0 ? (
            <Text style={[styles.topEmpty, styles.exploredPad, { marginTop: 12 }]}>No spots visited yet.</Text>
          ) : (
            <>
            {shownSpots.length === 0 && (
              <Text style={[styles.topEmpty, styles.exploredPad]}>
                {sq && spotCountries.some(c => wordMatch(c.name, sq)) ? 'No spot names match. Pick the country from the Country dropdown to filter by it.' : 'No spots match.'}
              </Text>
            )}
            {/* The same photo grid for spots: the spot's country under its name. */}
            <PhotoGrid pickedId={pickedId} onPick={pickTile} tiles={shownSpots.map(sp => ({
              key: sp.id, name: sp.name, countryCode: spotCountryCode(sp), sub: spotCountry(sp) ?? '',
              photo: NO_PHOTO.has(spotPhotoTitle(sp))
                ? <PhotoPlaceholder icon={sp.icon} category={sp.category} size={TILE} />
                : // The same small-photo key as the destination sheet's spot pickers, so either can reuse it.
                  <EntityPhoto
                    cacheKey={`pick_spot_${sp.id}`}
                    cache={thumbCache}
                    load={() => getOrFetchWikiThumbnail(`pick_spot_${sp.id}`, thumbCache, spotPhotoTitle(sp), 300)}
                    subject={photoSubject(spotPhotoTitle(sp))}
                    placeholderColor="#E5E7EB"
                    fallback={<PhotoPlaceholder icon={sp.icon} category={sp.category} size={TILE} />}
                  />,
            }))} />
            </>
          )}
        </View>
      )}
    </Animated.ScrollView>
    {editTap && !!editFrame && (
      <Pressable
        style={{ position: 'absolute', top: insets.top + 16 + editFrame.y, left: editFrame.x, width: editFrame.width, height: editFrame.height }}
        onPress={() => { Haptics.selectionAsync(); setEditOpen(true); }}
        hitSlop={8}
        accessibilityLabel="Edit profile"
      />
    )}
    <EditProfileSheet visible={editOpen} onClose={() => setEditOpen(false)} />
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
// Whether `text` has a word starting with `q` ("kak" finds Kakadu, "new z" New Zealand); an empty query matches all.
function wordMatch(text: string, q: string) {
  return !q || (' ' + text.toLowerCase()).includes(' ' + q);
}

// An Explored list as a grid of rounded photo tiles, three across: the name in white at the bottom left over a dark
// scrim, and under it a tiny flag with a short line (spots visited, or a spot's country).
const TILE_COLS = 3;
const TILE_GAP = 6;
// A tile's side: the screen width, less the side room and the gaps.
const TILE = Math.floor((SCREEN_W - 2 * EXPLORED_PAD - (TILE_COLS - 1) * TILE_GAP) / TILE_COLS);
// Nine to a page, three rows of three; a page is the screen wide and as tall as its rows.
const PAGE_SIZE = TILE_COLS * 3;
// Room above and below each page for the tiles' shadows (the scroller clips anything outside it).
const SHADOW_ROOM = 6;
const gridHeight = (n: number) => { const rows = Math.max(1, Math.ceil(n / TILE_COLS)); return TILE * rows + TILE_GAP * (rows - 1); };
function PhotoGrid({ tiles, pickedId, onPick }: {
  tiles: { key: string; name: string; countryCode?: string | null; sub: string; photo: React.ReactNode; rank?: number }[];
  pickedId: string | null; onPick: (id: string) => void;
}) {
  // Pages of nine (three by three): swiping snaps to a whole page, like a carousel, with a dot for each page below.
  const pages: typeof tiles[] = [];
  for (let i = 0; i < tiles.length; i += PAGE_SIZE) pages.push(tiles.slice(i, i + PAGE_SIZE));
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);
  // A new list (another sort, country or search) starts again from its first page.
  const firstKey = tiles[0]?.key;
  useEffect(() => { ref.current?.scrollTo({ x: 0, animated: false }); setPage(0); }, [firstKey, pages.length]);
  return (
    <View>
      <ScrollView ref={ref} horizontal pagingEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false}
        style={styles.tileScroll} decelerationRate="fast"
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}>
        {pages.map((pg, i) => (
          <View key={i} style={[styles.tilePage, { height: gridHeight(pg.length) + 2 * SHADOW_ROOM }]}>
            {pg.map(t => (
              <Pressable key={t.key} style={styles.tile} onPress={() => onPick(t.key)}>
                <View style={styles.tileClip}>
                {t.photo}
                {/* The text sits in a footer pinned to the tile's bottom, full width. Its scrim is measured from the footer, so it
                    spans the tile and grows with the text (one line or two) instead of being a fixed band. */}
                <TileFooter name={t.name} countryCode={t.countryCode} sub={t.sub} />
                {!!t.rank && (
                  <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[t.rank - 1] }]} pointerEvents="none">
                    <Text style={styles.rankTxt}>{t.rank}</Text>
                  </View>
                )}
                {pickedId === t.key && <View style={styles.tileRing} pointerEvents="none" />}
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      {pages.length > 1 && (
        <View style={styles.pageBar}>
          <View style={styles.pageDots}>
            {pages.map((_, i) => <View key={i} style={[styles.pageDot, i === page && styles.pageDotOn]} />)}
          </View>
          {/* Which tiles this page shows, out of all of them: "10–18 of 25". */}
          <Text style={styles.pageRange}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tiles.length)} of {tiles.length}</Text>
        </View>
      )}
    </View>
  );
}

// A tile's footer: the name and sub line over a dark gradient that fills the footer's own box (full tile width, as tall as the
// text plus room to fade in above it).
function TileFooter({ name, countryCode, sub }: { name: string; countryCode?: string | null; sub: string }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={styles.tileFooter} pointerEvents="none"
      onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {!!box && (
        <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="tileScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity={0} />
              <Stop offset="0.25" stopColor="#000" stopOpacity={0.12} />
              <Stop offset="0.55" stopColor="#000" stopOpacity={0.4} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.78} />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={box.w} height={box.h} fill="url(#tileScrim)" />
        </Svg>
      )}
      <Text style={styles.tileName} numberOfLines={3}>{name}</Text>
      <View style={styles.tileSubRow}>
        {!!countryCode && <CircleFlag countryCode={countryCode} size={11} ring ringWidth={1} />}
        {!!sub && <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>}
      </View>
    </View>
  );
}

type ExploredSort = 'name' | 'date' | 'rating' | 'spots';
const SORTS: { key: ExploredSort; label: string }[] = [
  { key: 'name', label: 'A–Z' },
  { key: 'date', label: 'Date Visited' },
  { key: 'rating', label: 'Rating' },
  // Destinations only: the most visited spots first (the first three tiles wear a rank badge).
  { key: 'spots', label: 'Spots Visited' },
];
// The sort choice above an Explored grid: small segmented pills, the chosen one dark.
type SortCountry = { code: string; name: string; count: number };
// The row above the Explored map: two dropdown chips side by side, the country filter ("All countries" or the chosen one, with
// its flag) and the sort order. Each opens a small menu under its chip.
function SortRow({ sort, onSort, withSpots, countries, total, country, onCountry }: {
  sort: ExploredSort; onSort: (s: ExploredSort) => void; withSpots: boolean;
  countries: SortCountry[]; total: number; country: string | null; onCountry: (code: string | null) => void;
}) {
  const countryRef = useRef<View>(null);
  const sortRef = useRef<View>(null);
  const [menu, setMenu] = useState<{ kind: 'country' | 'sort'; x: number; y: number } | null>(null);
  const openMenu = (kind: 'country' | 'sort') => {
    Haptics.selectionAsync();
    (kind === 'country' ? countryRef : sortRef).current?.measureInWindow((x, y, _w, h) => setMenu({ kind, x, y: y + h + 6 }));
  };
  const chosen = countries.find(c => c.code === country);
  const sorts = SORTS.filter(o => withSpots || o.key !== 'spots');
  const menuW = menu?.kind === 'sort' ? 180 : 220;
  return (
    <>
      <View style={styles.sortRow}>
        {countries.length > 1 && (
          <Pressable ref={countryRef} collapsable={false} hitSlop={6} style={[styles.countryDrop, !!chosen && styles.countryDropOn]} onPress={() => openMenu('country')}>
            {!!chosen && <CircleFlag countryCode={chosen.code} size={12} />}
            <Text style={[styles.countryDropTxt, !!chosen && styles.filterTxtOn]} numberOfLines={1}>{chosen ? chosen.name : 'All countries'}</Text>
            <ChevronDown size={13} color={chosen ? '#047857' : '#6B7280'} strokeWidth={2.4} />
          </Pressable>
        )}
        <Pressable ref={sortRef} collapsable={false} hitSlop={6} style={styles.countryDrop} onPress={() => openMenu('sort')}>
          <Text style={styles.sortLabel}>Sort</Text>
          <Text style={styles.countryDropTxt} numberOfLines={1}>{(sorts.find(o => o.key === sort) ?? sorts[0]).label}</Text>
          <ChevronDown size={13} color="#6B7280" strokeWidth={2.4} />
        </Pressable>
      </View>
      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} />
        {!!menu && (
          <View style={[styles.dropMenu, { width: menuW, top: menu.y, left: Math.max(12, Math.min(menu.x, SCREEN_W - menuW - 12)) }]}>
            <ScrollView style={{ maxHeight: 300 }} bounces={false}>
              {menu.kind === 'sort'
                ? sorts.map(o => (
                    <Pressable key={o.key} style={styles.dropRow} onPress={() => { Haptics.selectionAsync(); onSort(o.key); setMenu(null); }}>
                      <Text style={[styles.dropName, sort === o.key && styles.dropNameOn]}>{o.label}</Text>
                      <View style={styles.dropCheck}>{sort === o.key && <Check size={14} color="#047857" strokeWidth={3} />}</View>
                    </Pressable>
                  ))
                : [{ code: null as string | null, name: 'All countries', count: total }, ...countries].map(c => {
                    const on = (country ?? null) === c.code;
                    return (
                      <Pressable key={c.code ?? 'all'} style={styles.dropRow} onPress={() => { Haptics.selectionAsync(); onCountry(c.code); setMenu(null); }}>
                        <View style={styles.dropFlag}>{!!c.code && <CircleFlag countryCode={c.code} size={18} />}</View>
                        <Text style={[styles.dropName, on && styles.dropNameOn]} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.dropCount}>{c.count}</Text>
                        <View style={styles.dropCheck}>{on && <Check size={14} color="#047857" strokeWidth={3} />}</View>
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

// The magnifier in an Explored section's header that opens its search.
function SearchToggle({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.searchToggle} accessibilityLabel="Search">
      <Search size={15} color="#6B7280" strokeWidth={2.3} />
    </Pressable>
  );
}

// An Explored section's search box, in its header line in place of the title while open: it opens with the keyboard
// up, its close mark clears it and folds it away, and leaving it empty folds it away too.
function FoldingSearch({ value, placeholder, onChangeText, onClose, onBlurEmpty }: {
  value: string; placeholder: string; onChangeText: (t: string) => void; onClose: () => void; onBlurEmpty: () => void;
}) {
  return (
    <View style={[styles.searchBox, styles.searchInHeader]}>
      <Search size={14} color="#9CA3AF" />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        onBlur={() => { if (!value.trim()) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onBlurEmpty(); } }}
      />
      <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onClose(); }} hitSlop={8} accessibilityLabel="Close search">
        <X size={14} color="#9CA3AF" strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

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
// The Edit Profile button's height.
const EDIT_H = 26;
// How many points of scroll, ending where the bar pins, the bar fills in over and the full header fades out over.
const FADE = 36;
// The pinned bar's tab row height.
const TABS_H = 36;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  // Profile header
  // The avatar centred, the name and the line under it centred below.
  profileHeader: { alignItems: 'center', paddingHorizontal: 16 },
  profileName: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 12 },
  profileSub:  { fontSize: 13, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  profileHandle: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginTop: 4 },
  // Over the header's avatar (88 pt, centred at the top), in the page's room for the header.
  avatarHit:   { position: 'absolute', top: 0, alignSelf: 'center', width: 88, height: 88, borderRadius: 44 },
  // The Edit Profile button: a quiet grey pill with a pencil, under the header's text.
  editBtn:     {
    height: EDIT_H, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: EDIT_H / 2,
    backgroundColor: '#F3F4F6', marginTop: 10,
  },
  editTxt:     { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  // The pinned bar's own small avatar and name, in its top strip (COMPACT_H tall).
  compactHeader: {
    position: 'absolute', top: 0, left: 16, right: 16, height: COMPACT_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  compactName: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1 },

  // Stats row
  // The level selector: pinned while scrolling (on the page colour, so nothing shows round its corners). The selected
  // count sits on a dark pill.
  // Its top strip (room for the small avatar and name; the sticky View's negative margin) overlaps the bottom of the
  // full header until it pins, so the page keeps its old spacing; the background fills in only once pinned (stuckStyle).
  // A gray line under the card, as wide as the cards below, with room before the map; shown only when the selector is not pinned.
  selectorDivider: { height: 1, marginBottom: 16, backgroundColor: '#F0F1F3' },
  selectorSticky: { paddingTop: COMPACT_H, paddingHorizontal: 16 },
  // The pinned bar's tab headings: plain text on the bar, the number and the level's name, with an underline.
  // Spans the bar edge to edge less the page margins, whichever box absolute offsets count from: left and right are equal.
  tabs: { position: 'absolute', top: COMPACT_H, left: 16, right: 16, height: TABS_H, flexDirection: 'row' },
  // Equal thirds; the text centred in each (it may run past a third's edges rather than wrap, staying centred).
  tab: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  tabText: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
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
  // The map inside an Explored card: full width of the card, rounded, with room around it.
  // The Explored sections have no card: the map, pills and photo grid run the full screen width.
  exploredSection: { marginBottom: 12 },
  exploredPad: { paddingHorizontal: EXPLORED_PAD },
  exploredSearchBtn: { position: 'absolute', top: 10, right: 12 },
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
  titleWithCount: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  searchInHeader: { flex: 1, marginBottom: 0, height: 34 },
  searchToggle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },

  // My World
  mapWrap:       { height: WORLD_H, backgroundColor: '#EEF2F6' },
  // A quiet hint that the map opens: a translucent white pill with grey text, not a dark badge.
  // The Explored map runs the full screen width, with a line along its top and bottom edges (drawn over them, so it keeps its size).
  mapBorder:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#CBD5E1' },
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
  // The Explored lists' country filter: a sideways row of chips; the chosen one is green.
  filterScroll: { marginBottom: 10, flexGrow: 0 },
  filterRow:    { paddingHorizontal: EXPLORED_PAD, gap: 6 },
  filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: 'white' },
  filterChipOn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  filterTxt:    { fontSize: 12, fontWeight: '600', color: '#374151' },
  filterTxtOn:  { color: '#047857' },
  filterCount:  { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  // The Explored photo grid: square tiles, three across.
  // The sort is plain text with an underline on the chosen one, so it reads as a lighter tier than the country pills above.
  sortRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: EXPLORED_PAD, marginBottom: 10 },
  sortLabel: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  sortPill:  { paddingVertical: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  sortPillOn: { borderBottomColor: '#111827' },
  countryDrop: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                 borderWidth: 1, borderColor: '#E5E7EB', maxWidth: 170 },
  countryDropOn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  countryDropTxt: { fontSize: 12, fontWeight: '600', color: '#374151', flexShrink: 1 },
  dropMenu: { position: 'absolute', width: 220, backgroundColor: 'white', borderRadius: 14, paddingVertical: 6,
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  dropFlag: { width: 18 },
  dropName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827' },
  dropNameOn: { color: '#047857', fontWeight: '700' },
  dropCount: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  dropCheck: { width: 16, alignItems: 'center' },
  sortTxt:   { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  sortTxtOn: { color: '#111827' },
  tileScroll: { marginTop: 8, flexGrow: 0 },
  tilePage: { width: SCREEN_W, paddingHorizontal: EXPLORED_PAD, paddingVertical: SHADOW_ROOM, alignContent: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  pageBar:  { marginTop: 4, height: 18, justifyContent: 'center', paddingHorizontal: EXPLORED_PAD + 2 },
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  pageRange: { position: 'absolute', right: EXPLORED_PAD + 2, fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D1D5DB' },
  pageDotOn: { backgroundColor: '#111827' },
  // A tile is a shadow-casting shell around a clipped inner box (a view that clips cannot also cast a shadow).
  tile:     { width: TILE, height: TILE, borderRadius: 10, backgroundColor: '#E5E7EB',
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tileClip: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  // A picked tile: an orange ring inside its edge (the tile clips, so the ring is a child).
  rankBadge: { position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'white' },
  rankTxt:   { fontSize: 11, fontWeight: '800', color: 'white' },
  tileRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, borderWidth: 3, borderColor: PICK_COLOR },
  tileFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: 8, paddingBottom: 8 },
  tileName: { fontSize: 13, fontWeight: '700', color: 'white', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3 },
  tileSubRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  tileSub:  { flexShrink: 1, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  // Destinations Explored's rows: photo, name, country and spots visited; about five rows, then the list scrolls.
  destRowsScroll: { maxHeight: 300 },
  destRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  destRowBorder:  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  destThumb:      { width: 46, height: 46, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  destRowName:    { fontSize: 15, fontWeight: '700', color: '#111827' },
  destRowSub:     { fontSize: 12, color: '#6B7280', marginTop: 2 },
  // The line under a destination's name: a tiny flag, then its country (and spots visited).
  destRowSubRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  // The thin vertical line between the parts of a row's sub line.
  subDivider:     { width: StyleSheet.hairlineWidth * 2, height: 11, backgroundColor: '#D1D5DB', marginHorizontal: 2 },
  // A spot row's destination, after its country and a separator.
  spotRowDest:    { marginTop: 0, flexShrink: 1 },
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
  countryCount:    { fontSize: 14, fontWeight: '700', color: '#111827', width: 30, textAlign: 'right' },

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
