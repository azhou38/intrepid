import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useStats } from '../store';
import { DESTINATIONS } from '../data/destinations';
import CircleFlag from '../components/CircleFlag';

const TOTAL_COUNTRIES = 195;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const stats  = useStats();
  const savedDestinations = useStore(s => s.savedDestinations);
  const userName          = useStore(s => s.userName);

  const visitedDests = useMemo(() =>
    DESTINATIONS.filter(d => savedDestinations[d.id]?.type === 'visited'),
  [savedDestinations]);

  // Country code lookup: country name → ISO code (for flag)
  const countryCodeByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of visitedDests) map[d.country] = d.countryCode;
    return map;
  }, [visitedDests]);

  // Top countries sorted by destination count
  const topCountries = useMemo(() =>
    Object.entries(stats.countryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([country, count]) => ({ country, count, code: countryCodeByName[country] ?? '' })),
  [stats.countryCount, countryCodeByName]);

  const maxCountryCount = topCountries[0]?.count ?? 1;

  const coverageGeoJSON = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: visitedDests.map(dest => {
      const countInCountry = stats.countryCount[dest.country] ?? 1;
      const intensity = Math.min(countInCountry / 4, 1);
      const opacity = 0.28 + intensity * 0.42;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [dest.coordinates.longitude, dest.coordinates.latitude] },
        properties: { opacity },
      };
    }),
  }), [visitedDests, stats.countryCount]);

  const pct = ((stats.totalCountries / TOTAL_COUNTRIES) * 100).toFixed(1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
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

      {/* ── Stats row: Countries · Destinations · Spots ─────────────── */}
      <View style={[styles.statsRow, { marginHorizontal: 16, marginBottom: 14 }]}>
        {[
          { value: stats.totalCountries,    label: 'Countries'    },
          { value: stats.totalDestinations, label: 'Destinations' },
          { value: stats.totalSpots,        label: 'Spots'        },
        ].map(({ value, label }, i) => (
          <React.Fragment key={label}>
            {i > 0 && <View style={styles.statDivider} />}
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── My World map ────────────────────────────────────────────── */}
      <View style={[styles.card, { marginHorizontal: 16, marginBottom: 14, padding: 0, overflow: 'hidden' }]}>
        <View style={styles.worldHeader}>
          <View>
            <Text style={styles.worldTitle}>My World</Text>
            <Text style={styles.worldSub}>{pct}% of the world explored</Text>
          </View>
          <View style={styles.worldPctBadge}>
            <Text style={styles.worldPctText}>{stats.totalCountries} / {TOTAL_COUNTRIES}</Text>
          </View>
        </View>

        <View pointerEvents="none" style={styles.mapWrap}>
          <MapboxGL.MapView
            style={styles.worldMap}
            styleURL={MapboxGL.StyleURL.Light}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            logoEnabled={false}
            compassEnabled={false}
            scaleBarEnabled={false}
            attributionEnabled={false}
          >
            <MapboxGL.Camera
              defaultSettings={{ centerCoordinate: [10, 15], zoomLevel: 0.8 }}
              animationDuration={0}
            />
            {visitedDests.length > 0 && (
              <MapboxGL.ShapeSource id="coverage" shape={coverageGeoJSON}>
                <MapboxGL.CircleLayer
                  id="coverageCircles"
                  style={{
                    circleRadius: 18,
                    circleColor: '#10B981',
                    circleOpacity: ['get', 'opacity'] as any,
                    circleStrokeWidth: 0,
                    circleBlur: 1.2,
                  }}
                />
              </MapboxGL.ShapeSource>
            )}
          </MapboxGL.MapView>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: 'rgba(16,185,129,0.7)' }]} />
            <Text style={styles.legendLabel}>Visited</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#E5E7EB' }]} />
            <Text style={styles.legendLabel}>Not Visited</Text>
          </View>
        </View>
      </View>

      {/* ── Top Countries ───────────────────────────────────────────── */}
      {topCountries.length > 0 && (
        <View style={[styles.card, { marginHorizontal: 16, marginBottom: 14 }]}>
          <Text style={styles.cardTitle}>Top Countries</Text>
          {topCountries.map(({ country, count, code }) => (
            <View key={country} style={styles.countryRow}>
              <CircleFlag countryCode={code} size={22} />
              <Text style={styles.countryName} numberOfLines={1}>{country}</Text>
              <View style={styles.countryBarTrack}>
                <View style={[styles.countryBarFill, { width: `${(count / maxCountryCount) * 100}%` }]} />
              </View>
              <Text style={styles.countryCount}>
                {count} {count === 1 ? 'dest' : 'dests'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Countries explored ──────────────────────────────────────── */}
      <View style={[styles.card, { marginHorizontal: 16, marginBottom: 14 }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Countries Explored</Text>
          <Text style={styles.cardBadge}>{stats.totalCountries}/{TOTAL_COUNTRIES}</Text>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${(stats.totalCountries / TOTAL_COUNTRIES) * 100}%` as any }]} />
        </View>
        {stats.visitedCountryCodes.length > 0 && (
          <View style={styles.flagGrid}>
            {stats.visitedCountryCodes.map(code => (
              <View key={code} style={styles.flagItem}>
                <CircleFlag countryCode={code} size={24} />
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
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
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  statItem:    { flex: 1, alignItems: 'center' },
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
  worldHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingBottom: 12,
  },
  worldTitle:    { fontSize: 17, fontWeight: '800', color: '#111827' },
  worldSub:      { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  worldPctBadge: { backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  worldPctText:  { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  mapWrap:       { overflow: 'hidden' },
  worldMap:      { height: 210, width: '100%' },
  legend: {
    flexDirection: 'row', gap: 16,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500' },

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
  progressBg:   { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 3 },

  // Flag grid
  flagGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flagItem:  { alignItems: 'center' },
});
