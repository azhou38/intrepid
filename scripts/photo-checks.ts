// Checks shared by the photo pre-filter and the spot-gallery builder: what makes a Commons file not a current colour
// photograph of a place (IMAGES.md → "Automatic pre-filter").

// Categories and title words that mean "not a current photograph of the place".
export const BAD_CATEGORY = new RegExp([
  'historical (images|photographs)', 'historic(al)? photographs', 'old photographs', 'black and white', 'monochrome', 'sepia',
  'maps? of', 'maps$', 'satellite images?', 'drawings? of', 'paintings? of', 'lithographs?', 'engravings?', 'illustrations?',
  'postcards?', 'logos? of', 'flags? of', 'coats? of arms', 'diagrams?', 'posters?',
  'burton brothers', 'alexander turnbull library', 'national library', 'library of congress', 'state library', 'auckland libraries',
  'museum of new zealand', 'hocken', 'photographs by .*(studio|collection|archive)',
].join('|'), 'i');
export const BAD_TITLE = /\b(map|maps|satellite|locator|logo|flag|coat of arms|diagram|chart|poster|drawing|illustration|sketch|painting|engraving|lithograph|svg)\b/i;

// Mean saturation, and how much of the colour sits in ONE hue, over the lit pixels of a small decoded JPEG.
// A black-and-white scan has ~0 saturation. Sepia has colour but one hue: nearly every coloured pixel falls within
// ±25° of a single hue (1.00 for a 1913 sepia print), whereas a modern photo of sea, sand and bush spreads over
// several (0.4–0.7).
export function colourStats(data: Uint8Array | Buffer): { sat: number; hueShare: number; hue: number; vivid: number } {
  let n = 0, sat = 0, coloured = 0, vivid = 0;
  const bins = new Array(36).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx < 0.12) continue;                                   // ignore near-black pixels (no hue to speak of)
    const s = d / mx;
    sat += s; n++;
    if (s > 0.5) vivid++;
    if (s > 0.08) {
      const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
      bins[Math.floor(h / 10) % 36]++; coloured++;
    }
  }
  if (!n) return { sat: 0, hueShare: 0, hue: 0, vivid: 0 };
  let best = 0, bestAt = 0;
  for (let i = 0; i < 36; i++) {
    let t = 0;
    for (let k = -2; k <= 2; k++) t += bins[(i + k + 36) % 36];
    if (t > best) { best = t; bestAt = i; }
  }
  return { sat: sat / n, hueShare: coloured ? best / coloured : 0, hue: bestAt * 10, vivid: vivid / n };
}

