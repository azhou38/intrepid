# Cloud probe report 2

| Step | Check | Result |
|---|---|---|
| 1 | Commons API | 429 0.41s |
| 1 | Wikipedia API | 429 0.43s |
| 1 | Wikivoyage API | 429 0.18s |
| 1 | Nominatim | 200 0.46s |
| 1 | Overpass | 000 (no response, timed out at 6.3s) |
| 1 | Pageviews API | 429 0.19s |
| 1 | doc.govt.nz | 200 0.97s |
| 1 | Mapbox tilequery, no token | 401 0.23s (reachable) |
| 1 | Env vars containing MAPBOX | EXPO_PUBLIC_MAPBOX_TOKEN |
| 1 | Mapbox tilequery, with token | 200 |
| 2 | Commons thumbnail of Cape Reinga Lighthouse | Not done: Commons API returned 429 on two attempts, so no thumbnail URL and no image to view |
| 3 | node -v | v22.22.0 |
| 3 | npx tsx --version | tsx v4.23.15 (node v22.22.0); not preinstalled, npx fetched it |
| 3 | npm ci --ignore-scripts | Succeeded in 19s |
| 3 | npx tsc --noEmit | 7 lines with `error TS` (matches baseline 7) |
| 4 | 20 back-to-back Commons requests | 19 of 20 returned 429 |
| 5 | Branch / PR | See PR itself |

Note: all Wikimedia endpoints (Commons, Wikipedia, Wikivoyage, pageviews) returned 429 from the first request, which suggests the shared egress IP is rate limited, not that this probe exceeded a quota.
