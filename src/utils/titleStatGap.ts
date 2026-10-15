// Keeps the VISIBLE space between a card title and the time/cost line under it the same at every title font size.
//
// A title's line box has empty space below its baseline that grows with the font size (about (lineHeight/2 − 0.4155)·size
// for Playfair Display Bold, whose ascent is 1.082em and descent 0.251em, centred in the line), so a fixed margin gives a
// bigger visible gap under a big title than under a small one. This returns the margin that makes
// (space under the baseline + margin) equal `visualGap` at any size. Pure, so it can be checked from a script.
export function titleStatGap(fontSize: number, lineHeightRatio: number, visualGap: number): number {
  const belowBaseline = (lineHeightRatio / 2 - 0.4155) * fontSize;
  return Math.max(0, visualGap - belowBaseline);
}
