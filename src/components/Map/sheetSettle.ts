// The settle after a sheet is let go of: a critically damped spring that starts at the finger's own speed, as Google
// Maps' sheet does, instead of a fixed-length ease-out that ignored how fast the sheet was moving at release.
//
// Written as its own Reanimated animation rather than withSpring/withTiming for two reasons seen in frame traces:
//  - At release, the animation's start time (the gesture event's) can be later than the next frame's time. Both built-ins
//    then compute that frame from a negative elapsed time, and an ease-out curve or a velocity-seeded spring moves the
//    sheet backwards for a frame or two: a visible kick the moment the finger lifts. Here a frame never runs time
//    backwards.
//  - After a late frame (a React commit or the map holding up the UI thread), the built-ins catch up in one jump. Here a
//    step is at most MAX_STEP_MS, so a dropped frame slows the settle a touch instead of skipping a stretch of it.
// It never overshoots: reaching the target ends it there (a sheet that bounces past its snap reads as loose).
import { defineAnimation } from 'react-native-reanimated';
import type { Animation, AnimationCallback } from 'react-native-reanimated';

type Timestamp = number;

// Natural frequency (1/s). With no release speed the sheet covers 95% of the way in ~260 ms and rests by ~370 ms; a
// flick arrives sooner, carried by its own speed.
const OMEGA = 18;
const MAX_STEP_MS = 25;
const FIRST_STEP_MS = 8;
const MAX_VELOCITY = 6000;   // pt/s

interface SettleAnimation extends Animation<SettleAnimation> {
  current: number;
  toValue: number;
  velocity: number;
  lastTimestamp: Timestamp;
  started: boolean;
}

export function withSheetSettle(toValue: number, velocity = 0, callback?: AnimationCallback): number {
  'worklet';
  return defineAnimation<SettleAnimation>(toValue, () => {
    'worklet';
    const onStart = (a: SettleAnimation, value: number, now: Timestamp) => {
      a.current = value;
      a.lastTimestamp = now;
      a.started = false;
      a.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity || 0));
    };
    const onFrame = (a: SettleAnimation, now: Timestamp): boolean => {
      let dtMs = now - a.lastTimestamp;
      if (!a.started) dtMs = FIRST_STEP_MS;
      else if (dtMs <= 0) return false;   // called again within the same frame: nothing has elapsed
      a.started = true;
      a.lastTimestamp = now;
      const dt = Math.min(dtMs, MAX_STEP_MS) / 1000;
      // Exact step of a critically damped spring: x(t) = (x0 + (v0 + w x0) t) e^(-w t), v likewise.
      const x0 = a.current - a.toValue;
      const v0 = a.velocity;
      const e = Math.exp(-OMEGA * dt);
      const x = (x0 + (v0 + OMEGA * x0) * dt) * e;
      const v = (v0 - OMEGA * (v0 + OMEGA * x0) * dt) * e;
      // Crossed the target (a fast flick toward it): stop there.
      if (x0 !== 0 && Math.sign(x) !== Math.sign(x0)) { a.current = a.toValue; a.velocity = 0; return true; }
      if (Math.abs(x) < 0.3 && Math.abs(v) < 12) { a.current = a.toValue; a.velocity = 0; return true; }
      a.current = a.toValue + x;
      a.velocity = v;
      return false;
    };
    return {
      onFrame, onStart, callback, toValue,
      current: toValue, velocity: 0, lastTimestamp: 0, started: false,
    } as SettleAnimation;
  }) as unknown as number;
}
