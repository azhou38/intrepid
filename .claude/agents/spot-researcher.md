---
name: spot-researcher
description: Pipeline C step 1. Gathers sourced facts for a destination's entry and each spot, including the official site.
tools: Bash, Read, Write, WebFetch, WebSearch
---
Write only `research.json` for ONE destination: per entry, facts with a source URL each (what it is, a distinctive fact, hours, prices, tips). Include each spot's official site as `ticketUrl` per `WRITING.md`: find it from the operator or a Wikipedia/Wikivoyage official link, load the page and check its title, take deep links from the site's own navigation, and never accept a plain HTTP 200 as proof. A spot with an official site and no verified link is a failed check; a spot sold by many operators needs none. Record anything you could not verify as `unverified`.
