# ACT run: brief for every fact-check group

Repo: /Users/alexzhou/Developer/mobile-wellington (run commands from there). Role: .claude/agents/fact-checker.md. Read
WRITING.md "Voice" and "What the cost is for". Edit NOTHING except your own output file. Do not run git. Never put any
personal email or contact detail in a request header or a file.

Input: the Quill outputs named in your group (curation/act/quill/out-<N>.json: `spots` keyed by id, each a finished entry:
bio, hours, closedDays, visit hours, cost fields, ticketUrl, notes; and `unverified`) and, where named, a destination's
copy (curation/act/quill/dest-<id>.final.json: tagline, description, reasons, tips, best months).

For every spot and every destination claim, check against the source and write
`curation/act/quill/facts-<group>.json` = `[ { id, field, current, status: "supported"|"unsupported"|"unverifiable"|
"stale", fix, source } ]`: only the entries that are NOT plainly supported (do not list the supported ones). Priorities:
1. Every bio's facts (a number, a date, a feature, "free tours", "roof lawn", a superlative): the spot's own official page
   first, then Wikivoyage/Wikipedia/VisitCanberra. A claim with no source is `unsupported`, with the minimal fix (cut or
   reword) that still passes `python3 scripts/curation/bio-fit.py --text "<bio>"`.
2. Prices, hours and closed days: re-open the operator's or steward's page (`npx tsx scripts/curation/fetch.ts <url>`, a
   shared cache: pages the researcher loaded cost nothing). Where the entry says a figure came from Wikivoyage only or a
   search snippet, find the official page; if you find a different figure, say so as `stale` with the fix and the URL.
3. Each `ticketUrl`: load it and check its title or heading names the place; a 200 is not proof, a guessed deep link that
   404s is not "no site": search for the page. A blocked page (403, "Just a moment", WAF) goes under `needs_browser` with its
   URL: the run checks those in a browser; do not drop or guess a link.
4. `costBasis` against WRITING.md "What the cost is for": entry (adult), tour, ticket, park (+`costPer`), donation; parking is
   never a price; a free national institution is `free: true, costBasis: 'entry'`; a paid exhibition inside is not the
   spot's price.
5. The special flags in your group's notes below.
6. For a destination: the tagline, the description, each reason (must name a real, always-available draw), each tip (<= 160
   characters, a fact a visitor needs), best months; a tip or reason with no source is `unsupported`.
Final message: counts by status and the three most important corrections, by name.

Group assignments (each group writes its own facts file):
- group A: out-1.json, out-2.json + the `whyVisit`, `goodToKnow`, `description` and `tagline` of dest-canberra.final.json.
  Flags: Parliament House and High Court "security screening / photo ID" tip (unsourced); National Arboretum hours and free
  entry (no source); the Royal Australian Mint weekday/weekend hours; the National Zoo and Aquarium price (A$55 vs A$60);
  Mount Stromlo (the official page says the visitor centre is closed); Cockington Green's train; NFSA hours.
- group B: out-3.json, out-4.json. Flags: Canberra Deep Space Communication Complex: is it open to drop-in visitors at all
  now (a CSIRO page says "Temporarily closed to drop-in visitors")? If it is closed, the spot should be flagged `closed`;
  Tidbinbilla's entry price and hours (blocked site: search snippets say $15.53 per vehicle per day; a fee determination
  may raise it from 1 July 2026); Jerrabomberra Wetlands 24 hours vs 8-6; Stromlo Forest Park hours; National Carillon
  recital times (stale cache); the Tent Embassy "opposite Old Parliament House" line. (canberra-38 is dropped: skip it.)
- group C: out-5.json, out-6.json. Flags: Calthorpes' House tour days (Saturday only?), Belconnen Arts Centre free entry,
  the Weston Park (Yarralumla Play Station) facts, St John's church daily hours, the Centenary Trail's length and sections.
- group D: out-7.json, out-8.json + dest-namadgi-national-park.final.json (tagline, description, reasons, tips). Flags:
  Corin Forest prices and seasonal hours; the Namadgi visitor centre hours; "about 47% of the ACT"; that no ACT park pass or
  entry fee applies to Namadgi, Tidbinbilla's gate fee aside.
