# Spot researcher brief (Victoria, Pipeline C step 1)
Role: .claude/agents/spot-researcher.md. Rules: WRITING.md "Writing a spot" (cost, costBasis, ticketUrl, no opening hours, wiki title), PIPELINES.md Pipeline C step 1.
Input: a shard file of ~6 spots, each with `evidence` = its evidence bundle path (read it first; fetch only what it lacks with `npx tsx scripts/curation/fetch.ts <url>`).
Output: the shard's research file: a list, one object per spot:
{ id, name, facts:[{claim, source_url}] (3-5 concrete facts for a bio: what it is, where, the one thing worth a stop; no marketing),
  free: bool, costMin, costMax, currency:'AUD', costBasis:'entry'|'tour'|'ticket'|'park'|'donation'|'open', costPer?, needs?:'park-pass'|'booking'|'permit', parkPass?, cost_source_url, cost_confidence:'official page'|'secondary'|'unverified',
  ticketUrl: official site URL you LOADED and checked names the place (homepage or a deep link from the site's own nav), or null,
  ticketUrl_note: why null (many operators / no steward / BLOCKED:<url> needs a browser / not found),
  wiki: exact Wikipedia article title for the place if it has its own article, else null,
  visitHoursMin, visitHoursMax (quarter-hour steps; a quick stop starts at 0),
  access_note: closed/restricted/seasonal/booking caveats that matter (e.g. reported closed), or null,
  unresolved:[...] }
Rules: no opening hours; parking and transport are never the cost; adult price only; a Victorian national park is free to enter (Parks Victoria) unless a site-specific fee exists, so check the Parks Victoria page for the park; a fee covering many parks is needs:'park-pass'. A blocked page is `unresolved`, never evidence the thing does not exist; cost then stays cost_confidence 'unverified' with your best sourced figure or null. Never invent a price. Never name a source in fact text meant for the app. Final message at most 6 lines: file written, counts, every unresolved item and BLOCKED URL.
