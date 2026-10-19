// Pure (no React Native imports) so it can be unit-checked from a script.
// The LARGEST font size (down in 0.5 px steps, never below `min`) at which `name` fits on at most `maxLines` lines with
// no word broken across lines — React Native wraps at spaces and only splits a word mid-way when the word alone is wider
// than the line, so every word must fit on one line as well as the whole name fitting in `maxLines`. Glyph width is
// estimated at `glyphEm` (default 0.58em, a little wide for serif bold with its letterSpacing, so a rare wide word errs towards shrinking; the narrow grid cards pass a tighter 0.53 so their names are not shrunk more than they need to be).
// `wordEm` is the glyph width used only to decide whether a single word fits on a line (default `glyphEm`): packing words
// into lines can run a little tight, but a word that overflows is split mid-word, so a card can pass a wider (safer) figure
// there and have a long single word (Coonabarabran) shrink just enough to stay whole on one line.
export function fitNameFontSize(name: string, max: number, min: number, maxWidth: number, maxLines = 2, glyphEm = 0.58, wordEm = glyphEm): number {
  const words = name.split(/\s+/).filter(Boolean);
  for (let size = max; size >= min; size -= 0.5) {
    const perLine = Math.floor(maxWidth / (size * glyphEm));
    const wordsPerLine = Math.floor(maxWidth / (size * wordEm));
    if (words.some(w => w.length > wordsPerLine)) continue;                 // a word alone would split across lines
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

// A long name would shrink to an unreadable size to fit two lines, so it takes more lines instead — but as few as it can,
// and never so many that it swallows a small card. Two lines while the font stays at `comfort` or larger; else three lines
// while that keeps it at `comfort - 2` or larger; else four lines, with the font held to `comfort` (at four lines a name
// could otherwise grow large enough to fill the card). Never an ellipsis and never a word broken across lines.
export function fitNameSize(name: string, max: number, min: number, maxWidth: number, comfort: number, glyphEm = 0.58, wordEm = glyphEm): number {
  const two = fitNameFontSize(name, max, min, maxWidth, 2, glyphEm, wordEm);
  if (two >= comfort) return two;
  const three = fitNameFontSize(name, max, min, maxWidth, 3, glyphEm, wordEm);
  if (three >= comfort - 2) return three;
  return Math.min(comfort, fitNameFontSize(name, max, min, maxWidth, 4, glyphEm, wordEm));
}

// The name broken into lines the same way fitNameFontSize packs them (greedy, at spaces), joined with "\n". Handing React
// Native these breaks explicitly means a line is never decided by its own text measurement: a card's name was seen running
// out of its card on one line ("Tāmaki Drive C…", the rest clipped) when the measured line width came out narrower than the
// drawn one. A line that is still too wide in the real font then wraps once more inside its own box instead of overflowing.
export function breakNameLines(name: string, size: number, maxWidth: number, glyphEm = 0.58): string {
  const perLine = Math.max(1, Math.floor(maxWidth / (size * glyphEm)));
  const lines: string[] = [];
  let cur = '';
  for (const w of name.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= perLine) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

// ── Exact-width version (Playfair Display Bold, the card titles' font) ─────────────────────────────────────────────────
// The estimates above use one average glyph width, which is a few percent off in either direction for any given name
// (Whakarewarewa Forest came out 1 pt smaller than its card allowed). These use the font's real advance widths.
import { PLAYFAIR_BOLD_EM, PLAYFAIR_BOLD_DEFAULT_EM } from './playfairBoldWidths';
const textEm = (s: string) => { let t = 0; for (const ch of s) t += PLAYFAIR_BOLD_EM[ch] ?? PLAYFAIR_BOLD_DEFAULT_EM; return t; };
// The width in points of `s` at `size` with the title's letter spacing (negative: it tightens every glyph).
const textWidth = (s: string, size: number, letterSpacing: number) => textEm(s) * size + letterSpacing * s.length;
const SAFETY = 0.985;   // 1.5% under the box, so rounding in the native layout never tips a line over

function packExact(name: string, size: number, maxWidth: number, ls: number): string[] | null {
  const lines: string[] = [];
  let cur = '';
  for (const w of name.split(/\s+/).filter(Boolean)) {
    if (textWidth(w, size, ls) > maxWidth * SAFETY) return null;               // a word alone would split
    const t = cur ? cur + ' ' + w : w;
    if (!cur || textWidth(t, size, ls) <= maxWidth * SAFETY) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
// Same line policy as fitNameSize (two lines while the font stays at `comfort` or more, else three while it stays at
// `comfort - 2`, else four with the font held to `comfort`), but sized by real text width.
export function fitNameSizeExact(name: string, max: number, min: number, maxWidth: number, comfort: number, letterSpacing = -0.2): number {
  const best = (maxLines: number) => {
    for (let size = max; size >= min; size -= 0.5) {
      const l = packExact(name, size, maxWidth, letterSpacing);
      if (l && l.length <= maxLines) return size;
    }
    return min;
  };
  const two = best(2);
  if (two >= comfort) return two;
  const three = best(3);
  if (three >= comfort - 2) return three;
  return Math.min(comfort, best(4));
}
export function breakNameLinesExact(name: string, size: number, maxWidth: number, letterSpacing = -0.2): string {
  return (packExact(name, size, maxWidth, letterSpacing) ?? name.split(/\s+/)).join('\n');
}
