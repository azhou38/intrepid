import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, PanResponder, Image, Dimensions,
} from 'react-native';
import { Check, Heart } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CONTINENT_COLORS } from '../../types';
import type { Destination, SavedDestination } from '../../types';
import { SPOTS } from '../../data/spots';
import { photoCache, fetchWikiThumbnail } from '../../utils/photoCache';
import CircleFlag from '../CircleFlag';

interface Props {
  destination: Destination;
  savedEntry?: SavedDestination;
  visible: boolean;
  onOpen: (dragOffset?: number) => void;
}

const { height: SCREEN_H } = Dimensions.get('window');
const CARD_MAX_H           = Math.round(SCREEN_H / 4);
const CARD_TRANSLATE_HIDDEN = CARD_MAX_H + 40;

const MO_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseMonthYear(s: string): string | null {
  if (!s) return null;
  const p = s.split('-');
  if (p.length < 2) return null;
  const mi = parseInt(p[1], 10) - 1;
  if (mi < 0 || mi > 11) return null;
  return `${MO_SHORT[mi]} ${p[0]}`;
}


export default function DestinationContextCard({ destination, savedEntry, visible, onOpen }: Props) {
  const spots      = SPOTS.filter(s => s.destinationId === destination.id);
  const isVisited  = savedEntry?.type === 'visited';
  const isWishlist = !!(savedEntry?.isWishlisted || savedEntry?.type === 'wishlist');
  const color      = CONTINENT_COLORS[destination.continent];

  // User visit stats
  const visits          = savedEntry?.visits ?? [];
  const visitCount      = visits.length > 0 ? visits.length : (savedEntry?.visitDate ? 1 : 0);
  const lastVisitStr    = visits[0]?.startDate ?? savedEntry?.visitDate ?? null;
  const lastVisitFmt    = lastVisitStr ? parseMonthYear(lastVisitStr) : null;
  // Photo
  const [photoUrl, setPhotoUrl] = useState<string | null>(photoCache.get(destination.id) ?? null);
  useEffect(() => {
    if (photoCache.has(destination.id)) {
      setPhotoUrl(photoCache.get(destination.id)!);
      return;
    }
    fetchWikiThumbnail(destination.name, 900).then(url => {
      if (url) { photoCache.set(destination.id, url); setPhotoUrl(url); }
    });
  }, [destination.id]);

  // ── Visibility animation ──────────────────────────────────────────────────
  const slideAnim = useRef(new Animated.Value(CARD_TRANSLATE_HIDDEN)).current;

  useEffect(() => {
    slideAnim.stopAnimation();
    slideAnim.setValue(CARD_TRANSLATE_HIDDEN);
  }, [destination.id]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, damping: 26, stiffness: 300, useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: CARD_TRANSLATE_HIDDEN, duration: 240, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // ── Drag-to-open gesture ──────────────────────────────────────────────────
  const dragY       = useRef(new Animated.Value(0)).current;
  const hapticFired = useRef(false);
  const onOpenRef   = useRef(onOpen);
  onOpenRef.current = onOpen;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder:        (_, { dy, dx }) => dy < -8 && Math.abs(dy) > Math.abs(dx) * 1.2,
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) => dy < -8 && Math.abs(dy) > Math.abs(dx) * 1.2,
      onPanResponderGrant: () => { hapticFired.current = false; },
      onPanResponderMove:  (_, { dy }) => {
        if (dy < -10 && !hapticFired.current) {
          hapticFired.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        dragY.setValue(Math.min(0, dy));
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy < -28 || vy < -0.3) {
          onOpenRef.current(Math.abs(dy));
        } else {
          Animated.spring(dragY, {
            toValue: 0, damping: 22, stiffness: 300, useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Bookmark tabs positioned above the card's top edge
  const bookmarkTop = Animated.add(slideAnim, dragY);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        transform: [{ translateY: bookmarkTop }],
      }}
    >
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          st.sheet,
          isVisited && st.sheetVisited,
        ]}
      >
      {/* Handle */}
      <View style={[st.handleArea, isVisited && st.handleAreaVisited]}>
        <View style={[st.handle, isVisited && st.handleVisited]} />
      </View>

      <Pressable style={st.row} onPress={() => onOpen()}>

        {/* Photo thumbnail */}
        <View style={[st.thumb, { backgroundColor: color + '22' }]}>
          {photoUrl
            ? <Image source={{ uri: photoUrl }} style={st.thumbImg} resizeMode="cover" />
            : <Text style={st.thumbIcon}>{destination.icon ?? '📍'}</Text>}
        </View>

        {/* ── UNVISITED info ─────────────────────────────────────────────── */}
        {!isVisited && (
          <View style={st.info}>
            <View style={st.nameRow}>
              <Text style={st.name} numberOfLines={1}>{destination.name}</Text>
            </View>
            <View style={st.metaRow}>
              <CircleFlag countryCode={destination.countryCode} size={13} />
              <Text style={st.meta} numberOfLines={1}>
                {destination.country} · {destination.continent}
              </Text>
            </View>
            {spots.length > 0 && (
              <Text style={st.sep}>{spots.length} spots</Text>
            )}
          </View>
        )}

        {/* ── VISITED info ───────────────────────────────────────────────── */}
        {isVisited && (
          <View style={st.info}>
            <View style={st.nameRow}>
              <Text style={st.name} numberOfLines={1}>{destination.name}</Text>
            </View>
            <View style={st.metaRow}>
              <CircleFlag countryCode={destination.countryCode} size={13} />
              <Text style={st.meta} numberOfLines={1}>
                {destination.country} · {destination.continent}
              </Text>
            </View>
            {spots.length > 0 && (
              <Text style={st.sep}>{spots.length} spots visited</Text>
            )}
          </View>
        )}

        {/* Open button */}
        <View style={[st.openBtn, isVisited && st.openBtnVisited]}>
          <Text style={st.openBtnTxt}>Open</Text>
        </View>

      </Pressable>
      </Animated.View>

      {/* Bookmark tabs — synced with card position */}
      {(isVisited || isWishlist) && (
        <View
          pointerEvents="none"
          style={[st.bookmarkTabsRow, { top: -22 }]}
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
        </View>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  // ── Card shell ──────────────────────────────────────────────────────────────
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: CARD_MAX_H,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10, shadowRadius: 16, elevation: 12,
  },
  sheetVisited: {},

  // ── Handle ──────────────────────────────────────────────────────────────────
  handleArea: {
    alignItems: 'center', paddingTop: 12, paddingBottom: 14,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  handleAreaVisited: {},
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
  handleVisited: {},

  // ── Content row ─────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 14, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 0,
  },

  // ── Photo thumbnail ─────────────────────────────────────────────────────────
  thumb: {
    width: 72, height: 72, borderRadius: 16,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  thumbImg:  { width: '100%', height: '100%' },
  thumbIcon: { fontSize: 26 },

  // ── Info column ─────────────────────────────────────────────────────────────
  info:    { flex: 1, paddingTop: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' },
  name:    { fontSize: 20, fontWeight: '800', color: '#111827', flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  meta:    { fontSize: 13, color: '#6B7280' },

  // ── Stats rows ──────────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },

  visitInfoTxt:  { fontSize: 12, fontWeight: '600', color: '#111827' },
  spotsVisited:  { fontSize: 12, color: '#6B7280', marginTop: 4 },

  sep: { fontSize: 12, color: '#9CA3AF' },

  // ── Bookmark tabs (protrude above top-left edge of card) ────────────────────
  bookmarkTabsRow: { position: 'absolute', left: 20, flexDirection: 'row', gap: 6, zIndex: 5 },
  bookmarkTab: { paddingHorizontal: 11, paddingTop: 5, paddingBottom: 5,
                 borderTopLeftRadius: 9, borderTopRightRadius: 9 },
  bookmarkTabVisited: { backgroundColor: '#059669' },
  bookmarkTabWishlist: { backgroundColor: '#DB2777' },
  bookmarkTabTxt: { fontSize: 11, fontWeight: '700', color: 'white' },

  // ── Open button ─────────────────────────────────────────────────────────────
  openBtn: {
    backgroundColor: '#111827',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9,
    flexShrink: 0, marginTop: 2, alignSelf: 'flex-start',
  },
  openBtnVisited: { backgroundColor: '#059669' },
  openBtnTxt: { fontSize: 13, fontWeight: '700', color: 'white' },
});
