import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';
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
  focusY, frame,
}: {
  cacheKey: string;                                   // identifies the entity (and is the photoCache key)
  cache: Map<string, string>;
  load: () => Promise<string | null>;                 // resolves the URL (and fills `cache`) when it isn't cached
  instant?: boolean;                                  // force no fade-in (e.g. a strip that only ever shows a warm photo)
  scrim?: string;                                     // colour of a dark overlay drawn only while there's a photo
  placeholderColor?: string;                          // solid fill while there's no photo yet
  resizeMode?: 'cover' | 'contain';
  style?: StyleProp<ImageStyle>;
  // Vertical framing of a 'cover' crop, for a photo taller than its frame: 0 keeps its top in view, 1 its bottom,
  // 0.5 (the default, what plain 'cover' does) its middle. Needs `frame`, the box the photo fills, to place it.
  // The photo waits for its own dimensions before appearing, so it never jumps from centred to framed.
  focusY?: number;
  frame?: { w: number; h: number };
}) {
  const cached = cache.get(cacheKey) ?? null;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const url = cached ?? (loaded?.key === cacheKey ? loaded.url : null);

  // Was this entity's photo already cached the moment it became current? A cache hit should appear immediately,
  // not replay a fade the user never waited through. Recomputed (idempotently) whenever the entity changes.
  const meta = useRef({ key: cacheKey, hit: cached !== null });
  if (meta.current.key !== cacheKey) meta.current = { key: cacheKey, hit: cached !== null };

  const framed = focusY !== undefined && !!frame;
  const [natural, setNatural] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!framed || !url || natural?.url === url) return;
    let stale = false;
    Image.getSize(url, (w, h) => { if (!stale) setNatural({ url, w, h }); }, () => {});
    return () => { stale = true; };
  }, [framed, url]);

  useEffect(() => {
    if (cache.has(cacheKey)) return;
    let stale = false;
    load().then(u => { if (!stale && u) setLoaded({ key: cacheKey, url: u }); });
    return () => { stale = true; };
  }, [cacheKey]);

  const placeholder = placeholderColor
    ? <View style={[StyleSheet.absoluteFill, { backgroundColor: placeholderColor }]} />
    : null;
  if (!url) return placeholder;

  // Framed: size the image to exactly the 'cover' size itself and offset it, so `focusY` picks which part of the
  // overflow stays in view (the frame's own overflow:'hidden' does the clipping).
  let imageStyle: StyleProp<ImageStyle> = style;
  if (framed) {
    if (natural?.url !== url) return placeholder;
    const scale = Math.max(frame!.w / natural.w, frame!.h / natural.h);
    const w = natural.w * scale;
    const h = natural.h * scale;
    imageStyle = { position: 'absolute', width: w, height: h, left: (frame!.w - w) / 2, top: (frame!.h - h) * focusY! };
  }
  return (
    <>
      {/* keyed by entity: a fresh instance (and fresh fade state) per photo, never one image swapped in place */}
      <FadeInImage key={cacheKey} instant={instant ?? meta.current.hit} source={{ uri: url }} style={imageStyle} resizeMode={resizeMode} />
      {scrim ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} /> : null}
    </>
  );
}
