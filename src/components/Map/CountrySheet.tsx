import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image,
  Animated, PanResponder, Dimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Heart } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useStore } from '../../store';
import { CONTINENT_COLORS, CATEGORY_ICONS } from '../../types';
import type { Destination, CountryCluster } from '../../types';
import { DESTINATIONS } from '../../data/destinations';
import { flag } from '../../utils/stats';
import { photoCache } from '../../utils/photoCache';

interface Props {
  cluster: CountryCluster;
  onClose: () => void;
  onSelectDestination: (dest: Destination) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const { height: H } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;
const COMPACT_H   = 164;
const COLLAPSED_Y = Math.max(0, H - (Platform.OS === 'ios' ? 88 : 64) - COMPACT_H);
const HEADER_H    = 200;

// ── Destination row ────────────────────────────────────────────────────────────
function DestRow({
  dest, isVisited, isWishlist, onPress,
}: {
  dest: Destination;
  isVisited: boolean;
  isWishlist: boolean;
  onPress: () => void;
}) {
  const color = CONTINENT_COLORS[dest.continent];
  const [photoUrl, setPhotoUrl] = useState<string | null>(photoCache.get(dest.id) ?? null);

  useEffect(() => {
    if (photoCache.has(dest.id)) { setPhotoUrl(photoCache.get(dest.id)!); return; }
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(dest.name)}`)
      .then(r => r.json())
      .then(d => {
        const url = d?.originalimage?.source ?? d?.thumbnail?.source ?? null;
        if (url) { photoCache.set(dest.id, url); setPhotoUrl(url); }
      })
      .catch(() => {});
  }, [dest.id]);

  return (
    <Pressable style={st.destRow} onPress={onPress}>
      <View style={[st.destThumb, { backgroundColor: color + '22' }]}>
        {photoUrl
          ? <Image source={{ uri: photoUrl }} style={st.destThumbImg} resizeMode="cover" />
          : <Text style={st.destThumbIcon}>{dest.icon ?? CATEGORY_ICONS[dest.category]}</Text>
        }
      </View>
      <View style={st.destInfo}>
        <Text style={st.destName} numberOfLines={1}>{dest.name}</Text>
        <Text style={st.destMeta} numberOfLines={1}>
          {CATEGORY_ICONS[dest.category]}{'  '}{dest.category}
        </Text>
      </View>
      {isVisited && (
        <View style={st.destBadgeVisited}>
          <Check size={10} color="white" strokeWidth={2.5} />
          <Text style={st.destBadgeTxt}>Visited</Text>
        </View>
      )}
      {!isVisited && isWishlist && (
        <View style={st.destBadgeWishlist}>
          <Heart size={10} color="white" strokeWidth={2.5} fill="white" />
          <Text style={st.destBadgeTxt}>Wishlist</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CountrySheet({ cluster, onClose, onSelectDestination, onExpand, onCollapse }: Props) {
  const insets            = useSafeAreaInsets();
  const savedDestinations = useStore(s => s.savedDestinations);

  const dests = useMemo(
    () => DESTINATIONS.filter(d => d.country === cluster.country)
                      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    [cluster.country],
  );

  const continent   = dests[0]?.continent ?? 'Europe';
  const accentColor = CONTINENT_COLORS[continent];

  const visitedCount  = dests.filter(d => savedDestinations[d.id]?.type === 'visited').length;
  const wishlistCount = dests.filter(d =>
    savedDestinations[d.id]?.isWishlisted || savedDestinations[d.id]?.type === 'wishlist'
  ).length;
  const isAnyVisited   = visitedCount > 0;
  const isAnyWishlist  = wishlistCount > 0;

  // ── Sheet animation ──────────────────────────────────────────────────────────
  const snapStateRef = useRef<'collapsed' | 'full'>('collapsed');
  const slideAnim    = useRef(new Animated.Value(CLOSE_POS)).current;
  const lastPos      = useRef(COLLAPSED_Y);
  const scrollRef    = useRef<ScrollView>(null);
  const scrollY      = useRef(0);

  const collapsedYRef   = useRef(COLLAPSED_Y);
  const collapsedYAnimV = useRef(new Animated.Value(COLLAPSED_Y)).current;

  const compactRaw = useMemo(() => Animated.subtract(slideAnim, collapsedYAnimV), []);
  const compactTranslateY = useMemo(() => compactRaw.interpolate({
    inputRange: [-H, 0], outputRange: [-H, 0], extrapolate: 'clamp',
  }), []);

  const backdropOpacity = useMemo(() => slideAnim.interpolate({
    inputRange: [FULL_POS, COLLAPSED_Y],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  }), []);

  // Bookmark tabs + country btn above compact card
  const bookmarkTop   = useMemo(() => Animated.subtract(slideAnim, 24), []);

  // Slide in on mount
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(slideAnim, {
      toValue: collapsedYRef.current, useNativeDriver: false, damping: 28, stiffness: 260,
    }).start();
  }, []);

  // Reset when country changes
  useEffect(() => {
    snapStateRef.current = 'collapsed';
    slideAnim.stopAnimation();
    slideAnim.setValue(CLOSE_POS);
    lastPos.current = collapsedYRef.current;
    Animated.spring(slideAnim, {
      toValue: collapsedYRef.current, useNativeDriver: false, damping: 28, stiffness: 260,
    }).start();
  }, [cluster.country]);

  // Country photo from Wikipedia
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    photoCache.get(`country_${cluster.countryCode}`) ?? null,
  );
  useEffect(() => {
    const cacheKey = `country_${cluster.countryCode}`;
    if (photoCache.has(cacheKey)) {
      setPhotoUrl(photoCache.get(cacheKey)!);
      return;
    }
    setPhotoUrl(null);
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cluster.country)}`)
      .then(r => r.json())
      .then(d => {
        const url = d?.originalimage?.source ?? d?.thumbnail?.source ?? null;
        if (url) { photoCache.set(cacheKey, url); setPhotoUrl(url); }
      })
      .catch(() => {});
  }, [cluster.countryCode, cluster.country]);

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
        if (snapStateRef.current === 'collapsed') return true;
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

  return (
    <View style={st.backdrop} pointerEvents="box-none">
      {/* Dark overlay */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropOpacity }]}
      />
      {/* Tap to collapse */}
      <Animated.View
        pointerEvents={snapStateRef.current === 'full' ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToCollapsedRef.current()} />
      </Animated.View>

      <Animated.View {...panResponder.panHandlers} style={[st.sheet, { top: slideAnim }]}>
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>

          {/* ── FULL CONTENT ─────────────────────────────────────────────── */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            bounces={false}
            showsVerticalScrollIndicator={false}
            onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
          >
            {/* ── HEADER ───────────────────────────────────────────────── */}
            <View style={[st.header, { backgroundColor: accentColor, paddingTop: insets.top + 16 }]}>
              {/* Country photo background */}
              {photoUrl && (
                <Image
                  source={{ uri: photoUrl }}
                  style={StyleSheet.absoluteFill as any}
                  resizeMode="cover"
                />
              )}
              {/* Dark scrim for text legibility */}
              <View style={[StyleSheet.absoluteFill as any, {
                backgroundColor: photoUrl ? 'rgba(0,0,0,0.45)' : `${accentColor}CC`,
              }]} />
              <Pressable style={[st.closeBtn, { top: insets.top + 12 }]} onPress={() => dismissSheetRef.current()} hitSlop={12}>
                <X size={16} color="rgba(255,255,255,0.92)" />
              </Pressable>
              <Text style={st.headerFlag}>{flag(cluster.countryCode)}</Text>
              <Text style={st.headerName}>{cluster.country}</Text>
              <Text style={st.headerContinent}>{continent}</Text>
              <View style={st.headerStats}>
                <View style={st.headerStat}>
                  <Text style={st.headerStatNum}>{dests.length}</Text>
                  <Text style={st.headerStatLbl}>destination{dests.length !== 1 ? 's' : ''}</Text>
                </View>
                {visitedCount > 0 && (
                  <View style={st.headerStat}>
                    <Text style={st.headerStatNum}>{visitedCount}</Text>
                    <Text style={st.headerStatLbl}>visited</Text>
                  </View>
                )}
                {wishlistCount > 0 && (
                  <View style={st.headerStat}>
                    <Text style={st.headerStatNum}>{wishlistCount}</Text>
                    <Text style={st.headerStatLbl}>wishlisted</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── DESTINATION LIST ─────────────────────────────────────── */}
            <View style={st.listSection}>
              <Text style={st.listTitle}>Destinations</Text>
              {dests.map((dest, i) => {
                const saved      = savedDestinations[dest.id];
                const isVisited  = saved?.type === 'visited';
                const isWishlist = !!(saved?.isWishlisted || saved?.type === 'wishlist');
                return (
                  <React.Fragment key={dest.id}>
                    {i > 0 && <View style={st.divider} />}
                    <DestRow
                      dest={dest}
                      isVisited={isVisited}
                      isWishlist={isWishlist}
                      onPress={() => onSelectDestination(dest)}
                    />
                  </React.Fragment>
                );
              })}
            </View>
          </ScrollView>

          {/* ── COMPACT CARD (slides off as sheet opens) ─────────────── */}
          <Animated.View
            style={[
              st.compactCard,
              isAnyVisited && st.compactCardVisited,
              !isAnyVisited && isAnyWishlist && st.compactCardWishlist,
              { transform: [{ translateY: compactTranslateY }] },
            ]}
            onLayout={e => {
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
            <View pointerEvents="none" style={st.pillRow}>
              <View style={st.pill} />
            </View>
            <Pressable style={st.compactRow} onPress={() => snapToFullRef.current()}>
              <View style={[st.compactThumb, { backgroundColor: accentColor + '22' }]}>
                {photoUrl
                  ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                  : <Text style={st.compactFlag}>{flag(cluster.countryCode)}</Text>
                }
              </View>
              <View style={st.compactInfo}>
                <Text style={st.compactName} numberOfLines={1}>{cluster.country}</Text>
                <Text style={st.compactMeta}>
                  {dests.length} destination{dests.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={[st.openBtn, isAnyVisited && st.openBtnVisited]}>
                <Text style={st.openBtnTxt}>Open</Text>
              </View>
            </Pressable>
          </Animated.View>

        </View>
      </Animated.View>

      {/* Bookmark tabs — synced with compact card position */}
      {(isAnyVisited || isAnyWishlist) && (
        <Animated.View
          pointerEvents="none"
          style={[st.bookmarkTabsRow, { top: bookmarkTop }]}
        >
          {isAnyVisited && (
            <View style={[st.bookmarkTab, st.bookmarkTabVisited]}>
              <Text style={st.bookmarkTabTxt}>✓ Visited</Text>
            </View>
          )}
          {isAnyWishlist && (
            <View style={[st.bookmarkTab, st.bookmarkTabWishlist]}>
              <Text style={st.bookmarkTabTxt}>♡ Wishlist</Text>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 200, elevation: 200 },

  sheet: {
    position: 'absolute', left: 0, right: 0, height: H,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F9FAFB',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
    minHeight: HEADER_H,
  },
  closeBtn: {
    position: 'absolute', right: 16,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerFlag:      { fontSize: 52, marginBottom: 10, marginTop: 8 },
  headerName:      { fontSize: 28, fontWeight: '800', color: 'white', textAlign: 'center', marginBottom: 4 },
  headerContinent: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.78)', marginBottom: 16 },
  headerStats:     { flexDirection: 'row', gap: 24 },
  headerStat:      { alignItems: 'center' },
  headerStatNum:   { fontSize: 20, fontWeight: '800', color: 'white' },
  headerStatLbl:   { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  // ── Destination list ────────────────────────────────────────────────────────
  listSection: { backgroundColor: 'white', marginTop: -20, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  listTitle:   { fontSize: 13, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5,
                 paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  divider:     { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F1F3', marginLeft: 78 },

  destRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  destThumb:    { width: 50, height: 50, borderRadius: 12, overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  destThumbImg: { width: '100%', height: '100%' },
  destThumbIcon:{ fontSize: 22 },
  destInfo:     { flex: 1 },
  destName:     { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 3 },
  destMeta:     { fontSize: 12, color: '#9CA3AF' },
  destBadgeVisited:  { flexDirection: 'row', alignItems: 'center', gap: 4,
                       backgroundColor: '#059669', borderRadius: 10,
                       paddingHorizontal: 8, paddingVertical: 4 },
  destBadgeWishlist: { flexDirection: 'row', alignItems: 'center', gap: 4,
                       backgroundColor: '#DB2777', borderRadius: 10,
                       paddingHorizontal: 8, paddingVertical: 4 },
  destBadgeTxt: { fontSize: 10, fontWeight: '700', color: 'white' },

  // ── Compact card ────────────────────────────────────────────────────────────
  compactCard: {
    position: 'absolute', left: 0, right: 0, top: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10, shadowRadius: 16, elevation: 12,
  },
  compactCardVisited:  {},
  compactCardWishlist: {},

  pillRow: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  pill:    { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },

  compactRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingTop: 28, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F1F3',
  },
  compactThumb: {
    width: 66, height: 66, borderRadius: 14,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  compactFlag: { fontSize: 30 },
  compactInfo: { flex: 1, paddingHorizontal: 12, paddingTop: 2 },
  compactName: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 2 },
  compactMeta: { fontSize: 12, color: '#6B7280' },

  openBtn: {
    backgroundColor: '#111827', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9,
    flexShrink: 0, marginTop: 2, alignSelf: 'flex-start',
  },
  openBtnVisited: { backgroundColor: '#059669' },
  openBtnTxt: { fontSize: 13, fontWeight: '700', color: 'white' },

  // ── Bookmark tabs ────────────────────────────────────────────────────────────
  bookmarkTabsRow: { position: 'absolute', top: 0, left: 28, flexDirection: 'row', gap: 6, zIndex: 201 },
  bookmarkTab:     { paddingHorizontal: 11, paddingTop: 5, paddingBottom: 5,
                     borderTopLeftRadius: 9, borderTopRightRadius: 9 },
  bookmarkTabVisited:  { backgroundColor: '#059669' },
  bookmarkTabWishlist: { backgroundColor: '#DB2777' },
  bookmarkTabTxt: { fontSize: 11, fontWeight: '700', color: 'white' },
});
