import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Image, Alert,
  Animated, PanResponder, Dimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Star, Clock, MapPin, Pencil, ChevronUp, LayoutGrid, Bookmark } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store';
import { CONTINENT_COLORS, SPOT_CATEGORY_META } from '../../types';
import type { Destination, PhotoEntry } from '../../types';
import type { Spot } from '../../data/spots';
import { photoCache, thumbCache, fetchWikiThumbnail } from '../../utils/photoCache';
import CircleFlag from '../CircleFlag';
import {
  parseDateStr, fmtDatePart,
  DatePickerModal, PhotoCollage, ReviewEditModal,
} from './sheetShared';

const { height: H, width: W } = Dimensions.get('window');
const FULL_POS    = 0;
const CLOSE_POS   = H + 40;  // fully off-screen
const HERO_H      = Math.round(H * 0.48);
const COMPACT_H   = 232;     // header + one carousel card (onLayout refines this)

// Carousel card metrics — one card centered, neighbors peeking on both sides.
const CARD_W    = W - 64;
const CARD_GAP  = 12;
const CARD_SNAP = CARD_W + CARD_GAP;
const SIDE_PAD  = (W - CARD_W) / 2;

// "1.5 hr" / "45 min" — spot.visitHours is a plain decimal-hours estimate.
function formatVisitTime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)} hr`;
}

// ── Star rating (tappable) ────────────────────────────────────────────────────
function StarRating({ value, onChange, size = 30 }: {
  value: number; onChange?: (v: number) => void; size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={6}>
          <Star
            size={size}
            color={n <= value ? '#16A34A' : '#D1D5DB'}
            fill={n <= value ? '#16A34A' : 'none'}
            strokeWidth={2}
          />
        </Pressable>
      ))}
    </View>
  );
}

// ── Carousel preview card (one per spot in the collapsed carousel) ───────────
function CarouselCard({ spot, isActive, onPress }: {
  spot: Spot; isActive: boolean; onPress: () => void;
}) {
  const cacheKey = `spot_${spot.id}`;
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setThumb(thumbCache.get(cacheKey)!); return; }
    fetchWikiThumbnail(spot.name, 400).then(u => { if (u) { thumbCache.set(cacheKey, u); setThumb(u); } });
  }, [spot.id]);

  const cat        = SPOT_CATEGORY_META[spot.category];
  const savedSpot  = useStore(s => s.savedSpots[spot.id]);
  const isVisited  = !!savedSpot;

  return (
    <Pressable
      style={[st.card, isActive && st.cardActive, { width: CARD_W, marginRight: CARD_GAP }]}
      onPress={onPress}
    >
      <View style={st.cardImageWrap}>
        {thumb
          ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={st.cardThumbFallback}><Text style={{ fontSize: 30 }}>{spot.icon}</Text></View>}
        {/* Bookmark reflects the same visited status the old badge did — filled once
            visited, outline otherwise — there's no separate per-spot save/wishlist concept
            in the data model to hang a real "save" toggle off of. */}
        <View style={st.cardBookmark}>
          <Bookmark size={11} color="#111827" strokeWidth={2} fill={isVisited ? '#111827' : 'none'} />
        </View>
      </View>
      <View style={st.cardInfo}>
        {/* Category moved off the (now much smaller) image into a plain text row — a
            badge overlaid on a 96px-wide thumbnail didn't leave room to stay legible. */}
        <Text style={st.cardCat} numberOfLines={1}>{cat.icon}  {cat.label}</Text>
        <Text style={st.cardName} numberOfLines={1}>{spot.name}</Text>
        {/* Estimated time to spend here, in place of a rating/walking-distance row —
            spot.visitHours is the only per-spot metric this data model actually has. */}
        <View style={st.cardTimeRow}>
          <Clock size={12} color="#16A34A" strokeWidth={2.5} />
          <Text style={st.cardTimeTxt}>{formatVisitTime(spot.visitHours)}</Text>
        </View>
        <Text style={st.cardBio} numberOfLines={2}>{spot.bio}</Text>
        {isActive && (
          <View style={st.cardExpandRow}>
            <ChevronUp size={13} color="#16A34A" strokeWidth={2.5} />
            <Text style={st.cardExpandTxt}>Swipe up for details</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
interface Props {
  spots: Spot[];
  focusSpotId: string;
  destination: Destination;
  // `toCollapsed` is true when this fires from a swipe-down while the carousel itself was
  // collapsed (bottom-screen), so the caller can land the destination sheet underneath in
  // its own collapsed/bottom-screen view instead of the usual half-screen default. False
  // (or omitted) for the other dismiss path — the hero's back-pill, tapped while expanded.
  onClose: (toCollapsed?: boolean) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onActiveSpotChange?: (spot: Spot) => void;
  // Reports how far the collapsed carousel's top edge sits from the very bottom of the
  // screen, so callers (the back-navigation pill) can sit exactly above it instead of
  // guessing a fixed offset that breaks if the carousel's measured height changes.
  onCollapsedTopChange?: (distanceFromBottom: number) => void;
  // "Go to list view" — swaps this carousel for the destination sheet's full-screen Spots
  // grid, which is often easier to scan than swiping card-by-card.
  onGoToList?: () => void;
}

export default function SpotSheet({
  spots, focusSpotId, destination, onClose, onExpand, onCollapse, onActiveSpotChange, onCollapsedTopChange,
  onGoToList,
}: Props) {
  const insets       = useSafeAreaInsets();
  const saveSpotVisited = useStore(s => s.saveSpotVisited);
  const updateSpot   = useStore(s => s.updateSpot);
  const unsaveSpot   = useStore(s => s.unsaveSpot);

  const color = CONTINENT_COLORS[destination.continent];

  // ── Which spot is focused in the carousel ────────────────────────────────────
  const initialIndex = useMemo(
    () => Math.max(0, spots.findIndex(s => s.id === focusSpotId)),
    [focusSpotId, spots],
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const activeSpot = spots[activeIndex] ?? spots[0];

  const savedSpot = useStore(s => s.savedSpots[activeSpot.id]);
  const cat       = SPOT_CATEGORY_META[activeSpot.category];
  const isVisited = !!savedSpot;
  const photos: PhotoEntry[] = savedSpot?.photos ?? [];

  const carouselRef = useRef<ScrollView>(null);
  const [photoUrl,  setPhotoUrl ] = useState<string | null>(photoCache.get(`spot_${activeSpot.id}`) ?? null);
  const [activeTab, setActiveTab] = useState<'visit' | 'about'>('visit');
  const [showDP,    setShowDP   ] = useState(false);
  const [showReview,setShowReview] = useState(false);

  // Tab slide animation: 0 = visit tab, -W = about tab
  const tabSlideAnim    = useRef(new Animated.Value(0)).current;
  const activeTabRef    = useRef<'visit' | 'about'>('visit');
  const tabSwipeBaseRef = useRef(0);
  const tabIndicatorLeft = useMemo(() => tabSlideAnim.interpolate({
    inputRange: [-W, 0], outputRange: ['50%', '0%'], extrapolate: 'clamp',
  }), []);

  const switchTabRef = useRef<(tab: 'visit' | 'about') => void>(() => {});
  switchTabRef.current = (newTab: 'visit' | 'about') => {
    if (activeTabRef.current === newTab) return;
    activeTabRef.current = newTab;
    setActiveTab(newTab);
    Animated.spring(tabSlideAnim, {
      toValue: newTab === 'visit' ? 0 : -W, useNativeDriver: false, damping: 26, stiffness: 230,
    }).start();
  };
  const snapTabToNearest = () => {
    Animated.spring(tabSlideAnim, {
      toValue: activeTabRef.current === 'visit' ? 0 : -W, useNativeDriver: false, damping: 26, stiffness: 230,
    }).start();
  };
  const tabSwipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 2.5,
      onPanResponderGrant: () => { tabSlideAnim.stopAnimation(v => { tabSwipeBaseRef.current = v; }); },
      onPanResponderMove: (_, { dx }) => {
        const next = Math.max(-W, Math.min(0, tabSwipeBaseRef.current + dx));
        tabSlideAnim.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const projected = tabSwipeBaseRef.current + dx;
        const goTo: 'visit' | 'about' = (vx < -0.4 || projected < -W / 2) ? 'about' : 'visit';
        if (goTo !== activeTabRef.current) switchTabRef.current(goTo);
        else snapTabToNearest();
      },
      onPanResponderTerminate: () => snapTabToNearest(),
    })
  ).current;

  // Hero photo for the active spot — bounded width instead of the (often huge) original.
  useEffect(() => {
    const cacheKey = `spot_${activeSpot.id}`;
    if (photoCache.has(cacheKey)) { setPhotoUrl(photoCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(activeSpot.name, 900).then(url => {
      if (url) { photoCache.set(cacheKey, url); setPhotoUrl(url); }
    });
    // Reset tab whenever the focused spot changes.
    activeTabRef.current = 'visit';
    setActiveTab('visit');
    tabSlideAnim.setValue(0);
  }, [activeSpot.id]);

  // ── Unified sheet: two snap points ──────────────────────────────────────────
  const snapStateRef = useRef<'collapsed' | 'full'>('collapsed');
  const slideAnim    = useRef(new Animated.Value(CLOSE_POS)).current;
  const lastPos      = useRef(0);
  const scrollY      = useRef(0);
  const didMountRef  = useRef(false);

  const collapsedYRef   = useRef(Math.max(0, H - (Platform.OS === 'ios' ? 88 : 64) - COMPACT_H));
  const collapsedYAnimV = useRef(new Animated.Value(collapsedYRef.current)).current;
  const carouselTranslateY = useMemo(() => Animated.subtract(slideAnim, collapsedYAnimV).interpolate({
    inputRange: [-H, 0], outputRange: [-H, 0], extrapolate: 'clamp',
  }), []);
  const backdropOpacity = useMemo(() => slideAnim.interpolate({
    inputRange: [FULL_POS, collapsedYRef.current], outputRange: [1, 0], extrapolate: 'clamp',
  }), []);

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
    // Captured before the slide-out starts, since snapStateRef may already be mid-transition
    // by the time the animation callback fires.
    const wasCollapsed = snapStateRef.current === 'collapsed';
    Animated.timing(slideAnim, { toValue: CLOSE_POS, duration: 280, useNativeDriver: false }).start(() => onClose(wasCollapsed));
  };

  // Slide in from off-screen on first mount.
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    lastPos.current = collapsedYRef.current;
    Animated.spring(slideAnim, { toValue: collapsedYRef.current, useNativeDriver: false, damping: 28, stiffness: 260 }).start();
    onCollapsedTopChange?.(H - collapsedYRef.current);
    didMountRef.current = true;
  }, []);

  // When a NEW spot is tapped on the map (focusSpotId changes), jump the carousel to it
  // and return to the collapsed carousel view.
  useEffect(() => {
    setActiveIndex(initialIndex);
    requestAnimationFrame(() => carouselRef.current?.scrollTo({ x: initialIndex * CARD_SNAP, animated: false }));
    if (didMountRef.current) snapToCollapsedRef.current();
  }, [focusSpotId]);

  const hapticFiredRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) => {
        // Horizontal drags fall through to the carousel; vertical drags move the sheet.
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

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleMarkVisited = () => {
    if (isVisited) {
      Alert.alert(
        'Remove visit?',
        'This will delete your rating, notes, and photos for this spot.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => unsaveSpot(activeSpot.id) },
        ]
      );
      return;
    }
    saveSpotVisited(activeSpot.id, destination.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      const newEntries: PhotoEntry[] = result.assets.map(a => ({
        uri: a.uri, width: a.width, height: a.height, spotId: activeSpot.id, spotName: activeSpot.name,
      }));
      updateSpot(activeSpot.id, { photos: [...photos, ...newEntries] });
    }
  };
  const handleDeletePhoto = (index: number) => {
    updateSpot(activeSpot.id, { photos: photos.filter((_, i) => i !== index) });
  };

  const handleCarouselSettle = (offsetX: number) => {
    const idx = Math.max(0, Math.min(spots.length - 1, Math.round(offsetX / CARD_SNAP)));
    if (idx === activeIndex) return;
    setActiveIndex(idx);
    Haptics.selectionAsync();
    onActiveSpotChange?.(spots[idx]);
  };

  const heroTopRowTop = insets.top + 14;
  const visitDate = savedSpot?.visitDate ?? '';
  const vd = parseDateStr(visitDate);

  return (
    <View style={st.backdrop} pointerEvents="box-none">
      <Animated.View pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropOpacity }]} />
      <Animated.View
        pointerEvents={snapStateRef.current === 'full' ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapToCollapsedRef.current()} />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[st.sheetShadow, { top: slideAnim }]} />

      <Animated.View {...panResponder.panHandlers} style={[st.sheet, { top: slideAnim }]}>
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <View style={{ flex: 1 }} {...(isVisited ? tabSwipePan.panHandlers : {})}>
        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── HERO (active spot, shown when expanded) ─────────────────── */}
          <View style={[st.hero, { backgroundColor: color, height: HERO_H - insets.bottom }]}>
            {photoUrl && <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            <View pointerEvents="none" style={st.heroScrim} />
            <View pointerEvents="none" style={st.heroGrad} />

            {/* Top row: back to destination on the left, save + collapse on the right */}
            <View style={[st.heroTopRow, { top: heroTopRowTop }]}>
              <Pressable style={st.backPill} onPress={() => dismissSheetRef.current()} hitSlop={10}>
                <Text style={st.backPillArrow}>←</Text>
                <Text style={st.backPillTxt} numberOfLines={1}>{destination.name}</Text>
              </Pressable>
              <View style={st.heroActionsRight}>
                {!!onGoToList && (
                  <Pressable style={st.heroIconBtn} onPress={onGoToList} hitSlop={10}>
                    <LayoutGrid size={16} color="rgba(255,255,255,0.92)" />
                  </Pressable>
                )}
                <Pressable
                  style={[st.heroIconBtn, isVisited && st.heroIconBtnVisited]}
                  onPress={handleMarkVisited} hitSlop={10}>
                  <Check size={17} color="white" strokeWidth={2.75} />
                </Pressable>
                <Pressable style={st.heroIconBtn} onPress={() => snapToCollapsedRef.current()} hitSlop={12}>
                  <X size={16} color="rgba(255,255,255,0.92)" />
                </Pressable>
              </View>
            </View>

            <View style={st.heroBottomStack}>
              <View style={st.heroContent}>
                <View style={st.catChip}>
                  <Text style={st.catChipTxt}>{cat.icon}  {cat.label}</Text>
                </View>
                <Text style={st.heroName} numberOfLines={2}>{activeSpot.name}</Text>
                <View style={st.heroMeta}>
                  <MapPin size={12} color="rgba(255,255,255,0.85)" />
                  <Text style={st.heroMetaTxt}>{destination.name}</Text>
                  <Text style={st.heroMetaDot}> · </Text>
                  <CircleFlag countryCode={destination.countryCode} size={13} />
                  <Text style={[st.heroMetaTxt, { marginLeft: 4 }]}>{destination.country}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── TAB BAR (visited only) ──────────────────────────────────── */}
          {isVisited && (
            <View style={st.tabBar}>
              <Pressable style={st.tabBtn} onPress={() => switchTabRef.current('visit')}>
                <Text style={[st.tabBtnTxt, activeTab === 'visit' && st.tabBtnTxtActive]}>My Visit</Text>
              </Pressable>
              <Pressable style={st.tabBtn} onPress={() => switchTabRef.current('about')}>
                <Text style={[st.tabBtnTxt, activeTab === 'about' && st.tabBtnTxtActive]}>About</Text>
              </Pressable>
              <Animated.View style={[st.tabIndicator, { left: tabIndicatorLeft }]} />
            </View>
          )}

          {/* ── CONTENT ────────────────────────────────────────────────── */}
          <View style={[st.content, !isVisited && st.contentRounded]}>
            {isVisited ? (
              <View style={st.slideTrack}>
                <Animated.View style={[st.slideRow, { transform: [{ translateX: tabSlideAnim }] }]}>
                  {/* ── MY VISIT PANEL ─────────────────────────────────── */}
                  <View style={st.slidePanel}>
                    <View style={st.card2}>
                      <Text style={st.cardLabel}>YOUR RATING</Text>
                      <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
                        <StarRating value={savedSpot?.rating ?? 0} onChange={r => updateSpot(activeSpot.id, { rating: r })} />
                      </View>
                    </View>

                    <View style={st.card2}>
                      <Text style={st.cardLabel}>VISIT DATE</Text>
                      <Pressable style={st.dateRow} onPress={() => setShowDP(true)}>
                        <Clock size={15} color="#6366F1" />
                        <Text style={vd ? st.dateVal : st.datePh}>
                          {vd ? fmtDatePart(visitDate) : 'Add the date you visited'}
                        </Text>
                        <Pencil size={12} color="#9CA3AF" />
                      </Pressable>
                    </View>

                    <View style={st.card2}>
                      <Text style={st.cardLabel}>YOUR PHOTOS</Text>
                      <PhotoCollage photos={photos} onAdd={handleAddPhoto} onDelete={handleDeletePhoto} />
                    </View>

                    <View style={st.card2}>
                      <Pressable onPress={() => setShowReview(true)}>
                        <Text style={st.cardLabel}>YOUR REVIEW</Text>
                        {savedSpot?.notes
                          ? <Text style={[st.reviewTxt, { marginTop: 6 }]}>{savedSpot.notes}</Text>
                          : <Text style={[st.reviewPh, { marginTop: 6 }]}>Tap to write about this spot…</Text>}
                      </Pressable>
                    </View>
                  </View>

                  {/* ── ABOUT PANEL ────────────────────────────────────── */}
                  <View style={st.slidePanel}>
                    <SpotAbout spot={activeSpot} cat={cat} />
                  </View>
                </Animated.View>
              </View>
            ) : (
              <SpotAbout spot={activeSpot} cat={cat} />
            )}
          </View>
        </ScrollView>
        </View>{/* end tabSwipePan wrapper */}
        </View>{/* end full-content wrapper */}

        {/* ── CAROUSEL — collapsed overlay: all spots in this destination ──── */}
        <Animated.View
          style={[st.carouselWrap, { transform: [{ translateY: carouselTranslateY }] }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h < 20) return;
            const newCY = Math.max(0, H - (Platform.OS === 'ios' ? 88 : 64) - h);
            if (Math.abs(newCY - collapsedYRef.current) < 2) return;
            collapsedYRef.current = newCY;
            collapsedYAnimV.setValue(newCY);
            onCollapsedTopChange?.(H - newCY);
            if (snapStateRef.current === 'collapsed') {
              lastPos.current = newCY;
              Animated.spring(slideAnim, { toValue: newCY, useNativeDriver: false, damping: 40, stiffness: 400 }).start();
            }
          }}
        >
          <View pointerEvents="none" style={st.pillRow}>
            <View style={st.pill} />
          </View>

          {/* Heading — indicates you're browsing the spots within this destination */}
          <View style={st.carHeader}>
            <View style={{ flex: 1 }}>
              <Text style={st.carEyebrow}>SPOTS IN</Text>
              <Text style={st.carDest} numberOfLines={1}>{destination.name}</Text>
            </View>
            <Text style={st.carCounter}>{activeIndex + 1} / {spots.length}</Text>
            {!!onGoToList && (
              <Pressable style={st.carListBtn} onPress={onGoToList} hitSlop={8}>
                <LayoutGrid size={14} color="#6B7280" />
                <Text style={st.carListBtnTxt}>List</Text>
              </Pressable>
            )}
          </View>

          <ScrollView
            ref={carouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_SNAP}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
            onMomentumScrollEnd={e => handleCarouselSettle(e.nativeEvent.contentOffset.x)}
          >
            {spots.map((s, i) => (
              <CarouselCard
                key={s.id}
                spot={s}
                isActive={i === activeIndex}
                onPress={() => {
                  if (i !== activeIndex) {
                    setActiveIndex(i);
                    carouselRef.current?.scrollTo({ x: i * CARD_SNAP, animated: true });
                    onActiveSpotChange?.(spots[i]);
                  }
                  snapToFullRef.current();
                }}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </Animated.View>

      {showDP && (
        <DatePickerModal
          value={visitDate}
          onDone={d => { updateSpot(activeSpot.id, { visitDate: d }); setShowDP(false); }}
          onCancel={() => setShowDP(false)}
        />
      )}
      {showReview && (
        <ReviewEditModal
          value={savedSpot?.notes ?? ''}
          onSave={text => { updateSpot(activeSpot.id, { notes: text || undefined }); setShowReview(false); }}
          onCancel={() => setShowReview(false)}
        />
      )}
    </View>
  );
}

// ── About panel (shared between visited/non-visited) ──────────────────────────
function SpotAbout({ spot, cat }: { spot: Spot; cat: { label: string; icon: string } }) {
  return (
    <>
      <View style={st.section}>
        <Text style={st.sectionTitle}>About {spot.name}</Text>
        <Text style={st.aboutTxt}>{spot.bio}</Text>
      </View>

      <View style={st.section}>
        <Text style={st.sectionTitle}>At a Glance</Text>
        <View style={st.glanceCard}>
          <View style={st.glanceItem}>
            <Clock size={20} color="#6366F1" />
            <Text style={st.glanceVal}>{spot.visitHours}h</Text>
            <Text style={st.glanceLbl}>Time needed</Text>
          </View>
          <View style={st.glanceDivider} />
          <View style={st.glanceItem}>
            <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
            <Text style={[st.glanceVal, { fontSize: 14 }]} numberOfLines={1}>{cat.label}</Text>
            <Text style={st.glanceLbl}>Category</Text>
          </View>
        </View>
      </View>

      <View style={st.section}>
        <Text style={st.sectionTitle}>Opening Hours</Text>
        <View style={st.hoursRow}>
          <Clock size={16} color="#16A34A" />
          <Text style={st.hoursTxt}>{spot.hours}</Text>
        </View>
      </View>
    </>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 210, elevation: 210 } as any,
  sheet: {
    position: 'absolute', left: 0, right: 0, height: H, overflow: 'hidden',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F9FAFB',
  },
  sheetShadow: {
    position: 'absolute', left: 0, right: 0, height: H,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F9FAFB',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },

  // ── Carousel overlay ──────────────────────────────────────────────────────
  carouselWrap: {
    position: 'absolute', left: 0, right: 0, top: 0,
    backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 16,
  },
  pillRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  pill:    { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)' },
  carHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  carEyebrow: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.3, marginBottom: 2 },
  carDest:    { fontSize: 18, fontWeight: '800', color: '#111827' },
  carCounter: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  carListBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4,
                   marginLeft: 12, paddingHorizontal: 4, paddingVertical: 4 },
  carListBtnTxt: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },

  // Carousel card — compact horizontal layout: a fixed-size image on the left, all text
  // content on the right, matching the original card's overall height/density (unlike the
  // taller full-width-image-on-top layout this replaced).
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 16,
    backgroundColor: 'white', borderRadius: 18, padding: 12,
    borderWidth: 1.5, borderColor: '#EEF0F2',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardActive:  { borderColor: '#16A34A' },
  cardImageWrap: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F3F4F6', flexShrink: 0 },
  cardThumbFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' } as any,
  cardBookmark: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'white', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  cardInfo:    { flex: 1, gap: 3 },
  cardCat:     { fontSize: 11.5, fontWeight: '600', color: '#6B7280' },
  cardName:    { fontSize: 15.5, fontWeight: '800', color: '#111827', lineHeight: 19 },
  cardTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTimeTxt: { fontSize: 12.5, fontWeight: '700', color: '#16A34A' },
  cardBio:     { fontSize: 12, color: '#6B7280', lineHeight: 16 },
  cardExpandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardExpandTxt: { fontSize: 12, fontWeight: '600', color: '#16A34A' },

  // Hero
  hero: { width: '100%', height: HERO_H, overflow: 'hidden', justifyContent: 'flex-end' },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  heroGrad: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(0,0,0,0.42)' },
  heroTopRow: { position: 'absolute', left: 14, right: 14,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  backPill: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: W * 0.6,
              backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 22,
              paddingHorizontal: 12, paddingVertical: 9,
              shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  backPillArrow: { fontSize: 13, color: '#374151', fontWeight: '700' },
  backPillTxt: { fontSize: 13, fontWeight: '600', color: '#111827' },
  heroIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)',
                 alignItems: 'center', justifyContent: 'center',
                 borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  heroActionsRight:   { flexDirection: 'row', gap: 10, alignItems: 'center' },
  heroIconBtnVisited: { backgroundColor: '#16A34A', borderColor: 'transparent' },
  heroBottomStack: {},
  heroContent: { paddingHorizontal: 20, paddingBottom: 34, paddingTop: 8, gap: 10 },
  catChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20,
             paddingHorizontal: 12, paddingVertical: 5 },
  catChipTxt: { fontSize: 12, fontWeight: '700', color: 'white' },
  heroName: { fontSize: 34, fontFamily: 'PlayfairDisplay_700Bold', color: 'white', letterSpacing: -0.5 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaTxt: { fontSize: 14, color: 'rgba(255,255,255,0.90)', fontWeight: '500' },
  heroMetaDot: { fontSize: 14, color: 'rgba(255,255,255,0.40)' },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: 'white',
            borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB', zIndex: 1, overflow: 'hidden' },
  tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabBtnTxt: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },
  tabBtnTxtActive: { color: '#111827' },
  tabIndicator: { position: 'absolute', bottom: 0, width: '50%', height: 2.5, backgroundColor: '#16A34A', borderRadius: 2 },

  // Content
  content: { backgroundColor: 'white', padding: 16, gap: 16 },
  contentRounded: { borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24 },
  slideTrack: { overflow: 'hidden', marginHorizontal: -16, width: W },
  slideRow: { flexDirection: 'row', alignItems: 'flex-start', width: W * 2 },
  slidePanel: { width: W, paddingHorizontal: 16, gap: 16 },

  // My Visit cards
  card2: { backgroundColor: 'white', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#F0F1F3' },
  cardLabel: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dateVal: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  datePh:  { flex: 1, fontSize: 15, color: '#9CA3AF' },
  reviewTxt: { fontSize: 15, color: '#374151', lineHeight: 24 },
  reviewPh:  { fontSize: 15, color: '#C4C9D4', lineHeight: 24 },

  // About
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  aboutTxt: { fontSize: 15, color: '#374151', lineHeight: 24 },
  glanceCard: { backgroundColor: 'white', borderRadius: 16, flexDirection: 'row', borderWidth: 1, borderColor: '#F3F4F6' },
  glanceItem: { flex: 1, alignItems: 'center', paddingVertical: 20, gap: 5 },
  glanceDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginVertical: 14 },
  glanceVal: { fontSize: 20, fontWeight: '800', color: '#111827' },
  glanceLbl: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white',
              borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  hoursTxt: { fontSize: 15, fontWeight: '600', color: '#374151' },
});
