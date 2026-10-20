import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';
import FadeInImage from './FadeInImage';
import type { Subject } from '../../utils/subjectCrop';

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
  subject, fallback,
}: {
  cacheKey: string;                                   // identifies the entity (and is the photoCache key)
  cache: Map<string, string>;
  load: () => Promise<string | null>;                 // resolves the URL (and fills `cache`) when it isn't cached
  instant?: boolean;                                  // force no fade-in (e.g. a strip that only ever shows a warm photo)
  scrim?: string;                                     // colour of a dark overlay drawn only while there's a photo
  placeholderColor?: string;                          // solid fill while there's no photo yet
  resizeMode?: 'cover' | 'contain';
  style?: StyleProp<ImageStyle>;
  // Where the photo's subject sits (utils/subjectCrop): the 'cover' crop is placed to keep it near the middle.
  subject?: Subject;
  // Shown (instead of the plain placeholder) once the load has settled with NO photo at all: the place is deliberately photoless.
  fallback?: React.ReactNode;
}) {
  const cached = cache.get(cacheKey) ?? null;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const [noneKey, setNoneKey] = useState<string | null>(null);
  const url = cached ?? (loaded?.key === cacheKey ? loaded.url : null);

  // Was this entity's photo already cached the moment it became current? A cache hit should appear immediately,
  // not replay a fade the user never waited through. Recomputed (idempotently) whenever the entity changes.
  const meta = useRef({ key: cacheKey, hit: cached !== null });
  if (meta.current.key !== cacheKey) meta.current = { key: cacheKey, hit: cached !== null };

  useEffect(() => {
    if (cache.has(cacheKey)) return;
    let stale = false;
    load().then(u => { if (stale) return; if (u) setLoaded({ key: cacheKey, url: u }); else setNoneKey(cacheKey); });
    return () => { stale = true; };
  }, [cacheKey]);

  const placeholder = placeholderColor
    ? <View style={[StyleSheet.absoluteFill, { backgroundColor: placeholderColor }]} />
    : null;
  if (!url) return fallback && noneKey === cacheKey ? <>{fallback}</> : placeholder;

  return (
    <>
      {/* keyed by entity: a fresh instance (and fresh fade state) per photo, never one image swapped in place */}
      <FadeInImage key={cacheKey} instant={instant ?? meta.current.hit} source={{ uri: url }} style={style} resizeMode={resizeMode} subject={resizeMode === 'cover' ? subject : undefined} />
      {scrim ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} /> : null}
    </>
  );
}
