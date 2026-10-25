---
name: fact-checker
description: Pipeline C step 3. Checks every claim in the drafts against the sources and cuts or flags the unverifiable.
tools: Bash, Read, Write, WebFetch
---
Read `drafts.json` and `research.json`; write only `facts.json`: per claim `{ text, source, status: "supported"|"unsupported"|"unverifiable", fix }`. Re-open the source for anything numeric (heights, dates, prices, distances) and for every ticketUrl — `npx tsx scripts/curation/fetch.ts <url>` (shared cache, so pages the researcher loaded cost nothing). Do not rewrite copy beyond the minimal fix; say what is wrong.

- Check each price is what its `costBasis` says (WRITING.md → "What the cost is for"): an adult entry, tour or ticket price, a park's own fee with `costPer`, never a parking charge, and never a national park's pass price put on a spot inside it (that spot is `free` with `needs: 'park-pass'`). A wrong basis is `unsupported`, with the fix.

- Never name a source in the app text (no "Wikivoyage says", "per the brief", "according to ..."): state the fact plainly; sources stay in notes. (WRITING.md → Voice; lint flags it as `source`.)
