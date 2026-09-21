import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';
import FadeInImage from './FadeInImage';

// A photo that always belongs to the entity it was asked about.
//
// The sheets used to keep the photo URL as their own state, filled in by an effect that ran AFTER the render in
// which the selected entity changed, with an async result that nothing cancelled. That allowed two wrong
// pictures: for at least one render after switching from A to B the sheet showed B's name over A's photo, and if
// A's request resolved after the switch it overwrote whatever B was showing (a cache hit for B fetches nothing,
// so nothing would ever correct it). It also meant every photo arrival re-rendered the whole sheet, in the middle
// of whatever position animation was running.
//
// Here the URL is derived during render from the entity's own cache key, so it can only ever be that entity's
// URL or nothing; a request that outlives its entity is dropped by the effect's cleanup; and the state lives in
// this small component, so a photo arriving re-renders only the photo, never the sheet around it.
export default function EntityPhoto({
  cacheKey, cache, load, instant, scrim, placeholderColor, resizeMode = 'cover', style = StyleSheet.absoluteFill,
}: {
  cacheKey: string;                                   // identifies the entity (and is the photoCache key)
  cache: Map<string, string>;
  load: () => Promise<string | null>;                 // resolves the URL (and fills `cache`) when it isn't cached
  instant?: boolean;                                  // force no fade-in (e.g. a strip that only ever shows a warm photo)
  scrim?: string;                                     // colour of a dark overlay drawn only while there's a photo
  placeholderColor?: string;                          // solid fill while there's no photo yet
  resizeMode?: 'cover' | 'contain';
  style?: StyleProp<ImageStyle>;
}) {
  const cached = cache.get(cacheKey) ?? null;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const url = cached ?? (loaded?.key === cacheKey ? loaded.url : null);

  // Was this entity's photo already cached the moment it became current? A cache hit should appear immediately,
  // not replay a fade the user never waited through. Recomputed (idempotently) whenever the entity changes.
  const meta = useRef({ key: cacheKey, hit: cached !== null });
  if (meta.current.key !== cacheKey) meta.current = { key: cacheKey, hit: cached !== null };

  useEffect(() => {
    if (cache.has(cacheKey)) return;
    let stale = false;
    load().then(u => { if (!stale && u) setLoaded({ key: cacheKey, url: u }); });
    return () => { stale = true; };
  }, [cacheKey]);

  if (!url) {
    return placeholderColor ? <View style={[StyleSheet.absoluteFill, { backgroundColor: placeholderColor }]} /> : null;
  }
  return (
    <>
      {/* keyed by entity: a fresh instance (and fresh fade state) per photo, never one image swapped in place */}
      <FadeInImage key={cacheKey} instant={instant ?? meta.current.hit} source={{ uri: url }} style={style} resizeMode={resizeMode} />
      {scrim ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} /> : null}
    </>
  );
}
