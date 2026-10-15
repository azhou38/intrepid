// Pure (no React Native imports) so it can be unit-checked from a script.
// The LARGEST font size (down in 0.5 px steps, never below `min`) at which `name` fits on at most `maxLines` lines with
// no word broken across lines — React Native wraps at spaces and only splits a word mid-way when the word alone is wider
// than the line, so every word must fit on one line as well as the whole name fitting in `maxLines`. Glyph width is
// estimated at 0.58em (a little wide, serif bold, letterSpacing included) so a rare wide word errs towards shrinking.
export function fitNameFontSize(name: string, max: number, min: number, maxWidth: number, maxLines = 2): number {
  const words = name.split(/\s+/).filter(Boolean);
  for (let size = max; size >= min; size -= 0.5) {
    const perLine = Math.floor(maxWidth / (size * 0.58));
    if (words.some(w => w.length > perLine)) continue;                      // a word alone would split across lines
    let lines = 1, cur = 0;
    for (const w of words) {
      if (cur === 0) cur = w.length;
      else if (cur + 1 + w.length <= perLine) cur += 1 + w.length;
      else { lines++; cur = w.length; }
    }
    if (lines <= maxLines) return size;
  }
  return min;
}
