import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions, Pressable, LayoutAnimation, Modal,
} from 'react-native';
import { Pencil, ChevronDown, Check, LayoutGrid, List as ListIcon } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, useAnimatedScrollHandler, useAnimatedReaction, runOnJS, useAnimatedRef, scrollTo, withTiming, withSpring, Easing, interpolateColor, interpolate, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// The chips' sideways scroller (gesture-handler's, so it cooperates with the page's own scroll).
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
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
import { thumbCache, photoCache, getOrFetchWikiThumbnail, HEADER_PX } from '../utils/photoCache';
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
// The world view starts a little east of the date line's west edge, so Russia's far east (which crosses 180°) shows at the
// right edge of the map rather than as a sliver at the left. The countries that cross the line are drawn again 360 units over.
const WORLD_X0 = 10;
const WRAP_COUNTRIES = new Set(['RU', 'US', 'FJ', 'KI', 'NZ']);
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
// How much larger the picked spot's pin is drawn than the others.
const PICK_PIN_SCALE = 2;
const PIN_TY = (PIN_R * PIN_R) / PIN_TIP, PIN_TX = PIN_R * Math.sqrt(1 - (PIN_R * PIN_R) / (PIN_TIP * PIN_TIP));
const pinPath = (x: number, y: number) => {
  const cy = y - PIN_TIP;
  return `M ${x - PIN_TX} ${cy + PIN_TY} L ${x} ${y} L ${x + PIN_TX} ${cy + PIN_TY} A ${PIN_R} ${PIN_R} 0 1 0 ${x - PIN_TX} ${cy + PIN_TY} Z`;
};

// Where to mark a picked country on the map: the centre (area centroid) of its largest piece of land (France's mainland, not
// the box round it and its overseas departments), in map units, and whether it is small enough on the world map to need a fixed ring
// round it as well as the pulse (a country a few points across barely shows its orange).
const SMALL_COUNTRY = 6;   // map units (about points on the card) across its largest piece
function countryMark(d: string): { x: number; y: number; small: boolean } | null {
  let best: { area: number; cx: number; cy: number; x0: number; x1: number; y0: number; y1: number } | null = null;
  for (const part of d.split('M').filter(Boolean)) {
    const n = part.replace(/Z/g, ' ').trim().split(/[\s,]+/).map(Number);
    if (n.length < 2) continue;
    let a2 = 0, sx = 0, sy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < n.length; i += 2) {
      const x = n[i], y = n[i + 1], nx = n[(i + 2) % n.length], ny = n[(i + 3) % n.length];
      const cross = x * ny - nx * y;
      a2 += cross; sx += (x + nx) * cross; sy += (y + ny) * cross;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const area = Math.abs(a2) / 2;
    // A sliver with next to no area (a dot-sized island) has no usable centroid: its box's middle instead.
    const flat = area < 1e-6;
    const cx = flat ? (x0 + x1) / 2 : sx / (3 * a2), cy = flat ? (y0 + y1) / 2 : sy / (3 * a2);
    if (!best || area > best.area) best = { area, cx, cy, x0, x1, y0, y1 };
  }
  if (!best) return null;
  return { x: best.cx < WORLD_X0 ? best.cx + 360 : best.cx, y: best.cy, small: Math.max(best.x1 - best.x0, best.y1 - best.y0) < SMALL_COUNTRY };
}
const COUNTRY_D = new Map((WORLD_COUNTRIES as { c: string; d: string }[]).map(e => [e.c, e.d]));

