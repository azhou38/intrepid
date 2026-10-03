# Choosing images

How to pick the photos the app shows for places. All photos come from Wikimedia Commons (or the place's Wikipedia article), resolved ahead of time into `src/data/imageManifest.json` so the app builds URLs locally. What to put in the data files is in `DESTINATIONS.md`; this file is about the photos.

There are three kinds of photo, each with its own rule:

| Photo | Where it shows | How it's chosen |
|---|---|---|
| **Header** | Top of a destination's sheet; the destination's map pin | Hand-picked, always |
| **Why visit** | The three cards in a destination's About tab | Hand-picked, one per reason |
| **Spot** | A spot's hero, carousel and list cards, map pin | Wikipedia's lead image by default; override only when it's wrong |

## Every photo

- **Real, ground-level, in focus, well lit.** A photograph of the place as a visitor sees it. Not a drawing, painting, postcard scan, rendering or collage.
- **Never** a map, flag, logo, coat of arms, diagram, chart, floor plan, poster, signage, banknote, coin, icon or a heavily cropped detail.
- **Never** a different place with a similar name. Check the file's page, not just its name.
- **No people as the subject**, no watermarks, no text overlaid, no extreme filters or HDR.
- **Free licence only.** Commons files carry one; the build records the author and licence in the manifest. (The app doesn't display credits yet; keep to Commons so they can be shown later.)
- **Sharp at the size it's shown.** The app requests photos at about 1.5× the screen's pixel width (up to 1920px) for headers and 960px for cards, so a file narrower than the minimum below looks soft.

## Headers

The first impression of the place, so never left to whatever photo leads its Wikipedia article.

- **Cities and towns:** a spectacular cityscape or panorama of the place itself, such as a skyline, a waterfront, or a sweeping view over the rooftops. Never a single building, monument or attraction, and never a high aerial or satellite view.
- **Nature destinations (parks, lakes, coasts, mountains, islands, regions):** the landscape the place is known for, shown wide.
- **Shape:** the header is cropped to roughly a **square** on a phone. Use a roughly 3:2, 4:3 or portrait file with the subject **near the centre**. Avoid very wide panorama strips: anything wider than 2:1 loses most of its view. The manifest build flags anything outside an aspect of 0.6–2.0.
- **Size:** at least **2000px wide**.
- Register it in `WIKI_IMAGE_OVERRIDES` (`src/data/imageOverrides.ts`) keyed by the destination's exact `name`.

## "Why visit" photos

One photo per reason, three per destination, in the same order as `whyVisit`.

- **It must show that reason**, not the place in general. "Punting on the Avon" is a punt on the Avon; "Meet the cheeky kea" is a kea. If no good photo of the reason exists, rewrite the reason (see `DESTINATIONS.md`) rather than settling for a vague one.
- **Three different photos**, no repeats within a destination, and none of them the header.
- **Shape:** the cards are about 1.6:1 landscape, centre-cropped. Prefer a landscape file with the subject near the centre. If the default crop cuts off the subject (a tall statue, a bird high in the frame), set `PHOTO_FOCUS_Y` for that file in `imageOverrides.ts` (0 = crop toward the top, 0.5 = centre, 1 = bottom).
- **Size:** at least **1280px wide**. A ground-level view is preferred; an aerial is acceptable here only when the reason is itself about the view from above.
- Store the three Commons file names in `whyVisitPhotos`, in order.

## Spot photos

- **Default:** the lead photo of the spot's Wikipedia article, found by the spot's `name` (which is why spot names must match article titles; see `DESTINATIONS.md`). Most spots need nothing more.
- **Override when the default is wrong:** the name is ambiguous or shared with another place (a common lake, park or street name), the article's lead image is a map, logo, plan, drawing, an interior when visitors come for the exterior, or the wrong attraction, or the article has no image. Add the spot's name to `WIKI_IMAGE_OVERRIDES` with a better file.
- **What a good spot photo is:** the attraction itself, recognisable at a small size (it's shown in square thumbnails and map pins), subject centred. Landmarks and viewpoints: the view or the structure; trails: a characteristic stretch; museums: the building; wildlife: the animal.
- **Size:** at least **1280px wide** where possible.
- A standalone spot (one with no destination) follows the same rules.

## Choosing

1. **Search Commons** for the place or reason, preferring featured, quality or valued images and files named for the subject. Open each candidate and look at it.
2. **Check it against the rules above** (type, shape, size, subject, free licence).
3. **Record it** in `imageOverrides.ts` (headers and spot overrides) or `destinations.ts` (`whyVisitPhotos`).

`npx tsx scripts/photo-picker.ts [--country XX]` does steps 1–3 for everything missing, in two ways:

- **Contact sheet (default):** searches Commons, keeps only files that meet the size and shape rules, and writes `photo-picker.html`. Open it, choose by eye, press "Download picks.json", then `npx tsx scripts/photo-picker.ts --apply picks.json`. Prefer this for headers.
- **`--auto`:** chooses for you: it drops files that fail the rules, scores the rest (how well the file name matches the place or reason, Commons' own ranking, resolution, and for headers a 1.2–1.6 aspect), avoids repeating a file, writes the winners in, and prints each choice. It never picks a map, logo or diagram, and never an aerial or satellite view for a header. A score is not an eye: **read the printed list and open anything doubtful** before keeping it. Spots are skipped unless you add `--spots`.

Without network access (this applies to some sessions) you cannot see Commons: do not invent file names. Either leave the photos for the user to run `--auto` or the contact sheet, or say plainly that they are unverified.

## After choosing

```bash
npx tsx scripts/check-destination-headers.ts   # offline: every destination has a hand-picked header
npx tsx scripts/build-image-manifest.ts        # needs Commons; refuses to run if a header is missing
```

The manifest build resolves every file, records its size and credit, and lists headers that are too small or too wide: fix those and re-run. Commit the rebuilt `src/data/imageManifest.json`.

`HEADER_REVIEW_BACKLOG` in `scripts/destination-header-policy.ts` lists older destinations still waiting for a curated header. Never add a new destination to it; remove an entry once its header is curated.
