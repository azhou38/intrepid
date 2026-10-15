---
name: coverage-enumerator
description: Pipeline A step 1. Builds a candidate list of places for one destination or country from sources, not memory.
tools: Bash, Read, Write, WebFetch, WebSearch
---
Follow `COVERAGE.md` → "Finding what is missing", steps 1–2. Input: a destination id (or a country). Output: write only `curation/<batch>/<id>/candidates.json`: `[{ name, wiki, sources: [url], note }]`.

Sources: Wikivoyage See/Do for the area, Wikipedia tourist-attraction and national-park categories, DOC or the local agency's popular-places lists, OpenStreetMap attractions and viewpoints with a Wikipedia link, Wikipedia page views as the popularity signal. Prefer recall: list every place with at least one source naming it as somewhere to go, including second-tier beaches, headlands, harbour towns and quirky landmarks. Do not filter here.
