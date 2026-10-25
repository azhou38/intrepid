import React, { useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleFlag from './CircleFlag';
import type { Destination } from '../types';
import type { Spot } from '../data/spots';

// The Profile tab's My World map, opened full screen to explore: pinch to zoom, drag to pan, and tap a highlighted country
// (or, on Destinations and Spots, a dot) for a small card with its name. Deliberately simple next to the Explore tab: no
// sheets, no pins with photos, no rotation or tilt.

export type WorldLevel = 'countries' | 'destinations' | 'spots';
const LEVELS: { level: WorldLevel; label: string }[] = [
  { level: 'countries', label: 'Countries' },
  { level: 'destinations', label: 'Destinations' },
  { level: 'spots', label: 'Spots' },
];

type Picked =
  | { kind: 'country'; code: string; name: string; dests: number; spots: number }
  | { kind: 'place'; name: string; sub: string; code?: string };

export default function WorldMapModal({
  visible, onClose, level, onLevelChange, visitedCountryCodes, countryName, dests, spots, countsByCountry,
}: {
  visible: boolean;
  onClose: () => void;
  level: WorldLevel;
  onLevelChange: (l: WorldLevel) => void;
  visitedCountryCodes: string[];
  countryName: (code: string) => string;
  dests: Destination[];
  spots: { spot: Spot; country: string; countryCode?: string }[];
  countsByCountry: Map<string, { dests: number; spots: number }>;
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapboxGL.MapView>(null);
  const [picked, setPicked] = useState<Picked | null>(null);

  const points = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: level === 'destinations'
      ? dests.map(d => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [d.coordinates.longitude, d.coordinates.latitude] },
        properties: { name: d.name, sub: d.country, code: d.countryCode },
      }))
      : level === 'spots'
        ? spots.map(({ spot, country, countryCode }) => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: [spot.coordinates.longitude, spot.coordinates.latitude] },
          properties: { name: spot.name, sub: country, code: countryCode ?? '' },
        }))
        : [],
  }), [level, dests, spots]);

  // A tap: whatever highlighted feature is under the finger (a dot first, then a visited country), else nothing.
  const onMapPress = async (e: any) => {
    const x = e?.properties?.screenPointX, y = e?.properties?.screenPointY;
    if (x == null || y == null || !mapRef.current) { setPicked(null); return; }
    try {
      if (level !== 'countries') {
        const hit = await mapRef.current.queryRenderedFeaturesAtPoint([x, y], undefined, ['wmDots']);
        const f = hit?.features?.[0];
        if (f) {
          Haptics.selectionAsync();
          setPicked({ kind: 'place', name: f.properties?.name, sub: f.properties?.sub, code: f.properties?.code || undefined });
          return;
        }
      } else {
        const hit = await mapRef.current.queryRenderedFeaturesAtPoint([x, y], undefined, ['wmCountryFill']);
        const code = hit?.features?.[0]?.properties?.iso_3166_1 as string | undefined;
        if (code) {
          const n = countsByCountry.get(code) ?? { dests: 0, spots: 0 };
          Haptics.selectionAsync();
          setPicked({ kind: 'country', code, name: countryName(code), dests: n.dests, spots: n.spots });
          return;
        }
      }
    } catch { /* a failed query just clears the card */ }
    setPicked(null);
  };

  const close = () => { setPicked(null); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View style={st.root}>
        <MapboxGL.MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          styleURL={MapboxGL.StyleURL.Light}
          projection="mercator"
          rotateEnabled={false}
          pitchEnabled={false}
          logoEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
          attributionEnabled={false}
          // No double-tap zoom: with it, every tap waited to see if a second followed (~0.3 s) before the map reported it,
          // so tapping a country or dot lagged. Pinch still zooms.
          gestureSettings={{ doubleTapToZoomInEnabled: false, doubleTouchToZoomOutEnabled: false }}
          onPress={onMapPress}
        >
          <MapboxGL.Camera defaultSettings={{ centerCoordinate: [10, 25], zoomLevel: 0.4 }} minZoomLevel={0} maxZoomLevel={9} animationDuration={0} />
          {level === 'countries' && visitedCountryCodes.length > 0 && (
            <MapboxGL.VectorSource id="wmCountries" url="mapbox://mapbox.country-boundaries-v1">
              <MapboxGL.FillLayer
                id="wmCountryFill"
                sourceLayerID="country_boundaries"
                filter={['all',
                  ['in', ['get', 'iso_3166_1'], ['literal', visitedCountryCodes]],
                  ['match', ['get', 'worldview'], ['all', 'US'], true, false]] as any}
                style={{ fillColor: '#10B981', fillOpacity: 0.55 }}
              />
              <MapboxGL.LineLayer
                id="wmCountryLine"
                sourceLayerID="country_boundaries"
                filter={['all',
                  ['in', ['get', 'iso_3166_1'], ['literal', visitedCountryCodes]],
                  ['match', ['get', 'worldview'], ['all', 'US'], true, false]] as any}
                style={{ lineColor: '#059669', lineWidth: 0.8 }}
              />
              {/* The tapped country, outlined more strongly (matches nothing while none is picked). */}
              <MapboxGL.LineLayer
                id="wmCountryPicked"
                sourceLayerID="country_boundaries"
                filter={['all',
                  ['==', ['get', 'iso_3166_1'], picked?.kind === 'country' ? picked.code : '__none__'],
                  ['match', ['get', 'worldview'], ['all', 'US'], true, false]] as any}
                style={{ lineColor: '#047857', lineWidth: 2.5 }}
              />
            </MapboxGL.VectorSource>
          )}
          {level !== 'countries' && (
            <MapboxGL.ShapeSource id="wmPoints" shape={points}>
              <MapboxGL.CircleLayer
                id="wmDots"
                style={{
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 0, level === 'spots' ? 3 : 4, 8, level === 'spots' ? 7 : 9] as any,
                  circleColor: '#10B981', circleStrokeColor: 'white', circleStrokeWidth: 1.5,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
        </MapboxGL.MapView>

        {/* Top: close, and the same level selector as the card. */}
        <View style={[st.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable style={st.closeBtn} onPress={close} hitSlop={8} accessibilityLabel="Close map">
            <X size={18} color="#111827" strokeWidth={2.5} />
          </Pressable>
          <View style={st.levels}>
            {LEVELS.map(({ level: l, label }) => {
              const on = l === level;
              return (
                <Pressable key={l} style={[st.levelBtn, on && st.levelBtnOn]} hitSlop={4}
                  onPress={() => { if (!on) { Haptics.selectionAsync(); setPicked(null); onLevelChange(l); } }}>
                  <Text style={[st.levelTxt, on && st.levelTxtOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* The tapped country or place. */}
        {picked && (
          <View style={[st.card, { bottom: insets.bottom + 16 }]}>
            {picked.kind === 'country' ? (
              <>
                <CircleFlag countryCode={picked.code} size={30} ring ringWidth={1.5} style={st.flagRing} />
                <View style={{ flex: 1 }}>
                  <Text style={st.cardTitle} numberOfLines={1}>{picked.name}</Text>
                  <Text style={st.cardSub} numberOfLines={1}>
                    {picked.dests} destination{picked.dests === 1 ? '' : 's'} · {picked.spots} spot{picked.spots === 1 ? '' : 's'} visited
                  </Text>
                </View>
              </>
            ) : (
              <>
                {!!picked.code && <CircleFlag countryCode={picked.code} size={30} ring ringWidth={1.5} style={st.flagRing} />}
                <View style={{ flex: 1 }}>
                  <Text style={st.cardTitle} numberOfLines={1}>{picked.name}</Text>
                  <Text style={st.cardSub} numberOfLines={1}>{picked.sub}</Text>
                </View>
              </>
            )}
            <Pressable onPress={() => setPicked(null)} hitSlop={8} accessibilityLabel="Dismiss">
              <X size={16} color="#9CA3AF" strokeWidth={2.5} />
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF2F6' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  levels: {
    flex: 1, flexDirection: 'row', padding: 3, backgroundColor: 'white', borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  levelBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  levelBtnOn: { backgroundColor: '#ECFDF5' },
  levelTxt: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  levelTxtOn: { color: '#047857' },
  card: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'white', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  flagRing: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
});
