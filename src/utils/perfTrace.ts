// TEMPORARY performance instrumentation for the destination select / dismiss flows. Remove once measured.
//
//   perfTrace.start('select', dest.id)   // at the user's tap
//   perfTrace.mark('select', 'sheetAnimStart')   // logs "[perf] select sydney sheetAnimStart +123ms"
//
// Only one flow is timed at a time; a mark for a flow that is not running (or that started more than FLOW_MAX_MS ago) is
// ignored, so the marks can sit on hot paths. Dev builds only.
const FLOW_MAX_MS = 4000;
type Flow = { name: string; tag: string; t0: number; seen: Set<string> };
let current: Flow | null = null;
const now = () => (globalThis as any).performance?.now?.() ?? Date.now();

export const perfTrace = {
  start(name: string, tag = '') {
    if (!__DEV__) return;
    current = { name, tag, t0: now(), seen: new Set() };
    console.log(`[perf] ${name} ${tag} start`);
  },
  // `once`: log this label only the first time in the current flow.
  mark(name: string, label: string, once = true) {
    if (!__DEV__ || !current || current.name !== name) return;
    const dt = now() - current.t0;
    if (dt > FLOW_MAX_MS) { current = null; return; }
    if (once && current.seen.has(label)) return;
    current.seen.add(label);
    console.log(`[perf] ${name} ${current.tag} ${label} +${Math.round(dt)}ms`);
  },
  active(name?: string) {
    if (!current) return false;
    if (now() - current.t0 > FLOW_MAX_MS) { current = null; return false; }
    return name ? current.name === name : true;
  },
  name() { return current?.name ?? null; },
};
