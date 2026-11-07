// A setTimeout that camera events can also run. While the map is being pinched the JS thread is taken up with camera events
// and the renders they cause, and timers wait: a 120 ms timer was measured running up to 2.5 s late, until the pinch paused.
// Camera events keep arriving, so MapScreen's handleCameraChanged calls pumpTimeouts, which runs whatever is due.
type Job = { at: number; fn: () => void; timer: ReturnType<typeof setTimeout> };
let jobs: Job[] = [];

const run = (job: Job) => {
  jobs = jobs.filter(j => j !== job);
  clearTimeout(job.timer);
  job.fn();
};

// Runs fn after ms (once), and returns what cancels it.
export function pumpedTimeout(fn: () => void, ms: number): () => void {
  const job: Job = { at: Date.now() + ms, fn, timer: setTimeout(() => run(job), ms) };
  jobs.push(job);
  return () => {
    jobs = jobs.filter(j => j !== job);
    clearTimeout(job.timer);
  };
}

export function pumpTimeouts(): void {
  if (!jobs.length) return;
  const now = Date.now();
  for (const job of jobs.filter(j => j.at <= now)) if (jobs.includes(job)) run(job);
}
