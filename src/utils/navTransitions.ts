// Pure helpers for the sheet / camera transitions of the back pill and X (MapScreen and the three sliding sheets).
// No React or React Native imports, so they run on the UI thread as worklets and in plain Node for the tests in
// scripts/tests/nav-transitions.test.ts.

// The back/X pills' height above the bottom of the map view for a sheet whose top edge is at `y`.
// Between full screen, half-screen (collapsed) and the peek strip the pills sit at each snap's own tuned target; below the
// peek strip (an X close or a swap sliding the sheet off, down to `closeY`) they keep their offset from the sheet's top
// edge and leave the screen with it, instead of stopping at the peek target while the sheet slides away under them.
export function pillBottomForSheet(
  y: number,
  stops: { fullY: number; collapsedY: number; peekY: number; closeY: number },
  targets: { full: number; collapsed: number; peek: number },
): number {
  'worklet';
  const xs = [stops.fullY, stops.collapsedY, stops.peekY, stops.closeY];
  const ys = [targets.full, targets.collapsed, targets.peek, targets.peek - (stops.closeY - stops.peekY)];
  if (y <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (y <= xs[i]) {
      const span = xs[i] - xs[i - 1];
      const t = span > 0 ? (y - xs[i - 1]) / span : 1;
      return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
    }
  }
  return ys[ys.length - 1];
}

// Which mounted sheet positions the pills. Exactly one owner at a time, so an incoming sheet mounting under an outgoing
// one can never move the pills off the sheet the user is looking at. Ids are fixed per sheet role.
export const PILL_OWNER = { none: 0, country: 1, dest: 2, spot: 3, leavingCopy: 4 } as const;
export type PillOwner = (typeof PILL_OWNER)[keyof typeof PILL_OWNER];

export function pillOwnerFor(state: {
  liveKind: 'country' | 'dest' | 'spot' | null;
  // A swap is animating: the old sheet is sliding off, either as an outgoing copy or as the live instance leaving in place.
  leaving: 'copy' | 'dest-in-place' | 'spot-in-place' | null;
}): PillOwner {
  if (state.leaving === 'copy') return PILL_OWNER.leavingCopy;
  if (state.leaving === 'dest-in-place') return PILL_OWNER.dest;
  if (state.leaving === 'spot-in-place') return PILL_OWNER.spot;
  return state.liveKind ? PILL_OWNER[state.liveKind] : PILL_OWNER.none;
}

// The selection a back or X close is heading to, planned from the tap (see MapScreen's navTarget): the pins use it
// while the old sheet is still on screen, so they reach their final state during the transition and do not re-plan
// when the close lands. It stays in force only while the selection is still the one tapped from (`from`). It ends when
// the selection reaches the target (the close landed), or becomes anything else (a new tap interrupted it), so a stale
// target can never outlive its transition or restore an old selection.
export type NavSel = { country: string | null; dest: string | null; spot: string | null };
export const sameNavSel = (a: NavSel, b: NavSel) => a.country === b.country && a.dest === b.dest && a.spot === b.spot;
export function navTargetStatus(from: NavSel, to: NavSel, now: NavSel): 'pending' | 'landed' | 'interrupted' {
  if (sameNavSel(now, to)) return 'landed';
  if (sameNavSel(now, from)) return 'pending';
  return 'interrupted';
}

// The copy of longitude `lng` (shifted by whole turns) nearest `fromLng`, i.e. the end of the short way round. Mapbox's
// easeTo animates the centre's longitude in a straight line and only wraps it per frame, so from 170 to -175 it swept
// 345 degrees west round the globe instead of 15 east across the date line; aimed at 185 instead, it goes the short way.
export function nearestLng(lng: number, fromLng: number): number {
  'worklet';
  return lng + 360 * Math.round((fromLng - lng) / 360);
}
