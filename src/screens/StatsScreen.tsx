import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStats } from '../store';
import { CONTINENTS, CONTINENT_COLORS, CONTINENT_EMOJIS } from '../types';
import { ALL_COUNTRIES } from '../data/countries';
import CircleFlag from '../components/CircleFlag';

const { width } = Dimensions.get('window');
const TOTAL_COUNTRIES = 195;

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const stats = useStats();
  const visitedCodeSet = new Set(stats.visitedCountryCodes);

  const yearData = Object.entries(stats.visitsByYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, count]) => ({ year, count }));
  const maxCount = Math.max(...yearData.map((d) => d.count), 1);

  // Continents sorted by destinations visited (descending), excluding Antarctica
  const sortedContinents = [...CONTINENTS].sort(
    (a, b) => (stats.continentDestCount[b] ?? 0) - (stats.continentDestCount[a] ?? 0)
  );

  const fmt = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
    >
      <Text style={styles.pageTitle}>Your Travel Stats</Text>
      {stats.firstVisitDate ? (
        <Text style={styles.pageSubtitle}>
          {fmt(stats.firstVisitDate)} → {fmt(stats.mostRecentVisitDate)}
        </Text>
      ) : null}

      {/* Big stats */}
      <View style={styles.grid2}>
        {[
          { icon: '🌍', label: 'Countries', value: stats.totalCountries },
          { icon: '📍', label: 'Destinations', value: stats.totalVisited },
          { icon: '♡', label: 'Wishlist', value: stats.totalWishlist },
        ].map(({ icon, label, value }) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statIcon}>{icon}</Text>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Country flags — ALL countries */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Countries Explored</Text>
          <Text style={styles.cardBadge}>
            {stats.totalCountries}/{TOTAL_COUNTRIES} ({((stats.totalCountries / TOTAL_COUNTRIES) * 100).toFixed(1)}%)
          </Text>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${(stats.totalCountries / TOTAL_COUNTRIES) * 100}%` as any }]} />
        </View>
        <View style={styles.flagGrid}>
          {ALL_COUNTRIES.map(({ code, name }) => {
            const visited = visitedCodeSet.has(code);
            return (
              <View key={code} style={[styles.flagItem, !visited && { opacity: 0.25 }]}>
                <View style={[styles.flagCircle, visited && { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <CircleFlag countryCode={code} size={26} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Continents */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Continents</Text>
        {sortedContinents.map((c) => {
          const count = stats.continentDestCount[c] ?? 0;
          const isVisited = count > 0;
          const maxForC = Math.max(...sortedContinents.map((x) => stats.continentDestCount[x] ?? 0), 1);
          return (
            <View key={c} style={styles.continentRow}>
              <Text style={[styles.continentEmoji, !isVisited && { opacity: 0.3 }]}>
                {CONTINENT_EMOJIS[c]}
              </Text>
              <View style={styles.continentInfo}>
                <View style={styles.continentLabelRow}>
                  <Text style={[styles.continentName, !isVisited && { color: '#9CA3AF' }]}>{c}</Text>
                  {count > 0 && <Text style={styles.continentCount}>{count} spots</Text>}
                </View>
                <View style={styles.barBg}>
                  {count > 0 && (
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${(count / maxForC) * 100}%` as any,
                          backgroundColor: CONTINENT_COLORS[c],
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Most visited country */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Most Visited</Text>
        <Text style={styles.bigCountry}>{stats.mostVisitedCountry || '—'}</Text>
        {stats.mostVisitedCountry && (
          <Text style={styles.subMeta}>{stats.countryCount[stats.mostVisitedCountry]} spots</Text>
        )}
      </View>

      {/* Year chart */}
      {yearData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Visits by Year</Text>
          <View style={styles.chart}>
            {yearData.map(({ year, count }, i) => (
              <View key={year} style={styles.bar}>
                <Text style={styles.barValue}>{count}</Text>
                <View
                  style={[
                    styles.barRect,
                    {
                      height: Math.max(8, (count / maxCount) * 120),
                      backgroundColor: `hsl(${210 + i * 25}, 70%, 55%)`,
                    },
                  ]}
                />
                <Text style={styles.barYear}>{year.slice(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  pageSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: (width - 42) / 2, backgroundColor: 'white', borderRadius: 16,
    padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  card: {
    backgroundColor: 'white', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  cardBadge: { fontSize: 12, fontWeight: '600', color: '#3B82F6' },
  progressBg: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 3 },
  flagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  flagItem: { alignItems: 'center' },
  flagCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  continentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  continentEmoji: { fontSize: 22, width: 30 },
  continentInfo: { flex: 1 },
  continentLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  continentName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  continentCount: { fontSize: 11, color: '#6B7280' },
  barBg: { height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  subMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  bigCountry: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 160, paddingTop: 20 },
  bar: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 11, fontWeight: '600', color: '#374151' },
  barRect: { width: '100%', borderRadius: 6, minHeight: 8 },
  barYear: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
});
