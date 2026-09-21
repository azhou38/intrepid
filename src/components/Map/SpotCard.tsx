import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Check, Clock } from 'lucide-react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import FadeInImage from './FadeInImage';
import { GRADIENT_STOPS, styles } from './DestinationCard';
import { formatSpotCost, formatVisitTime, type Spot } from '../../data/spots';
import { useStore } from '../../store';
import { thumbCache, getOrFetchWikiThumbnail } from '../../utils/photoCache';

// Spot card for the destination sheet's Spots tab. Deliberately the same card as the destination
// cards in the country sheet — square, photo with the name in white serif over a bottom gradient,
// green Visited tag, same border and shadow — and it borrows that card's styles directly rather
// than copying them, so the two can't drift apart. Unlike the destination card, the photo fills the
// whole square: the name sits at the bottom of it with the time needed and the cost in smaller text
// underneath, all over the gradient.
function SpotCard({ spot, onPress, width }: {
  spot: Spot;
  onPress: () => void;
  width: number;
}) {
  const isVisited = !!useStore(s => s.savedSpots[spot.id]);

  // Own cache key at 960px (the sharpest step suited to a card) for the same reason DestinationCard has one: the bare `spot_<id>` key is
  // shared with smaller thumbnails elsewhere, and whichever loaded first would be stretched here.
  const cacheKey = `spotcard_${spot.id}`;
  const [photoUrl, setPhotoUrl] = useState<string | null>(thumbCache.get(cacheKey) ?? null);
  const photoWasCachedRef = useRef(thumbCache.has(cacheKey));

  useEffect(() => {
    if (thumbCache.has(cacheKey)) {
      photoWasCachedRef.current = true;
      setPhotoUrl(thumbCache.get(cacheKey)!);
      return;
    }
    photoWasCachedRef.current = false;
    setPhotoUrl(null);
    getOrFetchWikiThumbnail(cacheKey, thumbCache, spot.name, 960).then(url => {
      if (url) setPhotoUrl(url);
    });
  }, [spot.id]);

  return (
    <Pressable style={[styles.card, { width }]} onPress={onPress}>
      <View style={styles.cardClip}>
        <View style={[styles.cardTop, { height: width }]}>
          {photoUrl && (
            <FadeInImage
              instant={photoWasCachedRef.current}
              source={{ uri: photoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          )}
          <View pointerEvents="none" style={[styles.cardGradWrap, { height: 110 }]}>
            <Svg style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id={`spotCardGrad-${spot.id}`} x1="0" y1="0" x2="0" y2="1">
                  {GRADIENT_STOPS.map(({ offset, opacity }) => (
                    <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                  ))}
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#spotCardGrad-${spot.id})`} />
            </Svg>
          </View>
          <View pointerEvents="none" style={[styles.cardImageInfo, local.imageInfo]}>
            <Text style={styles.cardName} numberOfLines={2}>{spot.name}</Text>
            <View style={local.metaRow}>
              <Clock size={11} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
              <Text style={local.metaTxt}>{formatVisitTime(spot.visitHours)}</Text>
              <Text style={local.metaDot}>·</Text>
              <Text style={local.metaTxt}>{formatSpotCost(spot)}</Text>
            </View>
          </View>
          {isVisited && (
            <View style={styles.cardVisitedTag}>
              <Check size={12} color="white" strokeWidth={3} />
              <Text style={styles.cardVisitedTagTxt}>Visited</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const local = StyleSheet.create({
  // Lifted off the card's bottom edge so the name / time / cost block isn't cramped against it.
  imageInfo: { bottom: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
  metaDot: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
});

export default React.memo(SpotCard);
