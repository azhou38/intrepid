# Destination copy brief (Zhejiang)

For each destination id you are given, write `curation/expand-region-zhejiang/dest-copy/<id>.final.json` as
`{ "destination": { id, name, country:"China", countryCode:"CN", timezone:"Asia/Shanghai", continent:"Asia", coordinates:{lat,lng}, category, defaultZoomSpanKm, rank, icon, tagline, description, whyVisit[], highlights[], goodToKnow[{icon,title,detail}], bestMonths[], bestTimeBlurb, seasonalTags? }, "notes": "..." }`.
Start values (id, name, coordinates, category, rank, span, name_evidence) come from `curation/expand-region-zhejiang/wave1/destinations.json`; keep them unless the evidence says otherwise (say so in notes).

Rules: read WRITING.md sections "Writing a destination" and "Voice" first. Counts follow rank: whyVisit 4 for rank 1-2, 3 for rank 3-4, 2 for rank 5, highlights the same count; goodToKnow 3 for rank 1-3, 2 for rank 4-5, detail <=160 chars.
whyVisit: 2-8 words, start with an action verb, general experiences (name an attraction only if it is iconic to the destination), only permanent things. No semicolons in bestTimeBlurb; exactly one {months}; bestMonths from guide consensus (Zhejiang: humid subtropical, plum rains in June, typhoons Aug-Sep).
Facts only from the destination's spot bios/evidence (`wave1|wave2/quill/final-spots.json`, `wave*/evidence/`) and Wikipedia/Wikivoyage (WebFetch, paced). Never name a source in the copy. No invented numbers.
Check fit: `python3 scripts/curation/tagline-fit.py --text "<tagline>"` (exactly two lines) and `python3 scripts/curation/blurb-fit.py --text "<blurb>" --months <csv>` (two or three lines); iterate until both pass.
Reply in at most 6 lines: files written, anything unresolved.
