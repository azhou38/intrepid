// TEMP: timing probe for the spot photo pins flickering after a destination tap (photo pin fades in, vanishes ~100 ms, fades in
// again). Times are ms since the destination was selected. Posted to a log receiver on the Mac and echoed to Metro's console.
// Remove (this file and every `pinlog(` / `pinMark(` line in MapScreen.tsx) once the cause is found.
const SINK = 'http://10.34.227.104:8097';
let t0 = 0;
let buf: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
export function pinMark() { t0 = Date.now(); }
export function pinlog(msg: string) {
  const line = `+${t0 ? Date.now() - t0 : -1} ${msg}`;
  console.log(`[pinlog] ${line}`);
  buf.push(line);
  if (!timer) timer = setTimeout(() => {
    timer = null;
    const body = buf.join('\n'); buf = [];
    fetch(SINK, { method: 'POST', body }).catch(() => {});
  }, 300);
}
