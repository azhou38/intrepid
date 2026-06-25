import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { useStore } from '../store';
import { CATEGORY_ICONS, CONTINENT_COLORS } from '../types';
import type { Destination } from '../types';
import { DESTINATIONS } from '../data/destinations';
import { flag } from '../utils/stats';
import DestinationSheet from '../components/Map/DestinationSheet';

const { width } = Dimensions.get('window');
const CARD_W = 148;
const CARD_H = 196;

// ── Feed section definitions ───────────────────────────────────────────────
const FEED_SECTIONS: {
  id: string;
  title: string;
  emoji: string;
  filter: (d: Destination) => boolean;
}[] = [
  {
    id: 'trending',
    title: 'Trending Now',
    emoji: '🔥',
    filter: d => d.rank === 1,
  },
  {
    id: 'cities',
    title: 'Iconic Cities',
    emoji: '🏙',
    filter: d => d.category === 'city',
  },
  {
    id: 'nature',
    title: 'Natural Wonders',
    emoji: '🌿',
    filter: d => ['park', 'mountain', 'nature', 'lake', 'desert'].includes(d.category),
  },
  {
    id: 'beach',
    title: 'Beach Escapes',
    emoji: '🏖',
    filter: d => d.category === 'beach' || d.category === 'island',
  },
  {
    id: 'history',
    title: 'Historic Places',
    emoji: '🏛',
    filter: d => d.category === 'ruin' || d.category === 'landmark',
  },
];

export default function DiscoverScreen() {
  const insets            = useSafeAreaInsets();
  const savedDestinations = useStore(s => s.savedDestinations);

  const [searchQuery,  setSearchQuery ] = useState('');
  const [viewing,      setViewing     ] = useState<Destination | null>(null);

  const isSearching = searchQuery.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.toLowerCase();
    return DESTINATIONS.filter(
      d => d.name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q)
    ).slice(0, 14);
  }, [searchQuery, isSearching]);

  const sections = useMemo(() =>
    FEED_SECTIONS
      .map(sec => ({ ...sec, items: DESTINATIONS.filter(sec.filter).slice(0, 10) }))
      .filter(sec => sec.items.length > 0),
  []);

  const SEARCH_BAR_H = insets.top + 64;

  return (
    <View style={styles.root}>

      {/* ── Fixed search bar ──────────────────────────────────────────── */}
      <View style={[styles.searchContainer, { paddingTop: insets.top + 10 }]}>
        <View style={styles.searchBar}>
          <Search size={16} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search destinations…"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {!!searchQuery && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={14} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Content ───────────────────────────────────────────────────── */}
      {isSearching ? (

        /* Search results */
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: SEARCH_BAR_H, paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {searchResults.length === 0 ? (
            <View style={styles.searchEmpty}>
              <Text style={styles.searchEmptyIcon}>🔍</Text>
              <Text style={styles.searchEmptyTitle}>No results</Text>
              <Text style={styles.searchEmptySub}>Try a different name or country</Text>
            </View>
          ) : searchResults.map(dest => {
            const saved = savedDestinations[dest.id];
            const color = CONTINENT_COLORS[dest.continent];
            return (
              <Pressable key={dest.id} style={styles.searchRow} onPress={() => setViewing(dest)}>
                <View style={[styles.searchIconWrap, { backgroundColor: color + '22' }]}>
                  <Text style={styles.searchIconText}>
                    {dest.icon ?? CATEGORY_ICONS[dest.category]}
                  </Text>
                </View>
                <View style={styles.searchInfo}>
                  <Text style={styles.searchName}>{dest.name}</Text>
                  <Text style={styles.searchCountry}>{flag(dest.countryCode)} {dest.country}</Text>
                </View>
                {saved?.type === 'visited'  && <Text style={styles.badgeVisited}>✓</Text>}
                {saved?.type === 'wishlist' && <Text style={styles.badgeWishlist}>♡</Text>}
              </Pressable>
            );
          })}
        </ScrollView>

      ) : (

        /* Feed */
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: SEARCH_BAR_H, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.feedHeader}>
            <Text style={styles.feedTitle}>Discover</Text>
            <Text style={styles.feedSub}>{DESTINATIONS.length} destinations worldwide</Text>
          </View>

          {sections.map(section => (
            <View key={section.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionEmoji}>{section.emoji}</Text>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardRow}
              >
                {section.items.map(dest => {
                  const saved = savedDestinations[dest.id];
                  const color = CONTINENT_COLORS[dest.continent];
                  const icon  = dest.icon ?? CATEGORY_ICONS[dest.category];
                  return (
                    <Pressable key={dest.id} style={styles.card} onPress={() => setViewing(dest)}>
                      <View style={[styles.cardTop, { backgroundColor: color + '28' }]}>
                        <Text style={styles.cardIcon}>{icon}</Text>
                        {saved?.type === 'visited' && (
                          <View style={styles.cardBadge}>
                            <Text style={styles.cardBadgeText}>✓</Text>
                          </View>
                        )}
                        {saved?.type === 'wishlist' && (
                          <View style={[styles.cardBadge, styles.cardBadgeWishlist]}>
                            <Text style={styles.cardBadgeText}>♡</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.cardBottom}>
                        <Text style={styles.cardName} numberOfLines={1}>{dest.name}</Text>
                        <Text style={styles.cardCountry} numberOfLines={1}>
                          {flag(dest.countryCode)} {dest.country}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}

      {viewing && (
        <DestinationSheet destination={viewing} onClose={() => setViewing(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { flex: 1 },

  // Search bar
  searchContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: '#F9FAFB', paddingHorizontal: 16, paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },

  // Feed header
  feedHeader: { paddingHorizontal: 16, paddingVertical: 12 },
  feedTitle:  { fontSize: 28, fontWeight: '800', color: '#111827' },
  feedSub:    { fontSize: 13, color: '#9CA3AF', marginTop: 2 },

  // Section
  section:       { marginBottom: 6 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  sectionEmoji: { fontSize: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  cardRow: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },

  // Destination card
  card: {
    width: CARD_W, backgroundColor: 'white', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardTop: {
    height: CARD_H * 0.60, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  cardIcon: { fontSize: 46 },
  cardBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center',
  },
  cardBadgeWishlist: { backgroundColor: '#DB2777' },
  cardBadgeText: { fontSize: 11, color: 'white', fontWeight: '700' },
  cardBottom: {
    padding: 10, height: CARD_H * 0.40, justifyContent: 'center',
  },
  cardName:    { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 3 },
  cardCountry: { fontSize: 11, color: '#6B7280' },

  // Search results
  searchEmpty: { alignItems: 'center', gap: 6, paddingTop: 60 },
  searchEmptyIcon:  { fontSize: 36 },
  searchEmptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  searchEmptySub:   { fontSize: 13, color: '#9CA3AF' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  searchIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  searchIconText:  { fontSize: 22 },
  searchInfo:      { flex: 1 },
  searchName:      { fontSize: 15, fontWeight: '600', color: '#111827' },
  searchCountry:   { fontSize: 12, color: '#6B7280', marginTop: 1 },
  badgeVisited:    { fontSize: 18, color: '#059669', fontWeight: '700' },
  badgeWishlist:   { fontSize: 18, color: '#DB2777' },
});
