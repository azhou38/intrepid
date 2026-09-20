import React, { useEffect } from 'react';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { ImageProps } from 'react-native';

/**
 * Drop-in replacement for `Image` that cross-fades in once its data actually loads, instead of
 * popping in abruptly the frame a network-loaded header/hero photo arrives. Pass `instant` when
 * the source was already resolved before this ever mounted (e.g. a warm cache hit) — those
 * should appear immediately, not replay a fade the user never actually waited through.
 */
export default function FadeInImage({ instant, onLoad, style, ...rest }: ImageProps & { instant?: boolean }) {
  const opacity = useSharedValue(instant ? 1 : 0);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Failsafe: the fade is driven by onLoad, and if that event never arrives (a cached image
  // re-mounted while hidden, say) the photo would sit at opacity 0 over the dark placeholder for
  // good — the "header image turns black" bug. Fade in regardless after a moment.
  useEffect(() => {
    if (instant) return;
    const t = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Reanimated.Image
      {...rest}
      style={[style, animStyle]}
      onLoad={e => {
        if (!instant) opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
        onLoad?.(e);
      }}
    />
  );
}
