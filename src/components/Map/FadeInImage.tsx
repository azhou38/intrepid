import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { ImageProps } from 'react-native';
import { subjectCoverRect, type Subject } from '../../utils/subjectCrop';

/**
 * Drop-in replacement for `Image` that cross-fades in once its data actually loads, instead of
 * popping in abruptly the frame a network-loaded header/hero photo arrives. Pass `instant` when
 * the source was already resolved before this ever mounted (e.g. a warm cache hit) — those
 * should appear immediately, not replay a fade the user never actually waited through.
 *
 * `subject` (see utils/subjectCrop) places a 'cover' photo so its subject sits as near the middle of the box as the
 * photo allows, instead of the plain centre crop. The photo then stays hidden until both its own size and the box's
 * are known, so it never shows centred first and jumps.
 */
export default function FadeInImage({ instant, onLoad, style, subject, ...rest }: ImageProps & { instant?: boolean; subject?: Subject }) {
  const opacity = useSharedValue(instant && !subject ? 1 : 0);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const placed = !!subject && !!box && !!natural;

  const show = () => {
    opacity.value = instant ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  };
  // A subject photo appears only once it is placed (it is hidden until then even when `instant`).
  useEffect(() => { if (placed) show(); }, [placed]);

  // Failsafe: the fade is driven by onLoad, and if that event never arrives (a cached image
  // re-mounted while hidden, say) the photo would sit at opacity 0 over the dark placeholder for
  // good — the "header image turns black" bug. Fade in regardless after a moment.
  useEffect(() => {
    if (instant && !subject) return;
    const t = setTimeout(show, 1500);
    return () => clearTimeout(t);
  }, []);

  const handleLoad: ImageProps['onLoad'] = e => {
    if (subject) {
      const src = e.nativeEvent?.source;
      if (src?.width && src?.height) setNatural({ w: src.width, h: src.height });
      else show();
    } else if (!instant) show();
    onLoad?.(e);
  };

  if (!subject) {
    return <Reanimated.Image {...rest} style={[style, animStyle]} onLoad={handleLoad} />;
  }
  return (
    <View
      style={[style as any, { overflow: 'hidden' }]}
      pointerEvents="none"
      onLayout={ev => { const { width, height } = ev.nativeEvent.layout; setBox({ w: width, h: height }); }}
    >
      <Reanimated.Image
        {...rest}
        resizeMode="cover"
        style={[placed ? subjectCoverRect(box!.w, box!.h, natural!.w, natural!.h, subject) : StyleSheet.absoluteFill, animStyle]}
        onLoad={handleLoad}
      />
    </View>
  );
}
