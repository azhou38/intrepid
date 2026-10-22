import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, type ImageProps } from 'react-native';
import { subjectCoverRect, type Subject } from '../../utils/subjectCrop';

/**
 * Photo for the map pins: fades in over the pin's placeholder once loaded (or shows at once when
 * `instant`). Deliberately built on core Animated, NOT Reanimated like FadeInImage: pins render
 * inside Mapbox MarkerViews, which are re-parented into the map's own native container, and a
 * Reanimated animated style there never got applied — the photo stayed at opacity 0 and the pin
 * read as a black disc. Core Animated works there (FadePin, which fades the pins themselves, is
 * the same mechanism).
 *
 * `subject` keeps the photo's subject in the middle of the round crop, as FadeInImage does (utils/subjectCrop); the photo
 * stays hidden until it can be placed.
 */
// Natural sizes of photos that have already loaded once. A pin photo that is re-created (the selected spot's on-top copy is
// re-mounted whenever the set of spot pins changes) can then place itself on its first frame, instead of sitting hidden
// behind its grey placeholder until it has been laid out and measured again.
const naturalSizes = new Map<string, { w: number; h: number }>();
const uriOf = (source: ImageProps['source']) => (source && !Array.isArray(source) && typeof source === 'object' && 'uri' in source ? (source as { uri?: string }).uri : undefined);

export default function PinPhoto({ instant, onLoad, style, subject, boxSize, ...rest }: ImageProps & { instant?: boolean; subject?: Subject; boxSize?: number }) {
  const uri = uriOf(rest.source);
  const knownNatural = uri ? naturalSizes.get(uri) ?? null : null;
  const [box, setBox] = useState<{ w: number; h: number } | null>(boxSize ? { w: boxSize, h: boxSize } : null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(knownNatural);
  const opacity = useRef(new Animated.Value(instant && (!subject || (!!knownNatural && !!boxSize)) ? 1 : 0)).current;
  const placed = !!subject && !!box && !!natural;
  useEffect(() => { if (placed) { if (instant) opacity.setValue(1); else fadeIn(); } }, [placed]);
  // On finish, sync the settled value back to JS: a native-driven animation leaves the JS-side value at 0, and the next
  // React re-render would otherwise re-apply that, hiding the photo again (see FadePin in MapScreen).
  const fadeIn = () => Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true })
    .start(({ finished }) => { if (finished) opacity.setValue(1); });

  // Failsafe if onLoad never fires, so a photo can't stay hidden behind its placeholder.
  useEffect(() => {
    if (instant && !subject) return;
    const t = setTimeout(fadeIn, 1500);
    return () => clearTimeout(t);
  }, []);

  if (!subject) {
    return (
      <Animated.Image
        {...rest}
        style={[style, { opacity }]}
        onLoad={e => { if (!instant) fadeIn(); onLoad?.(e); }}
      />
    );
  }
  return (
    <View style={[style as any, { overflow: 'hidden' }]} onLayout={ev => setBox({ w: ev.nativeEvent.layout.width, h: ev.nativeEvent.layout.height })}>
      <Animated.Image
        {...rest}
        resizeMode="cover"
        style={[placed ? subjectCoverRect(box!.w, box!.h, natural!.w, natural!.h, subject) : StyleSheet.absoluteFill, { opacity }]}
        onLoad={e => {
          const src = (e.nativeEvent as any)?.source;
          if (src?.width && src?.height) { if (uri) naturalSizes.set(uri, { w: src.width, h: src.height }); setNatural({ w: src.width, h: src.height }); } else fadeIn();
          onLoad?.(e);
        }}
      />
    </View>
  );
}
