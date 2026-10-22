// Temporary timing logs for the sheet slide-in after a selection (dev builds only). perfMark() starts a window of a few
// seconds; inside it, timed()/perfLog() print how long each piece of selection work took and how long after the tap it ran,
// and the UI-thread frame monitor (registered by MapScreen) reports dropped frames during the slide.
let markT = 0;
let markLabel = '';
let startFrameMonitor: (() => void) | null = null;
const WINDOW_MS = 3000;
const now = () => (globalThis as any).performance?.now?.() ?? Date.now();

export function perfMark(label: string): void {
  if (!__DEV__) return;
  markT = now(); markLabel = label;
  console.log(`[perf] ── ${label}`);
  startFrameMonitor?.();
}
export function perfLog(what: string, ms: number): void {
  if (!__DEV__ || !markT) return;
  const since = now() - markT;
  if (since > WINDOW_MS || ms < 2) return;
  console.log(`[perf] ${what}: ${ms.toFixed(0)} ms (at +${(since - ms).toFixed(0)} ms after ${markLabel})`);
}
export function timed<T>(what: string, fn: () => T): T {
  if (!__DEV__) return fn();
  const t = now();
  const r = fn();
  perfLog(what, now() - t);
  return r;
}
export const perfNow = now;
export function registerFrameMonitor(start: () => void): void { startFrameMonitor = start; }
