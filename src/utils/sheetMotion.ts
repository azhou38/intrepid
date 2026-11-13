import { makeMutable } from 'react-native-reanimated';

// 1 while a sheet is being dragged or is settling after one (set from the sheets' gesture worklets, on the UI thread).
// React updates that land in that time can reach the screen a frame late and redraw a sheet where it was a moment before:
// at 120 Hz that showed as flashes of the sheet's previous position. MapScreen holds back its frequent updates (the camera's
// position, the breadcrumb's interactivity) while this is set and delivers them once the sheet has come to rest.
export const sheetMotionSV = makeMutable(0);
const sheetMotionAtSV = makeMutable(0);
// A drag that never moved the sheet (a tap) starts no settle to clear the flag: it lapses after this long.
const MOTION_MAX_MS = 1500;
export function beginSheetMotion() {
  'worklet';
  sheetMotionSV.value = 1;
  sheetMotionAtSV.value = Date.now();
}
export function endSheetMotion() {
  'worklet';
  sheetMotionSV.value = 0;
}
export const sheetInMotion = () => sheetMotionSV.value === 1 && Date.now() - sheetMotionAtSV.value < MOTION_MAX_MS;
