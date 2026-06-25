import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X, Heart, ChevronRight } from 'lucide-react-native';
import { useStore } from '../store';
import { CONTINENT_COLORS, CATEGORY_ICONS } from '../types';
import type { Destination } from '../types';
import { DESTINATIONS } from '../data/destinations';
import { flag } from '../utils/stats';
import DestinationSheet from '../components/Map/DestinationSheet';

type Filter = 'all' | 'visited' | 'wishlist';

export default function PlacesScreen() {
  const insets = useSafeAreaInsets();
  const savedDestinations = useStore((s) => s.savedDestinations);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<Destination | null>(null);

  const savedList = Object.values(savedDestinations)
    .filter((s) => filter === 'all' || s.type === filter)
    .map((s) => {
      const dest = DESTINATIONS.find((d) => d.id === s.destinationId);
      return dest ? { dest, saved: s } : null;
    })
    .filter(Boolean) as { dest: Destination; saved: typeof savedDestinations[string] }[];

  const filtered = savedList.filter(({ dest }) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return dest.name.toLowerCase().includes(q) || dest.country.toLowerCase().includes(q);
  }).sort((a, b) => {
    const ad = a.saved.visitDate ?? '';
    const bd = b.saved.visitDate ?? '';
    return bd.localeCompare(ad);
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Spots</Text>
          <Text style={styles.subtitle}>{Object.keys(savedDestinations).length} saved</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Search size={15} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your spots…"
          value={query}
          onChangeText={setQuery}
          placeholderTextColor="#9CA3AF"
        />
        {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><X size={15} color="#9CA3AF" /></Pressable> : null}
      </View>

      <View style={styles.filterRow}>
        {(['all', 'visited', 'wishlist'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'visited' ? '✓ Visited' : '♡ Wishlist'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.dest.id}
        contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyTitle}>
              {Object.keys(savedDestinations).length === 0 ? 'No spots saved yet' : 'No spots match'}
            </Text>
            <Text style={styles.emptyText}>Tap any pin on the map to mark it visited or add to wishlist</Text>
          </View>
        }
        renderItem={({ item: { dest, saved } }) => {
          const color = CONTINENT_COLORS[dest.continent];
          const icon = dest.icon ?? CATEGORY_ICONS[dest.category];
          return (
            <Pressable style={styles.row} onPress={() => setViewing(dest)}>
              <View style={[
                styles.avatar,
                saved.type === 'wishlist'
                  ? { backgroundColor: 'white', borderWidth: 2, borderColor: color, borderStyle: 'dashed' }
                  : { backgroundColor: color },
              ]}>
                <Text style={styles.avatarIcon}>{icon}</Text>
              </View>
              <View style={styles.rowContent}>
                <View style={styles.rowTitleRow}>
                  <Text style={styles.rowName}>{dest.name}</Text>
                  {saved.type === 'wishlist' && <Heart size={12} color="#EC4899" fill="#EC4899" />}
                </View>
                <Text style={styles.rowSub}>
                  {flag(dest.countryCode)} {dest.country}
                  {saved.visitDate ? `  ·  ${saved.visitDate.slice(0, 7)}` : ''}
                </Text>
              </View>
              <ChevronRight size={16} color="#D1D5DB" />
            </Pressable>
          );
        }}
      />

      {viewing && <DestinationSheet destination={viewing} onClose={() => setViewing(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', marginHorizontal: 12, marginVertical: 10,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginBottom: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterChipActive: { backgroundColor: '#111827' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterTextActive: { color: 'white' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'white', borderRadius: 14, padding: 12,
  },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarIcon: { fontSize: 20 },
  rowContent: { flex: 1 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 260 },
});
