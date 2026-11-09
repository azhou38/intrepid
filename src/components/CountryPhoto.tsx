import React, { useMemo } from 'react';
import EntityPhoto from './Map/EntityPhoto';
import { DESTINATIONS } from '../data/destinations';
import { photoCache, getOrFetchWikiThumbnail, HEADER_PX } from '../utils/photoCache';
import { photoSubject } from '../utils/subjectCrop';

// A photo grid tile's or list row's placeholder colour and its photo's fade-in (the Profile's Explored grids and lists).
export const GRID_PHOTO_BG = '#000000';
export const GRID_PHOTO_FADE_MS = 450;

// A country's photo: the same image (and cache key) as its country sheet's header, its top destination's photo.
// `dark`: on a photo grid tile or list row, a black placeholder and a slow fade-in, so the photo emerges rather than pops over grey.
export default function CountryPhoto({ code, name, dark }: { code: string; name: string; dark?: boolean }) {
  const top = useMemo(() => DESTINATIONS.filter(d => d.countryCode === code).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))[0], [code]);
  const key = `country_${code}`;
  return (
    <EntityPhoto
      cacheKey={key}
      cache={photoCache}
      load={() => (top ? getOrFetchWikiThumbnail(key, photoCache, top.name, HEADER_PX, name) : getOrFetchWikiThumbnail(key, photoCache, name, HEADER_PX))}
      subject={top ? photoSubject(top.name) : undefined}
      placeholderColor={dark ? GRID_PHOTO_BG : '#E5E7EB'}
      fadeMs={dark ? GRID_PHOTO_FADE_MS : undefined}
    />
  );
}
