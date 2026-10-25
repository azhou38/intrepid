import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions, Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MapboxGL from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useStats, useVisitIndex } from '../store';
import { DESTINATIONS } from '../data/destinations';
import { SPOTS } from '../data/spots';
import CircleFlag from '../components/CircleFlag';

const TOTAL_COUNTRIES = 195;
// My World's map: the card's width (the screen less its 16 pt margins) and height, and the scale from Mapbox's 512 pt world.
const WORLD_W = Dimensions.get('window').width - 32;
const WORLD_H = Math.round(WORLD_W * 0.6);
const WORLD_SCALE = WORLD_W / 512;

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

  // My World shows one level at a time: the visited countries filled in, or a dot per visited destination or spot.
  const [worldMode, setWorldMode] = useState<WorldMode>('countries');
  const visitedCountryCodes = useMemo(() => [...visitIndex.visitedCountryCodes], [visitIndex]);
  const visitedSpots = useMemo(() => SPOTS.filter(sp => visitIndex.isSpotVisited(sp.id)), [visitIndex]);
  const pointsGeoJSON = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: (worldMode === 'spots' ? visitedSpots : worldMode === 'destinations' ? visitedDests : []).map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.coordinates.longitude, p.coordinates.latitude] },
      properties: {},
    })),
  }), [worldMode, visitedSpots, visitedDests]);

  const worldBadge = worldMode === 'countries' ? `${stats.totalCountries} / ${TOTAL_COUNTRIES}`
    : worldMode === 'destinations' ? `${visitedDests.length} / ${DESTINATIONS.length}`
    : `${visitedSpots.length} / ${SPOTS.length}`;

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
        {/* Which level the map shows (countries, destinations or spots), and how many of them are visited. */}
        <View style={styles.worldHeader}>
          <View style={styles.worldToggle}>
            {WORLD_MODES.map(({ mode, label }) => {
              const on = worldMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[styles.worldToggleBtn, on && styles.worldToggleBtnOn]}
                  onPress={() => { if (!on) { Haptics.selectionAsync(); setWorldMode(mode); } }}
                  hitSlop={4}
                >
                  <Text style={[styles.worldToggleTxt, on && styles.worldToggleTxtOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View pointerEvents="none" style={styles.mapWrap}>
          <MapboxGL.MapView
            style={styles.worldMap}
            styleURL={MapboxGL.StyleURL.Light}
            projection="mercator"
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
              defaultSettings={{ centerCoordinate: [0, 12], zoomLevel: 0 }}
              animationDuration={0}
            />
            {/* Countries: each visited country filled in (one worldview, so disputed areas are not drawn twice). */}
            {worldMode === 'countries' && visitedCountryCodes.length > 0 && (
              <MapboxGL.VectorSource id="worldCountries" url="mapbox://mapbox.country-boundaries-v1">
                <MapboxGL.FillLayer
                  id="worldCountryFill"
                  sourceLayerID="country_boundaries"
                  filter={['all',
                    ['in', ['get', 'iso_3166_1'], ['literal', visitedCountryCodes]],
                    ['match', ['get', 'worldview'], ['all', 'US'], true, false]] as any}
                  style={{ fillColor: '#10B981', fillOpacity: 0.55 }}
                />
                <MapboxGL.LineLayer
                  id="worldCountryLine"
                  sourceLayerID="country_boundaries"
                  filter={['all',
                    ['in', ['get', 'iso_3166_1'], ['literal', visitedCountryCodes]],
                    ['match', ['get', 'worldview'], ['all', 'US'], true, false]] as any}
                  style={{ lineColor: '#059669', lineWidth: 0.6 }}
                />
              </MapboxGL.VectorSource>
            )}
            {/* Destinations or spots: a dot at each one visited (spots smaller, as there are more of them). */}
            {worldMode !== 'countries' && pointsGeoJSON.features.length > 0 && (
              <MapboxGL.ShapeSource id="worldPoints" shape={pointsGeoJSON}>
                <MapboxGL.CircleLayer
                  id="worldPointDots"
                  style={{
                    circleRadius: worldMode === 'spots' ? 3 : 4.5,
                    circleColor: '#10B981',
                    circleStrokeColor: 'white',
                    circleStrokeWidth: worldMode === 'spots' ? 1 : 1.5,
                  }}
                />
              </MapboxGL.ShapeSource>
            )}
          </MapboxGL.MapView>
          {/* How many of this level are visited, over the map's top-right corner. */}
          <View style={styles.worldPctBadge}>
            <Text style={styles.worldPctText}>{worldBadge}</Text>
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
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, paddingBottom: 12,
  },
  worldPctBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  worldPctText:  { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  // The whole world, flat: at zoom 0 Mapbox draws it 512 pt wide (the narrowest it goes), wider than the card, so the map
  // is laid out at that width and scaled down to the card's (a globe showed only one side of the Earth).
  mapWrap:       { overflow: 'hidden', height: WORLD_H },
  worldMap:      {
    width: 512, height: WORLD_H / WORLD_SCALE,
    marginLeft: (WORLD_W - 512) / 2, marginTop: (WORLD_H - WORLD_H / WORLD_SCALE) / 2,
    transform: [{ scale: WORLD_SCALE }],
  },
  // Countries · Destinations · Spots: a segmented toggle under the heading.
  worldToggle: {
    flex: 1, flexDirection: 'row', padding: 3,
    backgroundColor: '#F3F4F6', borderRadius: 10,
  },
  worldToggleBtn:    { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  worldToggleBtnOn:  { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  worldToggleTxt:    { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  worldToggleTxtOn:  { color: '#111827' },

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
