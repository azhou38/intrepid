import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing, type SharedValue } from 'react-native-reanimated';
import type { ImageProps } from 'react-native';
import { subjectCoverRect, subjectCoverRectUI, type Subject } from '../../utils/subjectCrop';

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
// `frame`: the box this photo fills has a width that never changes and a height that animates between `fullH` and `minH`
// (a sheet's header while the sheet is dragged). The photo is then placed on the UI thread, in step with that height, and
// moves in a straight line from its full-height framing to its shortest framing (each the same 'cover' crop it gets at
// rest), instead of being re-fitted to a measured box a frame late at every step.
export type AnimatedFrame = { width: number; fullH: number; height: SharedValue<number>; minH: SharedValue<number> };

export default function FadeInImage({ instant, onLoad, style, subject, frame, ...rest }: ImageProps & { instant?: boolean; subject?: Subject; frame?: AnimatedFrame }) {
  if (frame) return <FramedImage instant={instant} onLoad={onLoad} style={style} subject={subject} frame={frame} {...rest} />;
  return <BoxImage instant={instant} onLoad={onLoad} style={style} subject={subject} {...rest} />;
}

function FramedImage({ instant, onLoad, style, subject, frame, ...rest }: ImageProps & { instant?: boolean; subject?: Subject; frame: AnimatedFrame }) {
  const opacity = useSharedValue(0);
  const naturalW = useSharedValue(0), naturalH = useSharedValue(0);
  const sx = subject?.x ?? 0.5, sy = subject?.y ?? 0.5, zoom = subject?.zoom ?? 1;
  const show = () => { opacity.value = instant ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }); };
  useEffect(() => { const t = setTimeout(show, 1500); return () => clearTimeout(t); }, []);   // failsafe, as in BoxImage
  const animStyle = useAnimatedStyle(() => {
    const nw = naturalW.value, nh = naturalH.value;
    if (!nw || !nh) return { position: 'absolute', left: 0, top: 0, width: frame.width, height: frame.fullH, opacity: opacity.value };
    const minH = Math.min(frame.minH.value, frame.fullH);
    const a = subjectCoverRectUI(frame.width, frame.fullH, nw, nh, sx, sy, zoom);
    const b = subjectCoverRectUI(frame.width, minH, nw, nh, sx, sy, zoom);
    const span = frame.fullH - minH;
    const p = span > 0 ? Math.max(0, Math.min(1, (frame.fullH - frame.height.value) / span)) : 0;
    return {
      position: 'absolute',
      left: a.left + (b.left - a.left) * p, top: a.top + (b.top - a.top) * p,
      width: a.width + (b.width - a.width) * p, height: a.height + (b.height - a.height) * p,
      opacity: opacity.value,
    };
  });
  return (
    <View style={[style as any, { overflow: 'hidden' }]} pointerEvents="none">
      <Reanimated.Image
        {...rest}
        resizeMode="cover"
        style={animStyle}
        onLoad={e => {
          const src = e.nativeEvent?.source;
          if (src?.width && src?.height) { naturalW.value = src.width; naturalH.value = src.height; }
          show();
          onLoad?.(e);
        }}
      />
    </View>
  );
}

function BoxImage({ instant, onLoad, style, subject, ...rest }: ImageProps & { instant?: boolean; subject?: Subject }) {
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
