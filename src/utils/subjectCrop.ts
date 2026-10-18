import { PHOTO_SUBJECT } from '../data/imageOverrides';

// Where a photo's subject sits, as fractions of the photo (x: 0 left edge … 1 right edge, y: 0 top … 1 bottom), or
// undefined for a photo whose subject is already central. Keyed like the image manifest: a destination's name for its
// header, a spot's photo key (spotPhotoTitle) for a spot, `File:<name>` for a why-visit photo. See IMAGES.md
// ("Keeping the subject in the crop").
export type Subject = { x?: number; y?: number };
export const photoSubject = (key: string | undefined | null): Subject | undefined =>
  (key ? PHOTO_SUBJECT[key] : undefined);

// The 'cover' placement of a photo of natural size nw×nh in a frame fw×fh that puts the subject as close to the frame's
// centre as the photo allows (it never leaves a gap at an edge). With no subject this is the plain centre crop.
export function subjectCoverRect(fw: number, fh: number, nw: number, nh: number, s?: Subject) {
  const scale = Math.max(fw / nw, fh / nh);
  const w = nw * scale, h = nh * scale;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const left = clamp(fw / 2 - (s?.x ?? 0.5) * w, fw - w, 0);
  const top = clamp(fh / 2 - (s?.y ?? 0.5) * h, fh - h, 0);
  return { position: 'absolute' as const, left, top, width: w, height: h };
}
