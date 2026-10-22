import { PHOTO_SUBJECT } from '../data/imageOverrides';

// Where a photo's subject sits, as fractions of the photo (x: 0 left edge … 1 right edge, y: 0 top … 1 bottom), or
// undefined for a photo whose subject is already central. Keyed like the image manifest: a destination's name for its
// header, a spot's photo key (spotPhotoTitle) for a spot, `File:<name>` for a why-visit photo. See IMAGES.md
// ("Keeping the subject in the crop").
// `zoom` (default 1, the plain 'cover' fit) magnifies the photo about the subject so a subject small in the frame, or low
// in a landscape photo shown in a square, can be moved toward the middle (a landscape photo in a square otherwise only
// slides sideways).
export type Subject = { x?: number; y?: number; zoom?: number };
export const photoSubject = (key: string | undefined | null): Subject | undefined =>
  (key ? PHOTO_SUBJECT[key] : undefined);

// The 'cover' placement of a photo of natural size nw×nh in a frame fw×fh that puts the subject as close to the frame's
// centre as the photo allows (it never leaves a gap at an edge). With no subject this is the plain centre crop.
export function subjectCoverRect(fw: number, fh: number, nw: number, nh: number, s?: Subject) {
  const scale = Math.max(fw / nw, fh / nh) * Math.max(1, s?.zoom ?? 1);
  const w = nw * scale, h = nh * scale;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const left = clamp(fw / 2 - (s?.x ?? 0.5) * w, fw - w, 0);
  const top = clamp(fh / 2 - (s?.y ?? 0.5) * h, fh - h, 0);
  return { position: 'absolute' as const, left, top, width: w, height: h };
}

// The same placement, runnable on the UI thread (a Reanimated worklet), for a frame whose height animates.
export function subjectCoverRectUI(fw: number, fh: number, nw: number, nh: number, sx: number, sy: number, zoom: number) {
  'worklet';
  const scale = Math.max(fw / nw, fh / nh) * Math.max(1, zoom);
  const w = nw * scale, h = nh * scale;
  const left = Math.max(fw - w, Math.min(0, fw / 2 - sx * w));
  const top = Math.max(fh - h, Math.min(0, fh / 2 - sy * h));
  return { left, top, width: w, height: h };
}
