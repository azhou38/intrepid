import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import FadeInImage from './FadeInImage';
import { CARD_BOTTOM_H, GRADIENT_STOPS, styles } from './DestinationCard';
import type { Spot } from '../../data/spots';
import { useStore } from '../../store';
import { thumbCache, getOrFetchWikiThumbnail } from '../../utils/photoCache';

// Spot card for the destination sheet's Spots tab. Deliberately the same card as the destination
// cards in the country sheet — square, photo with the name in white serif over a bottom gradient,
// green Visited tag, a text area underneath, same border and shadow — and it borrows that card's
// styles directly rather than copying them, so the two can't drift apart. Where the destination
// card shows its reasons to visit below the photo, this shows the spot's description.
function SpotCard({ spot, onPress, width }: {
  spot: Spot;
  onPress: () => void;
  width: number;
}) {
  const isVisited = !!useStore(s => s.savedSpots[spot.id]);

  // Own cache key at 700px for the same reason DestinationCard has one: the bare `spot_<id>` key is
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
    getOrFetchWikiThumbnail(cacheKey, thumbCache, spot.name, 700).then(url => {
      if (url) setPhotoUrl(url);
    });
  }, [spot.id]);

  return (
    <Pressable style={[styles.card, { width }]} onPress={onPress}>
      <View style={styles.cardClip}>
        <View style={[styles.cardTop, { height: width - CARD_BOTTOM_H }]}>
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
                <SvgLinearGradient id={`spotCardGrad-${spot.id}`} x1="0" y1="0" x2="0" y2="1">
                  {GRADIENT_STOPS.map(({ offset, opacity }) => (
                    <Stop key={offset} offset={offset} stopColor="#000" stopOpacity={opacity} />
                  ))}
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#spotCardGrad-${spot.id})`} />
            </Svg>
          </View>
          <View pointerEvents="none" style={styles.cardImageInfo}>
            <Text style={styles.cardName} numberOfLines={2}>{spot.name}</Text>
          </View>
          {isVisited && (
            <View style={styles.cardVisitedTag}>
              <Check size={12} color="white" strokeWidth={3} />
              <Text style={styles.cardVisitedTagTxt}>Visited</Text>
            </View>
          )}
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.cardBlurb} numberOfLines={3}>{spot.bio}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(SpotCard);
