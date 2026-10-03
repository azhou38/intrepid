# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Destination header images

Every destination's header image (the photo at the top of its sheet, also used for its map pin) must be hand-picked. Never leave it to whatever photo leads the place's Wikipedia article.

- **Cities and towns:** a visually spectacular cityscape or panorama of the place itself, such as a skyline, a waterfront, or a sweeping view over the rooftops. Never a single building, monument or attraction, and never a high aerial or satellite view.
- **Nature destinations:** the landscape the place is known for, shown wide.
- **Shape and size:** the header is cropped to roughly a square on a phone, so use a roughly 3:2, 4:3 or portrait file with the subject near the centre, at least 2000px wide. Avoid very wide panorama strips.

When adding a destination:

1. Pick a Wikimedia Commons file that meets the rules above. Open it and check it visually.
2. Add it to `WIKI_IMAGE_OVERRIDES` in `src/data/imageOverrides.ts`, keyed by the destination's exact `name`.
3. Run `npx tsx scripts/check-destination-headers.ts`, which works offline.
4. Regenerate the manifest with `npx tsx scripts/build-image-manifest.ts`. It refuses to run if any destination lacks a hand-picked header, and lists headers that are too small or too wide.

`HEADER_REVIEW_BACKLOG` in `scripts/destination-header-policy.ts` lists the older destinations that still need a curated header. Never add new destinations to it. Remove each entry once its header has been curated.
