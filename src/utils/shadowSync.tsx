// Keeps React Native's shadow tree in step with Reanimated's transform/opacity animations.
//
// With Reanimated's IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS flag (package.json), a frame that only changes transforms and
// opacity is applied straight to the native views, skipping the per-frame shadow-tree commit (clone, layout, diff,
// mount) that cost a sliding sheet 20-45 ms frames on the phone. The shadow tree then keeps the last committed
// positions, and a react-native Pressable measures itself from the shadow tree: one that an animation has moved can
// fire onPressIn but silently drop onPress. Any React commit re-applies every current animated value to the shadow tree
// (Reanimated's commit hook), so ShadowSync makes a tiny one on request: when a sheet has settled, and shortly after
// every touch ends (by then the animation it started has landed).
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

let bump: (() => void) | null = null;

export function requestShadowSync(delayMs = 0) {
  if (delayMs <= 0) bump?.();
  else setTimeout(() => bump?.(), delayMs);
}

// After a touch: once the animation it most likely started has landed (a snap or a tab slide by 450 ms, a sheet that
// waits for the camera before sliding in well after that).
export function syncAfterTouch() {
  requestShadowSync(450);
  requestShadowSync(900);
  requestShadowSync(1800);
}

export function ShadowSync() {
  const [n, setN] = useState(0);
  useEffect(() => {
    bump = () => setN(x => x + 1);
    return () => { bump = null; };
  }, []);
  // A changing prop, so the re-render always reaches the shadow tree as a commit.
  return <View pointerEvents="none" testID={`shadow-sync-${n}`} style={{ position: 'absolute', width: 0, height: 0 }} />;
}
