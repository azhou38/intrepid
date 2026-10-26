import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AvatarCrop } from '../types';

export type { AvatarCrop };


// The photo's frame inside a circle `size` across, for a crop.
export function avatarImageFrame(crop: AvatarCrop, size: number) {
  const s = (size / Math.min(crop.w, crop.h)) * crop.z;
  const W = crop.w * s, H = crop.h * s;
  return { width: W, height: H, left: size / 2 - W / 2 + crop.fx * W, top: size / 2 - H / 2 + crop.fy * H };
}

const MAX_ZOOM = 5;

// The circular cropper: the photo behind a dark veil with a round window. Drag to move it, pinch to zoom; it always
// fills the circle. Choose returns the crop; Cancel returns nothing.
// `inline` draws it over the screen it sits in instead of presenting a modal, so it can appear at once, even while the
// system photo picker is still closing (a modal cannot be presented over a dismissing screen).
export default function CircleCropper({ uri, width, height, initial, inline, onDone, onCancel }: {
  uri: string | null; width: number; height: number; initial?: AvatarCrop | null; inline?: boolean;
  onDone: (crop: AvatarCrop) => void; onCancel: () => void;
}) {
  const win = useWindowDimensions();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const screenW = inline && box ? box.w : win.width, screenH = inline && box ? box.h : win.height;
  const insets = { ...useSafeAreaInsets() };
  if (inline) insets.top = 0;
  const D = screenW - 48;                         // the circle's diameter
  const cx = screenW / 2, cy = screenH / 2;       // its centre, mid-screen
  const base = D / Math.max(1, Math.min(width, height));

  const z = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0);
  const z0 = useSharedValue(1), tx0 = useSharedValue(0), ty0 = useSharedValue(0);
  // Each photo opens where it was last left (its saved crop), else filling the circle, centred.
  useEffect(() => {
    if (!uri) return;
    const c = initial && initial.w === width && initial.h === height ? initial : null;
    z.value = c?.z ?? 1;
    tx.value = c ? c.fx * width * base * c.z : 0;
    ty.value = c ? c.fy * height * base * c.z : 0;
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  const gesture = useMemo(() => {
    // Keeps the photo covering the circle: its edges never come inside it.
    const clamp = () => {
      'worklet';
      const W = width * base * z.value, H = height * base * z.value;
      const mx = Math.max(0, (W - D) / 2), my = Math.max(0, (H - D) / 2);
      tx.value = Math.min(mx, Math.max(-mx, tx.value));
      ty.value = Math.min(my, Math.max(-my, ty.value));
    };
    const pan = Gesture.Pan()
      .onStart(() => { tx0.value = tx.value; ty0.value = ty.value; })
      .onUpdate(e => { tx.value = tx0.value + e.translationX; ty.value = ty0.value + e.translationY; clamp(); });
    const pinch = Gesture.Pinch()
      .onStart(() => { z0.value = z.value; tx0.value = tx.value; ty0.value = ty.value; })
      .onUpdate(e => {
        const nz = Math.min(MAX_ZOOM, Math.max(1, z0.value * e.scale));
        // Zooms about the circle's centre: the offset scales with the photo.
        tx.value = tx0.value * (nz / z0.value); ty.value = ty0.value * (nz / z0.value);
        z.value = nz; clamp();
      });
    return Gesture.Simultaneous(pan, pinch);
  }, [width, height, base, D]); // eslint-disable-line react-hooks/exhaustive-deps

  const imgStyle = useAnimatedStyle(() => {
    const W = width * base * z.value, H = height * base * z.value;
    return { width: W, height: H, left: cx - W / 2 + tx.value, top: cy - H / 2 + ty.value };
  });

  const choose = () => {
    const W = width * base * z.value, H = height * base * z.value;
    onDone({ w: width, h: height, z: z.value, fx: tx.value / W, fy: ty.value / H });
  };
  const reset = () => {
    z.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0);
  };

  // The veil: the whole screen less the circle (even-odd fill).
  const veil = `M0 0H${screenW}V${screenH}H0Z M${cx - D / 2} ${cy} a${D / 2} ${D / 2} 0 1 0 ${D} 0 a${D / 2} ${D / 2} 0 1 0 ${-D} 0Z`;

  const body = (
      <GestureHandlerRootView style={[st.root, inline && StyleSheet.absoluteFill]}
        onLayout={inline ? e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }) : undefined}>
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
            {!!uri && <Animated.Image source={{ uri }} style={[st.img, imgStyle]} />}
            <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Path d={veil} fill="rgba(0,0,0,0.62)" fillRule="evenodd" />
              <Circle cx={cx} cy={cy} r={D / 2} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} fill="none" />
            </Svg>
          </View>
        </GestureDetector>
        <Text style={[st.title, { top: insets.top + 18 }]}>Move and Scale</Text>
        <View style={[st.bar, { paddingBottom: insets.bottom + 18 }]}>
          <Pressable onPress={onCancel} hitSlop={10}><Text style={st.btn}>Cancel</Text></Pressable>
          <Pressable onPress={reset} hitSlop={10}><Text style={st.btnDim}>Reset</Text></Pressable>
          <Pressable onPress={choose} hitSlop={10}><Text style={[st.btn, st.btnBold]}>Choose</Text></Pressable>
        </View>
      </GestureHandlerRootView>
  );
  if (inline) return uri ? body : null;
  return (
    <Modal visible={!!uri} animationType="fade" presentationStyle="fullScreen" onRequestClose={onCancel}>
      {body}
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'black' },
  img: { position: 'absolute' },
  title: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: 'white', fontSize: 16, fontWeight: '600' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 24, paddingTop: 18,
  },
  btn: { color: 'white', fontSize: 17 },
  btnBold: { fontWeight: '700' },
  btnDim: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
});
