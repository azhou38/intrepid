import React, { useMemo } from 'react';
import EntityPhoto from './Map/EntityPhoto';
import { DESTINATIONS } from '../data/destinations';
import { photoCache, getOrFetchWikiThumbnail, HEADER_PX } from '../utils/photoCache';
import { photoSubject } from '../utils/subjectCrop';

// A country's photo: the same image (and cache key) as its country sheet's header, its top destination's photo.
export default function CountryPhoto({ code, name }: { code: string; name: string }) {
  const top = useMemo(() => DESTINATIONS.filter(d => d.countryCode === code).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))[0], [code]);
  const key = `country_${code}`;
  return (
    <EntityPhoto
      cacheKey={key}
      cache={photoCache}
      load={() => (top ? getOrFetchWikiThumbnail(key, photoCache, top.name, HEADER_PX, name) : getOrFetchWikiThumbnail(key, photoCache, name, HEADER_PX))}
      subject={top ? photoSubject(top.name) : undefined}
      placeholderColor="#E5E7EB"
    />
  );
}
