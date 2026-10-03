import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import CircleFlag from '../CircleFlag';
import { DESTINATIONS } from '../../data/destinations';
import { SPOTS, type Spot } from '../../data/spots';
import type { Destination } from '../../types';
import type { VisitIndex } from '../../utils/visitStatus';
import type { RecentSearch } from '../../store';
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
// Results for a typed query. Empty for an empty query — what shows before typing is
// computeSuggestions' job.
export function computeSearchResults(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
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

// ── Suggestions (empty search field) ────────────────────────────────────────────────────────────
// Only ever shown when there's a reason for them — otherwise nothing, and the bar's placeholder does
// the talking. No generic "popular" list: most destinations share rank 1, so that list was really
// just the first entries of destinations.ts.
//   • Recent — places opened from search, newest first (persisted, see the store's recentSearches).
//   • On the map — what's in the current view, once the map is zoomed in past continent level:
//     destinations in view, or that view's spots once zoomed in to destination level. Unvisited
//     first, then the most prominent, then the closest to the centre of the view.
export type SearchSection = { kind: 'recent' | 'onMap'; title: string; items: SearchResult[] };

export type MapView = {
  latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number;
  zoom: number;
};

// Below this camera zoom the view spans a continent or more — "what's here" means nothing.
const ON_MAP_MIN_ZOOM = 4;
// At or past this zoom the view is a single destination's area, so suggest its spots instead.
const ON_MAP_SPOTS_ZOOM = 8;
const ON_MAP_MAX = 4;

const resultKey = (r: SearchResult) =>
  r.type === 'country' ? `country:${r.countryCode}` : r.type === 'destination' ? `destination:${r.destination.id}` : `spot:${r.spot.id}`;

// The stored form of a search result (see the store's RecentSearch).
export function toRecentSearch(item: SearchResult): RecentSearch {
  return item.type === 'country' ? { type: 'country', countryCode: item.countryCode }
    : item.type === 'destination' ? { type: 'destination', id: item.destination.id }
    : { type: 'spot', id: item.spot.id };
}

function resolveRecent(r: RecentSearch): SearchResult | null {
  if (r.type === 'country') {
    const d = DESTINATIONS.find(x => x.countryCode === r.countryCode);
    return d ? { type: 'country', country: d.country, countryCode: d.countryCode } : null;
  }
  if (r.type === 'destination') {
    const destination = DESTINATIONS.find(x => x.id === r.id);
    return destination ? { type: 'destination', destination } : null;
  }
  const spot = SPOTS.find(x => x.id === r.id);
  const destination = spot && DESTINATIONS.find(x => x.id === spot.destinationId);
  return spot && destination ? { type: 'spot', spot, destination } : null;
}

export function computeSuggestions({ recents, view, visitIndex }: {
  recents: RecentSearch[];
  view: MapView | null;
  visitIndex: VisitIndex;
}): SearchSection[] {
  const sections: SearchSection[] = [];

  const recentItems = recents.map(resolveRecent).filter((r): r is SearchResult => r !== null);
  if (recentItems.length) sections.push({ kind: 'recent', title: 'Recent', items: recentItems });

  if (view && view.zoom >= ON_MAP_MIN_ZOOM) {
    const listed = new Set(recentItems.map(resultKey));
    const inView = (c: { latitude: number; longitude: number }) =>
      Math.abs(c.latitude - view.latitude) <= view.latitudeDelta / 2
      && Math.abs(c.longitude - view.longitude) <= view.longitudeDelta / 2;
    const dist = (c: { latitude: number; longitude: number }) =>
      Math.hypot(c.latitude - view.latitude, (c.longitude - view.longitude) * Math.cos(view.latitude * Math.PI / 180));

    let items: SearchResult[];
    if (view.zoom >= ON_MAP_SPOTS_ZOOM) {
      items = SPOTS
        .filter(sp => inView(sp.coordinates))
        .sort((a, b) => Number(visitIndex.isSpotVisited(a.id)) - Number(visitIndex.isSpotVisited(b.id)) || dist(a.coordinates) - dist(b.coordinates))
        .map(spot => ({ spot, destination: DESTINATIONS.find(d => d.id === spot.destinationId) }))
        .filter((x): x is { spot: Spot; destination: Destination } => !!x.destination)
        .map(({ spot, destination }): SearchResult => ({ type: 'spot', spot, destination }));
    } else {
      const visited = (d: Destination) => visitIndex.isDestVisited(d.id);
      items = DESTINATIONS
        .filter(d => inView(d.coordinates))
        .sort((a, b) => Number(visited(a)) - Number(visited(b)) || a.rank - b.rank || dist(a.coordinates) - dist(b.coordinates))
        .map((destination): SearchResult => ({ type: 'destination', destination }));
    }
    items = items.filter(r => !listed.has(resultKey(r))).slice(0, ON_MAP_MAX);
    if (items.length) sections.push({ kind: 'onMap', title: 'On the map', items });
  }
  return sections;
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

// The rows only (section headers / empty state / items) — the caller supplies the scrolling container,
// since the map's dropdown and the sheet's full-screen list scroll and are styled differently. With a
// query, the matches; without one, the suggestion sections (which may be none at all).
export function SearchResultRows({ query, results, sections, onSelect, onClearRecent, onRemoveRecent }: {
  query: string;
  results: SearchResult[];
  sections: SearchSection[];
  onSelect: (item: SearchResult) => void;
  onClearRecent?: () => void;
  // Removes one place from Recent — each Recent row gets an X for it.
  onRemoveRecent?: (item: SearchResult) => void;
}) {
  const hasQuery = query.trim().length > 0;
  if (hasQuery) {
    return (
      <>
        {results.length === 0 && <Text style={st.noResults}>No results</Text>}
        {results.map((item, i) => (
          <SearchResultRow key={resultKey(item)} item={item} last={i === results.length - 1} onSelect={onSelect} />
        ))}
      </>
    );
  }
  return (
    <>
      {sections.map((section, si) => (
        <React.Fragment key={section.kind}>
          <View style={st.headerRow}>
            <Text style={st.header}>{section.title}</Text>
            {section.kind === 'recent' && onClearRecent && (
              <Pressable onPress={onClearRecent} hitSlop={8}>
                <Text style={st.clear}>Clear</Text>
              </Pressable>
            )}
          </View>
          {section.items.map((item, i) => (
            <SearchResultRow
              key={`${section.kind}-${resultKey(item)}`}
              item={item}
              last={si === sections.length - 1 && i === section.items.length - 1}
              onSelect={onSelect}
              onRemove={section.kind === 'recent' ? onRemoveRecent : undefined}
            />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}

function SearchResultRow({ item, last, onSelect, onRemove }: {
  item: SearchResult;
  last: boolean;
  onSelect: (item: SearchResult) => void;
  // Shown as an X after the type badge (Recent rows).
  onRemove?: (item: SearchResult) => void;
}) {
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
      style={[st.item, last && { borderBottomWidth: 0 }]}
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
      {onRemove && (
        <Pressable onPress={() => onRemove(item)} hitSlop={10} style={st.remove} accessibilityLabel={`Remove ${label} from recent searches`}>
          <X size={16} color="#9CA3AF" />
        </Pressable>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  thumb: { overflow: 'hidden', backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  header: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  clear: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
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
  // A little extra space between the badge and the X, beyond the row's own gap.
  remove: { marginLeft: 4 },
});
