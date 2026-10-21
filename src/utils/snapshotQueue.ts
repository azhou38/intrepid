// Pin images (DestPinImages, SpotPhotoImages, SpotPinImages) are React Native views that rnmapbox snapshots into the
// map style on the UI thread with refresh(). Each snapshot is cheap, but a destination's pins all asked at once: opening
// Blue Mountains ran 131 of them in one frame and froze the screen for 137 ms. They now go through this queue, a few per
// animation frame, so the map and the sheets keep animating while the pins fill in.
const PER_FRAME = 4;
const queue: (() => void)[] = [];
let scheduled = false;

function pump() {
  scheduled = false;
  for (let i = 0; i < PER_FRAME && queue.length; i++) queue.shift()!();
  if (queue.length) { scheduled = true; requestAnimationFrame(pump); }
}

export function queueSnapshot(run: () => void): void {
  queue.push(run);
  if (!scheduled) { scheduled = true; requestAnimationFrame(pump); }
}
