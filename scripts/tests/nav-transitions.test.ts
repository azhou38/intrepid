// Tests for the pure transition helpers in src/utils/navTransitions.ts.
//   npx tsx scripts/tests/nav-transitions.test.ts
import assert from 'node:assert/strict';
import { navTargetStatus, PILL_OWNER, pillBottomForSheet, pillOwnerFor, sameNavSel } from '../../src/utils/navTransitions';

const stops = { fullY: 60, collapsedY: 420, peekY: 700, closeY: 884 };
const targets = { full: 700, collapsed: 340, peek: 80 };

// Snap points map to their tuned targets, and between snaps the pills interpolate as before.
assert.equal(pillBottomForSheet(60, stops, targets), 700);
assert.equal(pillBottomForSheet(420, stops, targets), 340);
assert.equal(pillBottomForSheet(700, stops, targets), 80);
assert.equal(pillBottomForSheet(240, stops, targets), 520);
assert.equal(pillBottomForSheet(-100, stops, targets), 700);   // above full screen: clamped, as before

// Below the peek strip the pills keep their offset from the sheet's top: every point the sheet moves down, they move
// down too (their bottom offset falls by the same amount), all the way off the screen with it.
for (const dy of [1, 50, 120, 184]) {
  assert.equal(pillBottomForSheet(700 + dy, stops, targets), 80 - dy, `follows the sheet ${dy}pt below peek`);
}
assert.equal(pillBottomForSheet(2000, stops, targets), 80 - 184);   // past CLOSE: stays off-screen with the sheet
// The old CLAMP stopped at the peek target here: the regression this guards against.
assert.notEqual(pillBottomForSheet(800, stops, targets), 80);

// Exactly one owner, and during a swap it is the sheet that is leaving.
assert.equal(pillOwnerFor({ liveKind: 'dest', leaving: null }), PILL_OWNER.dest);
assert.equal(pillOwnerFor({ liveKind: 'country', leaving: 'dest-in-place' }), PILL_OWNER.dest);
assert.equal(pillOwnerFor({ liveKind: 'dest', leaving: 'spot-in-place' }), PILL_OWNER.spot);
assert.equal(pillOwnerFor({ liveKind: 'dest', leaving: 'copy' }), PILL_OWNER.leavingCopy);
assert.equal(pillOwnerFor({ liveKind: null, leaving: null }), PILL_OWNER.none);

// A close's planned target selection: pending until it lands, dropped the moment anything else is selected.
const sydney = { country: 'AU', dest: 'sydney', spot: null };
const australia = { country: 'AU', dest: null, spot: null };
const nothing = { country: null, dest: null, spot: null };
assert.equal(navTargetStatus(sydney, australia, sydney), 'pending');
assert.equal(navTargetStatus(sydney, australia, australia), 'landed');
assert.equal(navTargetStatus(sydney, nothing, nothing), 'landed');
assert.equal(navTargetStatus(sydney, australia, { country: 'NZ', dest: 'queenstown', spot: null }), 'interrupted');
assert.equal(navTargetStatus(sydney, nothing, { country: 'AU', dest: 'sydney', spot: 'sydney-1' }), 'interrupted');

// The X close's stale-close guard: only the selection it was tapped from may be closed.
assert.equal(sameNavSel(sydney, { ...sydney }), true);
assert.equal(sameNavSel(sydney, australia), false);

console.log('nav-transitions: all assertions passed');
