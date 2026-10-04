import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import CircleFlag from '../CircleFlag';
import FadeInImage from './FadeInImage';
import type { Destination } from '../../types';
import { thumbCache, getOrFetchWikiThumbnail } from '../../utils/photoCache';
import { useDestinationClimate } from '../../utils/climateApi';
import { formatBestMonthsShort } from '../../utils/travelData';

// Text area under the image, sized for the wrapped reasons.
export const CARD_BOTTOM_H = 58;
// Default (Explore feed) size: image area + text area, i.e. a 192px square.
export const DEST_CARD_W = 134 + CARD_BOTTOM_H;

// Bottom scrim behind the white name/country text. Gentler curve than the spot cards' (1.3,
// not 1.8) so it's already fairly dark where the text sits, rather than only at the very edge.
export const GRADIENT_STOPS = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return { offset: t, opacity: +(t ** 1.3 * 0.9).toFixed(4) };
});

// Destination card, shared by the Explore feed and the country sheet's Destinations tab: photo
// with name + country overlaid in white, up to three reasons to visit below.
function DestinationCard({ dest, isVisited, onPress, width = DEST_CARD_W, showCountry = true, showHighlights = true }: {
  dest: Destination;
  isVisited: boolean;
  onPress: () => void;
  // Card is always square: the image takes whatever height the fixed-size text area leaves
  // (or the full card, once showHighlights is off — see its own comment).
  width?: number;
  // Off where the country is already obvious from context (the country sheet's own list).
  showCountry?: boolean;
  // Off for the country sheet's own grid: with no reasons-to-visit text, there's no need to
  // reserve CARD_BOTTOM_H for it, so the photo fills the entire square card instead of just
  // its top portion.
  showHighlights?: boolean;
}) {
  // Own cache key, not the bare dest.id: thumbCache is shared with the map pins and search
  // results, which fetch the same destination at ~120px — whichever loaded first left a tiny
  // image under the shared key, and this card (~190pt wide, so ~570px on a 3x screen) then
  // showed it stretched, hence the blur. Also fetched larger than before (was 400px, under 1x
  // of what a 3x screen needs at this width).
  const cacheKey = `destcard_${dest.id}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  const photoWasCachedRef = useRef(thumbCache.has(cacheKey));

  // Best months come from the same real-vs-synthetic climate data the destination sheet's own
  // "when to visit" card uses, so the two can never disagree.
  const { crowds: crowdData } = useDestinationClimate(dest);
  const bestMonths = useMemo(
    () => formatBestMonthsShort(crowdData.map((c, i) => (c.isBest ? i : -1)).filter(i => i >= 0)),
    [crowdData],
  );

  useEffect(() => {
    if (thumbCache.has(cacheKey)) {
      photoWasCachedRef.current = true;
      setPhotoUrl(thumbCache.get(cacheKey)!);
      return;
    }
    photoWasCachedRef.current = false;
    setPhotoUrl(null);
    getOrFetchWikiThumbnail(cacheKey, thumbCache, dest.name, 960).then(url => {
      if (url) setPhotoUrl(url);
    });
  }, [dest.id]);

  return (
    // Shadow color reflects visited status — same green as the "Visited" tag itself when
    // visited, a neutral gray/black otherwise (shadowOpacity bumped up a bit for the colored
    // case, since a tinted shadow reads fainter than a plain black one at the same opacity).
    <Pressable
      style={[
        styles.card,
        { width },
        isVisited
          ? { shadowColor: '#059669', shadowOpacity: 0.28 }
          : { shadowColor: '#6B7280', shadowOpacity: 0.40 },
      ]}
      onPress={onPress}
    >
      {/* Border color matches the shadow's own visited-status tint above. */}
      <View style={[styles.cardClip, isVisited ? { borderColor: '#059669' } : { borderColor: '#9CA3AF' }]}>
      {/* Solid dark placeholder (no emoji) that the photo fades in over — same treatment as the
          spot cards. Name + country sit on the image in white, over a bottom gradient. */}
      <View style={[styles.cardTop, { height: showHighlights ? width - CARD_BOTTOM_H : width }]}>
        {photoUrl && (
          <FadeInImage
            instant={photoWasCachedRef.current}
            source={{ uri: photoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        )}
        <View pointerEvents="none" style={styles.cardGradWrap}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id={`destCardGrad-${dest.id}`} x1="0" y1="0" x2="0" y2="1">
                {GRADIENT_STOPS.map(({ offset, opacity }) => (
                  <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                ))}
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#destCardGrad-${dest.id})`} />
          </Svg>
        </View>
        <View pointerEvents="none" style={[styles.cardImageInfo, local.imageInfo]}>
          <Text style={styles.cardName}>{dest.name}</Text>
          {showCountry && (
            <View style={styles.cardCountryRow}>
              <CircleFlag countryCode={dest.countryCode} size={12} />
              <Text style={styles.cardCountry} numberOfLines={1}>{dest.country}</Text>
            </View>
          )}
          {/* Same text style, size and lift off the card's bottom edge as the spot cards' own
              visit-time line, so the two read as one consistent "meta" treatment. */}
          {!!bestMonths && (
            <Text style={[local.metaTxt, local.metaTxtSpacing]} numberOfLines={1}>Best: {bestMonths}</Text>
          )}
        </View>
        {isVisited && (
          <View style={styles.cardVisitedTag}>
            <Check size={12} color="white" strokeWidth={3} />
            <Text style={styles.cardVisitedTagTxt}>Visited</Text>
          </View>
        )}
      </View>
      {showHighlights && (
        <View style={styles.cardBottom}>
          {/* Reasons flow as one wrapping block, each followed by a small gray dot (except the
              last). The dot is an inline View so it can be centred against the text, and is
              glued to its phrase with a non-breaking space so a wrap never strands it at a
              line start. */}
          {!!dest.highlights?.length && (
            <Text style={styles.cardBlurb} numberOfLines={3}>
              {dest.highlights.map((h, i) => (
                <Text key={i}>
                  {h}
                  {i < dest.highlights!.length - 1 && (
                    <>
                      {'\u00A0\u2009'}
                      <View style={styles.cardSepBox}><View style={styles.cardSepDot} /></View>
                      {' \u2009'}
                    </>
                  )}
                </Text>
              ))}
            </Text>
          )}
        </View>
      )}
      </View>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  // Shadow lives on this outer view and the clipping on the inner one (cardClip): iOS drops a
  // shadow from any view that also has overflow:hidden, which is why the old single-view card
  // showed no visible edge.
  card: {
    backgroundColor: 'white', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  cardClip: {
    borderRadius: 16, overflow: 'hidden', backgroundColor: 'white',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  cardTop: {
    backgroundColor: '#111827',
    position: 'relative', overflow: 'hidden',
  },
  cardGradWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 },
  // Bottom-left overlay on the image itself, sitting on the gradient.
  cardImageInfo: { position: 'absolute', left: 10, right: 10, bottom: 8, gap: 3 },
  // Green "Visited" tag, top-right of the image — same design as the sheets' own.
  cardVisitedTag: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#059669', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  cardVisitedTagTxt: { fontSize: 11, fontWeight: '700', color: 'white' },
  cardBottom: { paddingHorizontal: 10, paddingVertical: 8, height: CARD_BOTTOM_H, justifyContent: 'flex-start' },
  cardName: {
    fontSize: 23, fontFamily: 'PlayfairDisplay_700Bold', color: 'white', lineHeight: 27,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  cardCountryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardCountry: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  cardBlurb: { fontSize: 12, lineHeight: 14, fontWeight: '500', color: '#374151' },
  // Inline views sit on the baseline by their bottom edge, so the box is taller than the dot
  // and centres it about 3.5px up — the middle of the lowercase letters.
  cardSepBox: { width: 3, height: 7, justifyContent: 'center' },
  cardSepDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#059669' },
});

// Matches the spot cards' own visit-time treatment exactly (same lift off the bottom edge, same
// text size/weight/shadow) so the two "meta" lines read as one consistent style across cards.
const local = StyleSheet.create({
  imageInfo: { bottom: 16 },
  metaTxt: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
  // A bit more room than cardImageInfo's own column gap (3) gives it from the country row above.
  metaTxtSpacing: { marginTop: 2 },
});

// Fifty of these sit in the Explore feed; re-rendering them (each draws an SVG gradient) on every
// unrelated parent render is wasted JS work. onPress is compared too — callers pass stable ones.
export default React.memo(DestinationCard);
