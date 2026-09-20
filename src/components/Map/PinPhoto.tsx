import React, { useEffect, useRef } from 'react';
import { Animated, type ImageProps } from 'react-native';

/**
 * Photo for the map pins: fades in over the pin's placeholder once loaded (or shows at once when
 * `instant`). Deliberately built on core Animated, NOT Reanimated like FadeInImage: pins render
 * inside Mapbox MarkerViews, which are re-parented into the map's own native container, and a
 * Reanimated animated style there never got applied — the photo stayed at opacity 0 and the pin
 * read as a black disc. Core Animated works there (FadePin, which fades the pins themselves, is
 * the same mechanism).
 */
export default function PinPhoto({ instant, onLoad, style, ...rest }: ImageProps & { instant?: boolean }) {
  const opacity = useRef(new Animated.Value(instant ? 1 : 0)).current;
  const fadeIn = () => Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();

  // Failsafe if onLoad never fires, so a photo can't stay hidden behind its placeholder.
  useEffect(() => {
    if (instant) return;
    const t = setTimeout(fadeIn, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.Image
      {...rest}
      style={[style, { opacity }]}
      onLoad={e => { if (!instant) fadeIn(); onLoad?.(e); }}
    />
  );
}
