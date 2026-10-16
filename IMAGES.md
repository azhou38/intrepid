# Choosing images

How to pick the photos the app shows for places. All photos come from Wikimedia Commons (or the place's Wikipedia article), resolved ahead of time into `src/data/imageManifest.json` so the app builds URLs locally. What to put in the data files is in `WRITING.md`; this file is about the photos.

There are three kinds of photo, each with its own rule:

| Photo | Where it shows | How it's chosen |
|---|---|---|
| **Header** | Top of a destination's sheet; the destination's map pin | Hand-picked, always |
| **Why visit** | The three cards in a destination's About tab | Hand-picked, one per reason |
| **Spot** | A spot's hero, carousel and list cards, map pin | Wikipedia's lead image by default; override only when it's wrong |

## Every photo

- **A current colour photograph.** Not archival, historical, black-and-white or sepia, however sharp: a 1913 view of the Government Gardens or a National Library glass-plate of Blue Lake is the wrong picture for a place visitors see today. The exception is a photo whose subject is itself the history (a spot about an old ship or a heritage museum), and even then a modern photo is preferred. Rotorua's Government Gardens and Blue Lake shipped with exactly this mistake.
- **Real, ground-level, in focus, well lit.** A photograph of the place as a visitor sees it. Not a drawing, painting, engraving, lithograph, postcard scan, rendering or collage.
- **Never** a map, satellite or orbital image, flag, logo, coat of arms, diagram, chart, floor plan, poster, signage, banknote, coin, icon or a heavily cropped detail.
- **Never** a different place with a similar name. Check the file's page, not just its name.
- **Pass the four checks below.** They are the mistakes that have actually shipped.
- **No people as the subject**, no watermarks, no text overlaid, no extreme filters or HDR.
- **Free licence only.** Commons files carry one; the build records the author and licence in the manifest. (The app doesn't display credits yet; keep to Commons so they can be shown later.)
- **Sharp at the size it's shown.** The app requests photos at about 1.5× the screen's pixel width (up to 1920px) for headers and 960px for cards, so a file narrower than the minimum below looks soft.

## The four checks

Run all four on every photo: headers, why-visit photos and spot overrides alike. **One failure rejects the photo.** Look at the image itself by opening the file's Commons page. A file name, a search ranking or a matching Wikipedia title proves nothing.

1. **It is the right place.** If the name is vague, shared, or also a person, film, band, ship or a place in another country (Clyde, Hanmer, Blue Lake, and so on), the photo must be proven to be the local place.
   - Search with the region ("Clyde, Central Otago", never "Clyde").
   - Confirm on the file's page that its description, categories or coordinates are the local place. Reject anything categorised under people, films, ships or another country.
   - **The pre-filter cannot catch this.** It reads dates, categories, colour and size, not what a photo shows, so a wrong subject sails through. Real cases: *Nelson Market* shipped with a photo of the singer Willie Nelson, *Mason Bay* with the American-football player Mason Crosby, *Lake Waikareiti* with Lake Waikaremoana, and *Clyde* with Bonnie and Clyde. A judge must look at every photo and its file page, and for any place whose name is also a person, band, film or another place, confirm it.
   - A high name-match score is **not** evidence for an ambiguous name: the search rewards a file literally named after the string, which is how this happens. *Clyde used a photo of Bonnie and Clyde.*

2. **It shows the named thing itself.** The subject is the lake, the hot pool, the peak, the bridge: not the township, car park, sign, jetty or building beside it. The name on the card is the subject.
   - Test: shown this photo with no caption, would a visitor say "that's the X" and recognise what they came for?
   - If the file is mainly of a settlement that shares the name, it fails. *"Blue Lake, St Bathans" used a photo of the St Bathans township, not the blue lake.*

3. **It is spectacular and wide.** Headers and why-visit cards sell the place: a sweeping scenic view, a dramatic landscape, a skyline or waterfront with its setting around it, a striking moment.
   - Fails: a house, shopfront, street corner, garden, car park, ordinary building or close-up, even a genuine photo taken in the town, unless that building is the very attraction the card is about.
   - A town header is the town in its landscape (lake, mountains, coast), never a single house in it. *The Wanaka and Hanmer Springs headers were each just a house.*
   - If no spectacular photo exists on Commons, say so rather than shipping a flat one.

4. **It is a photograph of the real place, not a representation.** No drawings, paintings, engravings, lithographs, illustrations, maps (including relief and tourist maps), satellite or orbital imagery, 3D renders, diagrams, collages, or photos of a map or a sign.
   - This applies to why-visit photos exactly as it does to headers. *All three Hanmer Springs why-visit photos were drawings, maps or similar.*
   - Files in Commons categories such as "Maps of", "Satellite images of", "Drawings of" and "Lithographs of" often have photo-like file names, so judge the image, not the name.
   - If you cannot tell whether it is a photograph, it fails.

### Automatic pre-filter

Before anyone (or any model) looks at a candidate, reject it by metadata and pixels. This is cheap, so run it on **every** photo in the app, including each spot's default Wikipedia lead image, not only the ones someone hand-picked:

- date taken before about 2000, or no date and an archive source (national libraries, museums, Library of Congress, "The Commons" uploads);
- Commons categories such as "Historical images", "Black and white photographs", "Photographs by [archive]", "Maps of", "Drawings of";
- low colour saturation (a black-and-white or sepia scan);
- under the minimum size, outside the aspect range, or already used for another place in the app.

What survives goes on to the four checks.

Each of the three why-visit photos is checked on its own: a destination is not done until every one passes. When one bad photo turns up, **audit the rest of that destination and its neighbours**: bad picks come from the same batch and share the same mistake.

## Headers

The first impression of the place, so never left to whatever photo leads its Wikipedia article. Every destination's header (also used for its map pin) must be hand-picked.

- **Cities and towns:** a spectacular cityscape or panorama of the place itself, such as a skyline, a waterfront, or a sweeping view over the rooftops. Never a single building, monument or attraction, and never a high aerial or satellite view.
- **Nature destinations (parks, lakes, coasts, mountains, islands, regions):** the landscape the place is known for, shown wide.
- **Shape:** the header is cropped to roughly a **square** on a phone. Use a roughly 3:2, 4:3 or portrait file with the subject **near the centre**. Avoid very wide panorama strips: anything wider than 2:1 loses most of its view. The manifest build flags anything outside an aspect of 0.6–2.0.
- **Size:** at least **2000px wide**.
- Register it in `WIKI_IMAGE_OVERRIDES` (`src/data/imageOverrides.ts`) keyed by the destination's exact `name`.

### Adding a header (the procedure)

1. Pick a Wikimedia Commons file that meets the rules above. Open it and check it visually. `npx tsx scripts/photo-picker.ts` does the searching (and `--auto` the choosing; see "Choosing" below).
2. Add it to `WIKI_IMAGE_OVERRIDES` in `src/data/imageOverrides.ts`, keyed by the destination's exact `name`.
3. Run `npx tsx scripts/check-destination-headers.ts`, which works offline.
4. Regenerate the manifest with `npx tsx scripts/build-image-manifest.ts`. It refuses to run if any destination lacks a hand-picked header, and lists headers that are too small or too wide.

`HEADER_REVIEW_BACKLOG` in `scripts/destination-header-policy.ts` lists the older destinations that still need a curated header. Never add new destinations to it; remove each entry once its header has been curated.

## "Why visit" photos

One photo per reason, three per destination, in the same order as `whyVisit`.

- **It must show that reason**, not the place in general. "Punting on the Avon" is a punt on the Avon; "Meet the cheeky kea" is a kea. If no good photo of the reason exists, rewrite the reason (see `WRITING.md`) rather than settling for a vague one.
- **Three different photos**, no repeats within a destination, and none of them the header.
- **Shape:** the cards are about 1.6:1 landscape, centre-cropped. Prefer a landscape file with the subject near the centre. If the default crop cuts off the subject (a tall statue, a bird high in the frame), set `PHOTO_FOCUS_Y` for that file in `imageOverrides.ts` (0 = crop toward the top, 0.5 = centre, 1 = bottom).
- **Size:** at least **1280px wide**. A ground-level view is preferred; an aerial is acceptable here only when the reason is itself about the view from above.
- Store the three Commons file names in `whyVisitPhotos`, in order.

## Spot photos

Every spot photo in the app is checked, not only the ones given an override: the default (the lead photo of the spot's Wikipedia article) is accepted only if it passes the pre-filter above and the four checks. A default that fails gets an override in `WIKI_IMAGE_OVERRIDES`, keyed by `spotPhotoTitle` (the spot's `wiki` title, else its `name`).

- **Default:** the lead photo of the spot's Wikipedia article, found by the spot's `name` (which is why a spot's `wiki` title, when it has one, must match its article exactly; see `WRITING.md`). Most spots need nothing more.
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
  - `--auto` cannot enforce the four checks. It matches names, so it favours a file literally called "Clyde" (check 1), cannot tell the lake from the village beside it (check 2), cannot tell a scenic view from a house (check 3), and can pick a drawing or map with a photo-like name (check 4).
  - Always treat these as doubtful and open the file: any vague or shared name, any town or region header (the "just a house" risk), and any file whose name or categories mention map, satellite, drawing, plan, lithograph, engraving or illustration.
  - For vague names, don't use `--auto` at all: use the contact sheet.

Without network access (this applies to some sessions) you cannot see Commons: do not invent file names. Either leave the photos for the user to run `--auto` or the contact sheet, or say plainly that they are unverified.

## After choosing

```bash
npx tsx scripts/check-destination-headers.ts   # offline: every destination has a hand-picked header
npx tsx scripts/build-image-manifest.ts        # needs Commons; refuses to run if a header is missing
```

The manifest build resolves every file, records its size and credit, and lists headers that are too small or too wide: fix those and re-run. Commit the rebuilt `src/data/imageManifest.json`.

**The build is incremental.** It keeps every entry already in the manifest and only looks up what is new or changed (a destination, spot or photo override added, changed or removed), so a normal run takes seconds. It records what decided each entry in `scripts/image-manifest.sigs.json`, which is committed with the manifest. It cannot see a Wikipedia article's own lead image changing under an unchanged entry, so run `npx tsx scripts/build-image-manifest.ts --full` (every lookup and URL check from scratch, about 30–40 minutes) now and then, roughly monthly; `--verify` re-checks every image URL without redoing the lookups.

`HEADER_REVIEW_BACKLOG` in `scripts/destination-header-policy.ts` lists older destinations still waiting for a curated header. Never add a new destination to it; remove an entry once its header is curated.

## When Commons has no suitable photo

Do not drop a spot or leave a wrong photo because Commons has nothing; use a photo from elsewhere on the internet. In order of preference:

1. **Openly licensed** (CC0, public domain, CC BY, CC BY-SA): Openverse (`api.openverse.org`, which indexes Flickr and others), the Department of Conservation's images that DOC labels "Creative Commons", Unsplash, Pexels. No permission needed; keep the credit.
2. **Official or tourism-organisation photos** (DOC, regional tourism boards, the operator or steward of the place). Not openly licensed, so they are a copyright risk for a published app; permission from the owner is advisable. Record the source page and owner in the credit.
3. Blogs, travel sites and stock agencies last, and only when nothing better exists.

The photo still has to pass the four checks and the size rules (spot ≥ 960 px, why-visit ≥ 1280 px, header ≥ 2000 px): travel blogs usually shrink images to 750 px, which fails.

**How a non-Commons photo is added:** download the original, resize to at most 1920 px, save it as `assets/photos/<name>.jpg`, commit it, then add an entry to `src/data/externalPhotos.json` keyed by the place's photo key (the spot's name, or `wiki` title; a destination's name for a header; `File:<name>` for a why-visit photo, using a name like `ext-<slug>.jpg` in `whyVisitPhotos`). The entry is `{ t: null, o: <raw.githubusercontent.com URL pinned to the commit that added the file>, ow, credit: { by, license, page } }`. Pin to the commit hash, not `main` (a fresh push is cached as a 404 for minutes), and push before expecting the photo to load. Then run `scripts/build-image-manifest.ts`; it merges the file and a rebuild keeps it. The pre-filter does not check these photos, so look at them yourself.

