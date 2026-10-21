// TEMPORARY probe: what happens while a sheet slides in after a selection. Remove once the slide-in is smooth.
// perfArm() starts a PERF_WINDOW_MS window; perfMark() logs one event, perfCount() tallies repeated ones (and their
// time, when given) in 100 ms buckets, printed at the end of the window. MapScreen logs the UI thread's long frames.
export const PERF_WINDOW_MS = 1200;
let armedAt = 0;
let label = '';
let buckets = new Map<string, Map<number, { n: number; ms: number }>>();
let timer: ReturnType<typeof setTimeout> | null = null;

const now = () => (globalThis as any).performance?.now?.() ?? Date.now();
const rel = () => now() - armedAt;
const live = () => armedAt !== 0 && rel() <= PERF_WINDOW_MS;

export function perfArm(what: string) {
  if (timer) clearTimeout(timer);
  armedAt = now();
  label = what;
  buckets = new Map();
  console.log(`[perf] ==== ${what}`);
  timer = setTimeout(report, PERF_WINDOW_MS + 100);
}

export function perfMark(what: string) {
  if (!live()) return;
  console.log(`[perf] +${rel().toFixed(0)}ms ${what}`);
}

export function perfCount(what: string, ms = 0) {
  if (!live()) return;
  const b = Math.floor(rel() / 100);
  let m = buckets.get(what);
  if (!m) buckets.set(what, (m = new Map()));
  const e = m.get(b) ?? { n: 0, ms: 0 };
  e.n += 1; e.ms += ms;
  m.set(b, e);
}

function report() {
  timer = null;
  for (const [what, m] of buckets) {
    const parts = [...m.entries()].sort((a, b) => a[0] - b[0])
      .map(([b, e]) => `${b * 100}:${e.n}${e.ms ? `/${e.ms.toFixed(0)}ms` : ''}`);
    console.log(`[perf] ${label} ${what} (bucket:count/time) ${parts.join(' ')}`);
  }
  armedAt = 0;
}

export const perfNow = now;