// The Spots destination filter's choice for a country's spots that belong to no destination.
const SPOT_NO_DEST = '__none';

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
  // visited destination or spot. Under it, every level lists what it has explored the same way: a photo grid or a ranked list.
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
  const [pageH, setPageH] = useState(0);
  const [selectorH, setSelectorH] = useState(0);
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
  // The Explored lists for destinations and spots, alphabetical.
  // How the Explored grids are ordered: A–Z, most recently visited first, or best rated first. A spot's rating is its own;
  // a destination has none of its own, so it takes the average of its visited spots' ratings. Places with no date or rating
  // come last.
  const [exploredSort, setExploredSort] = useState<ExploredSort>('name');
  // The Explored places as a photo grid, or as a ranked list in the order of the sort (see RankList).
  const [exploredView, setExploredView] = useState<ExploredView>('grid');
  const savedSpots = useStore(s => s.savedSpots);
  const savedDests = useStore(s => s.savedDestinations);
  const sortKeys = useMemo(() => {
    // Each place's most recent visit (the one that ended last): its last day sorts the date sort (spotDate, destDate), and
    // its start and end are what the tiles and rows show (spotVisit, destVisit; see visitLabel).
    const spotDate = new Map<string, string>();
    const destDate = new Map<string, string>();
    const spotVisit = new Map<string, { start: string; end: string }>();
    const destVisit = new Map<string, { start: string; end: string }>();
    const bump = (m: Map<string, string>, vm: Map<string, { start: string; end: string }>, id: string, start?: string, end?: string) => {
      if (!start) return;
      const e = end && end > start ? end : start;
      if (e > (m.get(id) ?? '')) { m.set(id, e); vm.set(id, { start, end: e }); }
    };
    for (const [id, dv] of Object.entries(savedDests)) {
      bump(destDate, destVisit, id, dv.visitDate);
      for (const v of dv.visits ?? []) {
        bump(destDate, destVisit, id, v.startDate, v.endDate);
        for (const sid of v.spotIds ?? []) bump(spotDate, spotVisit, sid, v.startDate, v.endDate);
      }
    }
    for (const [id, sv] of Object.entries(savedSpots)) {
      bump(spotDate, spotVisit, id, sv.visitDate);
      for (const v of sv.visits ?? []) bump(spotDate, spotVisit, id, v.startDate, v.endDate);
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
    return { spotDate, destDate, spotVisit, destVisit, destRating, destSpots };
  }, [savedSpots, savedDests, visitedSpots]);
  const sortBy = <T extends { id: string; name: string }>(list: T[], date: (id: string) => string, rating: (id: string) => number, spots?: (id: string) => number, dests?: (id: string) => number) =>
    [...list].sort((x, y) => {
      if (exploredSort === 'date') { const c = date(y.id).localeCompare(date(x.id)); if (c) return c; }
      else if (exploredSort === 'spots' && spots) { const c = spots(y.id) - spots(x.id); if (c) return c; }
      else if (exploredSort === 'dests' && dests) { const c = dests(y.id) - dests(x.id); if (c) return c; }
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
  const shownDests = useMemo(
    () => exploredDests.filter(d => !destCountry || d.countryCode === destCountry),
    [exploredDests, destCountry]);
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
  // With a country chosen, Spots can narrow further to one of its destinations (or to its standalone spots, SPOT_NO_DEST).
  const [spotDestF, setSpotDestF] = useState<string | null>(null);
  useEffect(() => { setSpotDestF(null); }, [spotCountryF]);
  const spotDests = useMemo(() => {
    if (!spotCountryF) return [];
    const m = new Map<string, { code: string; name: string; count: number }>();
    for (const sp of visitedSpots) {
      if (spotCountryCode(sp) !== spotCountryF) continue;
      const d = spotDestination(sp);
      const id = d?.id ?? SPOT_NO_DEST;
      const r = m.get(id) ?? { code: id, name: d?.name ?? 'Other spots', count: 0 };
      r.count += 1; m.set(id, r);
    }
    return [...m.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  }, [visitedSpots, spotCountryF]);
  const shownSpots = useMemo(() => exploredSpots.filter(sp =>
    (!spotCountryF || spotCountryCode(sp) === spotCountryF) &&
    (!spotDestF || (spotDestination(sp)?.id ?? SPOT_NO_DEST) === spotDestF)),
  [exploredSpots, spotCountryF, spotDestF]);

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
  // Countries Explored, as Destinations and Spots: every visited country with its visited destinations and spots, its most
  // recent visit (the latest of its destinations' and spots'), and the average rating of its rated spots.
  const countryKeys = useMemo(() => {
    const visit = new Map<string, { start: string; end: string }>();
    const later = (code: string | null | undefined, v?: { start: string; end: string }) => {
      if (!code || !v) return;
      const cur = visit.get(code);
      if (!cur || v.end > cur.end) visit.set(code, v);
    };
    for (const d of visitedDests) later(d.countryCode, sortKeys.destVisit.get(d.id));
    const rate = new Map<string, { t: number; n: number }>();
    for (const sp of visitedSpots) {
      const code = spotCountryCode(sp);
      later(code, sortKeys.spotVisit.get(sp.id));
      const r = savedSpots[sp.id]?.rating;
      if (code && r) { const a = rate.get(code) ?? { t: 0, n: 0 }; a.t += r; a.n += 1; rate.set(code, a); }
    }
    const rating = (code: string) => { const a = rate.get(code); return a && a.n ? a.t / a.n : 0; };
    return { visit, rating };
  }, [visitedDests, visitedSpots, sortKeys, savedSpots]);
  const exploredCountries = useMemo(
    () => sortBy(
      stats.visitedCountryCodes.map(code => ({ id: code, name: COUNTRY_NAME.get(code) ?? code })),
      code => countryKeys.visit.get(code)?.end ?? '', countryKeys.rating,
      code => countsByCountry.get(code)?.spots ?? 0, code => countsByCountry.get(code)?.dests ?? 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.visitedCountryCodes, countryKeys, countsByCountry, exploredSort]);
  const modalSpots = useMemo(
    () => visitedSpots.map(sp => ({ spot: sp, country: spotCountry(sp) ?? '', countryCode: spotCountryCode(sp) })),
    [visitedSpots]);

  const visitedCountrySet = visitIndex.visitedCountryCodes;
  const worldDots = useMemo(() => {
    const dot = (id: string, code: string, c: { longitude: number; latitude: number }) => {
      const pt = worldPoint(c.longitude, c.latitude);
      return { id, code, x: pt.x < WORLD_X0 ? pt.x + 360 : pt.x, y: pt.y };
    };
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
    if (!SORT_OPTIONS[mode].includes(exploredSort)) setExploredSort('name');
    Haptics.selectionAsync();
    // The sections below swap with an animation, so the change is seen to follow the selection.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setWorldMode(mode);
  };
  // The world map, inside the Explored card of every level.
  // With a country picked in the Explored dropdown, the map frames that country: the country's box (and the places visited
  // there), padded, kept in the map's own shape and never tighter than about 25 degrees across (so one place is not a pixel of land).
  const pickedCountry = worldMode === 'destinations' ? destCountry : worldMode === 'spots' ? spotCountryF : null;
  const mapView = useMemo(() => {
    const full = { x: WORLD_X0, y: WORLD_Y0, w: 360, h: WORLD_Y1 - WORLD_Y0 };
    const code = pickedCountry;
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
    return { x: cx - w / 2, y: Math.max(0, Math.min(WORLD_VH - h, cy - h / 2)), w, h };
  }, [pickedCountry, worldDots]);
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
    <View pointerEvents="none" style={[styles.mapWrap, { height: Math.round((w * WORLD_VH) / 360) }, w !== WORLD_W && { borderRadius: 12, overflow: 'hidden' }]}>
      <Svg width={w} height={Math.round((w * WORLD_VH) / 360)} viewBox={`${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`}>
        <Rect x={-360} y={WORLD_Y0} width={1080} height={WORLD_Y1 - WORLD_Y0} fill="#EEF2F6" />
        {zoomed ? detailInView.map(({ c, d }) => (
          // Zoomed in: the 1:10m outlines, only those in view, with a border about a point wide however far in it is.
          <Path key={c} d={d} fill="#D9DEE5" stroke="white" strokeWidth={(0.9 * mapView.w) / w} strokeLinejoin="round" />
        )) : (WORLD_COUNTRIES as { c: string; d: string }[]).map(({ c, d }, k) => (
          <Path key={k} d={d}
            fill={worldMode === 'countries' && c === pickedId ? PICK_COLOR : worldMode === 'countries' && visitedCountrySet.has(c) ? '#10B981' : '#D9DEE5'}
            stroke="white" strokeWidth={0.15} />
        ))}
        {!zoomed && (
          <G transform="translate(360 0)">
            {(WORLD_COUNTRIES as { c: string; d: string }[]).filter(e => WRAP_COUNTRIES.has(e.c)).map(({ c, d }, k) => (
              <Path key={k} d={d}
                fill={worldMode === 'countries' && c === pickedId ? PICK_COLOR : worldMode === 'countries' && visitedCountrySet.has(c) ? '#10B981' : '#D9DEE5'}
                stroke="white" strokeWidth={0.15} />
            ))}
          </G>
        )}
        {/* A picked country: a ring pulsing out from its centre once (and a fixed ring round a small one), so it can be found at a glance. */}
        {worldMode === 'countries' && pickedId && (() => {
          const m = COUNTRY_D.has(pickedId) ? countryMark(COUNTRY_D.get(pickedId)!) : null;
          return m && <PickedCountryPing key={pickedId} cx={m.x} cy={m.y} small={m.small} u={mapView.w / w} />;
        })()}
        {/* Destinations: a dot at each one visited. Spots: a small pin (the app's spot pin, its tip on the place), so they
            read differently from destinations, as on the full-screen map. */}
        {/* The picked tile's place is drawn last (on top), in orange and a little larger. */}
        {/* The picked place pops up in front of its neighbours (PickedDot, PickedPin): growing from its usual size to its
            picked size, with a little overshoot, so moving between two places a few pixels apart still reads as a change. */}
        {worldMode === 'destinations' && [...worldDots].sort((x, y) => +(x.id === pickedId) - +(y.id === pickedId)).map(p => (
          p.id === pickedId
            ? <PickedDot key={p.id} cx={p.x} cy={p.y} scale={dotScale} />
            : <Circle key={p.id} cx={p.x} cy={p.y} r={2 * dotScale} fill="#10B981" stroke="white" strokeWidth={0.5 * dotScale} />
        ))}
        {worldMode === 'spots' && [...worldDots].sort((x, y) => +(x.id === pickedId) - +(y.id === pickedId)).map(p => {
          if (p.id === pickedId) return <PickedPin key={p.id} x={p.x} y={p.y} scale={dotScale} />;
          return (
            <G key={p.id} transform={`translate(${p.x} ${p.y}) scale(${dotScale}) translate(${-p.x} ${-p.y})`}>
              <Path d={pinPath(p.x, p.y)} fill="#10B981" stroke="white" strokeWidth={0.3} strokeLinejoin="round" />
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
  const worldMap = worldMapAt(SCREEN_W - 2 * EXPLORED_PAD);
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
      onLayout={e => setPageH(e.nativeEvent.layout.height)}
      onScroll={onPageScroll}
      scrollEventThrottle={16}
      stickyHeaderIndices={[1]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      // Always tall enough to scroll the bar all the way to its pinned point, however little is below it (a country with a
      // couple of tiles): a short page would otherwise clamp the scroll part-way, leaving the header half faded.
      contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 100, minHeight: pageH + 16 + headerH + 16 - COMPACT_H }}
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
      {/* Once pinned, this box shrinks to just the visible bar and a spacer below it holds the rest of its height: the page below
          keeps its place, but the invisible part of the pinned box (which would swallow taps meant for what scrolls under it, such
          as the filter chips) is gone. */}
      <View
        style={[styles.selectorSticky, pinned && selectorH > 0 && { height: COMPACT_H + TABS_H }]}
        pointerEvents="box-none"
        onLayout={e => { if (!pinned) setSelectorH(e.nativeEvent.layout.height); }}
      >
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
      <View style={{ height: pinned && selectorH > 0 ? Math.max(0, selectorH - (COMPACT_H + TABS_H)) : 0 }} pointerEvents="none" />

      {/* ── Countries: Countries Explored, as Destinations and Spots (a photo grid or a ranked list, sortable) ── */}
      {worldMode === 'countries' && (
        <View style={styles.exploredSection}>
          <View style={styles.exploredPad}>
            <View style={styles.mapShadow}>{worldMap}</View>
          </View>
          {exploredCountries.length > 0 && <SortRow sort={exploredSort} onSort={setExploredSort} view={exploredView} onView={setExploredView} options={SORT_OPTIONS.countries} countries={[]} total={exploredCountries.length} country={null} onCountry={() => {}} matches={exploredCountries.length} />}
          {exploredCountries.length === 0 ? (
            <Text style={[styles.topEmpty, styles.exploredPad, { marginTop: 12 }]}>No countries visited yet.</Text>
          ) : exploredView === 'list' ? (
            <RankList sort={exploredSort} pickedId={pickedId} onPick={pickTile} onClearPick={() => setPickedId(null)} rows={exploredCountries.map(c => {
              const n = countsByCountry.get(c.id);
              return {
                // The country's flag beside its name, and its photo in front.
                key: c.id, name: c.name, countryCode: c.id, sub: '',
                dests: n?.dests ?? 0, spots: n?.spots ?? 0, rating: countryKeys.rating(c.id),
                date: visitLabel(countryKeys.visit.get(c.id)), dateKey: countryKeys.visit.get(c.id)?.end ?? '',
                photo: <CountryPhoto code={c.id} name={c.name} />,
              };
            })} />
          ) : (
            /* A photo grid: one tile per country, its name and (by the sort) its count, date or rating over its photo. */
            <PhotoGrid pickedId={pickedId} onPick={pickTile} onClearPick={() => setPickedId(null)} tiles={exploredCountries.map((c, k) => {
              const n = countsByCountry.get(c.id);
              const count = (code: string) => (exploredSort === 'dests' ? countsByCountry.get(code)?.dests : countsByCountry.get(code)?.spots) ?? 0;
              const v = count(c.id);
              // Sorted by a count, the top three ranks (with any) wear a rank badge, every tile that ties for one.
              let rk = k + 1;
              while (rk > 1 && count(exploredCountries[rk - 2].id) === v) rk -= 1;
              const counted = exploredSort === 'dests' ? n?.dests ?? 0 : exploredSort === 'spots' ? n?.spots ?? 0 : 0;
              return {
                key: c.id, name: c.name, countryCode: c.id,
                sub: tileSub(exploredSort, visitLabel(countryKeys.visit.get(c.id)), countryKeys.rating(c.id),
                  exploredSort === 'dests' && counted ? `${counted} destination${counted === 1 ? '' : 's'}`
                  : exploredSort === 'spots' && counted ? `${counted} spot${counted === 1 ? '' : 's'}` : ''),
                rank: (exploredSort === 'dests' || exploredSort === 'spots') && v > 0 && rk <= 3 ? rk : undefined,
                photo: <CountryPhoto code={c.id} name={c.name} />,
              };
            })} />
          )}
        </View>
      )}

      {/* ── Destinations: Destinations Explored, Top Destinations (by visited spots) ── */}
      {worldMode === 'destinations' && (<>
        <View style={styles.exploredSection}>
          <View style={styles.exploredPad}>
            <View style={styles.mapShadow}>{worldMap}</View>
          </View>
          {exploredDests.length > 0 && <SortRow sort={exploredSort} onSort={setExploredSort} view={exploredView} onView={setExploredView} options={SORT_OPTIONS.destinations} countries={destCountries} total={exploredDests.length} country={destCountry} onCountry={setDestCountry} matches={shownDests.length} />}
          {exploredDests.length === 0 ? (
            <Text style={[styles.topEmpty, styles.exploredPad, { marginTop: 12 }]}>No destinations visited yet.</Text>
          ) : (
            <>
            {shownDests.length === 0 && (
              <Text style={[styles.topEmpty, styles.exploredPad]}>
                No destinations match.
              </Text>
            )}
            {exploredView === 'list' ? (
              <RankList sort={exploredSort} pickedId={pickedId} onPick={pickTile} onClearPick={() => setPickedId(null)} rows={shownDests.map(d => {
                const n = spotsByDest.get(d.id) ?? 0;
                return {
                  // The country as its flag beside the name, not its name.
                  key: d.id, name: d.name, countryCode: d.countryCode, sub: '',
                  spots: n, rating: sortKeys.destRating(d.id), date: visitLabel(sortKeys.destVisit.get(d.id)), dateKey: sortKeys.destDate.get(d.id) ?? '',
                  // The destination's own photo in place of its flag: the grid tiles' small photo (same cache key).
                  photo: (
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
            ) : (
            /* A photo grid: one tile per destination, its name and its visited spots over its photo. */
            <PhotoGrid pickedId={pickedId} onPick={pickTile} onClearPick={() => setPickedId(null)} tiles={shownDests.map((d, k) => {
              const n = spotsByDest.get(d.id) ?? 0;
              // Its rank by spots visited, shared with the destinations it ties with (as in the list, see RankList).
              let rk = k + 1;
              while (rk > 1 && (spotsByDest.get(shownDests[rk - 2].id) ?? 0) === n) rk -= 1;
              return {
                key: d.id, name: d.name, countryCode: d.countryCode,
                sub: tileSub(exploredSort, visitLabel(sortKeys.destVisit.get(d.id)), sortKeys.destRating(d.id), exploredSort === 'spots' && n > 0 ? `${n} spot${n === 1 ? '' : 's'}` : ''),
                // Sorted by most spots, the top three ranks (with any spots) wear a rank badge, every tile that ties for one.
                rank: exploredSort === 'spots' && n > 0 && rk <= 3 ? rk : undefined,
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
            )}
            </>
          )}
        </View>
      </>)}

      {/* ── Spots: Spots Explored ── */}
      {worldMode === 'spots' && (
        <View style={styles.exploredSection}>
          <View style={styles.exploredPad}>
            <View style={styles.mapShadow}>{worldMap}</View>
          </View>
          {exploredSpots.length > 0 && <SortRow sort={exploredSort} onSort={setExploredSort} view={exploredView} onView={setExploredView} options={SORT_OPTIONS.spots} countries={spotCountries} total={exploredSpots.length} country={spotCountryF} onCountry={setSpotCountryF} dests={spotDests} dest={spotDestF} onDest={setSpotDestF} matches={shownSpots.length} />}
          {exploredSpots.length === 0 ? (
            <Text style={[styles.topEmpty, styles.exploredPad, { marginTop: 12 }]}>No spots visited yet.</Text>
          ) : (
            <>
            {shownSpots.length === 0 && (
              <Text style={[styles.topEmpty, styles.exploredPad]}>
                No spots match.
              </Text>
            )}
            {exploredView === 'list' ? (
              <RankList sort={exploredSort} pickedId={pickedId} onPick={pickTile} onClearPick={() => setPickedId(null)} rows={shownSpots.map(sp => ({
                // Its photo in front, and under its name the country's flag and its destination.
                key: sp.id, name: sp.name, countryCode: spotCountryCode(sp), flagBelow: true, sub: spotDestination(sp)?.name ?? '',
                rating: savedSpots[sp.id]?.rating ?? 0, date: visitLabel(sortKeys.spotVisit.get(sp.id)), dateKey: sortKeys.spotDate.get(sp.id) ?? '',
                // The grid tiles' small photo (same cache key), or the placeholder for a place with none.
                photo: NO_PHOTO.has(spotPhotoTitle(sp))
                  ? <PhotoPlaceholder icon={sp.icon} category={sp.category} size={30} />
                  : <EntityPhoto
                      cacheKey={`pick_spot_${sp.id}`}
                      cache={thumbCache}
                      load={() => getOrFetchWikiThumbnail(`pick_spot_${sp.id}`, thumbCache, spotPhotoTitle(sp), 300)}
                      subject={photoSubject(spotPhotoTitle(sp))}
                      placeholderColor="#E5E7EB"
                      fallback={<PhotoPlaceholder icon={sp.icon} category={sp.category} size={30} />}
                    />,
              }))} />
            ) : (
            /* The same photo grid for spots: the spot's country under its name. */
            <PhotoGrid pickedId={pickedId} onPick={pickTile} onClearPick={() => setPickedId(null)} tiles={shownSpots.map(sp => ({
              key: sp.id, name: sp.name, countryCode: spotCountryCode(sp),
              sub: tileSub(exploredSort, visitLabel(sortKeys.spotVisit.get(sp.id)), savedSpots[sp.id]?.rating ?? 0, spotCountry(sp) ?? ''),
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
            )}
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
      focusCountry={pickedCountry}
      pickedId={pickedId}
    />
    </View>
  );
}

// A selector item's text, fading between its selected and unselected colours as the pill slides to or from it.
// An Explored list as a grid of rounded photo tiles, three across: the name in white at the bottom left over a dark
// scrim with a short line under it (by the sort, see tileSub), and the country's flag in the top left corner.
const TILE_COLS = 3;
const TILE_GAP = 6;
// A tile's side: the screen width, less the side room and the gaps.
const TILE = Math.floor((SCREEN_W - 2 * EXPLORED_PAD - (TILE_COLS - 1) * TILE_GAP) / TILE_COLS);
// Nine to a page, three rows of three; a page is the screen wide and as tall as its rows.
const PAGE_SIZE = TILE_COLS * 3;
// The page dots' colours: the page in view, and the others.
const PAGE_DOT_ON = '#111827', PAGE_DOT_OFF = '#D1D5DB';
// Room above and below each page for the tiles' shadows (the scroller clips anything outside it).
const SHADOW_ROOM = 6;
const gridHeight = (n: number) => { const rows = Math.max(1, Math.ceil(n / TILE_COLS)); return TILE * rows + TILE_GAP * (rows - 1); };
function PhotoGrid({ tiles, pickedId, onPick, onClearPick }: {
  tiles: { key: string; name: string; countryCode?: string | null; sub: string; photo: React.ReactNode; rank?: number }[];
  pickedId: string | null; onPick: (id: string) => void;
  // A pick only lasts while its tile is on the page showing: this drops it once the page changes (or the list does) and it is gone.
  onClearPick: () => void;
}) {
  // Pages of nine (three by three): swiping snaps to a whole page, like a carousel, with a dot for each page below.
  const pages: typeof tiles[] = [];
  for (let i = 0; i < tiles.length; i += PAGE_SIZE) pages.push(tiles.slice(i, i + PAGE_SIZE));
  // The scroller's offset, live on the UI thread: the dots and the range follow the swipe as it happens (see PageDot and
  // PageRange), not only once it has settled, and without re-rendering the grid.
  const scrollX = useSharedValue(0);
  const onTileScroll = useAnimatedScrollHandler({ onScroll: e => { scrollX.value = e.contentOffset.x; } });
  const ref = useRef<Animated.ScrollView>(null);
  // A new list (another sort, country or search) starts again from its first page.
  const firstKey = tiles[0]?.key;
  useEffect(() => {
    ref.current?.scrollTo({ x: 0, animated: false }); scrollX.value = 0;
    if (pickedId && !pages[0]?.some(t => t.key === pickedId)) onClearPick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, pages.length]);
  return (
    <View>
      <Animated.ScrollView ref={ref} horizontal pagingEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false}
        style={styles.tileScroll} decelerationRate="fast" onScroll={onTileScroll} scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          const pg = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          if (pickedId && !pages[pg]?.some(t => t.key === pickedId)) onClearPick();
        }}>
        {pages.map((pg, i) => (
          <View key={i} style={[styles.tilePage, { height: gridHeight(pg.length) + 2 * SHADOW_ROOM }]}>
            {pg.map(t => (
              <Pressable key={t.key} style={styles.tile} onPress={() => onPick(t.key)}>
                <View style={styles.tileClip}>
                {t.photo}
                {/* The text sits in a footer pinned to the tile's bottom, full width. Its scrim is measured from the footer, so it
                    spans the tile and grows with the text (one line or two) instead of being a fixed band. */}
                <TileFooter name={t.name} sub={t.sub} />
                {/* The country's flag at the top left. */}
                {!!t.countryCode && (
                  <View style={styles.tileFlag} pointerEvents="none">
                    <CircleFlag countryCode={t.countryCode} size={16} ring ringWidth={1.5} style={styles.flagRing} />
                  </View>
                )}
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
      </Animated.ScrollView>
      {tiles.length > 0 && (
        <View style={styles.pageBar}>
          <View style={styles.pageDots}>
            {pages.map((_, i) => <PageDot key={i} index={i} scrollX={scrollX} />)}
          </View>
          <PageRange scrollX={scrollX} total={tiles.length} pageCount={pages.length} pageSize={PAGE_SIZE} />
        </View>
      )}
    </View>
  );
}

// The picked place, popping up in front of its neighbours: it grows from its usual size to its picked size with a little
// overshoot (remounted, by its key, for every pick). A spot's pin grows about its tip, so it stays on its place.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const PICK_POP = { damping: 9, stiffness: 260, mass: 0.6 };
function PickedDot({ cx, cy, scale }: { cx: number; cy: number; scale: number }) {
  const k = useSharedValue(2 * scale);
  useEffect(() => { k.value = withSpring(3.2 * scale, PICK_POP); }, [scale]);
  const props = useAnimatedProps(() => ({ r: k.value }));
  return <AnimatedCircle cx={cx} cy={cy} fill={PICK_COLOR} stroke="white" strokeWidth={0.5 * scale} animatedProps={props} />;
}
// A picked country's mark: one orange ring pulsing out from its centre, over a fixed ring for a small country. Sizes are
// in points on screen (u: map units per point), as the card's map is drawn at more than one width.
const PING_MS = 1600;
function PickedCountryPing({ cx, cy, small, u }: { cx: number; cy: number; small: boolean; u: number }) {
  return (
    <G>
      <PingRing cx={cx} cy={cy} u={u} />
      {small && <Circle cx={cx} cy={cy} r={7 * u} fill="none" stroke="white" strokeWidth={3 * u} />}
      {small && <Circle cx={cx} cy={cy} r={7 * u} fill="none" stroke={PICK_COLOR} strokeWidth={1.6 * u} />}
    </G>
  );
}
function PingRing({ cx, cy, u }: { cx: number; cy: number; u: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: PING_MS, easing: Easing.out(Easing.cubic) }); }, []);
  // Grows from a point at the centre.
  const props = useAnimatedProps(() => ({ r: 22 * t.value * u, strokeOpacity: 0.9 * (1 - t.value) }));
  return <AnimatedCircle cx={cx} cy={cy} fill="none" stroke={PICK_COLOR} strokeWidth={1.6 * u} animatedProps={props} />;
}
function PickedPin({ x, y, scale }: { x: number; y: number; scale: number }) {
  const k = useSharedValue(scale);
  useEffect(() => { k.value = withSpring(scale * PICK_PIN_SCALE, PICK_POP); }, [scale]);
  // pinPath at scale k about the tip, built on the UI thread each frame.
  const pinProps = useAnimatedProps(() => {
    const r = PIN_R * k.value, tx = PIN_TX * k.value, ty = PIN_TY * k.value, cy = y - PIN_TIP * k.value;
    return { d: `M ${x - tx} ${cy + ty} L ${x} ${y} L ${x + tx} ${cy + ty} A ${r} ${r} 0 1 0 ${x - tx} ${cy + ty} Z`, strokeWidth: 0.3 * k.value };
  });
  const headProps = useAnimatedProps(() => ({ cy: y - PIN_TIP * k.value, r: 0.55 * k.value }));
  return (
    <G>
      <AnimatedPath fill={PICK_COLOR} stroke="white" strokeLinejoin="round" animatedProps={pinProps} />
      <AnimatedCircle cx={x} fill="#111111" animatedProps={headProps} />
    </G>
  );
}

// A page dot: dark for the page in view, blending to grey as the swipe moves away from it, in step with the finger.
function PageDot({ index, scrollX }: { index: number; scrollX: SharedValue<number> }) {
  const st = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(scrollX.value / SCREEN_W - index));
    return { backgroundColor: interpolateColor(near, [0, 1], [PAGE_DOT_OFF, PAGE_DOT_ON]) };
  });
  return <Animated.View style={[styles.pageDot, st]} />;
}

// Which tiles the page in view shows, out of all of them: "10–18 of 25" ("1 of 1" for one tile). It switches to the next page's
// range as soon as a swipe passes halfway, rather than once the swipe has settled; only this text re-renders.
function PageRange({ scrollX, total, pageCount, pageSize }: { scrollX: SharedValue<number>; total: number; pageCount: number; pageSize: number }) {
  const [page, setPage] = useState(0);
  useAnimatedReaction(
    () => Math.max(0, Math.min(pageCount - 1, Math.round(scrollX.value / SCREEN_W))),
    (pg, prev) => { if (pg !== prev) runOnJS(setPage)(pg); },
    [pageCount],
  );
  return (
    <Text style={styles.pageRange}>
      {total === 1 ? '1 of 1' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total}`}
    </Text>
  );
}

// A tile's footer: the name and sub line over a dark gradient that fills the footer's own box (full tile width, as tall as the
// text plus room to fade in above it). Each footer's gradient has its own id: with one shared id, the spot grid's tiles
// (mounted after the destination grid's had gone) drew no gradient at all.
// The footer's top padding, which the scrim fades in over, and how dark it is from there down, behind the text.
const SCRIM_FADE = 28;
const SCRIM_UNDER_TEXT = 0.55;
function TileFooter({ name, sub }: { name: string; sub: string }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const scrimId = `tileScrim${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={styles.tileFooter} pointerEvents="none"
      onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {!!box && (
        <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id={scrimId} x1="0" y1="0" x2="0" y2="1">
              {/* It fades in over the footer's top padding only, so every line of the text, the first of three as much as
                  the last, sits on shading at least as dark as SCRIM_UNDER_TEXT. */}
              <Stop offset="0" stopColor="#000" stopOpacity={0} />
              <Stop offset={Math.min(0.5, (SCRIM_FADE * 0.5) / box.h)} stopColor="#000" stopOpacity={0.2} />
              <Stop offset={Math.min(0.7, SCRIM_FADE / box.h)} stopColor="#000" stopOpacity={SCRIM_UNDER_TEXT} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.8} />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={box.w} height={box.h} fill={`url(#${scrimId})`} />
        </Svg>
      )}
      <Text style={styles.tileName} numberOfLines={3}>{name}</Text>
      {!!sub && (
        <View style={styles.tileSubRow}>
          <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
        </View>
      )}
    </View>
  );
}

type ExploredSort = 'name' | 'date' | 'rating' | 'dests' | 'spots';
type ExploredView = 'grid' | 'list';
const SORTS: { key: ExploredSort; label: string }[] = [
  { key: 'name', label: 'A–Z' },
  { key: 'date', label: 'Date Visited' },
  { key: 'rating', label: 'Rating' },
  // Countries only: the most visited destinations first. Countries and destinations: the most visited spots first. The first
  // three tiles wear a rank badge.
  { key: 'dests', label: 'Destinations Visited' },
  { key: 'spots', label: 'Spots Visited' },
];
// The sorts each level offers (a spot has no destinations or spots of its own to count).
const SORT_OPTIONS: Record<WorldMode, ExploredSort[]> = {
  countries: ['name', 'date', 'rating', 'dests', 'spots'],
  destinations: ['name', 'date', 'rating', 'spots'],
  spots: ['name', 'date', 'rating'],
};
// A country's photo: the same image (and cache key) as its country sheet's header, its top destination's photo.
function CountryPhoto({ code, name }: { code: string; name: string }) {
  const top = useMemo(() => DESTINATIONS.filter(d => d.countryCode === code).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))[0], [code]);
  const key = `country_${code}`;
  return (
    <EntityPhoto
      cacheKey={key}
      cache={photoCache}
      load={() => (top ? getOrFetchWikiThumbnail(key, photoCache, top.name, HEADER_PX, name) : getOrFetchWikiThumbnail(key, photoCache, name, HEADER_PX))}
      subject={top ? photoSubject(top.name) : undefined}
      placeholderColor="#E5E7EB"
    />
  );
}
// An Explored list: one row per place, in the sort's order, numbered unless it is A–Z. What a
// row measures follows the sort: spots visited (destinations) or rating, as a bar against the top value and the number; the
// date visited for a chronology; nothing extra for A–Z. Tapping a row picks it, as tapping a tile does. Paged sideways like
// the photo grid, LIST_PAGE_SIZE rows to a page with the same dots and range, so the list never scrolls up and down inside
// the page (which scrolls up and down itself).
const LIST_PAGE_SIZE = 8;
// A grid tile's line under its name, by the sort: the date visited, or the rating, when sorted by it (an em dash for a place
// without one, which sorts last); otherwise its usual line (a destination's spots visited when sorted by them, nothing when
// sorted A–Z; a spot's country).
const tileSub = (sort: ExploredSort, date: string, rating: number, usual: string) =>
  sort === 'date' ? (date || '—')
  : sort === 'rating' ? (rating ? `★ ${rating.toFixed(1).replace(/\.0$/, '')}` : '—')
  : usual;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m ? `${d ? `${d} ` : ''}${MONTHS[m - 1]} ${y}` : '';
};
// A visit's dates, as short as they read: one day ("12 Mar 2025"), or its range with what the two ends share said once
// ("3–9 Mar 2025", "28 Feb – 4 Mar 2025", "30 Dec 2024 – 2 Jan 2025"). '' for no visit.
const visitLabel = (v?: { start: string; end: string }) => {
  if (!v) return '';
  if (v.end === v.start) return shortDate(v.start);
  const [y1, m1, d1] = v.start.split('-').map(Number), [y2, m2] = v.end.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2) return shortDate(v.end);
  if (y1 !== y2) return `${shortDate(v.start)} – ${shortDate(v.end)}`;
  if (m1 !== m2) return `${d1} ${MONTHS[m1 - 1]} – ${shortDate(v.end)}`;
  return `${d1}–${shortDate(v.end)}`;
};
function RankList({ rows, sort, pickedId, onPick, onClearPick }: {
  // `photo`: a small photo shown in place of the country flag (a destination's own photo).
  // `photo`: a small photo leading the row. The country's flag sits beside the name, or beside the line under it (flagBelow).
  // `dateKey`: what the date sort orders by (the most recent visit's last day), so rows that tie on it share a rank.
  rows: { key: string; name: string; countryCode?: string | null; flagBelow?: boolean; sub: string; dests?: number; spots?: number; rating: number; date: string; dateKey: string; photo?: React.ReactNode }[];
  sort: ExploredSort; pickedId: string | null; onPick: (id: string) => void;
  // As in PhotoGrid: a pick lasts only while its row is on the page showing.
  onClearPick: () => void;
}) {
  const counted = sort === 'spots' || sort === 'dests';
  const bar = counted || sort === 'rating';
  const valueOf = (r: typeof rows[number]) => (sort === 'spots' ? r.spots ?? 0 : sort === 'dests' ? r.dests ?? 0 : r.rating);
  const max = sort === 'rating' ? 5 : Math.max(1, ...rows.map(valueOf));
  const pages: typeof rows[] = [];
  for (let i = 0; i < rows.length; i += LIST_PAGE_SIZE) pages.push(rows.slice(i, i + LIST_PAGE_SIZE));
  // Rows that tie on what the sort measures share a rank (1, 2, 2, 4), shown only on the first of them, or again on the
  // first row of a page.
  const tieOf = (r: typeof rows[number]) => (bar ? valueOf(r) : r.dateKey);
  const ranks: number[] = [];
  rows.forEach((r, i) => { ranks.push(i > 0 && tieOf(r) === tieOf(rows[i - 1]) ? ranks[i - 1] : i + 1); });
  const scrollX = useSharedValue(0);
  const onListScroll = useAnimatedScrollHandler({ onScroll: e => { scrollX.value = e.contentOffset.x; } });
  const ref = useRef<Animated.ScrollView>(null);
  // A new list (another sort, country or search) starts again from its first page.
  const firstKey = rows[0]?.key;
  useEffect(() => {
    ref.current?.scrollTo({ x: 0, animated: false }); scrollX.value = 0;
    if (pickedId && !pages[0]?.some(r => r.key === pickedId)) onClearPick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, pages.length, sort]);
  return (
    <View>
      <Animated.ScrollView ref={ref} horizontal pagingEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false}
        style={styles.tileScroll} decelerationRate="fast" onScroll={onListScroll} scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          const pg = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          if (pickedId && !pages[pg]?.some(r => r.key === pickedId)) onClearPick();
        }}>
        {pages.map((pg, p) => (
          <View key={p} style={styles.rankPage}>
            {pg.map((r, j) => {
              const v = valueOf(r), k = p * LIST_PAGE_SIZE + j, rank = ranks[k];
              const showRank = j === 0 || rank !== ranks[k - 1];
              // Sorted by spots visited, the top three ranks (with any spots) get the grid's gold, silver and bronze on their
              // rank number, as a badge.
              const medal = counted && v > 0 && rank <= 3 ? RANK_COLORS[rank - 1] : undefined;
              return (
                <Pressable key={r.key} style={[styles.rankRow, pickedId === r.key && styles.rankRowOn]} onPress={() => onPick(r.key)}>
                  {sort !== 'name' && (!showRank ? <View style={styles.rankNumSlot} />
                    : medal
                    ? <View style={styles.rankNumSlot}><View style={[styles.rankBadge, styles.rankBadgeList, { backgroundColor: medal }]}><Text style={styles.rankTxt}>{rank}</Text></View></View>
                    : <Text style={styles.rankNum}>{rank}</Text>)}
                  {!!r.photo && <View style={styles.rankThumb}>{r.photo}</View>}
                  <View style={bar ? styles.rankNameCol : styles.rankNameFlex}>
                    {/* The country's flag on the left of the name, or (flagBelow) of the line under it. */}
                    <View style={styles.rankNameRow}>
                      {!!r.countryCode && !r.flagBelow && <CircleFlag countryCode={r.countryCode} size={14} ring ringWidth={1.5} style={styles.flagRing} />}
                      <Text style={styles.rankName} numberOfLines={1}>{r.name}</Text>
                    </View>
                    {(!!r.sub || (!!r.flagBelow && !!r.countryCode)) && (
                      <View style={styles.rankSubRow}>
                        {!!r.flagBelow && !!r.countryCode && <CircleFlag countryCode={r.countryCode} size={13} ring ringWidth={1.5} style={styles.flagRing} />}
                        {!!r.sub && <Text style={styles.rankSub} numberOfLines={1}>{r.sub}</Text>}
                      </View>
                    )}
                  </View>
                  {bar && (
                    <View style={styles.countryBarTrack}>
                      <View style={[styles.countryBarFill, { width: `${(v / max) * 100}%` }]} />
                    </View>
                  )}
                  {bar && <Text style={styles.countryCount}>{v ? (sort === 'rating' ? v.toFixed(1).replace(/\.0$/, '') : v) : '–'}</Text>}
                  {sort === 'date' && <Text style={styles.rankDate}>{r.date || '–'}</Text>}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.ScrollView>
      {rows.length > 0 && (
        <View style={styles.pageBar}>
          <View style={styles.pageDots}>
            {pages.map((_, i) => <PageDot key={i} index={i} scrollX={scrollX} />)}
          </View>
          <PageRange scrollX={scrollX} total={rows.length} pageCount={pages.length} pageSize={LIST_PAGE_SIZE} />
        </View>
      )}
    </View>
  );
}

// The Explored grid / list switch: a segmented control (a grey track, the chosen side on a raised white pill),
// with an icon on each side. The pill slides across when the choice changes.
const VIEW_SEG_W = 34;
function ViewToggle({ view, onView }: { view: ExploredView; onView: (v: ExploredView) => void }) {
  const idx = useSharedValue(view === 'grid' ? 0 : 1);
  useEffect(() => { idx.value = withTiming(view === 'grid' ? 0 : 1, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [view]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: idx.value * VIEW_SEG_W }] }));
  return (
    <View style={styles.viewToggle}>
      <Animated.View pointerEvents="none" style={[styles.viewTogglePill, pillStyle]} />
      {(['grid', 'list'] as const).map(v => {
        const on = view === v, Icon = v === 'grid' ? LayoutGrid : ListIcon;
        return (
          <Pressable key={v} hitSlop={4} style={styles.viewToggleBtn} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={v === 'grid' ? 'Grid view' : 'List view'}
            onPress={() => { if (!on) { Haptics.selectionAsync(); onView(v); } }}>
            <Icon size={15} color={on ? '#111827' : '#9CA3AF'} strokeWidth={2.5} />
          </Pressable>
        );
      })}
    </View>
  );
}

// The sort choice above an Explored grid: small segmented pills, the chosen one dark.
type SortCountry = { code: string; name: string; count: number };
// The row above the Explored map: two dropdown chips side by side, the country filter ("All countries" or the chosen one, with
// its flag) and the sort order. Each opens a small menu under its chip.
function SortRow({ sort, onSort, view, onView, options, countries, total, country, onCountry, dests, dest, onDest, matches }: {
  sort: ExploredSort; onSort: (s: ExploredSort) => void; options: ExploredSort[];
  view: ExploredView; onView: (v: ExploredView) => void;
  countries: SortCountry[]; total: number; country: string | null; onCountry: (code: string | null) => void;
  // Spots only, once a country is chosen: that country's destinations (code = destination id) to narrow to.
  dests?: SortCountry[]; dest?: string | null; onDest?: (id: string | null) => void;
  // How many places the filters leave, shown on the country chip.
  matches: number;
}) {
  const countryRef = useRef<View>(null);
  const sortRef = useRef<View>(null);
  const destRef = useRef<View>(null);
  type MenuKind = 'country' | 'sort' | 'dest';
  const [menu, setMenu] = useState<{ kind: MenuKind; x: number; y: number } | null>(null);
  const openMenu = (kind: MenuKind) => {
    Haptics.selectionAsync();
    ({ country: countryRef, sort: sortRef, dest: destRef })[kind].current?.measureInWindow((x, y, _w, h) => setMenu({ kind, x, y: y + h + 6 }));
  };
  const chosen = countries.find(c => c.code === country);
  const showDest = !!country && !!dests && dests.length > 1;
  const chosenDest = dests?.find(d => d.code === dest);
  const sorts = SORTS.filter(o => options.includes(o.key));
  const menuW = menu?.kind === 'sort' ? 180 : 240;
  return (
    <>
      <View style={styles.sortRow}>
        {countries.length > 1 && (
          <Pressable ref={countryRef} collapsable={false} hitSlop={6} style={[styles.countryDrop, !!chosen && styles.countryDropOn]} onPress={() => openMenu('country')}>
            {!!chosen && <CircleFlag countryCode={chosen.code} size={12} />}
            <Text style={[styles.countryDropTxt, !!chosen && styles.filterTxtOn]} numberOfLines={1}>{chosen ? chosen.name : 'All countries'}</Text>
            <Text style={[styles.dropCount, !!chosen && styles.filterTxtOn]}>{matches}</Text>
            <ChevronDown size={13} color={chosen ? '#047857' : '#6B7280'} strokeWidth={2.4} />
          </Pressable>
        )}
        {showDest && (
          <Pressable ref={destRef} collapsable={false} hitSlop={6} style={[styles.countryDrop, !!chosenDest && styles.countryDropOn]} onPress={() => openMenu('dest')}>
            <Text style={[styles.countryDropTxt, !!chosenDest && styles.filterTxtOn]} numberOfLines={1}>{chosenDest ? chosenDest.name : 'All destinations'}</Text>
            <ChevronDown size={13} color={chosenDest ? '#047857' : '#6B7280'} strokeWidth={2.4} />
          </Pressable>
        )}
        <Pressable ref={sortRef} collapsable={false} hitSlop={6} style={styles.countryDrop} onPress={() => openMenu('sort')}>
          <Text style={styles.sortLabel}>Sort</Text>
          <Text style={styles.countryDropTxt} numberOfLines={1}>{(sorts.find(o => o.key === sort) ?? sorts[0]).label}</Text>
          <ChevronDown size={13} color="#6B7280" strokeWidth={2.4} />
        </Pressable>
        {/* Grid or list, at the end of the row. */}
        <ViewToggle view={view} onView={onView} />
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
                : menu.kind === 'dest'
                ? [{ code: null as string | null, name: 'All destinations', count: dests!.reduce((n, d) => n + d.count, 0) }, ...dests!].map(d => {
                    const on = (dest ?? null) === d.code;
                    return (
                      <Pressable key={d.code ?? 'all'} style={styles.dropRow} onPress={() => { Haptics.selectionAsync(); onDest?.(d.code); setMenu(null); }}>
                        <Text style={[styles.dropName, on && styles.dropNameOn]} numberOfLines={1}>{d.name}</Text>
                        <Text style={styles.dropCount}>{d.count}</Text>
                        <View style={styles.dropCheck}>{on && <Check size={14} color="#047857" strokeWidth={3} />}</View>
                      </Pressable>
                    );
                  })
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
  // The map inside an Explored card: full width of the card, rounded, with room around it.
  // The Explored sections have no card: the map, pills and photo grid run the full screen width.
  exploredSection: { marginBottom: 12 },
  exploredPad: { paddingHorizontal: EXPLORED_PAD },
  statItem:    { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12 },
  statValue:   { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel:   { fontSize: 10, color: '#6B7280', marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: '#E5E7EB' },

  // Generic card
  card: {
    backgroundColor: 'white', borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: '#F3F4F6',
  },
  titleWithCount: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },

  // My World
  mapWrap:       { height: WORLD_H, backgroundColor: '#EEF2F6' },
  // A quiet hint that the map opens: a translucent white pill with grey text, not a dark badge.
  // The Explored map's shadow, on a shell around it (the map itself clips its corners, which would clip a shadow too).
  mapShadow: { borderRadius: 12, backgroundColor: '#EEF2F6',
               shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  // The Explored map's outline, drawn over its edge so the map keeps its size.
  mapBorder:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1' },
  mapHint:       { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  mapHintTxt:    { fontSize: 11, fontWeight: '500', color: '#6B7280' },
  topEmpty:      { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  topBy:         { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  // Destinations Explored's search box.
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
  // Between the map and the grid or list below it.
  sortRow:   { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: EXPLORED_PAD, marginTop: 12, marginBottom: 2 },
  sortLabel: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  sortPill:  { paddingVertical: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  sortPillOn: { borderBottomColor: '#111827' },
  countryDrop: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                 borderWidth: 1, borderColor: '#E5E7EB', maxWidth: 170 },
  countryDropOn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  // The grid / list toggle at the end of the sort row (ViewToggle): a grey track, two fixed-width sides and a white
  // pill that slides under the chosen one.
  viewToggle:     { marginLeft: 'auto', flexDirection: 'row', padding: 2, backgroundColor: '#F3F4F6', borderRadius: 9 },
  viewTogglePill: { position: 'absolute', top: 2, bottom: 2, left: 2, width: VIEW_SEG_W, borderRadius: 7, backgroundColor: 'white',
                    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  viewToggleBtn:  { width: VIEW_SEG_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  // The Explored list (RankList): rows with a sub line, a page of them the screen wide.
  rankPage:    { width: SCREEN_W, paddingHorizontal: EXPLORED_PAD + 4, paddingTop: 2 },
  rankRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 10 },
  rankRowOn:   { backgroundColor: '#FFF7ED' },
  rankNum:     { width: 18, fontSize: 13, fontWeight: '700', color: '#9CA3AF', textAlign: 'right' },
  // A medal rank in the list: the grid's rank badge, in the number's slot (right-aligned like the numbers).
  rankNumSlot:   { width: 18, alignItems: 'flex-end' },
  rankBadgeList: { position: 'relative', top: 0, right: 0, width: 18, height: 18, borderRadius: 9 },
  rankThumb:   { width: 30, height: 30, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  rankNameCol: { width: 120 },
  // The name takes what is left of the row and is cut short with "…"; the date beside it never shrinks.
  rankNameFlex: { flex: 1, minWidth: 0 },
  rankName:    { flexShrink: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  rankNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rankSubRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rankSub:     { flexShrink: 1, fontSize: 11, color: '#9CA3AF' },
  rankDate:    { marginLeft: 'auto', flexShrink: 0, fontSize: 12, fontWeight: '600', color: '#6B7280' },
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
  // The page dots and the range at the bottom right of the carousel (shown for any number of tiles, even one page).
  pageBar:  { marginTop: 4, height: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingHorizontal: EXPLORED_PAD + 2 },
  pageDots: { flexDirection: 'row', gap: 5 },
  pageRange: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PAGE_DOT_OFF },
  // A tile is a shadow-casting shell around a clipped inner box (a view that clips cannot also cast a shadow).
  tile:     { width: TILE, height: TILE, borderRadius: 10, backgroundColor: '#E5E7EB',
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tileClip: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  // A picked tile: an orange ring inside its edge (the tile clips, so the ring is a child).
  rankBadge: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'white' },
  rankTxt:   { fontSize: 11, fontWeight: '800', color: 'white' },
  tileRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, borderWidth: 3, borderColor: PICK_COLOR },
  tileFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: SCRIM_FADE, paddingHorizontal: 8, paddingBottom: 8 },
  tileName: { fontSize: 13, fontWeight: '700', color: 'white', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  // A tile's flag, in its top left corner (the rank badge takes the top right).
  tileFlag:   { position: 'absolute', top: 6, left: 6 },
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

  // The Explored list's bars
  countryBarTrack: { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  countryBarFill:  { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },
  countryCount:    { fontSize: 14, fontWeight: '700', color: '#111827', width: 30, textAlign: 'right' },

  // Every flag here in the map's frame: a thin white ring with a soft shadow (the country pills and breadcrumb flags).
  flagRing:  { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
});
