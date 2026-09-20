import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import CircleFlag from '../CircleFlag';
import { DESTINATIONS } from '../../data/destinations';
import { SPOTS, type Spot } from '../../data/spots';
import type { Destination } from '../../types';
import { thumbCache, fetchWikiThumbnail } from '../../utils/photoCache';

// Default (empty-field) text for both search bars — states the size of the catalog instead of
// a generic prompt. Static data, so computed once.
const COUNTRY_COUNT = new Set(DESTINATIONS.map(d => d.countryCode)).size;
export const SEARCH_PLACEHOLDER =
  `Search ${COUNTRY_COUNT} countries, ${DESTINATIONS.length} destinations, ${SPOTS.length} spots`;

export type SearchResult =
  | { type: 'country';     country: string; countryCode: string }
  | { type: 'destination'; destination: Destination }
  | { type: 'spot';        spot: Spot; destination: Destination };

// Shared by the map's own search bar and the Explore sheet's inline one, so both always
// return identical results for the same query.
export function computeSearchResults(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // Suggestions shown before typing anything — the highest-ranked (most popular)
    // destinations, so there's always something useful to tap into instead of an empty list.
    return [...DESTINATIONS]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10)
      .map((destination): SearchResult => ({ type: 'destination', destination }));
  }
  const results: SearchResult[] = [];

  const seenCountries = new Set<string>();
  for (const d of DESTINATIONS) {
    if (!seenCountries.has(d.countryCode) && d.country.toLowerCase().includes(q)) {
      seenCountries.add(d.countryCode);
      results.push({ type: 'country', country: d.country, countryCode: d.countryCode });
    }
  }
  for (const d of DESTINATIONS) {
    if (d.name.toLowerCase().includes(q)) results.push({ type: 'destination', destination: d });
  }
  for (const s of SPOTS) {
    if (s.name.toLowerCase().includes(q)) {
      const dest = DESTINATIONS.find(d => d.id === s.destinationId);
      if (dest) results.push({ type: 'spot', spot: s, destination: dest });
    }
  }
  return results.slice(0, 10);
}

// Rounded-square header-image thumbnail for destination/spot rows, falling back to the emoji
// while the image is loading or if none was found.
function SearchResultThumb({ name, icon, cacheKey, size }: {
  name: string; icon: string; cacheKey: string; size: number;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  useEffect(() => {
    if (thumbCache.has(cacheKey)) { setPhotoUrl(thumbCache.get(cacheKey)!); return; }
    setPhotoUrl(null);
    fetchWikiThumbnail(name, 120).then(url => {
      if (url) { thumbCache.set(cacheKey, url); setPhotoUrl(url); }
    });
  }, [cacheKey, name]);

  return (
    <View style={[st.thumb, { width: size, height: size, borderRadius: size * 0.28 }]}>
      {photoUrl
        ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
        : <Text style={{ fontSize: size * 0.55 }}>{icon}</Text>}
    </View>
  );
}

// The rows only (header / empty state / items) — the caller supplies the scrolling container,
// since the map's dropdown and the sheet's full-screen list scroll and are styled differently.
export function SearchResultRows({ query, results, onSelect }: {
  query: string;
  results: SearchResult[];
  onSelect: (item: SearchResult) => void;
}) {
  const hasQuery = query.trim().length > 0;
  return (
    <>
      {!hasQuery && <Text style={st.header}>Suggested</Text>}
      {hasQuery && results.length === 0 && <Text style={st.noResults}>No results</Text>}
      {results.map((item, i) => {
        let icon: string | null, countryCode: string | null, label: string, sublabel: string, badge: string;
        let thumbName: string | null = null, thumbKey: string | null = null;
        if (item.type === 'country') {
          icon = null; countryCode = item.countryCode; label = item.country; sublabel = ''; badge = 'Country';
        } else if (item.type === 'destination') {
          icon = item.destination.icon ?? '📍'; countryCode = null; label = item.destination.name;
          sublabel = item.destination.country; badge = 'Destination';
          thumbName = item.destination.name; thumbKey = item.destination.id;
        } else {
          icon = item.spot.icon; countryCode = null; label = item.spot.name;
          sublabel = item.destination.name; badge = 'Spot';
          thumbName = item.spot.name; thumbKey = `spot_${item.spot.id}`;
        }
        return (
          <Pressable
            key={i}
            style={[st.item, i === results.length - 1 && { borderBottomWidth: 0 }]}
            onPress={() => onSelect(item)}
          >
            {countryCode
              ? <CircleFlag countryCode={countryCode} size={22} />
              : <SearchResultThumb name={thumbName!} icon={icon ?? '📍'} cacheKey={thumbKey!} size={30} />}
            <View style={{ flex: 1 }}>
              <Text style={st.label} numberOfLines={1}>{label}</Text>
              {sublabel ? <Text style={st.sub} numberOfLines={1}>{sublabel}</Text> : null}
            </View>
            <Text style={st.badge}>{badge}</Text>
          </Pressable>
        );
      })}
    </>
  );
}

const st = StyleSheet.create({
  thumb: { overflow: 'hidden', backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  header: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  noResults: {
    fontSize: 14, color: '#9CA3AF', textAlign: 'center',
    paddingHorizontal: 14, paddingVertical: 24,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  sub:   { fontSize: 12, color: '#6B7280', marginTop: 1 },
  badge: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
});
