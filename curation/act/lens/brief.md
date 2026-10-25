# ACT run: brief for the destination photo group (Lens, first pass)

Repo root: /Users/alexzhou/Developer/mobile-wellington. Read .claude/routines/jobs/job-first.md and the roles it names
(.claude/agents/image-searcher.md, image-judge.md) and IMAGES.md (the four checks, headers, why-visit photos, brightness,
crop, "When Commons has no suitable photo"). Your group is curation/act/lens/dest-1/task.json (eight slots: a header and
three why-visit photos for Canberra and for Namadgi National Park, all `search`). Write curation/act/lens/dest-1/candidates.json
and judge-1.json as the job says.

Run-specific points:
- Never put a personal email or contact detail in a request header or file. Fetch with `npx tsx scripts/curation/fetch.ts`.
- Canberra's header is a CITY header: a skyline or lakeside panorama with Parliament House / Lake Burley Griffin / the hills
  in their setting, not a single building. Why-visit photos must show exactly the reason's subject (Parliament House; the
  Australian War Memorial; the city from Mount Ainslie: the view down Anzac Parade). Namadgi's header is the landscape the
  park is known for, shown wide; its reasons are Gibraltar Falls (the drop), Booroomba Rocks (the granite outcrop and
  view) and Yankee Hat (the Aboriginal rock art).
- A header or why-visit photo may also be the destination's header or one of its spots' photos if it is the best photo of the
  thing. The same file for the other destination is a failure.
- Commons first (featured, quality and valued images; the geotag search near the coordinates finds views the category search
  misses); then openly licensed (Openverse), then official or tourism-board photos (record the owner and the copyright risk).
  List every slot whose official page was BLOCKED under `needs_browser` with the URL: the run reads those in a browser.
- Photos must be current, colour, ground-level where possible, no people as the main subject, bright enough (a dark photo is
  brightened later, say so), and wide enough (header >= 1500 px, why-visit >= 1280 px).
Final message: the slots where you chose a NEW file, one line per other slot, and every `needs_browser` item.
