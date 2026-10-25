import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

// The bar that follows a one-tap "Mark Visited" (or a one-tap un-mark): "Marked visited · Add details · Undo", for a few
// seconds, at the bottom of the map screen. Marking a place visited no longer opens the trip editor; this keeps the
// details one tap away without asking for them, and Undo covers a mis-tap without a confirmation dialog.
//
//   showVisitToast({ message, actionLabel?, onAction?, onUndo? })   — from any sheet
//   <VisitToastHost bottom={…} />                                    — once, in MapScreen

export type VisitToastSpec = { message: string; actionLabel?: string; onAction?: () => void; onUndo?: () => void };

const SHOW_MS = 4500;
let listener: ((t: VisitToastSpec) => void) | null = null;
export function showVisitToast(t: VisitToastSpec) { listener?.(t); }

export function VisitToastHost({ bottom }: { bottom: number }) {
  const [toast, setToast] = useState<(VisitToastSpec & { key: number }) | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => { if (finished) setToast(null); });
  }, [anim]);

  useEffect(() => {
    listener = t => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ ...t, key: Date.now() });
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, SHOW_MS);
    };
    return () => { listener = null; if (timer.current) clearTimeout(timer.current); };
  }, [anim, hide]);

  if (!toast) return null;
  const run = (fn?: () => void) => () => { hide(); fn?.(); };
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[st.wrap, { bottom, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
    >
      <View style={st.bar}>
        <View style={st.icon}><Check size={13} color="white" strokeWidth={3} /></View>
        <Text style={st.msg} numberOfLines={1}>{toast.message}</Text>
        {!!toast.onAction && (
          <Pressable onPress={run(toast.onAction)} hitSlop={8} style={st.btn}>
            <Text style={st.action}>{toast.actionLabel ?? 'Add details'}</Text>
          </Pressable>
        )}
        {!!toast.onUndo && (
          <Pressable onPress={run(toast.onUndo)} hitSlop={8} style={st.btn}>
            <Text style={st.undo}>Undo</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  // Above every sheet (they reach zIndex/elevation 210), so the bar is never drawn under one.
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520, alignSelf: 'stretch',
    backgroundColor: '#111827', borderRadius: 14, paddingLeft: 12, paddingRight: 6, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  icon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  msg: { flex: 1, fontSize: 14, fontWeight: '600', color: 'white' },
  btn: { paddingHorizontal: 8, paddingVertical: 6 },
  action: { fontSize: 14, fontWeight: '700', color: '#34D399' },
  undo: { fontSize: 14, fontWeight: '700', color: 'white' },
});
