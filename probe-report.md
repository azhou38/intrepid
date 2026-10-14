# Cloud probe report (2026-10-14)

| Step | Check | Result |
|---|---|---|
| 1 | Commons API | HTTP 000 (curl failed), 0.26s |
| 1 | Wikipedia API | HTTP 000, 0.23s |
| 1 | Wikivoyage API | HTTP 000, 0.24s |
| 1 | Nominatim | HTTP 000, 0.24s |
| 1 | Overpass | HTTP 000, 1.32s |
| 1 | Pageviews API | HTTP 000, 0.25s |
| 1 | doc.govt.nz | HTTP 000, 0.26s |
| 1 | Mapbox tilequery (no token) | HTTP 000, 0.24s |
| 1 | MAPBOX env var names | none present |
| 1 | Cause of 000 | Not diagnosed: the follow-up diagnostic (curl -sS to see the error and the proxy status endpoint) was denied by the auto-mode classifier, so no workaround was attempted |
| 2 | Image view | Not done: thumbnail lookup returned no data (network failed) |
| 3 | node -v | v22.22.0 |
| 3 | tsx --version | tsx v4.23.15 (not installed locally; npx fetched it) |
| 3 | npm ci --ignore-scripts | succeeded, 25s |
| 3 | tsc error lines | 7 (matches baseline) |
| 4 | 20 Commons requests, 429 count | 0 429s, but all 20 returned 000 so this is not a real rate-limit test |
| 5 | Branch/commit/push/PR | see session reply |
