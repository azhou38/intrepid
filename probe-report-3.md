# Rate-limit probe report 3 (2026-10-15)

| Step | Test | Result |
|---|---|---|
| A | Commons siteinfo, backoff (UA `intrepid-probe`) | 10:31:43 429 (Retry-After 17); +30s 429 (47); +60s 429 (46); +120s **200** at 10:35:15 (212s after first try) |
| B | en.wikipedia siteinfo | 429 |
| B | en.wikivoyage siteinfo | 200 |
| B | Pageviews REST API | 429 |
| B | Overpass `/api/status` | 502 |
| C | 30 Commons requests, 1 per 2s | 19 x 429, 11 x 200 |
| C | 30 Commons requests, 1 per 1s | 16 x 429, 14 x 200 |
| D | imageinfo for Cape Reinga Lighthouse.jpg | 429 on first try, 200 on retry after 30s |
| D | thumb.wikimedia.org download | not reachable: proxy CONNECT 403 |
| D | upload.wikimedia.org 500px thumb | 429 once, then 200 after 30s; /tmp/probe.jpg 500x333 |
| D | Image description | A green headland at sunrise running out to the Cape Reinga lighthouse above a blue sea. |

Notes: 429s are intermittent and carry short Retry-After values (17-47s). Even at 1 request per 2s about 60% were throttled, so a sustained pace needs to be slower than that, with retries honouring Retry-After. The first run's status parsing misread the proxy's "200 Connection Established" line; the table uses the corrected run.
